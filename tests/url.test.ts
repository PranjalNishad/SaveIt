import { describe, expect, test } from "bun:test";
import { normalizeUrl, youtubeVideoId } from "@/utils/url";

describe("normalizeUrl", () => {
    test("strips instagram tracking params and trailing slash", () => {
        expect(normalizeUrl("https://www.instagram.com/reel/ABC123/?igsh=xyz", "instagram")).toBe(
            "https://www.instagram.com/reel/ABC123/",
        );
    });

    test("strips tracking params from other platforms", () => {
        expect(
            normalizeUrl("https://twitter.com/user/status/123?utm_source=x&utm_medium=y", "twitter"),
        ).toBe("https://twitter.com/user/status/123");
    });

    test("canonicalizes youtu.be to watch form", () => {
        expect(normalizeUrl("https://youtu.be/dQw4w9WgXcQ?si=abc", "youtube")).toBe(
            "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
        );
    });

    test("canonicalizes shorts to watch form", () => {
        expect(normalizeUrl("https://www.youtube.com/shorts/dQw4w9WgXcQ", "youtube")).toBe(
            "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
        );
    });

    test("strips si from a watch URL and keeps the id", () => {
        expect(
            normalizeUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ&si=abc", "youtube"),
        ).toBe("https://www.youtube.com/watch?v=dQw4w9WgXcQ");
    });

    test("different youtube forms map to the same key", () => {
        const a = normalizeUrl("https://youtu.be/dQw4w9WgXcQ", "youtube");
        const b = normalizeUrl("https://youtube.com/shorts/dQw4w9WgXcQ", "youtube");
        const c = normalizeUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ", "youtube");
        expect(a).toBe(b);
        expect(b).toBe(c);
    });
});

describe("youtubeVideoId", () => {
    test("extracts id from each form", () => {
        expect(youtubeVideoId(new URL("https://youtu.be/dQw4w9WgXcQ"))).toBe("dQw4w9WgXcQ");
        expect(youtubeVideoId(new URL("https://www.youtube.com/watch?v=dQw4w9WgXcQ"))).toBe("dQw4w9WgXcQ");
        expect(youtubeVideoId(new URL("https://www.youtube.com/shorts/dQw4w9WgXcQ"))).toBe("dQw4w9WgXcQ");
    });

    test("returns null for non-video URLs", () => {
        expect(youtubeVideoId(new URL("https://www.youtube.com/feed/subscriptions"))).toBeNull();
    });
});
