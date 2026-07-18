import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { registerMainMenuItem, inlineButton, inlineKeyboard } from "../toolkit/index.js";
import { getStorage, type Product } from "../storage.js";

registerMainMenuItem({ label: "📋 Review inbox", data: "review:inbox", order: 30 });

const composer = new Composer<Ctx>();

function formatProductPreview(p: Product): string {
  const priceLine = p.price !== null ? ` · ${p.price}` : "";
  return `${p.title}${priceLine}\n${p.description.slice(0, 100)}${p.description.length > 100 ? "…" : ""}`;
}

function reviewKeyboard(productId: string): ReturnType<typeof inlineKeyboard> {
  return inlineKeyboard([
    [
      inlineButton("✏️ Edit", `review:edit:${productId}`),
      inlineButton("🏷️ Assign", `review:assign:${productId}`),
    ],
    [
      inlineButton("🚀 Publish", `review:publish:${productId}`),
      inlineButton("❌ Reject", `review:reject:${productId}`),
    ],
    [inlineButton("⬅️ Back to menu", "menu:main")],
  ]);
}

composer.callbackQuery("review:inbox", async (ctx) => {
  await ctx.answerCallbackQuery();
  const storage = getStorage();
  const ids = await storage.getInboxProductIds();

  if (ids.length === 0) {
    await ctx.editMessageText(
      "Inbox is empty — no products waiting for review.",
      { reply_markup: inlineKeyboard([[inlineButton("⬅️ Back to menu", "menu:main")]]) },
    );
    return;
  }

  const buttons = ids.slice(0, 10).map((id) => [
    inlineButton(id.slice(0, 8), `review:view:${id}`),
  ]);
  buttons.push([inlineButton("⬅️ Back to menu", "menu:main")]);

  await ctx.editMessageText(
    `${ids.length} product(s) awaiting review.\nTap one to review:`,
    { reply_markup: inlineKeyboard(buttons) },
  );
});

composer.callbackQuery(/^review:view:(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const productId = ctx.match[1];
  const storage = getStorage();
  const product = await storage.getProduct(productId);

  if (!product) {
    await ctx.editMessageText(
      "Product not found — it may have been removed.",
      { reply_markup: inlineKeyboard([[inlineButton("⬅️ Back to menu", "menu:main")]]) },
    );
    return;
  }

  const priceLine = product.price !== null ? `Price: ${product.price}\n` : "";
  const photoLine = product.photos.length > 0
    ? `\n📸 ${product.photos.length} photo(s)`
    : "";

  await ctx.editMessageText(
    `📦 ${product.title}\n\n` +
      `${product.description}\n` +
      `${priceLine}` +
      `Status: ${product.status}${photoLine}\n` +
      `Submitted by: ${product.submitterId}`,
    { reply_markup: reviewKeyboard(productId) },
  );
});

composer.callbackQuery(/^review:publish:(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const productId = ctx.match[1];
  const storage = getStorage();
  const product = await storage.getProduct(productId);

  if (!product) {
    await ctx.editMessageText("Product not found.", {
      reply_markup: inlineKeyboard([[inlineButton("⬅️ Back to menu", "menu:main")]]),
    });
    return;
  }

  product.status = "published";
  product.auditHistory.push({
    actionType: "published",
    timestamp: new Date().toISOString(),
    performer: ctx.from.id,
  });
  product.updatedAt = new Date().toISOString();
  await storage.updateProduct(product);

  await ctx.editMessageText(
    `✅ Published: ${product.title}`,
    { reply_markup: inlineKeyboard([[inlineButton("⬅️ Back to menu", "menu:main")]]) },
  );
});

composer.callbackQuery(/^review:reject:(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const productId = ctx.match[1];
  ctx.session.step = "awaiting_review_reason";
  ctx.session.reviewProductId = productId;

  await ctx.editMessageText(
    "Why is this product being rejected? Send a short reason.",
    { reply_markup: inlineKeyboard([[inlineButton("Skip", `review:reject_skip:${productId}`)]]) },
  );
});

composer.callbackQuery(/^review:reject_skip:(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const productId = ctx.match[1];
  const storage = getStorage();
  const product = await storage.getProduct(productId);

  if (!product) {
    await ctx.editMessageText("Product not found.", {
      reply_markup: inlineKeyboard([[inlineButton("⬅️ Back to menu", "menu:main")]]),
    });
    return;
  }

  ctx.session.step = undefined;
  ctx.session.reviewProductId = undefined;

  product.status = "rejected";
  product.auditHistory.push({
    actionType: "rejected",
    timestamp: new Date().toISOString(),
    performer: ctx.from.id,
  });
  product.updatedAt = new Date().toISOString();
  await storage.updateProduct(product);

  await ctx.editMessageText(
    `❌ Rejected: ${product.title}`,
    { reply_markup: inlineKeyboard([[inlineButton("⬅️ Back to menu", "menu:main")]]) },
  );
});

composer.on("message:text", async (ctx) => {
  if (ctx.session.step !== "awaiting_review_reason") return;

  const productId = ctx.session.reviewProductId;
  if (!productId) {
    ctx.session.step = undefined;
    return;
  }

  const reason = ctx.message.text;
  const storage = getStorage();
  const product = await storage.getProduct(productId);

  ctx.session.step = undefined;
  ctx.session.reviewProductId = undefined;

  if (!product) {
    await ctx.reply("Product not found.", {
      reply_markup: inlineKeyboard([[inlineButton("⬅️ Back to menu", "menu:main")]]),
    });
    return;
  }

  product.status = "rejected";
  product.auditHistory.push({
    actionType: "rejected",
    timestamp: new Date().toISOString(),
    performer: ctx.from.id,
    reason,
  });
  product.updatedAt = new Date().toISOString();
  await storage.updateProduct(product);

  await ctx.reply(
    `❌ Rejected: ${product.title}\nReason: ${reason}`,
    { reply_markup: inlineKeyboard([[inlineButton("⬅️ Back to menu", "menu:main")]]) },
  );
});

composer.callbackQuery(/^review:assign:(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const productId = ctx.match[1];
  const storage = getStorage();
  const product = await storage.getProduct(productId);

  if (!product) {
    await ctx.editMessageText("Product not found.", {
      reply_markup: inlineKeyboard([[inlineButton("⬅️ Back to menu", "menu:main")]]),
    });
    return;
  }

  await ctx.editMessageText(
    `Assign "${product.title}" to a storefront:`,
    {
      reply_markup: inlineKeyboard([
        [inlineButton("Main Store", `review:assign_to:${productId}:main`)],
        [inlineButton("Outlet", `review:assign_to:${productId}:outlet`)],
        [inlineButton("Cancel", `review:view:${productId}`)],
      ]),
    },
  );
});

composer.callbackQuery(/^review:assign_to:(.+):(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const productId = ctx.match[1];
  const storefront = ctx.match[2];
  const storage = getStorage();
  const product = await storage.getProduct(productId);

  if (!product) {
    await ctx.editMessageText("Product not found.", {
      reply_markup: inlineKeyboard([[inlineButton("⬅️ Back to menu", "menu:main")]]),
    });
    return;
  }

  product.status = "assigned";
  product.assignedStorefront = storefront;
  product.auditHistory.push({
    actionType: "assigned",
    timestamp: new Date().toISOString(),
    performer: ctx.from.id,
    reason: `Assigned to ${storefront}`,
  });
  product.updatedAt = new Date().toISOString();
  await storage.updateProduct(product);

  await ctx.editMessageText(
    `🏷️ "${product.title}" assigned to ${storefront}`,
    { reply_markup: inlineKeyboard([[inlineButton("⬅️ Back to menu", "menu:main")]]) },
  );
});

composer.callbackQuery(/^review:edit:(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const productId = ctx.match[1];
  const storage = getStorage();
  const product = await storage.getProduct(productId);

  if (!product) {
    await ctx.editMessageText("Product not found.", {
      reply_markup: inlineKeyboard([[inlineButton("⬅️ Back to menu", "menu:main")]]),
    });
    return;
  }

  const priceLine = product.price !== null ? `Price: ${product.price}\n` : "";
  await ctx.editMessageText(
    `Editing: ${product.title}\n\n` +
      `${product.description}\n` +
      `${priceLine}` +
      `To edit, send the new details in this format:\n` +
      `Title\nDescription\nPrice: <amount>`,
    {
      reply_markup: inlineKeyboard([
        [inlineButton("Cancel", `review:view:${productId}`)],
      ]),
    },
  );
});

export default composer;
