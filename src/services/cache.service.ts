import { redis } from "@/config/redis";
import { env } from "@/config/env";
import { REDIS_KEYS } from "@/constants/redis-keys";
import type { CachedMedia, OutputFormat, Platform } from "@/types";
import { logger } from "@/utils/logger";
import { normalizeUrl } from "@/utils/url";

export class CacheService {
    /**
     * Tries to get the cached file ID for a specific URL and format.
     */
    static async getMedia(rawUrl: string, platform: Platform, format: OutputFormat): Promise<CachedMedia | null> {
        const normalizedUrl = normalizeUrl(rawUrl, platform);
        const key = REDIS_KEYS.MEDIA_CACHE(normalizedUrl, format);

        try {
            const stored = await redis.get(key);
            if (stored) {
                return JSON.parse(stored) as CachedMedia;
            }
        } catch (err) {
            logger.error("Error reading from Redis cache", err);
        }
        return null;
    }

    /**
     * Saves a sent file ID to Redis so future requests for the same URL can use it.
     */
    static async saveMedia(rawUrl: string, platform: Platform, format: OutputFormat, fileId: string): Promise<void> {
        const normalizedUrl = normalizeUrl(rawUrl, platform);
        const key = REDIS_KEYS.MEDIA_CACHE(normalizedUrl, format);

        const payload: CachedMedia = {
            fileId,
            format,
            platform,
            cachedAt: Date.now(),
        };

        try {
            await redis.set(key, JSON.stringify(payload), "EX", env.MEDIA_CACHE_TTL);
        } catch (err) {
            logger.error("Error saving to Redis cache", err);
        }
    }
}
