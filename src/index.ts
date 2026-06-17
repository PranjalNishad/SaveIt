import { spawn, type ChildProcess } from "child_process";
import http from "http";
import path from "path";

interface ManagedProcess {
    name: string;
    entry: string;
    proc: ChildProcess;
    restarts: number;
    restartTimer?: ReturnType<typeof setTimeout>;
}

const managed: ManagedProcess[] = [];
let shuttingDown = false;
let healthServer: http.Server | null = null;

const MAX_BACKOFF_MS = 30_000;

function resolveEntrypoints(): { botEntry: string; workerEntry: string } {
    const useSource = process.env.APP_ENTRY === "src";
    const baseDir = useSource ? "src" : "dist";
    const ext = useSource ? "ts" : "js";

    const botEntry = process.env.BOT_ENTRY ?? path.join(process.cwd(), baseDir, "bot", `index.${ext}`);
    const workerEntry = process.env.WORKER_ENTRY ?? path.join(process.cwd(), baseDir, "worker", `index.${ext}`);

    return { botEntry, workerEntry };
}

function startProcess(name: string, entryFile: string): void {
    const proc = spawn("bun", [entryFile], {
        stdio: "inherit",
        env: process.env,
    });

    const existing = managed.find((m) => m.name === name);
    const entry: ManagedProcess = existing ?? { name, entry: entryFile, proc, restarts: 0 };
    entry.proc = proc;
    if (!existing) managed.push(entry);

    proc.on("error", (err) => {
        console.error(`[app] ${name} failed to start`, err);
        scheduleRestart(entry);
    });

    proc.on("exit", (code, signal) => {
        if (shuttingDown) return;
        console.error(`[app] ${name} exited — restarting`, { code, signal });
        scheduleRestart(entry);
    });
}

// Restart the crashed child only (keeps the container up) with capped backoff.
function scheduleRestart(entry: ManagedProcess): void {
    if (shuttingDown || entry.restartTimer) return;

    entry.restarts += 1;
    const delay = Math.min(1000 * 2 ** Math.min(entry.restarts, 5), MAX_BACKOFF_MS);
    console.error(`[app] restarting ${entry.name} in ${delay}ms (attempt ${entry.restarts})`);

    entry.restartTimer = setTimeout(() => {
        entry.restartTimer = undefined;
        if (shuttingDown) return;
        startProcess(entry.name, entry.entry);
    }, delay);
    entry.restartTimer.unref?.();
}

function shutdown(code: number): void {
    if (shuttingDown) return;
    shuttingDown = true;

    if (healthServer) {
        healthServer.close();
        healthServer = null;
    }

    for (const { proc } of managed) {
        if (proc.pid) proc.kill("SIGTERM");
    }

    setTimeout(() => {
        for (const { proc } of managed) {
            if (proc.pid) proc.kill("SIGKILL");
        }
    }, 5000).unref();

    setTimeout(() => process.exit(code), 200).unref();
}

function startHealthServerIfNeeded(): void {
    const port = Number(process.env.PORT ?? 0);
    if (!port) return;

    healthServer = http
        .createServer((_req, res) => {
            res.writeHead(200, { "Content-Type": "text/plain" });
            res.end("ok");
        })
        .listen(port, () => {
            console.log(`[app] Health server listening on :${port}`);
        });
}

function main(): void {
    const { botEntry, workerEntry } = resolveEntrypoints();

    console.log("[app] Starting bot + worker", { botEntry, workerEntry });
    startHealthServerIfNeeded();

    startProcess("bot", botEntry);
    startProcess("worker", workerEntry);

    process.once("SIGINT", () => shutdown(0));
    process.once("SIGTERM", () => shutdown(0));
}

main();
