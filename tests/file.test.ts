import { describe, expect, test } from "bun:test";
import fs from "fs";
import { getFileSizeBytes, safeDelete, sweepTempDir, tempFilePath } from "@/utils/file";

describe("tempFilePath", () => {
    test("produces unique paths with the right extension", () => {
        const a = tempFilePath("mp4");
        const b = tempFilePath("mp4");
        expect(a).not.toBe(b);
        expect(a.endsWith(".mp4")).toBe(true);
        expect(fs.existsSync(a)).toBe(false);
    });
});

describe("safeDelete", () => {
    test("deletes an existing file", async () => {
        const p = tempFilePath("mp4");
        fs.writeFileSync(p, "x");
        await safeDelete(p);
        expect(fs.existsSync(p)).toBe(false);
    });

    test("ignores a missing file without throwing", async () => {
        await safeDelete("/nonexistent/path/does-not-exist.mp4");
    });
});

describe("getFileSizeBytes", () => {
    test("returns the real size for an existing file", async () => {
        const p = tempFilePath("mp4");
        fs.writeFileSync(p, Buffer.alloc(1234));
        expect(await getFileSizeBytes(p)).toBe(1234);
        await safeDelete(p);
    });

    test("returns -1 for a missing file", async () => {
        expect(await getFileSizeBytes("/nonexistent/path/does-not-exist.mp4")).toBe(-1);
    });
});

describe("sweepTempDir", () => {
    test("removes stale files but keeps fresh ones", async () => {
        const stale = tempFilePath("mp4");
        const fresh = tempFilePath("mp4");
        fs.writeFileSync(stale, "old");
        fs.writeFileSync(fresh, "new");

        // Backdate the stale file well beyond the sweep threshold.
        const old = new Date(Date.now() - 10_000);
        fs.utimesSync(stale, old, old);

        const removed = await sweepTempDir(5_000);

        expect(removed).toBeGreaterThanOrEqual(1);
        expect(fs.existsSync(stale)).toBe(false);
        expect(fs.existsSync(fresh)).toBe(true);

        await safeDelete(fresh);
    });
});
