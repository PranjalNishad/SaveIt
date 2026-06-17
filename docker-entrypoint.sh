#!/bin/sh
# yt-dlp self-update. YouTube extraction breaks frequently; keeping yt-dlp
# current is the single biggest reliability win.

update_ytdlp() {
  pip install --no-cache-dir -U yt-dlp >/dev/null 2>&1 \
    && echo "[yt-dlp-update] now $(yt-dlp --version)" \
    || echo "[yt-dlp-update] failed; using $(yt-dlp --version 2>/dev/null || echo unknown)"
}

# 1) Update once on boot (best-effort, never blocks startup).
echo "[entrypoint] updating yt-dlp on boot..."
update_ytdlp

# 2) Daily background cron — re-update every 24h for as long as the container runs.
(
  while true; do
    sleep 86400
    echo "[entrypoint] daily yt-dlp update..."
    update_ytdlp
  done
) &

exec "$@"
