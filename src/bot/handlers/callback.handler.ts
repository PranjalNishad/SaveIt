import type { Context } from "telegraf";
import { MESSAGES } from "@/constants/messages";
import { logger } from "@/utils/logger";
import { redis } from "@/config/redis";
import { enqueueDownload } from "@/queue/download.queue";
import { CacheService } from "@/services/cache.service";
import { TelegramService } from "@/services/telegram.service";
import { downloadMedia } from "@/services/download.service";
import { safeDelete } from "@/utils/file";
import { env } from "@/config/env";
import { DOWNLOAD, FAST_PLATFORMS } from "@/constants";
import type { Platform, OutputFormat } from "@/types";
import { REDIS_KEYS } from "@/constants/redis-keys";
import { normalizeUrl } from "@/utils/url";

const telegram = new TelegramService(env.BOT_TOKEN);

// ── Global + per-user download tracking ──────────────────────────────────────
let activeDownloads = 0;
const userActiveDownloads = new Map<number, number>();

function getUserDownloads(userId: number): number {
  return userActiveDownloads.get(userId) ?? 0;
}

function incrementUser(userId: number): void {
  userActiveDownloads.set(userId, getUserDownloads(userId) + 1);
}

function decrementUser(userId: number): void {
  const current = getUserDownloads(userId);
  if (current <= 1) {
    userActiveDownloads.delete(userId);
  } else {
    userActiveDownloads.set(userId, current - 1);
  }
}

// ── Fast download handler (Instagram, TikTok, Twitter) ────────────────────────
async function handleFastDownload(
  chatId: number,
  messageId: number,
  url: string,
  format: OutputFormat,
  platform: Platform,
  replyToMessageId?: number,
): Promise<void> {
  const userId = chatId;

  // Check global limit (30 simultaneous downloads)
  if (activeDownloads >= DOWNLOAD.MAX_CONCURRENT_DOWNLOADS) {
    await telegram.editMessage(
      chatId,
      messageId,
      MESSAGES.SERVER_BUSY(activeDownloads, DOWNLOAD.MAX_CONCURRENT_DOWNLOADS),
    );
    return;
  }

  // Check per-user limit (5 links at once)
  if (getUserDownloads(userId) >= DOWNLOAD.MAX_LINKS_PER_USER) {
    await telegram.editMessage(
      chatId,
      messageId,
      `⏳ You already have *${DOWNLOAD.MAX_LINKS_PER_USER}* downloads running.\nWait for one to finish first.`,
    );
    return;
  }

  activeDownloads++;
  incrementUser(userId);
  logger.info(`Downloads`, {
    global: activeDownloads,
    user: getUserDownloads(userId),
  });

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
      if (result.filePath) safeDelete(result.filePath);
      return;
    }

    try {
      if (format === "audio") {
        await telegram.sendAudio(chatId, result.filePath!, { replyToMessageId });
      } else {
        await telegram.sendVideo(chatId, result.filePath!, { replyToMessageId });
      }
      await telegram.editMessage(chatId, messageId, MESSAGES.DONE);
    } finally {
      if (result.filePath) safeDelete(result.filePath);
    }

  } finally {
    activeDownloads--;
    decrementUser(userId);
    logger.info(`Downloads after completion`, {
      global: activeDownloads,
      user: getUserDownloads(userId),
    });
  }
}

// ── Main callback handler ─────────────────────────────────────────────────────
export async function handleCallback(ctx: Context): Promise<void> {
  try {
    const data: string = (ctx.callbackQuery as any)?.data ?? "";
    if (!data.startsWith("dl:")) return;

    try { await ctx.answerCbQuery("⏳ Starting download..."); } catch { }

    const [, format, ...keyParts] = data.split(":");
    const keySuffix = keyParts.join(":");
    const key = `${REDIS_KEYS.LINK_PREFIX}:${keySuffix}`;

    const stored = await redis.get(key);
    if (!stored) {
      await ctx.reply(MESSAGES.LINK_EXPIRED);
      return;
    }

    const { url, platform } = JSON.parse(stored) as {
      url: string;
      platform: Platform;
    };

    const normalizedUrl = normalizeUrl(url, platform);
    const replyToMessageId = (ctx.callbackQuery as any)?.message
      ?.message_id as number | undefined;
    const outputFormat = format as OutputFormat;

    // ── Check cache first ─────────────────────────────────────────────────────
    const cached = await CacheService.getMedia(normalizedUrl, platform, outputFormat);
    if (cached) {
      logger.info("Cache hit", { url: normalizedUrl, format: outputFormat });
      if (outputFormat === "audio") {
        await telegram.sendAudio(ctx.chat!.id, cached.fileId, { replyToMessageId });
      } else {
        await telegram.sendVideo(ctx.chat!.id, cached.fileId, { replyToMessageId });
      }
      return;
    }

    const processingMsg = await ctx.reply(
      MESSAGES.PROCESSING(outputFormat),
      { parse_mode: "Markdown" },
    );

    const chatId = ctx.chat!.id;
    const messageId = processingMsg.message_id;

    // ── Fast path — Instagram, TikTok, Twitter ────────────────────────────────
    if (FAST_PLATFORMS.includes(platform)) {
      handleFastDownload(
        chatId,
        messageId,
        normalizedUrl,
        outputFormat,
        platform,
        replyToMessageId,
      ).catch((err) => logger.error("Fast download error", err));
      return;
    }

    // ── Queue path — YouTube ──────────────────────────────────────────────────
    const enqueued = await enqueueDownload({
      chatId,
      messageId,
      replyToMessageId,
      url: normalizedUrl,
      format: outputFormat,
      platform,
      requestedAt: Date.now(),
    });

    if (enqueued.deduped) {
      await telegram.editMessage(
        chatId,
        messageId,
        MESSAGES.ALREADY_PROCESSING(outputFormat),
      );
    }

  } catch (err) {
    logger.error("Callback handler error", err);
    try { await ctx.reply(MESSAGES.GENERIC_ERROR); } catch { }
  }
}