import { Telegram } from "convex-telegram";
import { v } from "convex/values";
import { components } from "./_generated/api.js";
import { internalAction } from "./_generated/server.js";

// Reads TELEGRAM_BOT_TOKEN and TELEGRAM_WEBHOOK_SECRET from the environment.
export const telegram = new Telegram(components.telegram);

// Point Telegram at this deployment's webhook endpoint. Run once after
// deploying (e.g. `npx convex run telegram:setupWebhook`).
export const setupWebhook = internalAction({
  args: {},
  returns: v.object({
    botUsername: v.string(),
    webhookUrl: v.string(),
  }),
  handler: async () => {
    return await telegram.setupWebhook();
  },
});

export const deleteWebhook = internalAction({
  args: {},
  returns: v.null(),
  handler: async () => {
    await telegram.deleteWebhook();
    return null;
  },
});

export const deliverToTelegram = internalAction({
  args: { chatId: v.float64(), text: v.string() },
  returns: v.null(),
  handler: async (_ctx, { chatId, text }) => {
    await telegram.api.sendMessage({ chat_id: chatId, text });
    return null;
  },
});
