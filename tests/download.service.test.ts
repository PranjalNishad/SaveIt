import { beforeEach, describe, expect, mock, test } from "bun:test";
import { EventEmitter } from "events";
import fs from "fs";

interface Behavior {
    code: number;
    stderr?: string;
    write?: boolean;
    truncate?: number;
}

let behavior: Behavior;
let lastArgs: string[] = [];
let lastOut: string | undefined;

mock.module("child_process", () => ({
    spawn: (_cmd: string, args: string[]) => {
        lastArgs = args;
        const proc: any = new EventEmitter();
        proc.stdout = new EventEmitter();
        proc.stderr = new EventEmitter();
        proc.kill = () => {};
        queueMicrotask(() => {
            const i = args.indexOf("-o");
            const out = i >= 0 ? args[i + 1] : undefined;
            lastOut = out;
            if (behavior.write && out) {
                fs.writeFileSync(out, Buffer.alloc(1024));
            }
            if (behavior.truncate && out) {
                fs.writeFileSync(out, Buffer.alloc(0));
                fs.truncateSync(out, behavior.truncate);
            }
            if (behavior.stderr) proc.stderr.emit("data", Buffer.from(behavior.stderr));
            proc.emit("close", behavior.code);
        });
        return proc;
    },
}));

const { downloadMedia } = await import("@/services/download.service");

describe("downloadMedia — non-YouTube", () => {
    beforeEach(() => {
        behavior = { code: 0, write: true };
    });

    test("returns success with the file size on a clean exit", async () => {
        const res = await downloadMedia("https://www.tiktok.com/@u/video/1234567890", "video", "tiktok");
        expect(res.success).toBe(true);
        expect(res.fileSizeBytes).toBe(1024);
        if (res.filePath) fs.rmSync(res.filePath, { force: true });
    });

    test("surfaces yt-dlp stderr on a non-zero exit", async () => {
        behavior = { code: 1, stderr: "ERROR: Requested format is not available" };
        const res = await downloadMedia("https://www.tiktok.com/@u/video/1234567890", "video", "tiktok");
        expect(res.success).toBe(false);
        expect(res.error).toContain("Requested format is not available");
    });

    test("treats a missing output file as a failure", async () => {
        behavior = { code: 0, write: false };
        const res = await downloadMedia("https://www.tiktok.com/@u/video/1234567890", "video", "tiktok");
        expect(res.success).toBe(false);
        expect(res.error).toMatch(/not found or empty/i);
    });

    test("removes the partial file when yt-dlp exits non-zero", async () => {
        behavior = { code: 1, write: true, stderr: "ERROR: unable to download" };
        const res = await downloadMedia("https://www.tiktok.com/@u/video/1234567890", "video", "tiktok");
        expect(res.success).toBe(false);
        expect(lastOut).toBeDefined();
        expect(fs.existsSync(lastOut!)).toBe(false);
    });

    test("attaches --cookies for instagram when a cookie file resolves", async () => {
        await downloadMedia("https://www.instagram.com/reel/DaSK7b3oWK7/", "video", "instagram");
        expect(lastArgs).toContain("--cookies");
        expect(lastArgs.join(" ")).toContain("instagram_cookies.txt");
    });
});

describe("downloadMedia — YouTube", () => {
    test("tries the tv_embedded client first and succeeds cookieless", async () => {
        behavior = { code: 0, write: true };
        const res = await downloadMedia("https://www.youtube.com/watch?v=dQw4w9WgXcQ", "video", "youtube");
        expect(res.success).toBe(true);
        expect(lastArgs.join(" ")).toContain("youtube:player_client=tv_embedded");
        expect(lastArgs).not.toContain("--cookies");
        if (res.filePath) fs.rmSync(res.filePath, { force: true });
    });
});

describe("downloadMedia — size limit", () => {
    test("rejects files above MAX_FILE_SIZE_MB with FILE_TOO_LARGE and keeps the path for cleanup", async () => {
        behavior = { code: 0, write: false, truncate: 51 * 1024 * 1024 };
        const res = await downloadMedia("https://www.tiktok.com/@u/video/1234567890", "video", "tiktok");
        expect(res.success).toBe(false);
        expect(res.error).toMatch(/^FILE_TOO_LARGE/);
        expect(typeof res.filePath).toBe("string");
        if (res.filePath) fs.rmSync(res.filePath, { force: true });
    });
});
