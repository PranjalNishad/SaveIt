FROM oven/bun:1.3.11-alpine AS builder

WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

COPY tsconfig.json ./
COPY src/ ./src/
RUN bun run build

FROM oven/bun:1.3.11-alpine AS runner

RUN apk add --no-cache \
    python3 \
    py3-pip \
    ffmpeg \
    tini \
    curl \
    unzip \
    nodejs && \
    py3-pip \
    ffmpeg \
    tini \
    curl

# yt-dlp lives in a venv owned by the runtime user so it can self-update at
# startup without root (YouTube breaks often — stale yt-dlp = broken downloads).
ENV VENV=/app/venv
ENV PATH="${VENV}/bin:${PATH}"
RUN python3 -m venv "$VENV" && \
    "$VENV/bin/pip" install --no-cache-dir -U yt-dlp

WORKDIR /app

COPY package.json bun.lock ./
RUN bun install --production --frozen-lockfile

COPY --from=builder /app/dist ./dist
COPY --chown=bun:bun docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x ./docker-entrypoint.sh

# Cookies are OPTIONAL and mounted as a volume (see docker-compose). The primary
# YouTube path needs no cookies; mount only if you have them — refresh without rebuild.
RUN mkdir -p logs temp && chown -R bun:bun /app "$VENV"

ENV PORT=3000
EXPOSE 3000

USER bun

ENTRYPOINT ["tini", "--", "./docker-entrypoint.sh"]

CMD ["bun", "dist/index.js"]
