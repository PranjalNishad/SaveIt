#!/bin/sh
# Best-effort yt-dlp self-update on boot. YouTube extraction breaks frequently;
# keeping yt-dlp current is the single biggest reliability win. Never blocks
# startup — if offline or update fails, the baked-in version is used.
echo "[entrypoint] updating yt-dlp (best-effort)..."
pip install --no-cache-dir -U yt-dlp >/dev/null 2>&1 \
  && echo "[entrypoint] yt-dlp $(yt-dlp --version)" \
  || echo "[entrypoint] yt-dlp update skipped; using $(yt-dlp --version 2>/dev/null || echo unknown)"

exec "$@"
