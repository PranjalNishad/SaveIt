// ─── Platform & Format ──────────────────────────────────────────────────────

export type Platform     = "youtube" | "instagram" | "twitter" | "tiktok";
export type OutputFormat = "video" | "audio";

// ─── Job ────────────────────────────────────────────────────────────────────

export interface DownloadJobData {
  chatId:      number;
  messageId:   number;
  url:         string;
  platform:    Platform;
  format:      OutputFormat;
  requestedAt: number;
}

// ─── Rate Limit ─────────────────────────────────────────────────────────────

export interface RateLimitInfo {
  allowed:        boolean;
  remaining:      number;
  resetInSeconds: number;
}

// ─── Detected Link ──────────────────────────────────────────────────────────

export interface DetectedLink {
  url:      string;
  platform: Platform;
}
