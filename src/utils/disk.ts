import fs from "fs";

/**
 * True when the filesystem holding `dir` has at least `minBytes` free.
 *
 * Uses `statfs` (Node 18+ / Bun). Fails OPEN (returns true) if the check itself
 * errors — an unsupported platform must never block every download.
 */
export async function hasFreeDiskSpace(dir: string, minBytes: number): Promise<boolean> {
    try {
        const stats = await fs.promises.statfs(dir);
        const freeBytes = stats.bavail * stats.bsize;
        return freeBytes >= minBytes;
    } catch {
        return true;
    }
}
