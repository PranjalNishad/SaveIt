export type Platform = "youtube" | "instagram" | "twitter" | "tiktok";
export type OutputFormat = "video" | "audio";

export interface DownloadJobData {
    chatId: number;
    messageId: number;
    replyToMessageId?: number;
    inFlightKey?: string;
    url: string;
    platform: Platform;
    format: OutputFormat;
    requestedAt: number;
    audioKey?: string;
}

export interface EnqueueResult {
    jobId: string;
    deduped: boolean;
}

export interface RateLimitInfo {
    allowed: boolean;
    remaining: number;
    resetInSeconds: number;
}

export interface DetectedLink {
    url: string;
    platform: Platform;
}

export interface DownloadResult {
    success: boolean;
    filePath?: string;
    fileSizeBytes?: number;
    error?: string;
}

export interface CachedMedia {
    fileId: string;
    format: OutputFormat;
    platform: Platform;
    cachedAt: number;
}

export interface TelegramSendOptions {
    audioKey?: string;
    replyToMessageId?: number;
}
