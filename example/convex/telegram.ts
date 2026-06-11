import { TelegramBot, vOnOutboundEventArgs } from "convex-telegram";
import { v } from "convex/values";
import { components, internal } from "./_generated/api.js";
import { internalAction, internalMutation } from "./_generated/server.js";

// Reads TELEGRAM_BOT_TOKEN and TELEGRAM_WEBHOOK_SECRET from the environment.
// The explicit annotation breaks the type cycle with `internal.telegram`.
export const bot: TelegramBot = new TelegramBot(components.telegram, {
  onOutboundEvent: internal.telegram.handleOutboundEvent,
});

// Point Telegram at this deployment's webhook endpoint. Run once after
// deploying (e.g. `npx convex run telegram:setupWebhook`).
export const setupWebhook = internalAction({
  args: {},
  handler: async (ctx) => {
    return await bot.setupWebhook(ctx, {
      allowedUpdates: ["message"],
      dropPendingUpdates: true,
    });
  },
});

export const deleteWebhook = internalAction({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    await bot.deleteWebhook(ctx);
    return null;
  },
});

// Links delivery outcomes back to our messages table: `clientRef` carries
// the messages._id passed to bot.outbound.send.
export const handleOutboundEvent = internalMutation({
  args: vOnOutboundEventArgs,
  returns: v.null(),
  handler: async (ctx, event) => {
    const messageId =
      event.clientRef === undefined
        ? null
        : ctx.db.normalizeId("messages", event.clientRef);
    if (event.event === "sent") {
      // The row may already be gone (threads expire after an hour).
      if (
        messageId !== null &&
        (await ctx.db.get("messages", messageId)) !== null
      ) {
        await ctx.db.patch("messages", messageId, {
          telegramMessageId: event.telegramMessageId,
        });
      }
    } else {
      console.warn(
        `Telegram delivery ${event.event} for message ${event.clientRef}:`,
        event.errorCode,
        event.errorMessage,
      );
    }
    return null;
  },
});
