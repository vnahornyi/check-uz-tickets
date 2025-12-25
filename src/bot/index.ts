import { Telegraf, Context, Markup } from "telegraf";
import { addLink } from "./commands/addLink";
import { removeLink } from "./commands/removeLink";
import { listLinksCommand } from "./commands/listLinks";
import { statusCommand } from "./commands/status";
import { mainMenuKeyboard, backToMainButton } from "./ui";
import { getUserState } from "../redis";

const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN || "");

bot.start(async (ctx: Context) => {
  // simply show main menu
  await ctx.replyWithHTML("Вітаю! Ось головне меню. Оберіть дію:", {
    reply_markup: mainMenuKeyboard(),
  } as any);
});

const showMainMenu = async (ctx: Context) => {
  await ctx.replyWithHTML("Головне меню", {
    reply_markup: mainMenuKeyboard(),
  } as any);
};

// Safely answer callback queries — ignore "query is too old" errors
const safeAnswerCbQuery = async (ctx: any, text?: string, opts?: any) => {
  try {
    await ctx.answerCbQuery(text, opts);
  } catch (err: any) {
    if (
      err &&
      typeof err.message === "string" &&
      /query is too old/i.test(err.message)
    ) {
      return;
    }
    console.warn("answerCallbackQuery failed", err);
  }
};

bot.command("addlink", (ctx: Context) => {
  const parts =
    ctx.message && "text" in ctx.message ? ctx.message.text.split(" ") : [];
  const link = parts[1];
  return addLink(ctx, link);
});

bot.command("removelink", (ctx: Context) => {
  const parts =
    ctx.message && "text" in ctx.message ? ctx.message.text.split(" ") : [];
  const link = parts[1];
  if (!link)
    return ctx.reply("Будь ласка, вкажіть посилання: /removelink <link>");
  return removeLink(ctx, link);
});

bot.command("listlinks", (ctx: Context) => listLinksCommand(ctx));

bot.command("status", (ctx: Context) => statusCommand(ctx));

// handle menu callbacks
bot.on("callback_query", async (ctx: Context, next: () => Promise<any>) => {
  const data =
    ctx.callbackQuery && "data" in ctx.callbackQuery
      ? ctx.callbackQuery.data
      : null;
  if (!data) return;
  try {
    if (data === "menu:main") {
      await showMainMenu(ctx);
      await safeAnswerCbQuery(ctx);
      return;
    }
    if (data === "menu:add") {
      const userId = ctx.from?.id;
      if (!userId)
        return await ctx.answerCbQuery("Не вдалось визначити користувача");
      await addLink(ctx, ""); // prompts interactive flow
      await safeAnswerCbQuery(ctx);
      return;
    }
    if (data === "menu:list") {
      await listLinksCommand(ctx);
      await safeAnswerCbQuery(ctx);
      return;
    }
    if (data === "menu:help") {
      await ctx.reply(
        "ℹ️ Довідка:\n- Додати посилання: додати нове посилання для відстеження\n- Список посилань: керувати вашими посиланнями"
      );
      await safeAnswerCbQuery(ctx);
      return;
    }
    await next();
  } catch (err) {
    console.error("Callback handling error", err);
  }
});

bot.on("text", async (ctx: Context) => {
  const text =
    ctx.message && "text" in ctx.message ? ctx.message.text.trim() : "";
  const userId = ctx.from?.id;
  if (!userId) return;
  const state = await getUserState(String(userId));
  const urlPattern = /https?:\/\//i;
  if (state && state.step === "awaiting_link") {
    if (!text || !urlPattern.test(text)) {
      return ctx.reply(
        'Будь ласка, надішліть коректне посилання або натисніть "Back to main".',
        { reply_markup: backToMainButton() } as any
      );
    }
    await addLink(ctx, text);
    return;
  }
  if (text && urlPattern.test(text)) {
    await addLink(ctx, text);
    return;
  }
});

// handle inline button callbacks
bot.on("callback_query", async (ctx: Context) => {
  const data =
    ctx.callbackQuery && "data" in ctx.callbackQuery
      ? ctx.callbackQuery.data
      : null;
  if (!data) return;
  try {
    if (data.startsWith("remove:")) {
      const id = Number(data.split(":")[1]);
      const { removeLinkById } = await import("../db");
      const removed = await removeLinkById(id);
      if (removed) {
        await safeAnswerCbQuery(ctx, "Посилання видалено");
        try {
          await ctx.editMessageText("Посилання видалено");
        } catch (_e) {}
      } else {
        await safeAnswerCbQuery(ctx, "Не вдалося видалити посилання", {
          show_alert: true,
        });
      }
    } else if (data.startsWith("check:")) {
      const id = Number(data.split(":")[1]);
      const { pool } = await import("../db");
      const res = await pool.query(
        "SELECT t.link, u.telegram_id FROM tracking_links t JOIN users u ON t.user_id = u.id WHERE t.id = $1",
        [id]
      );
      if (res.rows.length === 0) {
        await safeAnswerCbQuery(ctx, "Посилання не знайдено", {
          show_alert: true,
        });
        return;
      }
      const row = res.rows[0];
      const redis = await import("../redis");
      redis.redisClient.publish(
        "trackLinks",
        JSON.stringify({ userId: String(row.telegram_id) })
      );
      const statusText = `⏳ <b>Перевірка запущена</b>\n${row.link}`;
      const keyboard = [
        [{ text: "Видалити ❌", callback_data: `remove:${id}` }],
        [{ text: "Позначити як відсутнє 🚫", callback_data: `absent:${id}` }],
      ];
      try {
        await ctx.editMessageText(statusText, {
          parse_mode: "HTML",
          reply_markup: { inline_keyboard: keyboard },
        } as any);
      } catch (_e) {}
      await safeAnswerCbQuery(ctx, "Запит на перевірку надіслано");
    } else if (data.startsWith("absent:")) {
      const id = Number(data.split(":")[1]);
      try {
        const { pool } = await import("../db");
        const cooldownMinutes =
          Number(process.env.ABSENT_COOLDOWN_MINUTES) || 5; // default 5 minutes
        const res = await pool.query(
          "UPDATE tracking_links SET notified = false, ignore_until = NOW() + ($2)::interval WHERE id = $1 RETURNING id, link, notified, last_status, last_checked_at, ignore_until",
          [id, `${cooldownMinutes} minutes`]
        );
        if (res.rows.length === 0) {
          await safeAnswerCbQuery(ctx, "Посилання не знайдено", {
            show_alert: true,
          });
          return;
        }
        const row = res.rows[0];
        const statusEmoji =
          row.last_status === null ? "⏳" : row.last_status ? "❌" : "✅";
        const notified = row.notified ? "🔔" : "";
        const lastChecked = row.last_checked_at
          ? ` (перевірено: ${new Date(row.last_checked_at).toLocaleString()})`
          : "";
        const text = `${statusEmoji} <b>${row.link}</b> ${notified}${lastChecked}`;
        const keyboard = [
          [{ text: "Видалити ❌", callback_data: `remove:${id}` }],
          [{ text: "Позначити як відсутнє 🚫", callback_data: `absent:${id}` }],
        ];
        try {
          await ctx.editMessageText(text, {
            parse_mode: "HTML",
            reply_markup: { inline_keyboard: keyboard },
          } as any);
        } catch (_e) {}
        await showMainMenu(ctx);
        await safeAnswerCbQuery(ctx, "Посилання позначено як відсутнє");
      } catch (err) {
        console.error("Failed to mark absent", err);
        await safeAnswerCbQuery(ctx, "Не вдалося позначити посилання", {
          show_alert: true,
        });
      }
    }
  } catch (err) {
    console.error("Callback handling error", err);
  }
});

bot
  .launch()
  .then(() => {
    console.log("Bot is up and running!");
  })
  .catch((err: unknown) => {
    console.error("Failed to launch bot:", err);
  });
