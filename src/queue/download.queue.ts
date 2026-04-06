import { Queue } from "bullmq";
import { logger } from "@/utils/logger";
import { QUEUE } from "@/constants/queue";
import type { DownloadJobData, EnqueueResult } from "@/types";
import { createRedisConnection } from "@/config/redis";
import { createHash } from "crypto";
import { REDIS_KEYS } from "@/constants/redis-keys";
import { env } from "@/config/env";

// Create a dedicated Redis connection for the queue (BullMQ requirement)
const queueRedis = createRedisConnection("queue");

function hashUrl(url: string): string {
    return createHash("sha1").update(url).digest("hex");
}

export const videoQueue = new Queue<DownloadJobData>(QUEUE.NAME, {
    connection: queueRedis,
    defaultJobOptions: {
        attempts: QUEUE.MAX_ATTEMPTS,
        backoff: {
            type: "exponential",
            delay: QUEUE.RETRY_DELAY_MS,
        },
        removeOnComplete: { count: QUEUE.KEEP_COMPLETED },
        removeOnFail: { count: QUEUE.KEEP_FAILED },
    },
});

videoQueue.on("error", (err) => {
    logger.error("Queue error", err);
});

export async function enqueueDownload(data: DownloadJobData): Promise<EnqueueResult> {
    const inFlightKey = REDIS_KEYS.INFLIGHT_DOWNLOAD(data.chatId, data.format, hashUrl(data.url));

    const acquired = await queueRedis.set(inFlightKey, "1", "EX", env.INFLIGHT_DEDUPE_TTL, "NX");
    if (!acquired) {
        logger.info("Skipped duplicate in-flight job", {
            chatId: data.chatId,
            format: data.format,
            url: data.url,
        });
        return {
            jobId: inFlightKey,
            deduped: true,
        };
    }

    try {
        const job = await videoQueue.add(
            QUEUE.JOB_NAME,
            { ...data, inFlightKey },
            {
                jobId: `${data.chatId}_${data.requestedAt}`,
            },
        );
        logger.info("Job enqueued", {
            jobId: job.id,
            url: data.url,
            format: data.format,
        });
        return {
            jobId: job.id!,
            deduped: false,
        };
    } catch (err) {
        await queueRedis.del(inFlightKey);
        logger.error("Failed to enqueue job", err);
        throw err;
    }
}
