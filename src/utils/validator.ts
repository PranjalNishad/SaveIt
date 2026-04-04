import { PLATFORM_PATTERNS } from "@/constants";
import type { DetectedLink, Platform } from "@/types";

export function detectLink(text: string): DetectedLink | null {
  const url = text.trim();
  try {
    new URL(url);
  } catch {
    return null;
  }

  for (const [platform, patterns] of Object.entries(PLATFORM_PATTERNS)) {
    if (patterns.some((p) => p.test(url))) {
      return { url, platform: platform as Platform };
    }
  }
  return null;
}
