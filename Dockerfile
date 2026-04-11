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
    deno && \
     curl \
    unzip && \
    curl -fsSL https://deno.land/install.sh | sh && \
    python3 -m pip install --no-cache-dir --break-system-packages -U yt-dlp 

ENV DENO_INSTALL="/root/.deno"
ENV PATH="${DENO_INSTALL}/bin:${PATH}"

WORKDIR /app

COPY package.json bun.lock ./
RUN bun install --production --frozen-lockfile

COPY --from=builder /app/dist ./dist


RUN mkdir -p logs temp && chown -R bun:bun /app

COPY --chown=bun:bun youtube_cookies.txt ./youtube_cookies.txt
COPY --chown=bun:bun instagram_cookies.txt ./instagram_cookies.txt

ENV PORT=3000
EXPOSE 3000


USER bun

ENTRYPOINT ["tini", "--"]

CMD ["bun", "dist/index.js"]
