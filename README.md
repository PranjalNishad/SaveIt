# 🎬 Telegram Video Downloader Bot

A production-grade Telegram bot that downloads videos and audio from **YouTube Shorts**, **Instagram Reels & Stories**, **Twitter/X**, and **TikTok** — built with Bun, TypeScript, Telegraf, BullMQ, and Redis.

---

## 🏗️ Architecture

```
User
 │
 ▼
[Telegraf Bot]          ← receives links, shows Video/Audio buttons
 │
 ▼
[Rate Limiter]          ← Redis sliding window, blocks spam
 │
 ▼
[BullMQ Queue]          ← persists jobs, handles retries
 │
 ▼
[Worker Process]        ← runs yt-dlp, sends file back to user
 │
 ▼
[yt-dlp + ffmpeg]       ← actual download engine
```

- **Bot process** and **Worker process** run independently
- The queue decouples them — the bot never blocks waiting for downloads
- Multiple workers can run in parallel for scaling

---

## 📁 Project Structure

```
src/
├── bot/
│   ├── index.ts                    ← Bot entry point
│   ├── handlers/
│   │   ├── message.handler.ts      ← Detects links, shows format buttons
│   │   └── callback.handler.ts     ← Handles button clicks, enqueues jobs
│   └── middlewares/
│       └── rateLimit.middleware.ts ← Per-user rate limiting
├── worker/
│   └── index.ts                    ← BullMQ worker, download engine
├── queue/
│   └── queue.ts                    ← Queue setup + enqueueDownload()
├── services/
│   ├── download.service.ts         ← yt-dlp wrapper
│   ├── telegram.service.ts         ← Telegram API for workers
│   └── rateLimit.service.ts        ← Redis sliding window logic
├── utils/
│   ├── logger.ts                   ← Winston logger
│   ├── validator.ts                ← URL detection + platform parsing
│   └── file.ts                     ← Temp file helpers
├── config/
│   ├── env.ts                      ← Env vars with validation
│   └── redis.ts                    ← IORedis connection
├── types/
│   └── index.ts                    ← Shared TypeScript types
└── constants/
    └── index.ts                    ← Messages, URL patterns, queue names
```

---

## ⚙️ Prerequisites

Install these system tools before running the bot:

```bash
# 1. yt-dlp (video downloader)
pip install yt-dlp

# Keep it updated regularly (sites change their APIs):
pip install -U yt-dlp

# 2. ffmpeg (audio extraction + video merging)
# Ubuntu/Debian:
sudo apt install ffmpeg

# macOS:
brew install ffmpeg

# 3. Redis
# Ubuntu/Debian:
sudo apt install redis-server
redis-server

# macOS:
brew install redis
brew services start redis
```

---

## 🚀 Setup

### 1. Clone & Install

```bash
git clone <your-repo>
cd tg-downloader-bot
bun install
```

### 2. Configure Environment

```bash
cp .env.example .env
```

Edit `.env`:

```env
BOT_TOKEN=your_telegram_bot_token_here
REDIS_HOST=127.0.0.1
REDIS_PORT=6379
RATE_LIMIT_MAX_REQUESTS=5
RATE_LIMIT_WINDOW_SECONDS=60
MAX_FILE_SIZE_MB=50
```

**Get your bot token:**
1. Open Telegram → search `@BotFather`
2. Send `/newbot`
3. Copy the token into `.env`

### 3. Run (Development)

Open **two terminals**:

```bash
# Terminal 1 — Bot (receives messages, shows buttons)
bun run dev:bot

# Terminal 2 — Worker (downloads videos, sends files)
bun run dev:worker
```

### 4. Run (Production)

Use a process manager like PM2:

```bash
npm install -g pm2

pm2 start "bun run src/bot/index.ts" --name "tg-bot"
pm2 start "bun run src/worker/index.ts" --name "tg-worker"
pm2 save
pm2 startup
```

---

## 🔧 Supported Platforms & URLs

| Platform | Example URLs |
|---|---|
| YouTube Shorts | `youtube.com/shorts/xxx` |
| YouTube Videos | `youtu.be/xxx`, `youtube.com/watch?v=xxx` |
| Instagram Reels | `instagram.com/reel/xxx` |
| Instagram Stories | `instagram.com/stories/username/xxx` |
| Instagram Posts | `instagram.com/p/xxx` |
| Twitter / X | `twitter.com/user/status/xxx`, `x.com/user/status/xxx` |
| TikTok | `tiktok.com/@user/video/xxx`, `vm.tiktok.com/xxx` |

---

## ⚠️ Instagram Notes

Instagram frequently blocks unauthenticated downloads. If reels/stories fail:

### Option 1: Update yt-dlp
```bash
pip install -U yt-dlp
```

### Option 2: Use cookies (most reliable)

1. Install the [Get cookies.txt LOCALLY](https://chrome.google.com/webstore/detail/get-cookiestxt-locally) Chrome extension
2. Log into Instagram in Chrome
3. Export cookies → save as `cookies.txt` in project root
4. Update `download.service.ts` — add this flag to Instagram commands:
   ```
   --cookies ./cookies.txt
   ```

---

## 📊 Rate Limiting

Uses a **Redis sliding window** per user:
- Default: **5 requests per 60 seconds**
- Blocked users see: `🚫 Slow down! Try again in Xs.`
- Configure in `.env`: `RATE_LIMIT_MAX_REQUESTS` and `RATE_LIMIT_WINDOW_SECONDS`

---

## 📈 Scaling

To handle more users, run **multiple workers** in parallel:

```bash
pm2 start "bun run src/worker/index.ts" --name "worker-1"
pm2 start "bun run src/worker/index.ts" --name "worker-2"
pm2 start "bun run src/worker/index.ts" --name "worker-3"
```

BullMQ handles job distribution automatically — no extra config needed.

---

## 🪵 Logs

```
logs/
├── combined.log   ← All logs (JSON, rotated at 5MB)
└── error.log      ← Errors only
```

---

## 🛠️ Troubleshooting

| Issue | Fix |
|---|---|
| `yt-dlp not found` | Run `pip install yt-dlp` and ensure it's in PATH |
| `ffmpeg not found` | Install ffmpeg via your package manager |
| `Redis connection refused` | Start Redis: `redis-server` |
| Instagram fails | Update yt-dlp or use cookies (see above) |
| File too large | Telegram limit is 50MB — try audio or shorter clips |
| Bot not responding | Check `BOT_TOKEN` in `.env` is correct |
