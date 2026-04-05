import { spawn, type ChildProcess } from "child_process";
import http from "http";
import path from "path";

interface ManagedProcess {
    name: string;
    proc: ChildProcess;
}

const managed: ManagedProcess[] = [];
let shuttingDown = false;
let healthServer: http.Server | null = null;

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

    managed.push({ name, proc });

    proc.on("error", (err) => {
        console.error(`[app] ${name} failed to start`, err);
        shutdown(1);
    });

    proc.on("exit", (code, signal) => {
        if (shuttingDown) return;

        console.error(`[app] ${name} exited`, { code, signal });
        shutdown(typeof code === "number" ? code : 1);
    });
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
