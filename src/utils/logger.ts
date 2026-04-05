import winston from "winston";
import path from "path";
import fs from "fs";
import { env } from "@/config/env";

// Ensure log directory exists
if (!fs.existsSync(env.LOG_DIR)) {
    fs.mkdirSync(env.LOG_DIR, { recursive: true });
}

const { combine, timestamp, colorize, printf, json } = winston.format;

const consoleFormat = printf(({ level, message, timestamp, ...meta }) => {
    const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : "";
    return `${timestamp} [${level}]: ${message}${metaStr}`;
});

export const logger = winston.createLogger({
    level: env.LOG_LEVEL,
    transports: [
        // Console: colorized + human-readable
        new winston.transports.Console({
            format: combine(colorize(), timestamp({ format: "HH:mm:ss" }), consoleFormat),
        }),
        // File: structured JSON for easy parsing
        new winston.transports.File({
            filename: path.join(env.LOG_DIR, "combined.log"),
            format: combine(timestamp(), json()),
            maxsize: 5 * 1024 * 1024, // 5MB
            maxFiles: 5,
            tailable: true,
        }),
        new winston.transports.File({
            filename: path.join(env.LOG_DIR, "error.log"),
            level: "error",
            format: combine(timestamp(), json()),
            maxsize: 5 * 1024 * 1024,
            maxFiles: 3,
        }),
    ],
});
