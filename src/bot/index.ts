import { Telegraf } from "telegraf";
import { logger } from "@/utils/logger";
import { MESSAGES } from "@/constants";
import { handleMessage } from "@/bot/handlers/message.handler";
import { handleCallback } from "@/bot/handlers/callback.handler";
import { env } from "@/config/env";

const bot = new Telegraf(process.env.BOT_TOKEN!, {
  telegram: { apiRoot: "https://api.telegram.org" }
});

bot.start((ctx) => ctx.reply(MESSAGES.WELCOME, { parse_mode: "Markdown" }));
bot.help((ctx) => ctx.reply(MESSAGES.HELP, { parse_mode: "Markdown" }));

bot.on("text", handleMessage);
bot.on("callback_query", handleCallback);

bot.catch((err, ctx) => {
  logger.error("Unhandled bot error", { err, update: ctx.update });
});

// Never let a stray async error kill the process — log and keep running.
process.on("unhandledRejection", (reason) => {
  logger.error("Bot unhandledRejection", { reason: String(reason) });
});
process.on("uncaughtException", (err) => {
  logger.error("Bot uncaughtException", { err: err.message });
});

async function main() {
  logger.info("Starting bot...");
  process.once("SIGINT", () => bot.stop("SIGINT"));
  process.once("SIGTERM", () => bot.stop("SIGTERM"));
  await bot.launch();
  logger.info("✅ Bot is running");
}

main().catch((err) => {
  logger.error("Fatal error starting bot", err);
  process.exit(1);
});
