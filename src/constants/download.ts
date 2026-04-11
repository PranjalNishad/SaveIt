export const DOWNLOAD = {
  TIMEOUT_SECONDS: 120,
  SOCKET_TIMEOUT_SECONDS: 10,
  RETRIES: 2,
  CONCURRENT_FRAGMENTS: 8,
  AUDIO_QUALITY: "192K",
  AUDIO_FORMAT: "mp3",
  VIDEO_FORMAT: "mp4",
  VIDEO_FORMAT_SELECTOR:
    "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best",
  INSTAGRAM_USER_AGENT: "Mozilla/5.0",
  YOUTUBE_COOKIES_FILE: "./youtube_cookies.txt",
  INSTAGRAM_COOKIES_FILE: "./instagram_cookies.txt",
} as const;
