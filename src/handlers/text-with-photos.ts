import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { registerMainMenuItem, inlineButton, inlineKeyboard } from "../toolkit/index.js";
import { getStorage, type Product } from "../storage.js";

registerMainMenuItem({ label: "📦 Submit product", data: "submit:start", order: 10 });

const composer = new Composer<Ctx>();

function generateId(): string {
  return Math.random().toString(36).slice(2, 10);
}

function parseProductText(text: string): {
  title: string;
  description: string;
  price: number | null;
} {
  const lines = text.trim().split("\n");
  const title = lines[0]?.trim() ?? "Untitled product";
  const rest = lines.slice(1).join("\n").trim();

  let price: number | null = null;
  let description = rest;

  const priceMatch = rest.match(/(?:price|cost|₽|\$|€|£)\s*[:\s]*(\d+(?:[.,]\d+)?)/i);
  if (priceMatch) {
    price = parseFloat(priceMatch[1].replace(",", "."));
    description = rest.replace(priceMatch[0], "").trim();
  }

  return { title, description: description || title, price };
}

composer.command("text_with_photos", async (ctx) => {
  await ctx.reply("Submit product listing via text and photos");
});

composer.callbackQuery("submit:start", async (ctx) => {
  await ctx.answerCallbackQuery();
  ctx.session.step = "awaiting_product_text";
  await ctx.editMessageText(
    "Send your product details now.\n\n" +
      "Write the title on the first line, then the description below. " +
      "Include a price if you have one (e.g. \"Price: 2500\").\n\n" +
      "Attach photos to the same message if you have them.",
    { reply_markup: inlineKeyboard([[inlineButton("Cancel", "menu:main")]]) },
  );
});

composer.on("message:text", async (ctx) => {
  if (ctx.session.step !== "awaiting_product_text") return;

  ctx.session.step = undefined;
  const userId = ctx.from.id;
  const text = ctx.message.text;

  const photos: string[] = [];
  if ("photo" in ctx.message && Array.isArray(ctx.message.photo)) {
    for (const p of ctx.message.photo) {
      photos.push(p.file_id);
    }
  }

  const { title, description, price } = parseProductText(text);
  const id = generateId();
  const now = new Date().toISOString();

  const product: Product = {
    id,
    title,
    description,
    price,
    photos,
    status: "pending_review",
    submitterId: userId,
    auditHistory: [
      { actionType: "submitted", timestamp: now, performer: userId },
    ],
    createdAt: now,
    updatedAt: now,
  };

  const storage = getStorage();
  await storage.saveProduct(product);

  const priceLine = price !== null ? `\nPrice: ${price}` : "";
  await ctx.reply(
    `✅ Product submitted!\n\n` +
      `${title}\n` +
      `${description}${priceLine}\n\n` +
      `Our team will review it shortly.`,
    { reply_markup: inlineKeyboard([[inlineButton("⬅️ Back to menu", "menu:main")]]) },
  );
});

export default composer;
