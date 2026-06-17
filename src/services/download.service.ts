import { spawn } from "child_process";
import { tempFilePath, getFileSizeBytes } from "@/utils/file";
import { logger } from "@/utils/logger";
import { env } from "@/config/env";
import { DOWNLOAD } from "@/constants";
import type { OutputFormat, Platform, DownloadResult } from "@/types";
import fs from "fs";

// ══════════════════════════════════════════════════════════════════════════════
// COBALT API — YouTube downloads (no cookies, no bot detection)
// ══════════════════════════════════════════════════════════════════════════════

interface CobaltResponse {
  status: "tunnel" | "redirect" | "picker" | "error" | "rate-limit";
  url?: string;
  urls?: string[];
  text?: string;
}

async function tryCobaltInstance(
  instanceUrl: string,
  url: string,
  format: OutputFormat
): Promise<CobaltResponse | null> {
  try {
    const body: Record<string, unknown> = {
      url,
      videoQuality: "720",
      filenameStyle: "basic",
    };

    if (format === "audio") {
      body.downloadMode = "audio";
      body.audioFormat = "mp3";
      body.audioBitrate = "192";
    } else {
      body.downloadMode = "auto";
    }

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "Accept": "application/json",
    };
    if (DOWNLOAD.COBALT_API_KEY) {
      headers["Authorization"] = `Api-Key ${DOWNLOAD.COBALT_API_KEY}`;
    }

    const response = await fetch(`${instanceUrl}/`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) return null;
    return await response.json() as CobaltResponse;
  } catch {
    return null;
  }
}

async function downloadFileFromUrl(
  downloadUrl: string,
  outputPath: string
): Promise<void> {
  const response = await fetch(downloadUrl, {
    signal: AbortSignal.timeout(DOWNLOAD.TIMEOUT_SECONDS * 1000),
  });

  if (!response.ok) {
    throw new Error(`Failed to download: ${response.status}`);
  }

  const buffer = await response.arrayBuffer();
  await fs.promises.writeFile(outputPath, Buffer.from(buffer));
}

async function downloadViaCoablt(
  url: string,
  format: OutputFormat,
  outputPath: string
): Promise<{ success: boolean; error?: string }> {
  // Public api.cobalt.tools now requires auth. Skip entirely unless configured.
  const instances = DOWNLOAD.COBALT_INSTANCES.length
    ? DOWNLOAD.COBALT_INSTANCES
    : DOWNLOAD.COBALT_API_KEY
      ? ["https://api.cobalt.tools"]
      : [];

  if (!instances.length) {
    return { success: false, error: "Cobalt not configured" };
  }

  for (const instance of instances) {
    logger.info("Trying Cobalt instance", { instance });

    const result = await tryCobaltInstance(instance, url, format);
    if (!result) {
      logger.warn("Cobalt instance failed", { instance });
      continue;
    }

    if (result.status === "error" || result.status === "rate-limit") {
      logger.warn("Cobalt returned error", { instance, status: result.status, text: result.text });
      continue;
    }

    const downloadUrl = result.url ?? result.urls?.[0];
    if (!downloadUrl) {
      logger.warn("Cobalt returned no URL", { instance });
      continue;
    }

    try {
      await downloadFileFromUrl(downloadUrl, outputPath);
      logger.info("Cobalt download success", { instance });
      return { success: true };
    } catch (err: any) {
      logger.warn("Cobalt file download failed", { instance, err: err.message });
      continue;
    }
  }

  return { success: false, error: "All Cobalt instances failed" };
}

// ══════════════════════════════════════════════════════════════════════════════
// YT-DLP — Instagram, TikTok, Twitter
// ══════════════════════════════════════════════════════════════════════════════

function cookiesExist(file: string): boolean {
  try {
    return fs.existsSync(file) && fs.statSync(file).size > 0;
  } catch {
    return false;
  }
}

function buildArgs(
  url: string,
  outputPath: string,
  format: OutputFormat,
  platform: Platform,
): string[] {
  const args: string[] = [
    "--no-playlist",
    "--no-warnings",
    "--socket-timeout", String(DOWNLOAD.SOCKET_TIMEOUT_SECONDS),
    "--retries", String(DOWNLOAD.RETRIES),
    "--no-part",
    "--concurrent-fragments", String(DOWNLOAD.CONCURRENT_FRAGMENTS),
    "-o", outputPath,
  ];

  if (platform === "instagram") {
    // Cookies optional — only attach if file exists, so missing/expired
    // cookies never hard-fail the spawn.
    if (cookiesExist(DOWNLOAD.INSTAGRAM_COOKIES_FILE)) {
      args.push("--cookies", DOWNLOAD.INSTAGRAM_COOKIES_FILE);
    }
    args.push("--add-header", `User-Agent:${DOWNLOAD.INSTAGRAM_USER_AGENT}`);
  }

  if (format === "audio") {
    args.push(
      "-x",
      "--audio-format", DOWNLOAD.AUDIO_FORMAT,
      "--audio-quality", DOWNLOAD.AUDIO_QUALITY,
      url,
    );
    return args;
  }

  args.push(
    "-f", DOWNLOAD.VIDEO_FORMAT_SELECTOR,
    "--merge-output-format", DOWNLOAD.VIDEO_FORMAT,
    url,
  );

  return args;
}

async function runYtDlp(
  args: string[],
): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const proc = spawn("yt-dlp", args, { stdio: ["ignore", "pipe", "pipe"] });

    let stdout = "";
    let stderr = "";

    const timeout = setTimeout(() => {
      proc.kill("SIGKILL");
    }, DOWNLOAD.TIMEOUT_SECONDS * 1000);

    proc.stdout.on("data", (chunk) => { stdout += chunk.toString(); });
    proc.stderr.on("data", (chunk) => { stderr += chunk.toString(); });

    proc.on("error", (err) => {
      clearTimeout(timeout);
      stderr += err.message;
      resolve({ code: 1, stdout, stderr });
    });

    proc.on("close", (code) => {
      clearTimeout(timeout);
      resolve({ code, stdout, stderr });
    });
  });
}

// ── YouTube via yt-dlp — no-cookie clients, then cookie fallback ──────────────
function ytBaseArgs(outputPath: string, format: OutputFormat): string[] {
  const args = [
    "--no-playlist",
    "--no-warnings",
    "--socket-timeout", String(DOWNLOAD.SOCKET_TIMEOUT_SECONDS),
    "--retries", String(DOWNLOAD.RETRIES),
    "--no-part",
    "--concurrent-fragments", String(DOWNLOAD.CONCURRENT_FRAGMENTS),
    "-o", outputPath,
  ];

  if (format === "audio") {
    args.push("-x", "--audio-format", DOWNLOAD.AUDIO_FORMAT, "--audio-quality", DOWNLOAD.AUDIO_QUALITY);
  } else {
    args.push("-f", DOWNLOAD.VIDEO_FORMAT_SELECTOR, "--merge-output-format", DOWNLOAD.VIDEO_FORMAT);
  }

  return args;
}

async function downloadYouTubeViaYtDlp(
  url: string,
  format: OutputFormat,
  outputPath: string,
): Promise<{ success: boolean; error?: string }> {
  let lastErr = "yt-dlp failed";

  // 1) Try each no-cookie player client. tv/web_safari bypass bot-detection
  //    from datacenter IPs without login or PO-token — no recurring tokens.
  for (const client of DOWNLOAD.YOUTUBE_CLIENTS) {
    const args = [
      ...ytBaseArgs(outputPath, format),
      "--extractor-args", `youtube:player_client=${client}`,
      url,
    ];
    logger.info("YouTube yt-dlp attempt", { client });
    const res = await runYtDlp(args);
    if (res.code === 0) return { success: true };
    lastErr = res.stderr || lastErr;
    logger.warn("YouTube client failed", { client, err: lastErr.slice(-300) });
    await safeUnlink(outputPath);
  }

  // 2) Last resort: cookies, only if a cookie file is actually present.
  if (cookiesExist(DOWNLOAD.YOUTUBE_COOKIES_FILE)) {
    logger.info("YouTube cookie fallback");
    const args = [
      ...ytBaseArgs(outputPath, format),
      "--cookies", DOWNLOAD.YOUTUBE_COOKIES_FILE,
      url,
    ];
    const res = await runYtDlp(args);
    if (res.code === 0) return { success: true };
    lastErr = res.stderr || lastErr;
    await safeUnlink(outputPath);
  }

  return { success: false, error: lastErr };
}

async function safeUnlink(p: string): Promise<void> {
  try { await fs.promises.unlink(p); } catch { /* not present */ }
}

// ══════════════════════════════════════════════════════════════════════════════
// MAIN DOWNLOAD FUNCTION
// ══════════════════════════════════════════════════════════════════════════════

export async function downloadMedia(
  url: string,
  format: OutputFormat,
  platform: Platform,
): Promise<DownloadResult> {
  const ext = format === "audio" ? DOWNLOAD.AUDIO_FORMAT : DOWNLOAD.VIDEO_FORMAT;
  const outputPath = tempFilePath(ext as "mp4" | "mp3");

  logger.info("Starting download", { url, format, platform, outputPath });

  try {
    let success = false;
    let error: string | undefined;

    // ── YouTube → yt-dlp no-cookie clients, Cobalt only if configured ────────
    if (platform === "youtube") {
      const yt = await downloadYouTubeViaYtDlp(url, format, outputPath);
      success = yt.success;
      error = yt.error;

      // Optional Cobalt fallback (only if COBALT_API_KEY / COBALT_INSTANCES set)
      if (!success) {
        logger.warn("yt-dlp failed for YouTube, trying Cobalt if configured");
        const cobalt = await downloadViaCoablt(url, format, outputPath);
        if (cobalt.success) {
          success = true;
          error = undefined;
        } else {
          error = yt.error ?? cobalt.error;
        }
      }

    // ── Instagram, TikTok, Twitter → yt-dlp ─────────────────────────────────
    } else {
      const args = buildArgs(url, outputPath, format, platform);
      const ytResult = await runYtDlp(args);
      success = ytResult.code === 0;
      error = ytResult.stderr;
    }

    if (!success) {
      return { success: false, error: error ?? "Download failed" };
    }

    const sizeBytes = await getFileSizeBytes(outputPath);

    if (sizeBytes <= 0) {
      return { success: false, error: "Downloaded file not found or empty" };
    }

    const limitBytes = env.MAX_FILE_SIZE_MB * 1024 * 1024;
    if (sizeBytes > limitBytes) {
      return {
        success: false,
        filePath: outputPath,
        error: `FILE_TOO_LARGE:${sizeBytes}`,
      };
    }

    logger.info("Download complete", { outputPath, sizeBytes });
    return { success: true, filePath: outputPath, fileSizeBytes: sizeBytes };

  } catch (err: any) {
    const msg = err?.message ?? String(err);
    logger.error("Download failed", { url, error: msg });
    return { success: false, error: msg };
  }
}