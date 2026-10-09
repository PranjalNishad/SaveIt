import { Telegraf } from "telegraf";
import { logger } from "@/utils/logger";
import { MESSAGES } from "@/constants";
import { handleMessage } from "@/bot/handlers/message.handler";
import { handleCallback } from "@/bot/handlers/callback.handler";
import { env } from "@/config/env";
import { acquirePollerLock } from "@/utils/single-instance";

const bot = new Telegraf(env.BOT_TOKEN, {
  telegram: { apiRoot: "https://api.telegram.org" },
});

bot.start((ctx) => ctx.reply(MESSAGES.WELCOME, { parse_mode: "Markdown" }));
bot.help((ctx) => ctx.reply(MESSAGES.HELP, { parse_mode: "Markdown" }));

bot.on("text", handleMessage);
bot.on("callback_query", handleCallback);

bot.catch((err, ctx) => {
  logger.error("Unhandled bot error", { err, update: ctx.update });
});

// A rejected promise should be logged, not crash the process.
process.on("unhandledRejection", (reason) => {
  logger.error("Bot unhandledRejection", { reason: String(reason) });
});
// An uncaught exception leaves the process in an unknown state — exit so the
// supervisor can restart it cleanly instead of running corrupted.
process.on("uncaughtException", (err) => {
  logger.error("Bot uncaughtException — exiting for clean restart", {
    err: err.message,
    stack: err.stack,
  });
  process.exit(1);
});

async function main(): Promise<void> {
  const lock = await acquirePollerLock(env.BOT_TOKEN);
  if (!lock) {
    process.exit(0);
  }

  logger.info("Starting bot...");

  const shutdown = async () => {
    await lock.release();
    await bot.stop();
  };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);

  await bot.launch();
  logger.info("✅ Bot is running");
}

main().catch((err) => {
  const code = (err as any)?.response?.error_code;
  const message = String((err as Error)?.message ?? err);

  if (code === 409 || message.includes("409")) {
    logger.error(
      "Telegram 409 Conflict: another instance is polling with this token. " +
        "Ensure only one bot process runs (check other hosts/deployments sharing this token).",
    );
    process.exit(0);
  }

  logger.error("Fatal error starting bot", err);
  process.exit(1);
});
