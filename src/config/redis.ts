import { Redis, type RedisOptions } from "ioredis";
import { env } from "./env";
import { logger } from "@/utils/logger";

// Backoff: grow delay with attempts, cap at 5s. Stops the tight reconnect loop
// that floods logs when Redis is down.
function retryStrategy(times: number): number {
    return Math.min(times * 250, 5000);
}

function baseOptions(): RedisOptions {
    return {
        maxRetriesPerRequest: null,
        enableReadyCheck: false,
        retryStrategy,
    };
}

function createRedisOptions(): RedisOptions {
    return {
        ...baseOptions(),
        host: env.REDIS_HOST,
        port: env.REDIS_PORT,
        ...(env.REDIS_PASSWORD ? { password: env.REDIS_PASSWORD } : {}),
    };
}

export function createRedisConnection(label?: string): Redis {
    const url = env.REDIS_URL?.trim();
    const urlOptions: RedisOptions = { ...baseOptions() };

    if (url?.startsWith("rediss://")) {
        urlOptions.tls = {};
    }

    const conn = url ? new Redis(url, urlOptions) : new Redis(createRedisOptions());

    const tag = label ?? "redis";

    // Throttle repeated error/close logs to once per 30s per connection so a
    // down Redis logs a heartbeat, not a flood.
    let lastErrLog = 0;
    const ERR_THROTTLE_MS = 30_000;

    conn.on("connect", () => {
        lastErrLog = 0;
        logger.info(`[${tag}] connected`);
    });
    conn.on("error", (err) => {
        const now = Date.now();
        if (now - lastErrLog < ERR_THROTTLE_MS) return;
        lastErrLog = now;
        logger.error(`[${tag}] error (suppressing repeats 30s)`, {
            error: err.message || (err as any).code || "connection failed",
        });
    });
    conn.on("close", () => {
        const now = Date.now();
        if (now - lastErrLog < ERR_THROTTLE_MS) return;
        logger.warn(`[${tag}] closed`);
    });

    return conn;
}

export const redis = createRedisConnection("shared");
