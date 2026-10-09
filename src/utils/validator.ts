import { PLATFORM_HOSTS, PLATFORM_PATHS } from "@/constants/platforms";
import type { DetectedLink, Platform } from "@/types";

// First http(s) URL token in the message, so "check this <link>" also works.
const URL_IN_TEXT = /https?:\/\/[^\s<>"')\]]+/i;

const YOUTUBE_ID = /^[\w-]{5,}$/;

export function extractUrl(text: string): string | null {
  const match = URL_IN_TEXT.exec(text.trim());
  return match ? match[0] : null;
}

function matchPlatform(url: URL): Platform | null {
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;

  const host = url.hostname.toLowerCase();

  // youtu.be is host-only: the video id is the path.
  if (host === "youtu.be") {
    return YOUTUBE_ID.test(url.pathname.slice(1).replace(/\/+$/, "")) ? "youtube" : null;
  }

  for (const platform of Object.keys(PLATFORM_HOSTS) as Platform[]) {
    if (!PLATFORM_HOSTS[platform].includes(host)) continue;

    // Standard watch URLs need a ?v= id.
    if (platform === "youtube" && url.pathname === "/watch") {
      return YOUTUBE_ID.test(url.searchParams.get("v") ?? "") ? "youtube" : null;
    }

    if (PLATFORM_PATHS[platform].some((p) => p.test(url.pathname))) return platform;
  }

  return null;
}

export function detectLink(text: string): DetectedLink | null {
  const raw = extractUrl(text);
  if (!raw) return null;

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }

  const platform = matchPlatform(url);
  if (!platform) return null;

  return { url: url.toString(), platform };
}
