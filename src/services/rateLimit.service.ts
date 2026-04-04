import { redis } from "@/config/redis";
import { env } from "@/config/env";
import { REDIS_KEYS } from "@/constants";
import type { RateLimitInfo } from "@/types";

export async function checkRateLimit(userId: number): Promise<RateLimitInfo> {
  const key = REDIS_KEYS.RATE_LIMIT(userId);
  const now = Date.now();
  const windowMs = env.RATE_LIMIT_WINDOW * 1000;
  // Use a single EVAL script to perform the rate-limit operations atomically
  const lua = `
    local key = KEYS[1]
    local now = tonumber(ARGV[1])
    local windowMs = tonumber(ARGV[2])
    local maxCount = tonumber(ARGV[3])
    local expireSeconds = tonumber(ARGV[4])

    redis.call('ZREMRANGEBYSCORE', key, 0, now - windowMs)
    local count = redis.call('ZCARD', key)
    if count >= maxCount then
      local oldest = redis.call('ZRANGE', key, 0, 0, 'WITHSCORES')
      local oldestTs = tonumber(oldest[2]) or now
      return {0, count, oldestTs}
    else
      redis.call('ZADD', key, now, tostring(now))
      redis.call('EXPIRE', key, expireSeconds)
      return {1, maxCount - count - 1, 0}
    end
  `;

  const res = (await redis.eval(lua, 1, key, now, windowMs, env.RATE_LIMIT_MAX, env.RATE_LIMIT_WINDOW)) as Array<any>;
  const allowed = res[0] === 1;
  const remaining = Number(res[1] ?? 0);
  const oldestTs = Number(res[2] ?? now);

  if (!allowed) {
    const resetInSeconds = Math.ceil((oldestTs + windowMs - now) / 1000);
    return { allowed: false, remaining: 0, resetInSeconds };
  }

  return { allowed: true, remaining, resetInSeconds: 0 };
}
