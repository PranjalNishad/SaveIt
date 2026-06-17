# Changes — Reliability & YouTube Fix

Session goal: YouTube downloads failed in production and kept demanding fresh
tokens/cookies; the bot also crashed. This documents every change: what, why,
added, removed.

Commits:
- `5a42a66` — cookieless YouTube + crash-proof supervisor
- `f0a4924` — format selector fix (Instagram)
- `5f3f3a3` — daily yt-dlp cron + Redis log-flood throttle
- local-only `.env` typo fix (not committed; `.env` is gitignored)

---

## Root causes found

1. **YouTube dead in prod.** Primary path used the public Cobalt API
   (`api.cobalt.tools`). It now requires auth and returns
   `error.api.auth.jwt.missing`. So every YouTube request fell through to
   yt-dlp.
2. **yt-dlp needed cookies that expire.** From a datacenter IP, YouTube
   bot-detects yt-dlp ("Sign in to confirm you're not a bot"). The only fix in
   place was `youtube_cookies.txt`, **baked into the Docker image at build
   time**. Cookies expire in days → "needs token again and again", and
   refreshing meant rebuilding the image.
3. **Instagram returned zero formats.** The format selector required exact
   `[filesize<45M]`. Instagram/DASH report only `filesize_approx`, so the
   selector matched nothing → `Requested format is not available`.
4. **Container crashed as a unit.** The supervisor killed the whole container
   if either child (bot/worker) exited. One stray error = full restart.
5. **Redis errors flooded logs.** When Redis was briefly unreachable, ioredis +
   BullMQ logged an error on every retry, hundreds per minute.
6. **`.env` typo.** `REDIS_URL=redis://localhost:637` (port 637, not 6379) —
   broke local `bun start` only (Docker overrides this var).

---

## File-by-file

### `src/services/download.service.ts` — rewritten YouTube path
**Why:** make YouTube work without cookies and stop depending on dead Cobalt.

Added:
- `cookiesExist(file)` — only attach `--cookies` if the file is present and
  non-empty. Missing/expired cookies never hard-fail a download.
- `ytBaseArgs()` — shared yt-dlp args builder for YouTube (video/audio).
- `downloadYouTubeViaYtDlp()` — the new YouTube strategy:
  1. Try each no-cookie player client in order
     (`tv_embedded`, `default`, `web_safari`). `tv_embedded` bypasses YouTube
     bot-detection from datacenter IPs **without login or PO-token** — this is
     the key fix. First client that succeeds wins.
  2. Only if all clients fail **and** a cookie file actually exists, retry with
     `--cookies` as a last resort.
- `safeUnlink()` — clean up partial output between client attempts.
- Cobalt now sends `Authorization: Api-Key <key>` when `COBALT_API_KEY` is set.

Changed:
- Main `downloadMedia()` YouTube branch: **yt-dlp no-cookie first**, then Cobalt
  only as optional fallback (was: Cobalt first, yt-dlp+cookies fallback).
- Instagram branch: cookies attached only if present (via `cookiesExist`).

Removed:
- Hard-coded `COBALT_INSTANCES` array (public instances that now need auth).
- The old YouTube path that always required `youtube_cookies.txt`.

### `src/constants/download.ts`
**Why:** make behavior configurable and fix the selector.

Added:
- `YOUTUBE_CLIENTS` — yt-dlp clients to try, default
  `tv_embedded,default,web_safari`, override via `YTDLP_YT_CLIENTS`.
- `COBALT_API_KEY`, `COBALT_INSTANCES` — Cobalt now opt-in via env.
- Cookie paths read from env (`YOUTUBE_COOKIES_FILE`, `INSTAGRAM_COOKIES_FILE`)
  with Docker defaults — so they can point at a mounted volume.

Changed:
- `VIDEO_FORMAT_SELECTOR` — added a `filesize_approx<45M` tier and plain
  height-capped fallbacks. Fixes Instagram (approx-only sizes); the
  post-download 50MB check still guards oversize files.

### `src/index.ts` — supervisor
**Why:** stop one child crash from taking down the container.

Added:
- `scheduleRestart()` — restarts only the crashed child with capped exponential
  backoff (1s → max 30s), tracking attempts per child.
- `ManagedProcess` now stores `entry`, `restarts`, `restartTimer`.

Changed:
- On child `error`/`exit`, restart that child instead of `shutdown()` of the
  whole container.

### `src/bot/index.ts` and `src/worker/index.ts`
**Why:** a stray async error should log, not kill the process.

Added:
- `process.on("unhandledRejection")` and `process.on("uncaughtException")`
  handlers in both — log and keep running. BullMQ still retries failed jobs.
- Worker: throttled `worker.on("error")` logging (once per 30s).

### `src/config/redis.ts`
**Why:** stop the reconnect log flood.

Added:
- `retryStrategy` — backoff `250ms * attempts`, capped at 5s (was a tight loop).
- Error/close logs throttled to once per 30s per connection.

### `src/queue/download.queue.ts`
- `videoQueue.on("error")` logging throttled to once per 30s.

### `src/utils/log-throttle.ts` — NEW
- `throttled(windowMs)` helper: runs a fn at most once per window. Used by
  worker + queue error handlers.

### `Dockerfile`
**Why:** keep yt-dlp current and stop baking cookies into the image.

Changed:
- yt-dlp installed into a **bun-owned venv** (`/app/venv`) so it can self-update
  at runtime without root.
- Entrypoint is now `docker-entrypoint.sh`.

Removed:
- `COPY youtube_cookies.txt` / `COPY instagram_cookies.txt` into the image.
  Cookies are now a mounted volume (refresh without rebuild).
- Deno install (was unused for the download path).

### `docker-entrypoint.sh` — NEW
**Why:** YouTube breaks often; stale yt-dlp = broken downloads.
- Updates yt-dlp on boot (best-effort, never blocks startup).
- Background loop re-updates yt-dlp every 24h (daily cron).

### `docker-compose.yml`
Added:
- `./cookies:/app/cookies:ro` volume — drop cookie files here, refresh without
  rebuild.
- Env passthrough/examples: `YOUTUBE_COOKIES_FILE`, `INSTAGRAM_COOKIES_FILE`,
  `COBALT_API_KEY`, `COBALT_INSTANCES`, `YTDLP_YT_CLIENTS`.

### `.env.example`
- Documented the new optional vars (clients, cookie paths, Cobalt).

### `.dockerignore`
- Added `cookies` and `*_cookies.txt` so cookies aren't sent to the build
  context (no longer copied into the image).

### `cookies/` — NEW dir
- Holds `youtube_cookies.txt` / `instagram_cookies.txt` (gitignored via
  `*_cookies.txt`) plus a tracked `.gitkeep` so the mount target exists.

### `.env` (local only, not committed)
- Fixed `REDIS_URL` port typo `637` → `6379` (then `localhost` → `127.0.0.1`).

---

## New configuration (all optional)

| Env var | Default | Purpose |
|---|---|---|
| `YTDLP_YT_CLIENTS` | `tv_embedded,default,web_safari` | yt-dlp YouTube clients, in order |
| `YOUTUBE_COOKIES_FILE` | `/app/youtube_cookies.txt` | YouTube cookie path (fallback only) |
| `INSTAGRAM_COOKIES_FILE` | `/app/instagram_cookies.txt` | Instagram cookie path |
| `COBALT_API_KEY` | _(empty)_ | enables Cobalt fallback with auth |
| `COBALT_INSTANCES` | _(empty)_ | self-hosted Cobalt URLs (csv) |

---

## Verified

- YouTube video — OK, ~32MB, cookieless (`tv_embedded`).
- YouTube audio — OK, cookieless.
- Instagram reel — OK, with cookies (live URL).
- Worker ↔ local Valkey — connects, `bzpopmin`/`evalsha` healthy, no errors.

## Known limitation (not code)

- **Telegram is blocked by the local ISP** (IP-level), so the bot can't reach
  `api.telegram.org` from this host. The download engine works; delivery needs
  a network where Telegram is reachable — deploy on a VPS/EC2 or use a VPN.
- **Instagram inherently needs valid cookies** — unlike YouTube, there is no
  reliable cookieless path. Refresh `cookies/instagram_cookies.txt` when it
  expires (no rebuild needed thanks to the volume).
