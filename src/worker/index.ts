import { Worker, type Job } from "bullmq";
import { logger } from "@/utils/logger";
import { TelegramService } from "@/services/telegram.service";
import { downloadMedia } from "@/services/download.service";
import { CacheService } from "@/services/cache.service";
import { safeDelete, sweepTempDir } from "@/utils/file";
import { QUEUE } from "@/constants/queue";
import { videoQueue } from "@/queue/download.queue";
import { env } from "@/config/env";
import { createRedisConnection, redis } from "@/config/redis";
import { throttled } from "@/utils/log-throttle";
import { processJob, type DownloadJob, type JobProcessorDeps } from "@/worker/process-job";

const telegram = new TelegramService(env.BOT_TOKEN);
const workerRedis = createRedisConnection("worker", "bullmq");

const jobDeps: JobProcessorDeps = {
    telegram,
    download: downloadMedia,
    cacheMedia: (url, platform, format, fileId) => CacheService.saveMedia(url, platform, format, fileId),
    getCached: (url, platform, format) => CacheService.getMedia(url, platform, format),
    removeFile: safeDelete,
};

// Conservative sweep age: comfortably longer than the longest legitimate download
// (yt-dlp timeout + buffer) and never below an hour, so a healthy in-flight file
// is never deleted.
const TEMP_SWEEP_MAX_AGE_MS = Math.max(60 * 60_000, env.YTDLP_TIMEOUT_SECONDS * 1000 + 5 * 60_000);
const METRICS_INTERVAL_MS = 60_000;

async function releaseInFlightKey(job?: Job<DownloadJob>): Promise<void> {
    const key = job?.data?.inFlightKey;
    if (!key) return;

    try {
        await redis.del(key);
    } catch (err) {
        logger.warn("Failed to release in-flight key", {
            key,
            err: (err as Error).message,
        });
    }
}

const worker = new Worker<DownloadJob>(QUEUE.NAME, (job) => processJob(job, jobDeps), {
    connection: workerRedis,
    concurrency: QUEUE.WORKER_CONCURRENCY,
    limiter: {
        max: QUEUE.RATE_LIMITER_MAX,
        duration: QUEUE.RATE_LIMITER_DURATION_MS,
    },
    stalledInterval: QUEUE.STALLED_INTERVAL_MS,
    lockDuration: QUEUE.LOCK_DURATION_MS,
});

worker.on("completed", async (job) => {
    await releaseInFlightKey(job);
    logger.info("Job completed", { jobId: job.id });
});

worker.on("failed", async (job, err) => {
    const attemptsAllowed = job?.opts?.attempts ?? 1;
    const attemptsMade = job?.attemptsMade ?? 0;
    const isFinalFailure = attemptsMade >= attemptsAllowed;
    // UnrecoverableError skips retries, so it may fail before the last attempt.
    const unrecoverable = err?.name === "UnrecoverableError";

    if (isFinalFailure || unrecoverable) {
        await releaseInFlightKey(job);
    }

    logger.error("Job failed", {
        jobId: job?.id,
        attempt: attemptsMade,
        err: err.message,
    });
});
const throttleWorkerErr = throttled();
worker.on("error", (err) =>
    throttleWorkerErr(() =>
        logger.error("Worker error (suppressing repeats 30s)", {
            error: err.message || (err as any).code || "connection failed",
        }),
    ),
);

// Lightweight observability: log queue depth periodically so a building backlog
// or a spike in failures is visible without adding a metrics stack.
setInterval(() => {
    videoQueue
        .getJobCounts("waiting", "active", "completed", "failed", "delayed")
        .then((counts) => logger.info("Queue metrics", counts))
        .catch((err: Error) => logger.warn("Queue metrics unavailable", { err: err.message }));
}, METRICS_INTERVAL_MS).unref?.();

// Keep worker alive on stray async errors — BullMQ retries the job itself.
process.on("unhandledRejection", (reason) => {
  logger.error("Worker unhandledRejection", { reason: String(reason) });
});
// An uncaught exception leaves the process in an unknown state — exit so the
// supervisor restarts it cleanly instead of running corrupted.
process.on("uncaughtException", (err) => {
  logger.error("Worker uncaughtException — exiting for clean restart", {
    err: err.message,
    stack: err.stack,
  });
  process.exit(1);
});

async function main() {
    // Remove orphaned temp files left by a previous crash/force-kill before we
    // begin accepting jobs. Age-guarded so nothing in-flight is removed.
    const swept = await sweepTempDir(TEMP_SWEEP_MAX_AGE_MS);
    if (swept > 0) logger.info(`Swept ${swept} stale temp file(s) from ${env.TEMP_DIR}`);

    logger.info("✅ Worker started, waiting for jobs...");
    process.once("SIGINT", async () => {
        await worker.close();
        process.exit(0);
    });
    process.once("SIGTERM", async () => {
        await worker.close();
        process.exit(0);
    });
}

main().catch((err) => {
    logger.error("Fatal error starting worker", err);
    process.exit(1);
});
