import { describe, expect, test } from "bun:test";
import { detectLink, extractUrl } from "@/utils/validator";

describe("extractUrl", () => {
    test("finds a URL inside surrounding text", () => {
        expect(extractUrl("check this https://youtu.be/dQw4w9WgXcQ out")).toBe(
            "https://youtu.be/dQw4w9WgXcQ",
        );
    });

    test("returns null when there is no http(s) URL", () => {
        expect(extractUrl("hello world")).toBeNull();
        expect(extractUrl("javascript:alert(1)")).toBeNull();
    });
});

describe("detectLink", () => {
    const valid: Array<[string, string]> = [
        ["https://www.youtube.com/shorts/lYi1yjdmkPw", "youtube"],
        ["https://youtube.com/watch?v=dQw4w9WgXcQ", "youtube"],
        ["https://youtu.be/dQw4w9WgXcQ", "youtube"],
        ["https://www.instagram.com/reel/DaSK7b3oWK7/", "instagram"],
        ["https://twitter.com/user/status/1234567890", "twitter"],
        ["https://x.com/user/status/1234567890", "twitter"],
        ["https://www.tiktok.com/@user/video/1234567890", "tiktok"],
        ["https://vm.tiktok.com/ZMabcdef/", "tiktok"],
    ];

    for (const [url, platform] of valid) {
        test(`accepts ${url} as ${platform}`, () => {
            expect(detectLink(url)?.platform).toBe(platform);
        });
    }

    test("accepts a link embedded in a message", () => {
        expect(detectLink("look at https://youtu.be/dQw4w9WgXcQ please")?.platform).toBe("youtube");
    });

    test("rejects host spoofing via query string", () => {
        expect(detectLink("https://evil.com/?u=https://youtube.com/watch?v=dQw4w9WgXcQ")).toBeNull();
    });

    test("rejects host spoofing via subdomain", () => {
        expect(detectLink("https://youtube.com.evil.com/watch?v=dQw4w9WgXcQ")).toBeNull();
        expect(detectLink("https://evil.com/youtu.be/dQw4w9WgXcQ")).toBeNull();
    });

    test("rejects non-http(s) schemes", () => {
        expect(detectLink("ftp://youtube.com/watch?v=dQw4w9WgXcQ")).toBeNull();
        expect(detectLink("javascript:alert(1)")).toBeNull();
    });

    test("rejects a youtube watch URL without a video id", () => {
        expect(detectLink("https://www.youtube.com/watch?list=abc")).toBeNull();
    });

    test("rejects an unsupported youtube path", () => {
        expect(detectLink("https://www.youtube.com/feed/subscriptions")).toBeNull();
    });
});
