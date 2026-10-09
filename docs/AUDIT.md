# Audit & Repair — SaveIt Telegram Downloader

Summary of the audit and the repairs applied. Everything below was verified
against the actual source and the runtime logs in `logs/`, not assumed.

## Confirmed issues and fixes

### Critical

1. **Docker build was broken.** `Dockerfile`'s `RUN apk add …` ended with `&&`
   followed by a stray `py3-pip ffmpeg tini curl`, which ran as a bogus shell
   command, so `docker build` failed.
   *Fixed:* collapsed to a single valid `apk add` list.

2. **Cookie paths were Docker-only.** Defaults were `/app/*_cookies.txt`, so a
   local run never attached the cookies that exist at `./cookies/*.txt` — which
   is why Instagram always failed with `empty media response`.
   *Fixed:* `src/constants/download.ts` now resolves an explicit env value, then
   `./cookies/<name>.txt` if present, then the `/app/cookies/` default.

3. **Duplicate bot polling → 409 thrash loop.** A second poller caused
   `409 Conflict`, and the supervisor restarted the bot every ~30s indefinitely.
   *Fixed:* a Redis single-instance lock (`src/utils/single-instance.ts`,
   `bot:poller`) makes a second instance exit cleanly; the bot detects 409 and
   exits 0 with an actionable message; the supervisor backs off up to 5 minutes
   and resets its restart counter after a healthy run.

### High

4. **Instagram/TikTok/Twitter audio bypassed the queue.** Those downloads ran
   inline in the bot process, skipping BullMQ's dedupe/cleanup/caching.
   *Fixed:* every download now goes through BullMQ; the inline fast path is gone.

5. **Redis commands could hang forever.** The shared app connection used
   `maxRetriesPerRequest: null` (a BullMQ requirement) for ordinary commands, so
   a Redis blip froze handlers.
   *Fixed:* split into `bullmq` and `app` profiles; the app profile fails fast.
   Rate limiting now fails **open** on Redis errors so an outage can't block everyone.

6. **URL validation could be spoofed.** Detection used unanchored substring
   regexes, so `https://evil.com/?u=https://youtube.com/watch?v=…` matched and
   was passed to yt-dlp.
   *Fixed:* strict hostname allowlists + path-only matching + http(s)-only; URLs
   are also extracted from surrounding text.

7. **Permanent failures were retried 3×.** Auth/private/deleted/empty-media
   errors wasted worker capacity and flooded logs.
   *Fixed:* classified as permanent and thrown as BullMQ `UnrecoverableError`.

8. **Telegram delivery gaps.** No 429 handling, no document fallback, and
   `editMessage` swallowed every error.
   *Fixed:* single bounded 429 retry honoring `retry_after`, `sendDocument`
   fallback, and precise edit-error handling; permanent send failures (403 /
   blocked / chat-not-found) are not retried.

9. **Concurrency was too high** (30 workers, ~60 concurrent yt-dlp/ffmpeg).
   *Fixed:* `WORKER_CONCURRENCY` (default 4), validated in `config/env.ts`.

10. **`uncaughtException` was swallowed.**
    *Fixed:* log, then `process.exit(1)` so the supervisor restarts cleanly.

### Medium

11. Missing `bun run dev` script (documented but absent) → added, plus `bun test`.
12. Unbounded format selector → now `YTDLP_FORMAT_SELECTOR` (default keeps the
    proven `bv*+ba/b`; post-download size guard still applies).
13. `/start` also hit the text handler → spurious "unknown link" reply → guarded.
14. YouTube URL forms now canonicalize to `watch?v=<id>` for stable cache/dedupe keys.

## Tests added

`bun test` (60 tests, 9 files, all passing) covering: URL validation/spoofing,
URL normalization, permanent-vs-transient error classification, temp-file
helpers, rate-limit (incl. fail-open), Telegram delivery (429 + document
fallback + edit handling), queue enqueue/dedupe, job processing (success,
too-large, permanent/transient, delivery failure), and downloader success /
failure / size-limit paths. External processes (yt-dlp) and Telegram/Redis are
mocked; no network or credentials are required.

## Known limitations (not code)

- Telegram is ISP-blocked on the dev host, so live delivery can't be exercised
  here — deploy to a reachable host/VPN.
- Instagram requires valid cookies; `cookies/instagram_cookies.txt` may be expired.
- Docker build/compose need a working Docker daemon.
