// yt-dlp / platform errors that will not succeed on retry. Retrying these only
// wastes worker capacity and floods logs (each retry re-attempts every client).
//
// Deliberately EXCLUDES transient signals like HTTP 403 (expired PO-token can
// recover on the next client) and 429 (rate limit) — those stay retryable.
const PERMANENT_PATTERNS: RegExp[] = [
  /empty media response/i,
  /sign in to confirm/i,
  /login required/i,
  /private video/i,
  /this video is private/i,
  /video unavailable/i,
  /this post is not available/i,
  /has been removed/i,
  /\bdeleted\b/i,
  /no video formats found/i,
  /requested format is not available/i,
  /unsupported url/i,
  /not available in your country/i,
  /geo.?restricted/i,
  /http error 40[14]/i,
  /does not exist/i,
  // Local resource problems that a retry cannot fix.
  /^disk_full/i,
  /not enough free disk space/i,
];

export function isPermanentDownloadError(error: string | undefined): boolean {
  if (!error) return false;
  return PERMANENT_PATTERNS.some((pattern) => pattern.test(error));
}
