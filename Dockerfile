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
    tini && \
    python3 -m pip install --no-cache-dir --break-system-packages -U yt-dlp

WORKDIR /app

COPY package.json bun.lock ./
RUN bun install --production --frozen-lockfile

COPY --from=builder /app/dist ./dist

ENV PORT=3000
EXPOSE 3000

RUN mkdir -p logs temp && chown -R bun:bun /app

USER bun

ENTRYPOINT ["tini", "--"]

CMD ["bun", "dist/index.js"]
