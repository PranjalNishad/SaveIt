import { Worker, type Job } from "bullmq";
import { logger } from "@/utils/logger";
import { downloadMedia } from "@/services/download.service";
import { CacheService } from "@/services/cache.service";
import { TelegramService } from "@/services/telegram.service";
import { safeDelete } from "@/utils/file";
import { MESSAGES } from "@/constants/messages";
import { QUEUE } from "@/constants/queue";
import { env } from "@/config/env";
import { createRedisConnection, redis } from "@/config/redis";
import type { DownloadJobData } from "@/types";

const telegram = new TelegramService(env.BOT_TOKEN);
const workerRedis = createRedisConnection("worker");

async function processJob(job: Job<DownloadJobData & { audioKey?: string }>): Promise<void> {
    const { chatId, messageId, replyToMessageId, url, format, platform, audioKey } = job.data;

    logger.info("Processing job", {
        jobId: job.id,
        url,
        format,
        platform,
        chatId,
    });

    await telegram.editMessage(chatId, messageId, MESSAGES.PROCESSING(format));

    const result = await downloadMedia(url, format, platform);

    if (!result.success) {
        const isTooLarge = result.error?.startsWith("FILE_TOO_LARGE");
        await telegram.editMessage(chatId, messageId, isTooLarge ? MESSAGES.FILE_TOO_LARGE : MESSAGES.DOWNLOAD_FAILED);
        if (result.filePath) await safeDelete(result.filePath);
        if (isTooLarge) return;
        throw new Error(result.error ?? "Unknown download error");
    }

    try {
        let fileId: string | undefined;
        if (format === "audio") {
            const msg = await telegram.sendAudio(chatId, result.filePath!, {
                replyToMessageId,
            });
            fileId = msg.audio?.file_id ?? (msg as any).document?.file_id;
        } else {
            const msg = await telegram.sendVideo(chatId, result.filePath!, {
                audioKey,
                replyToMessageId,
            });
            fileId = msg.video?.file_id ?? (msg as any).document?.file_id;
        }

        if (fileId) {
            await CacheService.saveMedia(url, platform, format, fileId);
            logger.info(`Cached ${format} file_id`, { url });
        }

        await telegram.editMessage(chatId, messageId, MESSAGES.DONE);
        logger.info("Job completed successfully", { jobId: job.id, chatId });
    } catch (sendErr) {
        logger.error("Failed to send file to user", {
            jobId: job.id,
            chatId,
            sendErr,
        });
        await telegram.editMessage(chatId, messageId, MESSAGES.DOWNLOAD_FAILED);
        throw sendErr;
    } finally {
        if (result.filePath) await safeDelete(result.filePath);
    }
}

async function releaseInFlightKey(job?: Job<DownloadJobData & { audioKey?: string }>): Promise<void> {
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

const worker = new Worker<DownloadJobData & { audioKey?: string }>(QUEUE.NAME, processJob, {
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

    if (isFinalFailure) {
        await releaseInFlightKey(job);
    }

    logger.error("Job failed", {
        jobId: job?.id,
        attempt: attemptsMade,
        err: err.message,
    });
});
worker.on("error", (err) => logger.error("Worker error", err));

async function main() {
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
