import { Telegraf } from "telegraf";
import { logger } from "@/utils/logger";
import { MESSAGES } from "@/constants";
import { handleMessage } from "@/bot/handlers/message.handler";
import { handleCallback } from "@/bot/handlers/callback.handler";

const bot = new Telegraf(process.env.BOT_TOKEN!);

// ── Commands ───────────────────────────────────────────────
bot.start((ctx) => ctx.reply(MESSAGES.WELCOME, { parse_mode: "Markdown" }));
bot.help((ctx) => ctx.reply(MESSAGES.HELP, { parse_mode: "Markdown" }));

// ── Handlers ───────────────────────────────────────────────
bot.on("text", handleMessage);
bot.on("callback_query", handleCallback);

// ── Errors ─────────────────────────────────────────────────
bot.catch((err, ctx) => {
  logger.error("Unhandled bot error", { err, update: ctx.update });
});

// ── Launch ─────────────────────────────────────────────────
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
