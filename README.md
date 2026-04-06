# Telegram Media Downloader Bot

Production-ready Telegram bot that downloads media from supported social platforms and delivers it through Telegram.

## Overview

This project uses a queue-based architecture so Telegram updates stay responsive while downloads run in background workers.

Core stack:

- Bun + TypeScript
- Telegraf (Telegram bot API)
- BullMQ (job queue)
- Redis (queue backend, cache, rate-limiting state)
- yt-dlp + ffmpeg (media extraction and conversion)

## Key Capabilities

- Accepts supported media links and auto-downloads video
- Optional audio extraction flow via inline button
- Redis-backed URL normalization and media caching
- URL-aware rate limiting
- In-flight deduplication per user + URL + format
- One-command runtime for bot + worker (`bun run start`)
- Docker/Compose support for local and production-like runs

## Runtime Architecture

```text
Telegram User
   -> Bot process (Telegraf)
      -> Validation + URL normalization
      -> Rate limiting (Redis, URL-aware)
      -> Cache lookup (Redis)
      -> BullMQ enqueue
         -> Worker process
            -> yt-dlp/ffmpeg download
            -> Telegram media send (reply to original message when available)
            -> Cache file_id
```

Default runtime starts both bot and worker from a single launcher process.

## Project Scripts

From [package.json](package.json):

- `bun run dev`: run source entrypoint (bot + worker)
- `bun run build`: build dist bundles
- `bun run start`: run dist entrypoint (bot + worker)
- `bun run start:bot`: run only bot
- `bun run start:worker`: run only worker
- `bun run typecheck`: TypeScript validation

## Prerequisites

For non-Docker local runtime:

- Bun
- Redis
- Python3 + pip
- ffmpeg
- yt-dlp

For Docker runtime:

- Docker + Docker Compose plugin

## Quick Start (Local)

### 1) Configure environment

```bash
cp .env.example .env
```

Set at minimum:

```env
BOT_TOKEN=your_telegram_bot_token
REDIS_URL=redis://127.0.0.1:6379
```

### 2) Start Redis (without installing locally)

```bash
docker run -d --name tg-redis -p 6379:6379 redis:7-alpine
```

### 3) Install dependencies

```bash
bun install
```

### 4) Run dev

```bash
bun run dev
```

### 5) Run production mode locally

```bash
bun run build
bun run start
```

## Quick Start (Docker Compose)

```bash
cp .env.example .env
# set BOT_TOKEN in .env

docker compose up --build -d

docker compose logs -f app
```

Compose services in [docker-compose.yml](docker-compose.yml):

- `app`: bot + worker
- `redis`: Redis 7

Note: Compose overrides `REDIS_URL` to `redis://redis:6379` for container-network connectivity.

## Environment Variables

Defined in [.env.example](.env.example) and parsed in [src/config/env.ts](src/config/env.ts).

### Required

- `BOT_TOKEN`: Telegram bot token from BotFather

### Redis

- `REDIS_URL`: preferred connection string (`redis://` or `rediss://`)
- `REDIS_HOST`: fallback when `REDIS_URL` is unset
- `REDIS_PORT`: fallback when `REDIS_URL` is unset
- `REDIS_PASSWORD`: optional password for host/port mode

### Rate limiting and dedupe

- `RATE_LIMIT_MAX_REQUESTS` (default `5`)
- `RATE_LIMIT_WINDOW_SECONDS` (default `60`)
- `INFLIGHT_DEDUPE_TTL_SECONDS` (default `360`)

### Media and cache

- `MAX_FILE_SIZE_MB` (default `50`)
- `MEDIA_CACHE_TTL_SECONDS` (default `86400`)

### Logging and paths

- `TEMP_DIR` (default `./temp`)
- `LOG_LEVEL` (default `info`)
- `LOG_DIR` (default `./logs`)

## Production Deployment

### Recommended pattern

- Managed Redis (Upstash / Redis Cloud)
- App command: `bun run build` then `bun run start`
- Environment configured via platform UI (not committed `.env`)

### Railway

1. Connect repo
2. Set env vars (`BOT_TOKEN`, `REDIS_URL`, others as needed)
3. Build command: `bun run build`
4. Start command: `bun run start`
5. Deploy and watch logs

### Render

1. Create Web Service from repo
2. Set env vars (`BOT_TOKEN`, `REDIS_URL`, others as needed)
3. Build command: `bun run build`
4. Start command: `bun run start`

The app opens an HTTP health endpoint when `PORT` is set, which helps web-service style platforms.

## Docker Image Notes

The Docker image:

- Uses Bun Alpine base image
- Installs `python3`, `py3-pip`, `ffmpeg`, `tini`
- Installs latest `yt-dlp`
- Runs as non-root `bun` user

See [Dockerfile](Dockerfile).

## Operational Behavior

### URL normalization

Incoming links are normalized before cache/rate-limit/dedupe keys so tracking params do not create duplicate logical requests.

### URL-aware rate limiting

Repeated same normalized URL from same user does not consume extra rate-limit quota in the active window.

### In-flight queue dedupe

If the same user requests same normalized URL + format while job is already active, duplicate enqueue is skipped.

## Troubleshooting

- Bot not responding:
    - verify `BOT_TOKEN`
    - verify process is running
- Redis connection errors:
    - verify `REDIS_URL`
    - check Redis network accessibility
- Download failures on specific sites:
    - update `yt-dlp`
- Large media rejected:
    - reduce clip length or use audio flow

## Security and Operations Best Practices

- Never commit real secrets in `.env`
- Rotate bot token if exposed
- Use managed Redis with TLS (`rediss://`) in production
- Keep `yt-dlp` updated due to frequent upstream platform changes
- Monitor logs for repeated queue failures and adjust retry/limits as needed
