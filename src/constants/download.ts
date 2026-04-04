// DOWNLOAD.TS — Video & audio download settings
// Change these to control how videos are downloaded.

export const DOWNLOAD = {
  // How long to wait before giving up on a download (seconds)
  // Increase if you have slow internet and downloads time out
  TIMEOUT_SECONDS: 120,

  // ── How many times to retry if download fails
  SOCKET_TIMEOUT_SECONDS: 10,
  RETRIES: 2,

  // ── How many parallel chunks to download at once
  // Recommended: 4 to 8
  CONCURRENT_FRAGMENTS: 8,

  // ── Max simultaneous downloads at once across all users
  MAX_CONCURRENT_DOWNLOADS: 5,

  // ── Audio quality (MP3)
  // Options: "128K" (smaller file), "192K" (good), "320K" (best quality)
  AUDIO_QUALITY: "192K",

  // ── Audio format
  // Options: "mp3", "m4a", "wav", "opus"
  AUDIO_FORMAT: "mp3",

  // ── Video format
  VIDEO_FORMAT: "mp4",

  // ── yt-dlp format selection for video
  // This picks the best available mp4 quality
  // Change "bestvideo" to "bestvideo[height<=720]" to limit to 720p
  VIDEO_FORMAT_SELECTOR:
    "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best",

  // ── Extra headers for Instagram downloads (helps bypass blocks)
  INSTAGRAM_USER_AGENT: "Mozilla/5.0",
} as const;
