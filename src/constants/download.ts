export const DOWNLOAD = {
  TIMEOUT_SECONDS: 120,
  SOCKET_TIMEOUT_SECONDS: 10,
  RETRIES: 2,
  CONCURRENT_FRAGMENTS: 8,
  AUDIO_QUALITY: "192K",
  AUDIO_FORMAT: "mp3",
  VIDEO_FORMAT: "mp4",

  // Smart quality fallback — best quality under ~45MB, steps down if needed.
  // Uses BOTH filesize and filesize_approx (Instagram/DASH only report approx),
  // then plain height-capped fallbacks (post-download 50MB check guards oversize).
  VIDEO_FORMAT_SELECTOR:
    "bv*+ba/b",

  INSTAGRAM_USER_AGENT: "Mozilla/5.0",

  // Cookies — optional. Override via env (mount as volume so refresh w/o rebuild).
  // Used ONLY as last-resort fallback; primary YouTube path needs no cookies.
  YOUTUBE_COOKIES_FILE: process.env.YOUTUBE_COOKIES_FILE ?? "/app/youtube_cookies.txt",
  INSTAGRAM_COOKIES_FILE: process.env.INSTAGRAM_COOKIES_FILE ?? "/app/instagram_cookies.txt",

  // ── YouTube anti-bot strategy ──────────────────────────────────────────────
  // yt-dlp player clients that bypass YouTube bot-detection WITHOUT cookies.
  // tv + web_safari work from datacenter IPs without PO-token/login.
  // Tried in order; first success wins. Override via YTDLP_YT_CLIENTS (csv).
  YOUTUBE_CLIENTS: (process.env.YTDLP_YT_CLIENTS ?? "tv_embedded,default,web_safari")
    .split(",")
    .map((c) => c.trim())
    .filter(Boolean),

  // ── Cobalt (optional) ──────────────────────────────────────────────────────
  // Public api.cobalt.tools now needs auth. Only used if COBALT_API_KEY set,
  // or a self-hosted instance via COBALT_INSTANCES (csv) that allows anon.
  COBALT_API_KEY: process.env.COBALT_API_KEY ?? "",
  COBALT_INSTANCES: (process.env.COBALT_INSTANCES ?? "")
    .split(",")
    .map((c) => c.trim())
    .filter(Boolean),

  // ── Concurrency settings ──────────────────────────────────────────────────
  MAX_CONCURRENT_DOWNLOADS: 30,  // 30 users simultaneously
  MAX_LINKS_PER_USER: 5,         // 5 links per user at once

} as const;
