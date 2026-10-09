import { describe, expect, test } from "bun:test";
import { clampFileSizeLimit, TELEGRAM_BOT_MAX_UPLOAD_MB } from "@/config/env";

describe("clampFileSizeLimit", () => {
    test("clamps values above the Telegram bot upload limit", () => {
        expect(clampFileSizeLimit(500)).toBe(TELEGRAM_BOT_MAX_UPLOAD_MB);
        expect(clampFileSizeLimit(51)).toBe(50);
    });

    test("keeps values at or below the limit unchanged", () => {
        expect(clampFileSizeLimit(50)).toBe(50);
        expect(clampFileSizeLimit(30)).toBe(30);
        expect(clampFileSizeLimit(1)).toBe(1);
    });

    test("exposes the 50MB bot upload limit", () => {
        expect(TELEGRAM_BOT_MAX_UPLOAD_MB).toBe(50);
    });
});
