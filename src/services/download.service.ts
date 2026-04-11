import { spawn } from "child_process";
import { tempFilePath, getFileSizeBytes } from "@/utils/file";
import { logger } from "@/utils/logger";
import { env } from "@/config/env";
import { DOWNLOAD } from "@/constants";
import type { OutputFormat, Platform, DownloadResult } from "@/types";

function buildArgs(
  url: string,
  outputPath: string,
  format: OutputFormat,
  platform: Platform,
): string[] {
  const args: string[] = [
    "--no-playlist",
    "--no-warnings",
    "--socket-timeout",
    String(DOWNLOAD.SOCKET_TIMEOUT_SECONDS),
    "--retries",
    String(DOWNLOAD.RETRIES),
    "--no-part",
    "--concurrent-fragments",
    String(DOWNLOAD.CONCURRENT_FRAGMENTS),
    "-o",
    outputPath,
  ];

  // Add cookies per platform
  if (platform === "youtube") {
    args.push("--cookies", DOWNLOAD.YOUTUBE_COOKIES_FILE);
  }
  if (platform === "instagram") {
    args.push("--cookies", DOWNLOAD.INSTAGRAM_COOKIES_FILE);
    args.push("--add-header", `User-Agent:${DOWNLOAD.INSTAGRAM_USER_AGENT}`);
  }

  if (format === "audio") {
    args.push(
      "-x",
      "--audio-format",
      DOWNLOAD.AUDIO_FORMAT,
      "--audio-quality",
      DOWNLOAD.AUDIO_QUALITY,
      url,
    );
    return args;
  }

  args.push(
    "-f",
    DOWNLOAD.VIDEO_FORMAT_SELECTOR,
    "--merge-output-format",
    DOWNLOAD.VIDEO_FORMAT,
    url,
  );

  return args;
}

async function runYtDlp(
  args: string[],
): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return await new Promise((resolve) => {
    const proc = spawn("yt-dlp", args, { stdio: ["ignore", "pipe", "pipe"] });

    let stdout = "";
    let stderr = "";

    const timeout = setTimeout(() => {
      proc.kill("SIGKILL");
    }, DOWNLOAD.TIMEOUT_SECONDS * 1000);

    proc.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });

    proc.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

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

export async function downloadMedia(
  url: string,
  format: OutputFormat,
  platform: Platform,
): Promise<DownloadResult> {
  const ext =
    format === "audio" ? DOWNLOAD.AUDIO_FORMAT : DOWNLOAD.VIDEO_FORMAT;
  const outputPath = tempFilePath(ext as "mp4" | "mp3");
  const args = buildArgs(url, outputPath, format, platform);

  logger.info(`Starting download`, { url, format, platform, outputPath });

  try {
    const { code, stdout, stderr } = await runYtDlp(args);

    if (code !== 0) {
      return {
        success: false,
        error: stderr || `yt-dlp exited with code ${code}`,
      };
    }

    if (stdout) logger.debug("yt-dlp stdout", { stdout });
    if (stderr) logger.debug("yt-dlp stderr", { stderr });

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

    logger.info(`Download complete`, { outputPath, sizeBytes });
    return { success: true, filePath: outputPath, fileSizeBytes: sizeBytes };
  } catch (err: any) {
    const msg = err?.message ?? String(err);
    logger.error("yt-dlp failed", { url, error: msg });
    return { success: false, error: msg };
  }
}
