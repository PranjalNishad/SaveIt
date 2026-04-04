import { exec } from "child_process";
import { promisify } from "util";
import { tempFilePath, getFileSizeBytes } from "@/utils/file";
import { logger } from "@/utils/logger";
import { env } from "@/config/env";
import { DOWNLOAD } from "@/constants";
import type { OutputFormat, Platform } from "@/types";

const execAsync = promisify(exec);

function buildCommand(
  url: string,
  outputPath: string,
  format: OutputFormat,
  platform: Platform,
): string {
  const baseFlags = [
    `--no-playlist`,
    `--no-warnings`,
    `--socket-timeout ${DOWNLOAD.SOCKET_TIMEOUT_SECONDS}`,
    `--retries ${DOWNLOAD.RETRIES}`,
    `--no-part`,
    `--concurrent-fragments ${DOWNLOAD.CONCURRENT_FRAGMENTS}`,
    `-o "${outputPath}"`,
  ];

  if (format === "audio") {
    return [
      "yt-dlp",
      ...baseFlags,
      `-x`,
      `--audio-format ${DOWNLOAD.AUDIO_FORMAT}`,
      `--audio-quality ${DOWNLOAD.AUDIO_QUALITY}`,
      `"${url}"`,
    ].join(" ");
  }

  const videoFlags = [
    `-f "${DOWNLOAD.VIDEO_FORMAT_SELECTOR}"`,
    `--merge-output-format ${DOWNLOAD.VIDEO_FORMAT}`,
  ];

  if (platform === "instagram") {
    videoFlags.push(
      `--add-header "User-Agent:${DOWNLOAD.INSTAGRAM_USER_AGENT}"`,
    );
  }

  return ["yt-dlp", ...baseFlags, ...videoFlags, `"${url}"`].join(" ");
}

export interface DownloadResult {
  success: boolean;
  filePath?: string;
  fileSizeBytes?: number;
  error?: string;
}

export async function downloadMedia(
  url: string,
  format: OutputFormat,
  platform: Platform,
): Promise<DownloadResult> {
  const ext =
    format === "audio" ? DOWNLOAD.AUDIO_FORMAT : DOWNLOAD.VIDEO_FORMAT;
  const outputPath = tempFilePath(ext as "mp4" | "mp3");
  const cmd = buildCommand(url, outputPath, format, platform);

  logger.info(`Starting download`, { url, format, platform, outputPath });

  try {
    const { stdout, stderr } = await execAsync(cmd, {
      timeout: DOWNLOAD.TIMEOUT_SECONDS * 1000,
      maxBuffer: 10 * 1024 * 1024,
    });
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
    const msg = err?.stderr ?? err?.message ?? String(err);
    logger.error("yt-dlp failed", { url, error: msg });
    return { success: false, error: msg };
  }
}
