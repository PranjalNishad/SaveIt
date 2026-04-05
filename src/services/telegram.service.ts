import { Telegram, Markup } from "telegraf";
import type { Message } from "telegraf/types";
import fs from "fs";
import path from "path";
import { MESSAGES } from "@/constants/messages";
import type { TelegramSendOptions } from "@/types";

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
        } catch {
            /* ignore "message not modified" */
        }
    }

    private resolveTelegramSource(source: string): string | { source: fs.ReadStream } {
        const resolvedPath = path.resolve(source);

        if (fs.existsSync(resolvedPath) && fs.statSync(resolvedPath).isFile()) {
            return { source: fs.createReadStream(resolvedPath) };
        }

        return source;
    }

    async sendVideo(chatId: number, source: string, options: TelegramSendOptions = {}): Promise<Message.VideoMessage> {
        // Add inline keyboard for audio if an audioKey is provided
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

        return (await this.tg.sendVideo(chatId, this.resolveTelegramSource(source), {
            ...sendOptions,
        })) as Message.VideoMessage;
    }

    async sendAudio(chatId: number, source: string, options: TelegramSendOptions = {}): Promise<Message.AudioMessage> {
        const sendOptions: any = {
            caption: MESSAGES.SUCCESS_AUDIO,
        };

        if (options.replyToMessageId) {
            sendOptions.reply_parameters = { message_id: options.replyToMessageId };
        }

        return (await this.tg.sendAudio(chatId, this.resolveTelegramSource(source), {
            ...sendOptions,
        })) as Message.AudioMessage;
    }
}
