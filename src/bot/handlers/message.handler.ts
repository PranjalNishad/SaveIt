import type { Context } from "telegraf";
import { detectLink } from "@/utils/validator";
import { MESSAGES } from "@/constants/messages";
import { REDIS_KEYS } from "@/constants/redis-keys";
import { logger } from "@/utils/logger";
import { redis } from "@/config/redis";
import { enqueueDownload } from "@/queue/download.queue";
import { CacheService } from "@/services/cache.service";
import { TelegramService } from "@/services/telegram.service";
import { env } from "@/config/env";
import { rateLimitMiddleware } from "@/bot/middleware/rate-limit";
import { normalizeUrl } from "@/utils/url";

const telegram = new TelegramService(env.BOT_TOKEN);

export async function handleMessage(ctx: Context): Promise<void> {
    const text = (ctx.message as any)?.text as string | undefined;
    if (!text) return;

    const detected = detectLink(text);
    if (!detected) {
        await ctx.reply(MESSAGES.INVALID_URL);
        return;
    }

    const { url, platform } = detected;
    const normalizedUrl = normalizeUrl(url, platform);

    // NOTE: Apply rate limit here so we don't punish users who send normal text messages.
    const rateLimitResult = await rateLimitMiddleware(ctx, normalizedUrl);
    if (!rateLimitResult) return; // Middleware already sent the blocked message

    const userId = ctx.from!.id;
    const replyToMessageId = (ctx.message as any)?.message_id as number | undefined;

    logger.info("Link detected", { userId, platform });

    // Store URL in Redis for the audio fallback button
    const linkKeyTimestamp = Date.now();
    const linkKey = REDIS_KEYS.LINK(userId, linkKeyTimestamp);
    const linkKeySuffix = `${userId}:${linkKeyTimestamp}`;

    await redis.set(linkKey, JSON.stringify({ url: normalizedUrl, platform }), "EX", REDIS_KEYS.LINK_TTL_SECONDS);

    // Check cache first for VIDEO
    const cachedVideo = await CacheService.getMedia(normalizedUrl, platform, "video");
    if (cachedVideo) {
        logger.info("Cache hit for video", { url: normalizedUrl });
        await telegram.sendVideo(ctx.chat!.id, cachedVideo.fileId, {
            audioKey: linkKeySuffix,
            replyToMessageId,
        });
        return;
    }

    // Not in cache, so we drop it into the queue
    const processingMsg = await ctx.reply(MESSAGES.DETECTED(platform), { parse_mode: "Markdown" });

    const enqueued = await enqueueDownload({
        chatId: ctx.chat!.id,
        messageId: processingMsg.message_id,
        replyToMessageId,
        url: normalizedUrl,
        platform,
        format: "video",
        requestedAt: Date.now(),
        audioKey: linkKeySuffix, // Pass it to the worker so it can add the button
    });

    if (enqueued.deduped) {
        await telegram.editMessage(ctx.chat!.id, processingMsg.message_id, MESSAGES.ALREADY_PROCESSING("video"));
    }
}
