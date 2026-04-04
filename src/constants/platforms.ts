// PLATFORMS.TS — Supported platforms configuration
// Add or remove platforms here.
// PLATFORM_PATTERNS: URL patterns used to detect which platform
// PLATFORM_NAMES: How the platform name appears to users
// FAST_PLATFORMS: These skip the queue for instant downloads

import type { Platform } from "@/types";

// ── URL patterns to detect which platform a link belongs to ──
// Add new patterns here if a platform changes its URL format
export const PLATFORM_PATTERNS: Record<Platform, RegExp[]> = {
  youtube: [
    /youtube\.com\/shorts\//i, // YouTube Shorts
    /youtu\.be\//i, // Short YouTube links
    /youtube\.com\/watch\?v=/i, // Regular YouTube videos
  ],
  instagram: [
    /instagram\.com\/reel\//i, // Instagram Reels
    /instagram\.com\/p\//i, // Instagram Posts
    /instagram\.com\/stories\//i, // Instagram Stories
  ],
  twitter: [
    /twitter\.com\/.+\/status\//i, // Old Twitter URLs
    /x\.com\/.+\/status\//i, // New X.com URLs
  ],
  tiktok: [
    /tiktok\.com\/@.+\/video\//i, // Full TikTok URLs
    /vm\.tiktok\.com\//i, // Short TikTok URLs
  ],
};

// How platform names appear in bot messages
export const PLATFORM_NAMES: Record<Platform, string> = {
  youtube: "YouTube",
  instagram: "Instagram",
  twitter: "Twitter / X",
  tiktok: "TikTok",
};

// Platforms that download directly without going through queue
// These serve pre-merged mp4 files so they are instant (~3-5s)
// YouTube is NOT here because it needs video+audio merging
export const FAST_PLATFORMS: Platform[] = ["instagram", "tiktok", "twitter"];
