import { beforeEach, describe, expect, mock, test } from "bun:test";

let evalImpl: (...args: unknown[]) => Promise<unknown>;

mock.module("@/config/redis", () => ({
    redis: {
        eval: (...args: unknown[]) => evalImpl(...args),
    },
    createRedisConnection: () => ({}),
}));

const { checkRateLimit } = await import("@/services/rate-limit.service");

describe("checkRateLimit", () => {
    beforeEach(() => {
        evalImpl = async () => [1, 4, 0];
    });

    test("allows a request under the limit", async () => {
        const res = await checkRateLimit(1, "https://example.com/x");
        expect(res.allowed).toBe(true);
        expect(res.remaining).toBe(4);
        expect(res.resetInSeconds).toBe(0);
    });

    test("blocks a request over the limit with a reset window", async () => {
        evalImpl = async () => [0, 5, Date.now() - 1000];
        const res = await checkRateLimit(1, "https://example.com/x");
        expect(res.allowed).toBe(false);
        expect(res.remaining).toBe(0);
        expect(res.resetInSeconds).toBeGreaterThan(0);
    });

    test("fails open when Redis errors", async () => {
        evalImpl = async () => {
            throw new Error("ECONNREFUSED");
        };
        const res = await checkRateLimit(1, "https://example.com/x");
        expect(res.allowed).toBe(true);
        expect(res.resetInSeconds).toBe(0);
    });

    test("works without a URL (no dedupe key)", async () => {
        const res = await checkRateLimit(1);
        expect(res.allowed).toBe(true);
    });
});
