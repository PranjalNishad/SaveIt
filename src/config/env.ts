function required(key: string): string {
    const val = process.env[key];
    if (!val) throw new Error(`Missing required env var: ${key}`);
    return val;
}

function optional(key: string, fallback: string): string {
    return process.env[key] ?? fallback;
}

function optionalNumber(key: string, fallback: number): number {
    const raw = process.env[key];
    if (!raw) return fallback;

    const parsed = Number(raw);
    if (Number.isNaN(parsed)) {
        throw new Error(`Invalid numeric env var: ${key}=${raw}`);
    }

    return parsed;
}

export const env = {
    BOT_TOKEN: required("BOT_TOKEN"),

    REDIS_URL: process.env.REDIS_URL,
    REDIS_HOST: optional("REDIS_HOST", "127.0.0.1"),
    REDIS_PORT: optionalNumber("REDIS_PORT", 6379),
    REDIS_PASSWORD: process.env.REDIS_PASSWORD,

    RATE_LIMIT_MAX: optionalNumber("RATE_LIMIT_MAX_REQUESTS", 5),
    RATE_LIMIT_WINDOW: optionalNumber("RATE_LIMIT_WINDOW_SECONDS", 60),
    INFLIGHT_DEDUPE_TTL: optionalNumber("INFLIGHT_DEDUPE_TTL_SECONDS", 360),
    MAX_FILE_SIZE_MB: optionalNumber("MAX_FILE_SIZE_MB", 50),
    MEDIA_CACHE_TTL: optionalNumber("MEDIA_CACHE_TTL_SECONDS", 86400),

    TEMP_DIR: optional("TEMP_DIR", "./temp"),
    LOG_LEVEL: optional("LOG_LEVEL", "info"),
    LOG_DIR: optional("LOG_DIR", "./logs"),
} as const;
