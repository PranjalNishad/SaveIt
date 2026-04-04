import type { Context, MiddlewareFn } from "telegraf";
import { checkRateLimit } from "@/services/rateLimit.service";
import { MESSAGES } from "@/constants";
import { logger } from "@/utils/logger";

/**
 * Telegraf middleware that enforces per-user rate limits.
 * Blocked users get a friendly message with a countdown.
 */
export const rateLimitMiddleware: MiddlewareFn<Context> = async (ctx, next) => {
  const userId = ctx.from?.id;
  if (!userId) return next();

  const result = await checkRateLimit(userId);

  if (!result.allowed) {
    logger.warn("Rate limit hit", {
      userId,
      resetInSeconds: result.resetInSeconds,
    });
    await ctx.reply(MESSAGES.RATE_LIMITED(result.resetInSeconds), {
      parse_mode: "Markdown",
    });
    return; // Do NOT call next()
  }

  return next();
};
