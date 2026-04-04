function required(key: string): string {
  const val = process.env[key];
  if (!val) throw new Error(`❌ Missing required env var: ${key}`);
  return val;
}

function optional(key: string, fallback: string): string {
  return process.env[key] ?? fallback;
}

export const env = {
  BOT_TOKEN:        required("BOT_TOKEN"),
  REDIS_HOST:       optional("REDIS_HOST", "127.0.0.1"),
  REDIS_PORT:       Number(optional("REDIS_PORT", "6379")),
  REDIS_PASSWORD:   process.env.REDIS_PASSWORD,
  RATE_LIMIT_MAX:   Number(optional("RATE_LIMIT_MAX_REQUESTS", "5")),
  RATE_LIMIT_WINDOW:Number(optional("RATE_LIMIT_WINDOW_SECONDS", "60")),
  MAX_FILE_SIZE_MB: Number(optional("MAX_FILE_SIZE_MB", "50")),
  TEMP_DIR:         optional("TEMP_DIR", "./temp"),
  LOG_LEVEL:        optional("LOG_LEVEL", "info"),
  LOG_DIR:          optional("LOG_DIR", "./logs"),
} as const;
