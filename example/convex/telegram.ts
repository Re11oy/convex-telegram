import { Telegram } from "convex-telegram";
import { v } from "convex/values";
import { components } from "./_generated/api.js";
import { action, internalMutation } from "./_generated/server.js";

// Reads TELEGRAM_BOT_TOKEN and TELEGRAM_WEBHOOK_SECRET from the environment.
export const telegram = new Telegram(components.telegram);

// Point Telegram at this deployment's webhook endpoint. Run once after
// deploying (e.g. `npx convex run telegram:setupWebhook`).
export const setupWebhook = action({
  args: {},
  returns: v.object({
    botUsername: v.string(),
    webhookUrl: v.string(),
  }),
  handler: async () => {
    return await telegram.setupWebhook();
  },
});

export const deleteWebhook = action({
  args: {},
  returns: v.null(),
  handler: async () => {
    await telegram.deleteWebhook();
    return null;
  },
});

export const sendMessage = action({
  args: {
    chatId: v.union(v.string(), v.float64()),
    text: v.string(),
  },
  returns: v.null(),
  handler: async (_ctx, args) => {
    await telegram.api.sendMessage({ chat_id: args.chatId, text: args.text });
    return null;
  },
});

export const recordMessage = internalMutation({
  args: {
    chatId: v.float64(),
    text: v.optional(v.string()),
    username: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.insert("messages", args);
    return null;
  },
});
