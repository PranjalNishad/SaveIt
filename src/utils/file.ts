import fs from "fs";
import path from "path";
import { env } from "@/config/env";
import { logger } from "./logger";

function ensureTempDir(): void {
    if (!fs.existsSync(env.TEMP_DIR)) {
        fs.mkdirSync(env.TEMP_DIR, { recursive: true });
    }
}

export function tempFilePath(ext: "mp4" | "mp3"): string {
    ensureTempDir();
    return path.join(env.TEMP_DIR, `${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`);
}

export async function safeDelete(filePath: string): Promise<void> {
    try {
        await fs.promises.unlink(filePath);
        logger.debug(`Deleted temp file: ${filePath}`);
    } catch (err: any) {
        // Ignore missing file errors, log others
        if (err && err.code === "ENOENT") return;
        logger.error(`Failed to delete file: ${filePath}`, err);
    }
}

export async function getFileSizeBytes(filePath: string): Promise<number> {
    try {
        const stat = await fs.promises.stat(filePath);
        return stat.size;
    } catch {
        return -1;
    }
}

/**
 * Delete files in TEMP_DIR older than `maxAgeMs` and return how many were removed.
 *
 * Called once at worker startup so orphans from a previous crash or force-kill do
 * not accumulate. The age guard means a download in flight (in another live
 * process) is never touched — only clearly stale files are swept.
 */
export async function sweepTempDir(maxAgeMs: number): Promise<number> {
    ensureTempDir();
    let removed = 0;

    try {
        const cutoff = Date.now() - maxAgeMs;
        const entries = await fs.promises.readdir(env.TEMP_DIR, { withFileTypes: true });

        for (const entry of entries) {
            if (!entry.isFile()) continue;
            const full = path.join(env.TEMP_DIR, entry.name);
            try {
                const stat = await fs.promises.stat(full);
                if (stat.mtimeMs < cutoff) {
                    await fs.promises.unlink(full);
                    removed += 1;
                }
            } catch {
                /* file vanished or is unreadable — skip it */
            }
        }
    } catch (err: any) {
        logger.warn("Temp-dir sweep failed", { err: err?.message ?? String(err) });
    }

    return removed;
}
