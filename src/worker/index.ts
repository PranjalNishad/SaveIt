import { Worker, type Job } from "bullmq";
import { Redis } from "ioredis";
import { logger } from "@/utils/logger";
import { downloadMedia } from "@/services/download.service";
import { TelegramService } from "@/services/telegram.service";
import { safeDelete } from "@/utils/file";
import { MESSAGES, QUEUE } from "@/constants";
import { env } from "@/config/env";
import type { DownloadJobData } from "@/types";

const telegram = new TelegramService(env.BOT_TOKEN);

const workerRedis = new Redis({
  host: env.REDIS_HOST,
  port: env.REDIS_PORT,
  maxRetriesPerRequest: null,
});

async function processJob(job: Job<DownloadJobData>): Promise<void> {
  const { chatId, messageId, url, format, platform } = job.data;

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
    await telegram.editMessage(
      chatId,
      messageId,
      isTooLarge ? MESSAGES.FILE_TOO_LARGE : MESSAGES.DOWNLOAD_FAILED,
    );
    if (result.filePath) await safeDelete(result.filePath);
    if (isTooLarge) return;
    throw new Error(result.error ?? "Unknown download error");
  }

  try {
    if (format === "audio") {
      await telegram.sendAudio(chatId, result.filePath!);
    } else {
      await telegram.sendVideo(chatId, result.filePath!);
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

const worker = new Worker<DownloadJobData>(QUEUE.NAME, processJob, {
  connection: workerRedis,
  concurrency: QUEUE.WORKER_CONCURRENCY,
  limiter: {
    max: QUEUE.RATE_LIMITER_MAX,
    duration: QUEUE.RATE_LIMITER_DURATION_MS,
  },
});

worker.on("completed", (job) =>
  logger.info("Job completed", { jobId: job.id }),
);
worker.on("failed", (job, err) =>
  logger.error("Job failed", {
    jobId: job?.id,
    attempt: job?.attemptsMade,
    err: err.message,
  }),
);
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
