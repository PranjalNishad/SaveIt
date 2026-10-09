import { UnrecoverableError, type Job } from "bullmq";
import { logger } from "@/utils/logger";
import { env } from "@/config/env";
import { isPermanentTelegramError } from "@/services/telegram.service";
import { safeDelete } from "@/utils/file";
import { MESSAGES } from "@/constants/messages";
import { isPermanentDownloadError } from "@/utils/download-error";
import type { DownloadJobData, DownloadResult, OutputFormat, Platform } from "@/types";

export type DownloadJob = DownloadJobData & { audioKey?: string };

/**
 * Dependencies are injected so job processing can be unit-tested without any
 * real Telegram/Redis/filesystem-download side effects.
 */
export interface JobProcessorDeps {
    telegram: {
        editMessage: (chatId: number, messageId: number, text: string) => Promise<void>;
        sendVideo: (chatId: number, filePath: string, options?: { audioKey?: string; replyToMessageId?: number }) => Promise<any>;
        sendAudio: (chatId: number, filePath: string, options?: { replyToMessageId?: number }) => Promise<any>;
    };
    download: (url: string, format: OutputFormat, platform: Platform) => Promise<DownloadResult>;
    cacheMedia: (url: string, platform: Platform, format: OutputFormat, fileId: string) => Promise<void>;
    getCached: (url: string, platform: Platform, format: OutputFormat) => Promise<{ fileId: string } | null>;
    removeFile: (filePath: string) => Promise<void>;
}

/**
 * Processes a single download job: (cache check) -> download -> deliver -> cache -> cleanup.
 */
export async function processJob(job: Job<DownloadJob>, deps: JobProcessorDeps): Promise<void> {
    const { telegram, download, cacheMedia, getCached, removeFile } = deps;
    const { chatId, messageId, replyToMessageId, url, format, platform, audioKey } = job.data;

    logger.info("Processing job", {
        jobId: job.id,
        url,
        format,
        platform,
        chatId,
    });

    // Deliver a source that is either a local file path or a Telegram file_id.
    const deliver = (source: string) =>
        format === "audio"
            ? telegram.sendAudio(chatId, source, { replyToMessageId })
            : telegram.sendVideo(chatId, source, { audioKey, replyToMessageId });

    // Idempotency guard: if this URL+format was already delivered once, send the
    // cached copy and skip the download. BullMQ re-delivers a job when a worker
    // crashes or stalls, and without this every retry would re-download the media
    // (and risk a duplicate send). A cache lookup failure must not block the job.
    const cached = await getCached(url, platform, format).catch(() => null);
    if (cached?.fileId) {
        logger.info("Cache hit — delivering without download", { url, format });
        try {
            await deliver(cached.fileId);
            await telegram.editMessage(chatId, messageId, MESSAGES.DONE);
        } catch (sendErr) {
            logger.error("Failed to deliver cached media", { jobId: job.id, chatId, sendErr });
            await telegram.editMessage(chatId, messageId, MESSAGES.DOWNLOAD_FAILED);
            if (isPermanentTelegramError(sendErr)) {
                throw new UnrecoverableError((sendErr as Error).message);
            }
            throw sendErr;
        }
        return;
    }

    await telegram.editMessage(chatId, messageId, MESSAGES.PROCESSING(format));

    const result = await download(url, format, platform);

    if (!result.success) {
        const isTooLarge = result.error?.startsWith("FILE_TOO_LARGE");
        await telegram.editMessage(chatId, messageId, isTooLarge ? MESSAGES.FILE_TOO_LARGE(env.MAX_FILE_SIZE_MB) : MESSAGES.DOWNLOAD_FAILED);
        if (result.filePath) await removeFile(result.filePath);
        // Too large is terminal but a normal completion — no retry, no error spam.
        if (isTooLarge) return;

        const msg = result.error ?? "Unknown download error";
        // Auth/private/deleted/disk-full/etc. will never succeed on retry.
        if (isPermanentDownloadError(msg)) throw new UnrecoverableError(msg);
        throw new Error(msg);
    }

    try {
        let fileId: string | undefined;
        const msg = await deliver(result.filePath!);

        if (format === "audio") {
            fileId = msg.audio?.file_id ?? (msg as any).document?.file_id;
        } else {
            fileId = msg.video?.file_id ?? (msg as any).document?.file_id;
        }

        if (fileId) {
            await cacheMedia(url, platform, format, fileId);
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
        // Blocked/kicked/chat-not-found won't recover — don't re-download on retry.
        if (isPermanentTelegramError(sendErr)) {
            throw new UnrecoverableError((sendErr as Error).message);
        }
        throw sendErr;
    } finally {
        if (result.filePath) await removeFile(result.filePath);
    }
}
