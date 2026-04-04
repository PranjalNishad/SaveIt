import { Redis, type RedisOptions } from "ioredis";
import { env } from "./env";
import { logger } from "@/utils/logger";

const config: RedisOptions = {
  host: env.REDIS_HOST,
  port: env.REDIS_PORT,
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
  ...(env.REDIS_PASSWORD ? { password: env.REDIS_PASSWORD } : {}),
};

export const redis = new Redis(config);

redis.on("connect", () => logger.info("Redis connected"));
redis.on("ready", () => logger.info("Redis ready"));
redis.on("error", (err) => logger.error("Redis error", err));
redis.on("close", () => logger.warn("Redis connection closed"));
redis.on("reconnecting", () => logger.warn("Redis reconnecting..."));
