import type { Platform } from "@/types";

export const PLATFORM_PATTERNS: Record<Platform, RegExp[]> = {
  youtube:   [/youtube\.com\/shorts\//i, /youtu\.be\//i, /youtube\.com\/watch\?v=/i],
  instagram: [/instagram\.com\/reel\//i, /instagram\.com\/p\//i, /instagram\.com\/stories\//i],
  twitter:   [/twitter\.com\/.+\/status\//i, /x\.com\/.+\/status\//i],
  tiktok:    [/tiktok\.com\/@.+\/video\//i, /vm\.tiktok\.com\//i],
};

export const PLATFORM_NAMES: Record<Platform, string> = {
  youtube:   "YouTube",
  instagram: "Instagram",
  twitter:   "Twitter / X",
  tiktok:    "TikTok",
};

// These platforms serve pre-merged mp4 — download directly without queue
export const FAST_PLATFORMS: Platform[] = [
  "instagram",
  "tiktok",
  "twitter",
];