import type { OutputFormat } from "@/types";

export const MESSAGES = {
    WELCOME:
        `👋 *Welcome to SaveMyClips Bot!*\n\n` +
        `Send me a video link and I'll download it for you.\n\n` +
        `*Supported platforms:*\n` +
        `• 📹 YouTube Shorts\n` +
        `• 📸 Instagram Reels & Stories\n` +
        `• 🐦 Twitter / X Videos\n` +
        `• 🎵 TikTok\n\n` +
        `_Paste any link to get started!_`,

    HELP:
        `📖 *How to use SaveMyClips:*\n\n` +
        `1. Copy a video link\n` +
        `2. Paste it here\n` +
        `3. I'll send the video automatically\n` +
        `4. Want audio? Tap the button below the video\n\n` +
        `_Make sure the video is public._`,

    DETECTED: (platform: string) => `✅ *${platform}* link detected! Downloading video 🎬...`,

    PROCESSING: (format: OutputFormat) => `⏳ Downloading ${format === "audio" ? "audio 🎵" : "video 🎬"}...\nThis may take a few seconds.`,
    ALREADY_PROCESSING: (format: OutputFormat) =>
        `⏳ This ${format === "audio" ? "audio" : "video"} is already being processed. Please wait a moment.`,

    CACHED_HIT: `⚡ Sent from cache!`,

    SUCCESS_VIDEO: `✅ Here's your video!`,
    SUCCESS_AUDIO: `✅ Here's your audio!`,
    DONE: `✅ Done!`,

    INVALID_URL:
        `❌ I couldn't recognize that link.\n\n` +
        `*Supported links:*\n` +
        `• youtube.com/shorts/...\n` +
        `• instagram.com/reel/... or /stories/...\n` +
        `• twitter.com or x.com/status/...\n` +
        `• tiktok.com/video/...`,

    FILE_TOO_LARGE: `⚠️ This file is too large for Telegram (max 50MB).\n` + `Try a shorter clip.`,

    DOWNLOAD_FAILED:
        `❌ Download failed. The video may be:\n` +
        `• Private or login-required\n` +
        `• Expired or deleted\n` +
        `• Geo-restricted\n\n` +
        `Try again or use a different link.`,

    GENERIC_ERROR: `❌ Something went wrong. Please try again.`,
    LINK_EXPIRED: `❌ Link expired. Please send it again.`,

    RATE_LIMITED: (resetIn: number) => `🚫 Too many requests! Try again in *${resetIn}s*.`,
};
