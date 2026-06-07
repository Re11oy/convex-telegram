import { httpRouter } from "convex/server";
import { internal } from "./_generated/api.js";
import { telegram } from "./telegram.js";

const http = httpRouter();

// Webhook URL: https://<your-deployment>.convex.site/telegram/webhook
telegram.registerRoutes(http, {
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
