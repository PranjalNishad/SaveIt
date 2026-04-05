import type { Context } from "telegraf";
import { MESSAGES } from "@/constants/messages";
import { logger } from "@/utils/logger";
import { redis } from "@/config/redis";
import { enqueueDownload } from "@/queue/download.queue";
import { CacheService } from "@/services/cache.service";
import { TelegramService } from "@/services/telegram.service";
import { env } from "@/config/env";
import type { Platform } from "@/types";
import { REDIS_KEYS } from "@/constants/redis-keys";
import { normalizeUrl } from "@/utils/url";

const telegram = new TelegramService(env.BOT_TOKEN);

export async function handleCallback(ctx: Context): Promise<void> {
    try {
        const data: string = (ctx.callbackQuery as any)?.data ?? "";
        if (!data.startsWith("dl:")) return;

        try {
            await ctx.answerCbQuery("⏳ Starting download...");
        } catch {}

        // data format: dl:audio:userId:timestamp
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
        const replyToMessageId = (ctx.callbackQuery as any)?.message?.message_id as number | undefined;
        // Don't delete the key yet, because maybe they want to click it again if it fails?
        // Actually yes, let's keep it until it expires via TTL.

        // Check cache first for AUDIO
        if (format === "audio") {
            const cachedAudio = await CacheService.getMedia(normalizedUrl, platform, "audio");
            if (cachedAudio) {
                logger.info("Cache hit for audio", { url: normalizedUrl });
                await telegram.sendAudio(ctx.chat!.id, cachedAudio.fileId, {
                    replyToMessageId,
                });
                return;
            }
        }

        const processingMsg = await ctx.reply(MESSAGES.PROCESSING("audio"), { parse_mode: "Markdown" });

        // Queue path
        const enqueued = await enqueueDownload({
            chatId: ctx.chat!.id,
            messageId: processingMsg.message_id,
            replyToMessageId,
            url: normalizedUrl,
            format: "audio",
            platform,
            requestedAt: Date.now(),
        });

        if (enqueued.deduped) {
            await telegram.editMessage(ctx.chat!.id, processingMsg.message_id, MESSAGES.ALREADY_PROCESSING("audio"));
        }
    } catch (err) {
        logger.error("Callback handler error", err);
        try {
            await ctx.reply(MESSAGES.GENERIC_ERROR);
        } catch {}
    }
}
