import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { registerMainMenuItem, inlineButton, inlineKeyboard } from "../toolkit/index.js";
import { getStorage } from "../storage.js";

registerMainMenuItem({ label: "📄 My submissions", data: "submissions:list", order: 20 });

const composer = new Composer<Ctx>();

const STATUS_LABELS: Record<string, string> = {
  pending_review: "⏳ Pending",
  assigned: "🏷️ Assigned",
  published: "✅ Published",
  rejected: "❌ Rejected",
};

async function showSubmissions(ctx: Ctx, userId: number): Promise<void> {
  const storage = getStorage();
  const ids = await storage.getSellerProductIds(userId);

  if (ids.length === 0) {
    const msg = "No submissions yet — tap 📦 Submit product to create one.";
    if (ctx.callbackQuery) {
      await ctx.editMessageText(msg, {
        reply_markup: inlineKeyboard([[inlineButton("⬅️ Back to menu", "menu:main")]]),
      });
    } else {
      await ctx.reply(msg, {
        reply_markup: inlineKeyboard([[inlineButton("⬅️ Back to menu", "menu:main")]]),
      });
    }
    return;
  }

  const recent = ids.slice(-5).reverse();
  const lines: string[] = [];
  for (const id of recent) {
    const product = await storage.getProduct(id);
    if (product) {
      const status = STATUS_LABELS[product.status] ?? product.status;
      const price = product.price !== null ? ` · ${product.price}` : "";
      lines.push(`${status} ${product.title}${price}`);
    }
  }

  const text = `Your recent submissions:\n\n${lines.join("\n")}`;
  if (ctx.callbackQuery) {
    await ctx.editMessageText(text, {
      reply_markup: inlineKeyboard([[inlineButton("⬅️ Back to menu", "menu:main")]]),
    });
  } else {
    await ctx.reply(text, {
      reply_markup: inlineKeyboard([[inlineButton("⬅️ Back to menu", "menu:main")]]),
    });
  }
}

composer.command("my_submissions", async (ctx) => {
  await ctx.reply("View recent product submissions and statuses");
});

composer.callbackQuery("submissions:list", async (ctx) => {
  await ctx.answerCallbackQuery();
  await showSubmissions(ctx, ctx.from.id);
});

export default composer;
