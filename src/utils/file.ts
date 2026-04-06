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
