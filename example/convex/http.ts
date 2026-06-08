import { httpRouter } from "convex/server";
import { registerRoutes } from "convex-telegram";
import { components, internal } from "./_generated/api.js";

const http = httpRouter();

// Webhook URL: https://<your-deployment>.convex.site/telegram/webhook
registerRoutes(http, components.telegram, {
  handlers: {
    message: async (ctx, update) => {
      const { chat, from, text } = update.message;
      if (!text) return;

      await ctx.runMutation(internal.messages.recordInbound, {
        chatId: chat.id,
        username: from?.username,
        text,
      });
    },
  },
});

export default http;
