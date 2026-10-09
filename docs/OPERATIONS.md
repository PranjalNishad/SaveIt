# Operations Runbook — SaveIt

Day-2 procedures for running the bot safely. No secrets belong in this file.

## Single poller per bot token

Telegram delivers updates to exactly **one** `getUpdates` poller per token. A
second poller causes `409 Conflict: terminated by other getUpdates request`,
which historically caused a restart thrash loop.

The bot takes a Redis lock before polling:

- Key: `bot:poller:<hash>` — `<hash>` is a short SHA-1 of the bot token, so two
  **different** bots sharing one Redis do not conflict. The token itself is never
  stored or logged.
- TTL: 60s, renewed every 30s (compare-and-extend, so only the holder renews).
- Released on graceful shutdown (compare-and-delete, so we never delete another
  instance's lock).
- If another instance holds the lock, the new instance **exits cleanly** (code 0)
  instead of hot-looping.
- If Redis is unreachable at startup, the bot starts **without** the lock
  (graceful degradation). In that window the 409 handler is the last line of defence.

### Verify only one poller is active

```bash
# Exactly one lock key should exist, and it should belong to your running bot.
redis-cli --scan --pattern 'bot:poller:*'
redis-cli get "bot:poller:<hash>"     # non-empty while the bot is polling

# Exactly one bot process on the host:
pgrep -af 'bot/index'

# No 409s in recent logs:
grep -i '409' logs/combined.log | tail
```

If you see two lock keys for the same bot, or repeated 409s, stop the extra
instance (deployment overlap, a stray `bun run start`, or a second host).

## Rotating the Telegram bot token

Rotate if a token was ever exposed, shared, or committed. Rotating invalidates
the old token immediately.

1. In Telegram, open **@BotFather** → `/revoke` (or `/token`) and select the bot.
   Copy the new token. **Do not** paste it into a shell that records history or
   into any tracked file.
2. Update the secret store for every environment that runs the bot:
   - Local: edit `.env` (`BOT_TOKEN=...`). `.env` is gitignored — never commit it.
   - Docker/Compose: update `.env` used by `env_file`.
   - Hosted (Railway/Render/etc.): set the variable in the platform UI/env vars.
3. Restart the app so the new token takes effect:
   ```bash
   bun run build && bun run start     # local
   docker compose up -d --build app    # Docker
   ```
4. Verify:
   - Logs show `✅ Bot is running` (no `409`).
   - `redis-cli --scan --pattern 'bot:poller:*'` shows a single key whose hash
     changed (it is derived from the new token).
   - Send a test link; confirm a download completes.
5. If the old token existed in git history, treat it as compromised and purge it
   from history separately (it was not committed in this repository).

## Secrets handling

- `.env` and `cookies/*.txt` are **gitignored** and **dockerignored**. Keep it that way.
- Never log tokens, cookie contents, or full `Authorization` headers. Existing logs
  reference only cookie *paths*, never contents.
- `cookies/*.txt` are credentials. Refresh them out-of-band; do not commit them.
- Cookie files are mounted `:rw` in Compose on purpose — yt-dlp rewrites the
  cookie jar after a run.

## Graceful shutdown

- The supervisor sends `SIGTERM` to the bot and worker, waits
  `SHUTDOWN_GRACE_MS` (default 60000ms) for them to drain, then `SIGKILL`s.
- The worker waits for in-flight jobs via `worker.close()`, so a download in
  progress is given time to finish rather than being killed mid-file.
- Docker: `stop_grace_period: 90s` on the app service must exceed
  `SHUTDOWN_GRACE_MS`.

## Health & readiness

- When `PORT` is set, the supervisor exposes `GET /` on it.
- `200` = Redis replies to `PING` (the bot can enqueue/poll).
- `503` = Redis unreachable. Use this for platform health checks and Compose.

## Resource limits

- `MAX_FILE_SIZE_MB` is clamped to the Telegram bot upload limit (50MB). Setting it
  higher logs a warning and uses 50.
- `MIN_FREE_DISK_MB` (default 500) guards against downloading onto a full disk;
  downloads are refused with a clear message when free space is below it.
- `WORKER_CONCURRENCY` (default 4) bounds simultaneous yt-dlp/ffmpeg processes.
- Stale files in `TEMP_DIR` are swept at worker startup.
