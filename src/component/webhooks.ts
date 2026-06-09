import { v } from "convex/values";
import { mutation, query, type MutationCtx } from "./_generated/server.js";
import { vWebhookSettings } from "./schema.js";

async function deleteByUsername(ctx: MutationCtx, botUsername: string) {
  const existing = await ctx.db
    .query("webhooks")
    .withIndex("by_botUsername", (q) => q.eq("botUsername", botUsername))
    .unique();
  if (existing) {
    await ctx.db.delete("webhooks", existing._id);
  }
}

// Deletes any existing record for the bot first, so re-registering is idempotent.
export const create = mutation({
  args: {
    botUsername: v.string(),
    botId: v.float64(),
    secretHash: v.string(),
    settings: vWebhookSettings,
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await deleteByUsername(ctx, args.botUsername);
    await ctx.db.insert("webhooks", args);
    return null;
  },
});

export const verifySecretHash = query({
  args: { secretHash: v.string() },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const match = await ctx.db
      .query("webhooks")
      .withIndex("by_secretHash", (q) => q.eq("secretHash", args.secretHash))
      .first();
    return match !== null;
  },
});

export const remove = mutation({
  args: { botUsername: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    await deleteByUsername(ctx, args.botUsername);
    return null;
  },
});
