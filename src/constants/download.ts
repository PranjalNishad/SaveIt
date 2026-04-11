export const DOWNLOAD = {
  TIMEOUT_SECONDS: 120,
  SOCKET_TIMEOUT_SECONDS: 10,
  RETRIES: 2,
  CONCURRENT_FRAGMENTS: 8,
  AUDIO_QUALITY: "192K",
  AUDIO_FORMAT: "mp3",
  VIDEO_FORMAT: "mp4",
  VIDEO_FORMAT_SELECTOR:
    "bestvideo[filesize<45M][ext=mp4]+bestaudio[ext=m4a]/bestvideo[height<=720][filesize<45M][ext=mp4]+bestaudio[ext=m4a]/bestvideo[height<=480][filesize<45M][ext=mp4]+bestaudio[ext=m4a]/bestvideo[height<=360][filesize<45M][ext=mp4]+bestaudio[ext=m4a]/best[filesize<45M][ext=mp4]/best[filesize<45M]",
  INSTAGRAM_USER_AGENT: "Mozilla/5.0",
  YOUTUBE_COOKIES_FILE: "/app/youtube_cookies.txt",
  INSTAGRAM_COOKIES_FILE: "./instagram_cookies.txt",
} as const;
