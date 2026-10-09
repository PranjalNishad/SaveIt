import { describe, expect, test } from "bun:test";
import { tmpdir } from "os";
import { hasFreeDiskSpace } from "@/utils/disk";

describe("hasFreeDiskSpace", () => {
    test("returns true when there is plenty of free space", async () => {
        expect(await hasFreeDiskSpace(tmpdir(), 1)).toBe(true);
    });

    test("returns false when the requirement exceeds any real disk", async () => {
        expect(await hasFreeDiskSpace(tmpdir(), Number.MAX_SAFE_INTEGER)).toBe(false);
    });

    test("fails open when the path cannot be inspected", async () => {
        // Must never block downloads just because statfs is unsupported/missing.
        expect(await hasFreeDiskSpace("/nonexistent/path/xyz", 1)).toBe(true);
    });
});
