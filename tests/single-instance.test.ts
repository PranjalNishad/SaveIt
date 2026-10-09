import { describe, expect, mock, test } from "bun:test";

// The lock module creates a Redis connection at import time; mock it so this
// pure key-derivation test never touches a real server.
mock.module("@/config/redis", () => ({
    redis: {},
    createRedisConnection: () => ({}),
}));

const { pollerLockKey } = await import("@/utils/single-instance");

describe("pollerLockKey", () => {
    test("is stable for the same token", () => {
        expect(pollerLockKey("token-a")).toBe(pollerLockKey("token-a"));
    });

    test("differs for different tokens (multi-bot isolation)", () => {
        expect(pollerLockKey("token-a")).not.toBe(pollerLockKey("token-b"));
    });

    test("is prefixed and never contains the token", () => {
        const key = pollerLockKey("supersecret-token-value");
        expect(key.startsWith("bot:poller:")).toBe(true);
        expect(key).not.toContain("supersecret");
    });
});
