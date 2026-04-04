// MESSAGES.TS — All text the bot sends to users

export const MESSAGES = {

  // /start command
  WELCOME:
    `👋 *Welcome to SaveMyClips Bot!*\n\n` +
    `Send me a video link and choose Video or Audio.\n\n` +
    `*Supported platforms:*\n` +
    `• 📹 YouTube Shorts\n` +
    `• 📸 Instagram Reels & Stories\n` +
    `• 🐦 Twitter / X Videos\n` +
    `• 🎵 TikTok\n\n` +
    `_Paste any link to get started!_`,

  // /help command
  HELP:
    `📖 *How to use SaveMyClips:*\n\n` +
    `1. Copy a video link\n` +
    `2. Paste it here\n` +
    `3. Choose *Video* or *Audio*\n` +
    `4. Done!\n\n` +
    `_Make sure the video is public._`,

  // Shown after link is detected — asks Video or Audio
  CHOOSE_FORMAT: (platform: string) =>
    `✅ *${platform}* link detected!\n\nWhat do you want?`,

  // Shown while downloading
  PROCESSING: (format: "video" | "audio") =>
    `⏳ Downloading ${format === "audio" ? "audio 🎵" : "video 🎬"}...\nThis may take a few seconds.`,

  // Shown after successful send
  SUCCESS_VIDEO: `✅ Here's your video!`,
  SUCCESS_AUDIO: `✅ Here's your audio!`,
  DONE:          `✅ Done!`,

  // Errors
  INVALID_URL:
    `❌ I couldn't recognize that link.\n\n` +
    `*Supported links:*\n` +
    `• youtube.com/shorts/...\n` +
    `• instagram.com/reel/... or /stories/...\n` +
    `• twitter.com or x.com/status/...\n` +
    `• tiktok.com/video/...`,

  FILE_TOO_LARGE:
    `⚠️ This file is too large for Telegram (max 50MB).\n` +
    `Try a shorter clip.`,

  DOWNLOAD_FAILED:
    `❌ Download failed. The video may be:\n` +
    `• Private or login-required\n` +
    `• Expired or deleted\n` +
    `• Geo-restricted\n\n` +
    `Try again or use a different link.`,

  GENERIC_ERROR:  `❌ Something went wrong. Please try again.`,
  LINK_EXPIRED:   `❌ Link expired. Please send it again.`,

  // Rate limit — {resetIn} auto-replaced with actual seconds
  RATE_LIMITED: (resetIn: number) =>
    `🚫 Too many requests! Try again in *${resetIn}s*.`,

};
