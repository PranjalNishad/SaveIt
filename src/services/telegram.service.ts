import { Telegram } from "telegraf";
import fs from "fs";
import { logger } from "@/utils/logger";
import { MESSAGES } from "@/constants";

export class TelegramService {
  private tg: Telegram;

  constructor(token: string) {
    this.tg = new Telegram(token);
  }

  async editMessage(
    chatId: number,
    messageId: number,
    text: string,
  ): Promise<void> {
    try {
      await this.tg.editMessageText(chatId, messageId, undefined, text, {
        parse_mode: "Markdown",
      });
    } catch {
      /* ignore "message not modified" */
    }
  }

  async sendVideo(chatId: number, filePath: string): Promise<void> {
    await this.tg.sendVideo(
      chatId,
      { source: fs.createReadStream(filePath) },
      { caption: MESSAGES.SUCCESS_VIDEO },
    );
  }

  async sendAudio(chatId: number, filePath: string): Promise<void> {
    await this.tg.sendAudio(
      chatId,
      { source: fs.createReadStream(filePath) },
      { caption: MESSAGES.SUCCESS_AUDIO },
    );
  }
}
