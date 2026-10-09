import fs from "fs";
import path from "path";
import { env } from "@/config/env";

// Cookie files live in Docker at /app/cookies/*.txt (mounted volume) and locally
// at ./cookies/*.txt. Resolve in that order unless an explicit env path is set,
// so a missing cookie file never hard-fails a spawn (see cookiesExist()).
function resolveCookiePath(envVal: string | undefined, dockerDefault: string, localName: string): string {
  const explicit = envVal?.trim();
  if (explicit) return explicit;

  const local = path.resolve(process.cwd(), "cookies", localName);
  try {
    if (fs.existsSync(local) && fs.statSync(local).size > 0) return local;
  } catch {
    /* fall through to the docker default */
  }

  return dockerDefault;
}

export const DOWNLOAD = {
  TIMEOUT_SECONDS: env.YTDLP_TIMEOUT_SECONDS,
  SOCKET_TIMEOUT_SECONDS: 10,
  RETRIES: 2,
  CONCURRENT_FRAGMENTS: 8,
  AUDIO_QUALITY: "192K",
  AUDIO_FORMAT: "mp3",
  VIDEO_FORMAT: "mp4",

  // yt-dlp format selector. Default keeps the proven best-video+best-audio
  // merge; the post-download 50MB check still rejects oversize files. Override
  // via YTDLP_FORMAT_SELECTOR (e.g. a size-bounded chain) if most videos exceed
  // the Telegram limit.
  VIDEO_FORMAT_SELECTOR: env.YTDLP_FORMAT_SELECTOR,

  INSTAGRAM_USER_AGENT: "Mozilla/5.0",

  // Cookies — optional. Override via env (mount as volume so refresh w/o rebuild).
  // Used ONLY as last-resort fallback; primary YouTube path needs no cookies.
  YOUTUBE_COOKIES_FILE: resolveCookiePath(
    process.env.YOUTUBE_COOKIES_FILE,
    "/app/cookies/youtube_cookies.txt",
    "youtube_cookies.txt",
  ),
  INSTAGRAM_COOKIES_FILE: resolveCookiePath(
    process.env.INSTAGRAM_COOKIES_FILE,
    "/app/cookies/instagram_cookies.txt",
    "instagram_cookies.txt",
  ),

  // ── YouTube anti-bot strategy ──────────────────────────────────────────────
  // yt-dlp player clients that bypass YouTube bot-detection WITHOUT cookies.
  // tv + web_safari work from datacenter IPs without PO-token/login.
  // Tried in order; first success wins. Override via YTDLP_YT_CLIENTS (csv).
  YOUTUBE_CLIENTS: (process.env.YTDLP_YT_CLIENTS ?? "tv_embedded,default,web_safari")
    .split(",")
    .map((c) => c.trim())
    .filter(Boolean),

  // ── Cobalt (optional) ──────────────────────────────────────────────────────
  // Public api.cobalt.tools now needs auth. Only used if COBALT_API_KEY set,
  // or a self-hosted instance via COBALT_INSTANCES (csv) that allows anon.
  COBALT_API_KEY: process.env.COBALT_API_KEY ?? "",
  COBALT_INSTANCES: (process.env.COBALT_INSTANCES ?? "")
    .split(",")
    .map((c) => c.trim())
    .filter(Boolean),

} as const;
