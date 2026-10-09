import { spawn, type ChildProcess } from "child_process";
import http from "http";
import path from "path";
import { Redis } from "ioredis";

interface ManagedProcess {
    name: string;
    entry: string;
    proc: ChildProcess;
    restarts: number;
    startedAt: number;
    restartTimer?: ReturnType<typeof setTimeout>;
}

const managed: ManagedProcess[] = [];
let shuttingDown = false;
let healthServer: http.Server | null = null;

const MAX_BACKOFF_MS = 5 * 60_000;
// If a child stayed up at least this long, treat the next exit as a fresh
// failure and reset the backoff counter (prevents pinning at max forever).
const HEALTHY_UPTIME_MS = 60_000;
// How long to let the bot/worker drain in-flight work after SIGTERM before we
// force-kill. Downloads can take minutes, so this is generous; Docker's
// stop_grace_period must exceed it (see docker-compose.yml). Parsed defensively
// so a bad value can't collapse the grace to 0.
const SHUTDOWN_GRACE_MS = (() => {
    const raw = Number(process.env.SHUTDOWN_GRACE_MS);
    return Number.isFinite(raw) && raw > 0 ? raw : 60_000;
})();

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
    const entry: ManagedProcess = existing ?? { name, entry: entryFile, proc, restarts: 0, startedAt: Date.now() };
    entry.proc = proc;
    entry.startedAt = Date.now();
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

    // A clean run resets the backoff so a later one-off crash retries quickly.
    if (Date.now() - entry.startedAt >= HEALTHY_UPTIME_MS) {
        entry.restarts = 0;
    }

    entry.restarts += 1;
    const delay = Math.min(1000 * 2 ** Math.min(entry.restarts, 8), MAX_BACKOFF_MS);
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

    const running = managed.filter((m) => m.proc.pid);
    if (running.length === 0) {
        process.exit(code);
        return;
    }

    // Ask children to stop. The worker drains in-flight jobs via worker.close(),
    // so a download in progress is given time to finish rather than killed mid-file.
    for (const { proc } of running) proc.kill("SIGTERM");

    // Escalate to SIGKILL only for children that ignore SIGTERM past the grace.
    const forceKill = setTimeout(() => {
        for (const { proc } of running) if (proc.pid) proc.kill("SIGKILL");
    }, SHUTDOWN_GRACE_MS);

    // Exit as soon as every child has exited.
    let pending = running.length;
    const onExit = () => {
        pending -= 1;
        if (pending <= 0) {
            clearTimeout(forceKill);
            process.exit(code);
        }
    };
    for (const m of running) m.proc.once("exit", onExit);

    // Absolute backstop in case a child is unkillable.
    setTimeout(() => process.exit(code), SHUTDOWN_GRACE_MS + 5000).unref();
}

// Build a Redis URL from env for the readiness probe. Mirrors the app's own
// precedence (REDIS_URL wins, else host/port/password).
function healthRedisUrl(): string {
    const url = process.env.REDIS_URL?.trim();
    if (url) return url;

    const host = process.env.REDIS_HOST ?? "127.0.0.1";
    const port = process.env.REDIS_PORT ?? "6379";
    const password = process.env.REDIS_PASSWORD;
    const auth = password ? `:${encodeURIComponent(password)}@` : "";
    return `redis://${auth}${host}:${port}`;
}

// Readiness = Redis actually replies to PING (the bot cannot enqueue or poll
// without it). A short-lived connection per probe keeps this dependency-free of
// the app's long-lived client and cannot leak in production.
async function isRedisReady(): Promise<boolean> {
    const client = new Redis(healthRedisUrl(), {
        lazyConnect: true,
        maxRetriesPerRequest: 1,
        enableOfflineQueue: false,
        connectTimeout: 2000,
        retryStrategy: () => null,
    });
    client.on("error", () => {
        /* swallow — the caller reports the failure */
    });

    try {
        await client.connect();
        const pong = await client.ping();
        return pong === "PONG";
    } catch {
        return false;
    } finally {
        client.disconnect();
    }
}

function startHealthServerIfNeeded(): void {
    const port = Number(process.env.PORT ?? 0);
    if (!port) return;

    healthServer = http
        .createServer(async (_req, res) => {
            const ready = await isRedisReady();
            res.writeHead(ready ? 200 : 503, { "Content-Type": "text/plain" });
            res.end(ready ? "ok" : "redis unavailable");
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
