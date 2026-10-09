import { Telegram, Markup } from "telegraf";
import type { Message } from "telegraf/types";
import fs from "fs";
import path from "path";
import { MESSAGES } from "@/constants/messages";
import { logger } from "@/utils/logger";
import type { TelegramSendOptions } from "@/types";

const RETRY_AFTER_FALLBACK_SECONDS = 3;
const MAX_RETRY_AFTER_SECONDS = 30;

interface TelegramApiError extends Error {
    response?: {
        error_code?: number;
        description?: string;
        parameters?: { retry_after?: number };
    };
}

function describeError(err: unknown): string {
    const e = err as TelegramApiError;
    return e?.response?.description ?? e?.message ?? String(err);
}

/** 429 retry_after in seconds, or null when the error is not a rate limit. */
function rateLimitSeconds(err: unknown): number | null {
    const e = err as TelegramApiError;
    if (e?.response?.error_code !== 429) return null;
    const retryAfter = e.response?.parameters?.retry_after;
    return typeof retryAfter === "number" ? retryAfter : RETRY_AFTER_FALLBACK_SECONDS;
}

/** Delivery failures that will not succeed on retry. */
const PERMANENT_SEND_PATTERNS = [
    /bot was blocked/i,
    /chat not found/i,
    /user is deactivated/i,
    /bot was kicked/i,
    /have no rights/i,
    /not enough rights/i,
    /chat_write_forbidden/i,
    // File exceeds the bot upload limit — re-sending the same file can't help.
    /file is too big/i,
    /file too large/i,
    /requested file is too large/i,
    /file_too_big/i,
    /entity too large/i,
];

export function isPermanentTelegramError(err: unknown): boolean {
    const e = err as TelegramApiError;
    // 403 Forbidden (blocked/kicked) and 413 Payload Too Large are terminal.
    if (e?.response?.error_code === 403 || e?.response?.error_code === 413) return true;
    const desc = describeError(err);
    return PERMANENT_SEND_PATTERNS.some((p) => p.test(desc));
}

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

export class TelegramService {
    private tg: Telegram;

    constructor(token: string) {
        this.tg = new Telegram(token);
    }

    async editMessage(chatId: number, messageId: number, text: string): Promise<void> {
        try {
            await this.tg.editMessageText(chatId, messageId, undefined, text, {
                parse_mode: "Markdown",
            });
        } catch (err) {
            const desc = describeError(err);
            // Expected no-ops, not real failures.
            if (/message is not modified/i.test(desc) || /message to edit not found/i.test(desc)) {
                return;
            }
            logger.warn("editMessage failed", { chatId, messageId, error: desc });
        }
    }

    private resolveTelegramSource(source: string): string | { source: fs.ReadStream } {
        const resolvedPath = path.resolve(source);

        if (fs.existsSync(resolvedPath) && fs.statSync(resolvedPath).isFile()) {
            return { source: fs.createReadStream(resolvedPath) };
        }

        return source;
    }

    // Retries once on 429, honoring retry_after; other errors propagate.
    private async withRateLimitRetry<T>(fn: () => Promise<T>): Promise<T> {
        try {
            return await fn();
        } catch (err) {
            const retryAfter = rateLimitSeconds(err);
            if (retryAfter === null) throw err;

            const waitMs = Math.min(retryAfter, MAX_RETRY_AFTER_SECONDS) * 1000;
            logger.warn("Telegram 429 — retrying once", { retryAfter });
            await sleep(waitMs);
            return fn();
        }
    }

    async sendVideo(chatId: number, source: string, options: TelegramSendOptions = {}): Promise<Message.VideoMessage> {
        const extra = options.audioKey
            ? Markup.inlineKeyboard([Markup.button.callback("🎵 Want audio too?", `dl:audio:${options.audioKey}`)])
            : {};

        const sendOptions: any = {
            caption: MESSAGES.SUCCESS_VIDEO,
            ...extra,
        };

        if (options.replyToMessageId) {
            sendOptions.reply_parameters = { message_id: options.replyToMessageId };
        }

        try {
            return (await this.withRateLimitRetry(() =>
                this.tg.sendVideo(chatId, this.resolveTelegramSource(source), { ...sendOptions }),
            )) as Message.VideoMessage;
        } catch (err) {
            // Some files are rejected as video (codec/format). Deliver as a document.
            logger.warn("sendVideo failed — falling back to sendDocument", {
                chatId,
                error: describeError(err),
            });
            const msg = await this.withRateLimitRetry(() =>
                this.tg.sendDocument(chatId, this.resolveTelegramSource(source), { ...sendOptions }),
            );
            return msg as unknown as Message.VideoMessage;
        }
    }

    async sendAudio(chatId: number, source: string, options: TelegramSendOptions = {}): Promise<Message.AudioMessage> {
        const sendOptions: any = {
            caption: MESSAGES.SUCCESS_AUDIO,
        };

        if (options.replyToMessageId) {
            sendOptions.reply_parameters = { message_id: options.replyToMessageId };
        }

        try {
            return (await this.withRateLimitRetry(() =>
                this.tg.sendAudio(chatId, this.resolveTelegramSource(source), { ...sendOptions }),
            )) as Message.AudioMessage;
        } catch (err) {
            logger.warn("sendAudio failed — falling back to sendDocument", {
                chatId,
                error: describeError(err),
            });
            const msg = await this.withRateLimitRetry(() =>
                this.tg.sendDocument(chatId, this.resolveTelegramSource(source), { ...sendOptions }),
            );
            return msg as unknown as Message.AudioMessage;
        }
    }
}
