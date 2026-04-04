import type { Context } from "telegraf";
import { Markup } from "telegraf";
import { detectLink } from "@/utils/validator";
import { MESSAGES, PLATFORM_NAMES, REDIS_KEYS } from "@/constants";
import { logger } from "@/utils/logger";
import { redis } from "@/config/redis";

export async function handleMessage(ctx: Context): Promise<void> {
  const text = (ctx.message as any)?.text as string | undefined;
  if (!text) return;

  const detected = detectLink(text);
  if (!detected) {
    await ctx.reply(MESSAGES.INVALID_URL);
    return;
  }

  logger.info("Link detected", {
    userId: ctx.from?.id,
    platform: detected.platform,
  });

  // Store URL in Redis — avoids Telegram's 64-byte button data limit
  const key = REDIS_KEYS.LINK(ctx.from!.id, Date.now());
  await redis.set(
    key,
    JSON.stringify({ url: detected.url, platform: detected.platform }),
    "EX",
    REDIS_KEYS.LINK_TTL_SECONDS,
  );

  await ctx.reply(MESSAGES.CHOOSE_FORMAT(PLATFORM_NAMES[detected.platform]), {
    parse_mode: "Markdown",
    ...Markup.inlineKeyboard([
      [
        Markup.button.callback("🎬 Video (MP4)", `dl:video:${key}`),
        Markup.button.callback("🎵 Audio (MP3)", `dl:audio:${key}`),
      ],
    ]),
  });
}
