import { beforeEach, describe, expect, mock, test } from "bun:test";
import { MESSAGES } from "@/constants/messages";
import { env } from "@/config/env";
import { processJob, type JobProcessorDeps } from "@/worker/process-job";
import { UnrecoverableError } from "bullmq";

let downloadResult: any;

function makeDeps(overrides: Partial<JobProcessorDeps> = {}) {
    const saved: any[][] = [];
    const removed: string[] = [];

    const deps: JobProcessorDeps = {
        telegram: {
            editMessage: mock(async () => {}),
            sendVideo: mock(async () => ({ video: { file_id: "vid" } })),
            sendAudio: mock(async () => ({ audio: { file_id: "aud" } })),
        },
        download: mock(async () => downloadResult),
        cacheMedia: mock(async (...args: any[]) => {
            saved.push(args);
        }),
        getCached: mock(async () => null),
        removeFile: mock(async (p: string) => {
            removed.push(p);
        }),
        ...overrides,
    };

    return { deps, saved, removed };
}

function makeJob(data: Record<string, any> = {}) {
    return {
        id: "job-1",
        data: {
            chatId: 1,
            messageId: 2,
            url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
            format: "video",
            platform: "youtube",
            requestedAt: 1,
            ...data,
        },
    } as any;
}

async function captureError(fn: () => Promise<void>): Promise<any> {
    try {
        await fn();
        return null;
    } catch (err) {
        return err;
    }
}

beforeEach(() => {
    downloadResult = { success: true, filePath: "/tmp/clip.mp4", fileSizeBytes: 4 };
});

describe("processJob — success", () => {
    test("sends video, caches file_id and cleans up the temp file", async () => {
        const { deps, saved, removed } = makeDeps();
        await processJob(makeJob(), deps);

        expect(deps.telegram.sendVideo).toHaveBeenCalledTimes(1);
        expect(saved.length).toBe(1);
        expect(saved[0][3]).toBe("vid");
        expect(removed).toEqual(["/tmp/clip.mp4"]);
        expect((deps.telegram.editMessage as any).mock.calls.at(-1)?.[2]).toBe(MESSAGES.DONE);
    });

    test("caches the audio file_id for audio jobs", async () => {
        const { deps, saved } = makeDeps();
        await processJob(makeJob({ format: "audio" }), deps);

        expect(deps.telegram.sendAudio).toHaveBeenCalledTimes(1);
        expect(saved.length).toBe(1);
        expect(saved[0][3]).toBe("aud");
    });

    test("does not cache when the send returns no file_id", async () => {
        const { deps, saved } = makeDeps({
            telegram: {
                editMessage: mock(async () => {}),
                sendVideo: mock(async () => ({})),
                sendAudio: mock(async () => ({})),
            },
        });
        await processJob(makeJob(), deps);
        expect(saved.length).toBe(0);
    });
});

describe("processJob — idempotency (cache hit)", () => {
    test("delivers from cache without downloading on a re-delivered job", async () => {
        const { deps, saved } = makeDeps({ getCached: mock(async () => ({ fileId: "cached-id" })) });

        await processJob(makeJob(), deps);

        expect(deps.download).not.toHaveBeenCalled();
        expect(deps.telegram.sendVideo).toHaveBeenCalledTimes(1);
        expect((deps.telegram.sendVideo as any).mock.calls[0][1]).toBe("cached-id");
        expect(saved.length).toBe(0);
    });

    test("continues to download when the cache lookup throws", async () => {
        const { deps } = makeDeps({
            getCached: mock(async () => {
                throw new Error("redis down");
            }),
        });

        await processJob(makeJob(), deps);

        expect(deps.download).toHaveBeenCalledTimes(1);
        expect(deps.telegram.sendVideo).toHaveBeenCalledTimes(1);
    });

    test("permanent failure delivering cached media throws UnrecoverableError", async () => {
        const { deps } = makeDeps({
            getCached: mock(async () => ({ fileId: "cached-id" })),
            telegram: {
                editMessage: mock(async () => {}),
                sendVideo: mock(async () => {
                    throw { response: { error_code: 403 } };
                }),
                sendAudio: mock(async () => ({})),
            },
        });

        const err = await captureError(() => processJob(makeJob(), deps));
        expect(err).toBeInstanceOf(UnrecoverableError);
    });
});

describe("processJob — download failures", () => {
    test("FILE_TOO_LARGE is terminal and does not retry", async () => {
        downloadResult = { success: false, error: "FILE_TOO_LARGE:99999999" };
        const { deps } = makeDeps();

        await processJob(makeJob(), deps);

        expect(deps.telegram.sendVideo).not.toHaveBeenCalled();
        expect((deps.telegram.editMessage as any).mock.calls.at(-1)?.[2]).toBe(MESSAGES.FILE_TOO_LARGE(env.MAX_FILE_SIZE_MB));
    });

    test("permanent error throws UnrecoverableError", async () => {
        downloadResult = {
            success: false,
            error: "ERROR: [Instagram] x: Instagram sent an empty media response.",
        };
        const { deps } = makeDeps();
        const err = await captureError(() => processJob(makeJob(), deps));
        expect(err).toBeInstanceOf(UnrecoverableError);
        expect(err.name).toBe("UnrecoverableError");
    });

    test("transient error throws a retryable Error", async () => {
        downloadResult = { success: false, error: "socket timeout" };
        const { deps } = makeDeps();
        const err = await captureError(() => processJob(makeJob(), deps));
        expect(err).toBeInstanceOf(Error);
        expect(err.name).toBe("Error");
    });
});

describe("processJob — delivery failures", () => {
    test("permanent delivery failure throws UnrecoverableError and still cleans up", async () => {
        const { deps, removed } = makeDeps({
            telegram: {
                editMessage: mock(async () => {}),
                sendVideo: mock(async () => {
                    throw { response: { error_code: 403, description: "Forbidden: bot was blocked by the user" } };
                }),
                sendAudio: mock(async () => ({})),
            },
        });

        const err = await captureError(() => processJob(makeJob(), deps));
        expect(err).toBeInstanceOf(UnrecoverableError);
        expect(removed).toEqual(["/tmp/clip.mp4"]);
    });
});
