// Test preload: provide the env that config/env.ts requires and redirect all
// logs/temp files away from the repo so tests never touch real directories.
import { mkdtempSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

process.env.BOT_TOKEN = "test-token";
process.env.LOG_LEVEL = "silent";
// Pin the limit so the suite does not depend on the developer's .env.
process.env.MAX_FILE_SIZE_MB = "50";

const scratch = mkdtempSync(join(tmpdir(), "saveit-test-"));
process.env.TEMP_DIR = join(scratch, "temp");
process.env.LOG_DIR = join(scratch, "logs");
