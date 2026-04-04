import type { Context } from "telegraf";
import { MESSAGES, FAST_PLATFORMS, REDIS_KEYS, DOWNLOAD } from "@/constants";
import { logger } from "@/utils/logger";
import { redis } from "@/config/redis";
import { downloadMedia } from "@/services/download.service";
import { TelegramService } from "@/services/telegram.service";
import { enqueueDownload } from "@/queue/queue";
import { safeDelete } from "@/utils/file";
import { env } from "@/config/env";
import type { OutputFormat, Platform } from "@/types";

const telegram = new TelegramService(env.BOT_TOKEN);

// Semaphore limits simultaneous downloads ─────────────────────────────────
let activeDownloads = 0;

async function handleFastDownload(
  chatId: number,
  messageId: number,
  url: string,
  format: OutputFormat,
  platform: Platform,
): Promise<void> {
  // If already at max, tell user to wait
  if (activeDownloads >= DOWNLOAD.MAX_CONCURRENT_DOWNLOADS) {
    await telegram.editMessage(
      chatId,
      messageId,
      `⏳ Server is busy (${activeDownloads} downloads running). Please wait and try again.`,
    );
    return;
  }

  activeDownloads++;
  logger.info(`Active downloads: ${activeDownloads}`);

  try {
    const result = await downloadMedia(url, format, platform);

    if (!result.success) {
      await telegram.editMessage(
        chatId,
        messageId,
        result.error?.startsWith("FILE_TOO_LARGE")
          ? MESSAGES.FILE_TOO_LARGE
          : MESSAGES.DOWNLOAD_FAILED,
      );
      if (result.filePath) await safeDelete(result.filePath);
      return;
    }

    try {
      format === "audio"
        ? await telegram.sendAudio(chatId, result.filePath!)
        : await telegram.sendVideo(chatId, result.filePath!);
      await telegram.editMessage(chatId, messageId, MESSAGES.DONE);
    } finally {
      if (result.filePath) await safeDelete(result.filePath);
    }
  } finally {
    activeDownloads--;
    logger.info(`Active downloads: ${activeDownloads}`);
  }
}

// ── Main callback handler ─────────────────────────────────────────────────────
export async function handleCallback(ctx: Context): Promise<void> {
  try {
    const data: string = (ctx.callbackQuery as any)?.data ?? "";
    if (!data.startsWith("dl:")) return;

    try {
      await ctx.answerCbQuery("⏳ Starting download...");
    } catch {}

    const [, format, ...keyParts] = data.split(":");
    const key = keyParts.join(":");

    const stored = await redis.get(key);
    if (!stored) {
      await ctx.reply(MESSAGES.LINK_EXPIRED);
      return;
    }

    const { url, platform } = JSON.parse(stored) as {
      url: string;
      platform: Platform;
    };
    await redis.del(key);

    const processingMsg = await ctx.reply(
      MESSAGES.PROCESSING(format as OutputFormat),
      {
        parse_mode: "Markdown",
      },
    );

    const chatId = ctx.chat!.id;
    const messageId = processingMsg.message_id;

    // Fast path — fire and forget
    if (FAST_PLATFORMS.includes(platform)) {
      handleFastDownload(
        chatId,
        messageId,
        url,
        format as OutputFormat,
        platform,
      ).catch((err) => {
        logger.error("Fast download error", err);
      });
      return;
    }

    // Queue path — YouTube
    await enqueueDownload({
      chatId,
      messageId,
      url,
      format: format as OutputFormat,
      platform,
      requestedAt: Date.now(),
    });
  } catch (err) {
    logger.error("Callback handler error", err);
    try {
      await ctx.reply(MESSAGES.GENERIC_ERROR);
    } catch {}
  }
}
