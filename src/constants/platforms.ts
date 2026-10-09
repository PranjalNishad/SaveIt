import type { Platform } from "@/types";

// Exact, lowercased hostname allowlists. Validation matches against
// URL.hostname ONLY, so a path or query string that merely *contains* a
// platform name (e.g. https://evil.com/?u=youtube.com/watch?v=x) can never match.
export const PLATFORM_HOSTS: Record<Platform, string[]> = {
  youtube: ["youtube.com", "www.youtube.com", "m.youtube.com", "music.youtube.com", "youtu.be"],
  instagram: ["instagram.com", "www.instagram.com", "m.instagram.com"],
  twitter: ["twitter.com", "www.twitter.com", "mobile.twitter.com", "x.com", "www.x.com"],
  tiktok: ["tiktok.com", "www.tiktok.com", "m.tiktok.com", "vm.tiktok.com", "vt.tiktok.com"],
};

// Tested against URL.pathname ONLY (not the full URL string).
export const PLATFORM_PATHS: Record<Platform, RegExp[]> = {
  youtube: [/^\/shorts\/[\w-]+/, /^\/live\/[\w-]+/, /^\/embed\/[\w-]+/],
  instagram: [/^\/reels?\/[\w-]+/, /^\/p\/[\w-]+/, /^\/tv\/[\w-]+/, /^\/stories\/[\w.-]+\/[\w-]+/],
  twitter: [/^\/i\/status\/\d+/, /^\/[\w.-]+\/status\/\d+/],
  tiktok: [/^\/@[\w.-]+\/video\/\d+/, /^\/video\/\d+/, /^\/t\/[\w-]+/, /^\/[\w-]{5,}\/?$/],
};

export const PLATFORM_NAMES: Record<Platform, string> = {
  youtube: "YouTube",
  instagram: "Instagram",
  twitter: "Twitter / X",
  tiktok: "TikTok",
};
