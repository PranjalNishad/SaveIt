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

function optionalPositiveNumber(key: string, fallback: number): number {
    const value = optionalNumber(key, fallback);
    if (value <= 0) {
        throw new Error(`Env var ${key} must be a positive number (got ${value})`);
    }
    return value;
}

// Telegram's Bot API caps bot uploads at 50MB for sendVideo AND sendDocument.
export const TELEGRAM_BOT_MAX_UPLOAD_MB = 50;

/** Clamp a configured max file size to Telegram's hard upload limit. */
export function clampFileSizeLimit(configuredMb: number): number {
    return Math.min(configuredMb, TELEGRAM_BOT_MAX_UPLOAD_MB);
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
    // Guard against a misconfigured value: never allow downloads larger than
    // Telegram will accept (a 500MB env would otherwise let huge files download
    // and then fail upload, burning bandwidth and retries). Warn via console to
    // avoid a dependency cycle with the logger at import time.
    MAX_FILE_SIZE_MB: (() => {
        const configured = optionalPositiveNumber("MAX_FILE_SIZE_MB", TELEGRAM_BOT_MAX_UPLOAD_MB);
        const clamped = clampFileSizeLimit(configured);
        if (clamped !== configured) {
            console.warn(
                `[config] MAX_FILE_SIZE_MB=${configured} exceeds Telegram's ${TELEGRAM_BOT_MAX_UPLOAD_MB}MB bot limit — clamping to ${clamped}MB`,
            );
        }
        return clamped;
    })(),
    MIN_FREE_DISK_MB: optionalPositiveNumber("MIN_FREE_DISK_MB", 500),
    MEDIA_CACHE_TTL: optionalNumber("MEDIA_CACHE_TTL_SECONDS", 86400),

    WORKER_CONCURRENCY: optionalPositiveNumber("WORKER_CONCURRENCY", 4),
    YTDLP_TIMEOUT_SECONDS: optionalPositiveNumber("YTDLP_TIMEOUT_SECONDS", 300),
    YTDLP_FORMAT_SELECTOR: optional("YTDLP_FORMAT_SELECTOR", "bv*+ba/b"),

    TEMP_DIR: optional("TEMP_DIR", "./temp"),
    LOG_LEVEL: optional("LOG_LEVEL", "info"),
    LOG_DIR: optional("LOG_DIR", "./logs"),
} as const;
