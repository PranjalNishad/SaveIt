export const REDIS_KEYS = {
    LINK_PREFIX: "link",
    LINK: (userId: number, timestamp: number) => `link:${userId}:${timestamp}`,
    RATE_LIMIT: (userId: number) => `rl:${userId}`,
    RATE_LIMIT_URL_SEEN: (userId: number, urlHash: string) => `rlurl:${userId}:${urlHash}`,
    INFLIGHT_DOWNLOAD: (userId: number, format: string, urlHash: string) => `inflight:${userId}:${format}:${urlHash}`,
    MEDIA_CACHE: (normalizedUrl: string, format: string) => `cache:${format}:${normalizedUrl}`,
    LINK_TTL_SECONDS: 600,
} as const;
