import { Redis, type RedisOptions } from "ioredis";
import { env } from "./env";
import { logger } from "@/utils/logger";

function createRedisOptions(): RedisOptions {
    return {
        host: env.REDIS_HOST,
        port: env.REDIS_PORT,
        maxRetriesPerRequest: null,
        enableReadyCheck: false,
        ...(env.REDIS_PASSWORD ? { password: env.REDIS_PASSWORD } : {}),
    };
}

export function createRedisConnection(label?: string): Redis {
    const url = env.REDIS_URL?.trim();
    const urlOptions: RedisOptions = {
        maxRetriesPerRequest: null,
        enableReadyCheck: false,
    };

    if (url?.startsWith("rediss://")) {
        urlOptions.tls = {};
    }

    const conn = url ? new Redis(url, urlOptions) : new Redis(createRedisOptions());

    const tag = label ?? "redis";
    conn.on("connect", () => logger.info(`[${tag}] connected`));
    conn.on("error", (err) => logger.error(`[${tag}] error`, { error: err.message }));
    conn.on("close", () => logger.warn(`[${tag}] closed`));

    return conn;
}

export const redis = createRedisConnection("shared");
