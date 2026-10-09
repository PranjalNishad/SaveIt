import { beforeEach, describe, expect, mock, test } from "bun:test";

// Capture the real error class so the bullmq mock stays compatible with
// process-job, which constructs UnrecoverableError.
const realBullmq = await import("bullmq");

let setResult: "OK" | null = "OK";
let setImpl: () => Promise<"OK" | null>;
const connCalls: Array<{ label?: string; profile?: string }> = [];
const delCalls: string[] = [];
const added: Array<{ name: string; data: any; opts: any }> = [];
let addImpl: (name: string, data: any, opts: any) => Promise<any>;

mock.module("bullmq", () => ({
    UnrecoverableError: realBullmq.UnrecoverableError,
    Queue: class {
        constructor(public name: string, public opts: any) {}
        on() {}
        add(name: string, data: any, opts: any) {
            added.push({ name, data, opts });
            return addImpl(name, data, opts);
        }
    },
}));

mock.module("@/config/redis", () => ({
    createRedisConnection: (label?: string, profile?: string) => {
        connCalls.push({ label, profile });
        return {
            set: () => setImpl(),
            del: async (key: string) => {
                delCalls.push(key);
                return 1;
            },
        };
    },
    redis: {},
}));

const { enqueueDownload } = await import("@/queue/download.queue");

const baseData = {
    chatId: 1,
    messageId: 2,
    url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    platform: "youtube",
    format: "video",
    requestedAt: 1700000000000,
} as any;

describe("enqueueDownload", () => {
    beforeEach(() => {
        setResult = "OK";
        setImpl = async () => setResult;
        delCalls.length = 0;
        added.length = 0;
        addImpl = async (_n, _d, opts) => ({ id: opts.jobId });
    });

    test("enqueues a job and returns its deterministic id", async () => {
        const res = await enqueueDownload(baseData);
        expect(res.deduped).toBe(false);
        expect(res.jobId).toBe("1_1700000000000");
        expect(added.length).toBe(1);
        expect(added[0].opts.jobId).toBe("1_1700000000000");
    });

    test("skips a duplicate when the in-flight key already exists", async () => {
        setResult = null;
        const res = await enqueueDownload(baseData);
        expect(res.deduped).toBe(true);
        expect(added.length).toBe(0);
    });

    test("releases the in-flight key when enqueue fails", async () => {
        addImpl = async () => {
            throw new Error("redis down");
        };
        await expect(enqueueDownload(baseData)).rejects.toThrow("redis down");
        expect(delCalls.length).toBe(1);
        expect(delCalls[0]).toContain("inflight:1:video:");
    });

    test("uses the fail-fast (app) profile for the dedupe connection", () => {
        const dedupe = connCalls.find((c) => c.label === "dedupe");
        expect(dedupe?.profile).toBe("app");
        // The Queue itself must keep the bullmq profile (blocking commands).
        expect(connCalls.find((c) => c.label === "queue")?.profile).toBe("bullmq");
    });

    test("rejects (fails fast) instead of hanging when the dedupe Redis call errors", async () => {
        setImpl = async () => {
            throw new Error("ECONNREFUSED");
        };
        await expect(enqueueDownload(baseData)).rejects.toThrow("ECONNREFUSED");
        expect(added.length).toBe(0);
    });
});
