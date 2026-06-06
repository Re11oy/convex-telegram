import { v } from "convex/values";
import { mutation, query } from "./_generated/server.js";
import { normalizeUsername } from "./utils.js";

export const saveWebhookSecret = mutation({
  args: {
    botUsername: v.string(),
    webhookSecretToken: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const botUsername = normalizeUsername(args.botUsername);

    const existing = await ctx.db
      .query("webhooks")
      .withIndex("by_bot_username", (q) => q.eq("botUsername", botUsername))
      .unique();
    if (existing !== null) {
      await ctx.db.patch("webhooks", existing._id, {
        webhookSecretToken: args.webhookSecretToken,
      });
      return;
    }
    await ctx.db.insert("webhooks", {
      botUsername,
      webhookSecretToken: args.webhookSecretToken,
    });

    return null;
  },
});

export const deleteWebhookSecret = mutation({
  args: {
    botUsername: v.string(),
  },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const botUsername = normalizeUsername(args.botUsername);

    const existing = await ctx.db
      .query("webhooks")
      .withIndex("by_bot_username", (q) => q.eq("botUsername", botUsername))
      .unique();

    if (existing === null) {
      return false;
    }

    await ctx.db.delete("webhooks", existing._id);
    return true;
  },
});

export const findWebhookSecret = query({
  args: {
    webhookSecretToken: v.string(),
  },
  returns: v.union(
    v.object({
      isValid: v.literal(false),
    }),
    v.object({
      isValid: v.literal(true),
      botUsername: v.string(),
    }),
  ),
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("webhooks")
      .withIndex("by_webhook_secret_token", (q) =>
        q.eq("webhookSecretToken", args.webhookSecretToken),
      )
      .unique();

    if (existing === null) {
      return {
        isValid: false as const,
      };
    }

    return {
      isValid: true as const,
      botUsername: existing.botUsername,
    };
  },
});
