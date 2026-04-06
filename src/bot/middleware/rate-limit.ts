import type { Context } from "telegraf";
import { checkRateLimit } from "@/services/rate-limit.service";
import { MESSAGES } from "@/constants/messages";
import { logger } from "@/utils/logger";

/**
 * Checks per-user rate limits.
 * When normalizedUrl is provided, repeated same-link requests do not consume extra quota.
 * Returns true if allowed, false if blocked (and sends a warning message).
 */
export const rateLimitMiddleware = async (ctx: Context, normalizedUrl?: string): Promise<boolean> => {
    const userId = ctx.from?.id;
    if (!userId) return true;

    const result = await checkRateLimit(userId, normalizedUrl);

    if (!result.allowed) {
        logger.warn("Rate limit hit", {
            userId,
            resetInSeconds: result.resetInSeconds,
        });
        await ctx.reply(MESSAGES.RATE_LIMITED(result.resetInSeconds), {
            parse_mode: "Markdown",
        });
        return false;
    }

    return true;
};
