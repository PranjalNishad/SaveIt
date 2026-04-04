// REDIS-KEYS.TS — Redis storage key patterns
// These are the key names used to store data in Redis.
// Change the prefix if you run multiple bots on the same Redis.

export const REDIS_KEYS = {

  // ── Stores a URL temporarily when user sends a link
  // Used to pass data to inline buttons without exceeding Telegram's 64 byte limit
  // Format: link:<userId>:<timestamp>
  LINK: (userId: number, timestamp: number) => `link:${userId}:${timestamp}`,

  // ── Rate limiting key per user
  // Stores timestamps of recent requests
  // Format: ratelimit:<userId>
  RATE_LIMIT: (userId: number) => `ratelimit:${userId}`,

  // ── How long (seconds) to keep a stored link before it expires
  // If user doesn't tap a button within this time, link is gone
  LINK_TTL_SECONDS: 600, // 10 minutes

} as const;
