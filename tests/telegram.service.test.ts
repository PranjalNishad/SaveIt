import { beforeEach, describe, expect, mock, test } from "bun:test";

const calls = {
    sendVideo: 0,
    sendAudio: 0,
    sendDocument: 0,
    editMessageText: 0,
};

let sendVideoImpl: (...args: unknown[]) => Promise<unknown>;
let sendAudioImpl: (...args: unknown[]) => Promise<unknown>;
let sendDocumentImpl: (...args: unknown[]) => Promise<unknown>;
let editMessageImpl: (...args: unknown[]) => Promise<unknown>;

mock.module("telegraf", () => ({
    Telegram: class {
        sendVideo(...args: unknown[]) {
            calls.sendVideo++;
            return sendVideoImpl(...args);
        }
        sendAudio(...args: unknown[]) {
            calls.sendAudio++;
            return sendAudioImpl(...args);
        }
        sendDocument(...args: unknown[]) {
            calls.sendDocument++;
            return sendDocumentImpl(...args);
        }
        editMessageText(...args: unknown[]) {
            calls.editMessageText++;
            return editMessageImpl(...args);
        }
    },
    Markup: {
        inlineKeyboard: (rows: unknown) => ({ reply_markup: rows }),
        button: { callback: (text: string, data: string) => ({ text, callback_data: data }) },
    },
}));

const { TelegramService, isPermanentTelegramError } = await import("@/services/telegram.service");

const badRequest = (description: string, error_code = 400) => ({ response: { error_code, description } });

describe("TelegramService.editMessage", () => {
    beforeEach(() => {
        calls.editMessageText = 0;
        editMessageImpl = async () => ({});
    });

    test("swallows 'message is not modified'", async () => {
        editMessageImpl = async () => {
            throw badRequest("Bad Request: message is not modified");
        };
        await expect(new TelegramService("t").editMessage(1, 2, "hi")).resolves.toBeUndefined();
    });

    test("swallows 'message to edit not found'", async () => {
        editMessageImpl = async () => {
            throw badRequest("Bad Request: message to edit not found");
        };
        await expect(new TelegramService("t").editMessage(1, 2, "hi")).resolves.toBeUndefined();
    });

    test("does not throw on other errors (logged)", async () => {
        editMessageImpl = async () => {
            throw badRequest("Bad Request: chat not found");
        };
        await expect(new TelegramService("t").editMessage(1, 2, "hi")).resolves.toBeUndefined();
    });
});

describe("TelegramService.sendVideo", () => {
    beforeEach(() => {
        calls.sendVideo = 0;
        calls.sendDocument = 0;
        sendDocumentImpl = async () => ({ document: { file_id: "doc" } });
    });

    test("sends a video on success", async () => {
        sendVideoImpl = async () => ({ video: { file_id: "vid" } });
        const msg: any = await new TelegramService("t").sendVideo(1, "/tmp/x.mp4", {});
        expect(msg.video.file_id).toBe("vid");
        expect(calls.sendVideo).toBe(1);
        expect(calls.sendDocument).toBe(0);
    });

    test("retries exactly once on 429 honoring retry_after", async () => {
        let n = 0;
        sendVideoImpl = async () => {
            n++;
            if (n === 1) throw { response: { error_code: 429, parameters: { retry_after: 0 } } };
            return { video: { file_id: "vid" } };
        };
        const msg: any = await new TelegramService("t").sendVideo(1, "/tmp/x.mp4", {});
        expect(msg.video.file_id).toBe("vid");
        expect(calls.sendVideo).toBe(2);
    });

    test("falls back to sendDocument when video send fails", async () => {
        sendVideoImpl = async () => {
            throw badRequest("Bad Request: unsupported media");
        };
        const msg: any = await new TelegramService("t").sendVideo(1, "/tmp/x.mp4", {});
        expect(msg.document.file_id).toBe("doc");
        expect(calls.sendDocument).toBe(1);
    });
});

describe("TelegramService.sendAudio", () => {
    beforeEach(() => {
        calls.sendAudio = 0;
        calls.sendDocument = 0;
        sendDocumentImpl = async () => ({ document: { file_id: "doc" } });
    });

    test("sends audio and falls back to document on failure", async () => {
        sendAudioImpl = async () => {
            throw badRequest("Bad Request: unsupported media");
        };
        const msg: any = await new TelegramService("t").sendAudio(1, "/tmp/x.mp3", {});
        expect(msg.document.file_id).toBe("doc");
        expect(calls.sendDocument).toBe(1);
    });
});

describe("isPermanentTelegramError", () => {
    test("is true for 403 and blocked/kicked chats", () => {
        expect(isPermanentTelegramError({ response: { error_code: 403 } })).toBe(true);
        expect(isPermanentTelegramError(badRequest("Forbidden: bot was blocked by the user", 403))).toBe(true);
        expect(isPermanentTelegramError(badRequest("Bad Request: chat not found"))).toBe(true);
    });

    test("is true for oversize uploads (413 / 'file is too big')", () => {
        expect(isPermanentTelegramError({ response: { error_code: 413 } })).toBe(true);
        expect(isPermanentTelegramError(badRequest("Bad Request: file is too big"))).toBe(true);
        expect(isPermanentTelegramError(badRequest("Requested file is too large"))).toBe(true);
    });

    test("is false for transient errors", () => {
        expect(isPermanentTelegramError({ response: { error_code: 429 } })).toBe(false);
        expect(isPermanentTelegramError(badRequest("Bad Request: unsupported media"))).toBe(false);
    });
});
