import { describe, expect, test } from "bun:test";
import { isPermanentDownloadError } from "@/utils/download-error";

describe("isPermanentDownloadError", () => {
    test("classifies auth/private/deleted errors as permanent", () => {
        expect(isPermanentDownloadError("ERROR: [Instagram] x: Instagram sent an empty media response.")).toBe(true);
        expect(isPermanentDownloadError("ERROR: Sign in to confirm you're not a bot")).toBe(true);
        expect(isPermanentDownloadError("ERROR: Private video. Sign in if you've been granted access")).toBe(true);
        expect(isPermanentDownloadError("ERROR: Video unavailable")).toBe(true);
        expect(isPermanentDownloadError("Requested format is not available")).toBe(true);
        expect(isPermanentDownloadError("HTTP Error 404: Not Found")).toBe(true);
        expect(isPermanentDownloadError("DISK_FULL: not enough free disk space to start the download")).toBe(true);
    });

    test("keeps transient errors retryable", () => {
        expect(isPermanentDownloadError("HTTP Error 403: Forbidden")).toBe(false);
        expect(isPermanentDownloadError("HTTP Error 429: Too Many Requests")).toBe(false);
        expect(isPermanentDownloadError("socket timeout")).toBe(false);
        expect(isPermanentDownloadError("Connection reset by peer")).toBe(false);
        expect(isPermanentDownloadError(undefined)).toBe(false);
    });
});
