import { createHash, randomUUID } from "crypto";
import { redis } from "@/config/redis";
import { logger } from "@/utils/logger";
import { throttled } from "@/utils/log-throttle";

const LOCK_PREFIX = "bot:poller";
const LOCK_TTL_SECONDS = 60;
const RENEW_INTERVAL_MS = 30_000;

export interface PollerLock {
  release: () => Promise<void>;
}

/**
 * Namespace the single-poller lock by a short hash of the bot token, so two
 * DIFFERENT bots sharing one Redis never block each other. Only the hash is
 * stored and logged — the token itself is never written to Redis or the logs.
 */
export function pollerLockKey(token: string): string {
  const hash = createHash("sha1").update(token).digest("hex").slice(0, 12);
  return `${LOCK_PREFIX}:${hash}`;
}

// Compare-and-extend: only touch the key if we are still the holder.
const RENEW_LUA = `
if redis.call('get', KEYS[1]) == ARGV[1] then
  return redis.call('expire', KEYS[1], ARGV[2])
end
return 0
`;

// Compare-and-delete: never delete another instance's lock.
const RELEASE_LUA = `
if redis.call('get', KEYS[1]) == ARGV[1] then
  return redis.call('del', KEYS[1])
end
return 0
`;

/**
 * Best-effort single-poller guard. Telegram allows only one getUpdates poller
 * per token, so a second instance causes a 409 thrash loop. Returns null when
 * another instance already holds the lock.
 *
 * Degrades gracefully: if Redis is unreachable the bot starts WITHOUT the lock
 * rather than refusing to run (the 409 handler is the last line of defence).
 */
export async function acquirePollerLock(token: string): Promise<PollerLock | null> {
  const key = pollerLockKey(token);
  const id = randomUUID();
  const throttleLockLog = throttled();

  // Acquire with NX so a concurrent instance never overwrites the holder.
  try {
    const acquired = await redis.set(key, id, "EX", LOCK_TTL_SECONDS, "NX");
    if (acquired !== "OK") {
      logger.error(
        "Another bot poller holds the lock — refusing to start to avoid a 409 loop. " +
          "If this is stale it clears within 60s; otherwise ensure only one instance runs.",
        { lock: key },
      );
      return null;
    }
  } catch (err) {
    logger.warn("Poller lock unavailable (Redis unreachable) — starting without single-instance guard", {
      error: (err as Error).message,
    });
    return { release: async () => {} };
  }

  // Renew on a timer well inside the TTL. If we ever observe that we no longer
  // hold the lock (e.g. Redis restarted and the key expired, or another instance
  // took over), log it loudly — two pollers may be possible until the 409 path fires.
  const timer = setInterval(() => {
    redis
      .eval(RENEW_LUA, 1, key, id, LOCK_TTL_SECONDS)
      .then((res) => {
        if (Number(res) === 0) {
          throttleLockLog(() =>
            logger.error("Poller lock lost — another instance may be polling this token", { lock: key }),
          );
        }
      })
      .catch((err) => {
        throttleLockLog(() =>
          logger.warn("Poller lock renewal failed (will retry)", { error: (err as Error).message }),
        );
      });
  }, RENEW_INTERVAL_MS);
  timer.unref?.();

  return {
    release: async () => {
      clearInterval(timer);
      try {
        await redis.eval(RELEASE_LUA, 1, key, id);
      } catch {
        /* best effort */
      }
    },
  };
}
