import { httpRouter } from "convex/server";
import { internal } from "./_generated/api.js";
import { telegram } from "./telegram.js";

const http = httpRouter();

// Verifies the secret token, then dispatches updates to the handlers below.
// Webhook URL: https://<your-deployment>.convex.site/telegram/webhook
telegram.registerRoutes(http, {
  handlers: {
    message: async (ctx, update, bot) => {
      const { chat, from, text } = update.message;

      await ctx.runMutation(internal.telegram.recordMessage, {
        chatId: chat.id,
        text,
        username: from?.username,
      });

      if (text) {
        await bot.api.sendMessage({
          chat_id: chat.id,
          text: `You said: ${text}`,
        });
      }
    },
  },
  onUpdate: async (_ctx, update, bot) => {
    console.log(`${bot.username} received update ${update.update_id}`);
  },
});

export default http;
