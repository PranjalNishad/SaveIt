import type { Context } from "telegraf";
import { MESSAGES } from "@/constants/messages";
import { logger } from "@/utils/logger";
import { redis } from "@/config/redis";
import { enqueueDownload } from "@/queue/download.queue";
import { CacheService } from "@/services/cache.service";
import { TelegramService } from "@/services/telegram.service";
import { env } from "@/config/env";
import type { Platform, OutputFormat } from "@/types";
import { REDIS_KEYS } from "@/constants/redis-keys";
import { normalizeUrl } from "@/utils/url";
import { rateLimitMiddleware } from "@/bot/middleware/rate-limit";

const telegram = new TelegramService(env.BOT_TOKEN);

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

    // Per-user rate limit applies to this path too (not just new links).
    const allowed = await rateLimitMiddleware(ctx, normalizedUrl);
    if (!allowed) return;

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

    // ── Every download goes through BullMQ ────────────────────────────────────
    const processingMsg = await ctx.reply(
      MESSAGES.PROCESSING(outputFormat),
      { parse_mode: "Markdown" },
    );

    const enqueued = await enqueueDownload({
      chatId: ctx.chat!.id,
      messageId: processingMsg.message_id,
      replyToMessageId,
      url: normalizedUrl,
      format: outputFormat,
      platform,
      requestedAt: Date.now(),
    });

    if (enqueued.deduped) {
      await telegram.editMessage(
        ctx.chat!.id,
        processingMsg.message_id,
        MESSAGES.ALREADY_PROCESSING(outputFormat),
      );
    }

  } catch (err) {
    logger.error("Callback handler error", err);
    try { await ctx.reply(MESSAGES.GENERIC_ERROR); } catch { }
  }
}
