import { Queue } from "bullmq";
import { logger } from "@/utils/logger";
import { QUEUE } from "@/constants";
import type { DownloadJobData } from "@/types";
import { Redis } from "ioredis";
import { env } from "@/config/env";

const queueRedis = new Redis({
  host: env.REDIS_HOST,
  port: env.REDIS_PORT,
  maxRetriesPerRequest: null,
});

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

export async function enqueueDownload(data: DownloadJobData): Promise<string> {
  try {
    const job = await videoQueue.add(QUEUE.JOB_NAME, data, {
      jobId: `${data.chatId}_${data.requestedAt}`,
    });
    logger.info("Job enqueued", {
      jobId: job.id,
      url: data.url,
      format: data.format,
    });
    return job.id!;
  } catch (err) {
    logger.error("Failed to enqueue job", err);
    throw err;
  }
}
