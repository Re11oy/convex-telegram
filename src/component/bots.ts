import { v } from "convex/values";
import { mutation, query, type MutationCtx } from "./_generated/server.js";
import schema from "./schema.js";

async function deleteByBotId(ctx: MutationCtx, botId: number) {
  const existing = await ctx.db
    .query("bots")
    .withIndex("by_botId", (q) => q.eq("botId", botId))
    .unique();

  if (existing) {
    await ctx.db.delete("bots", existing._id);
  }
}

// Deletes any existing record for the bot first, so re-registering is idempotent.
export const upsert = mutation({
  args: schema.tables.bots.validator,
  returns: v.null(),
  handler: async (ctx, args) => {
    await deleteByBotId(ctx, args.botId);
    await ctx.db.insert("bots", args);
    return null;
  },
});

export const remove = mutation({
  args: { botId: v.float64() },
  returns: v.null(),
  handler: async (ctx, args) => {
    await deleteByBotId(ctx, args.botId);
    return null;
  },
});

export const getByBotId = query({
  args: { botId: v.float64() },
  returns: v.union(schema.tables.bots.validator, v.null()),
  handler: async (ctx, args) => {
    return await ctx.db
      .query("bots")
      .withIndex("by_botId", (q) => q.eq("botId", args.botId))
      .unique();
  },
});

export const list = query({
  args: {},
  returns: v.array(schema.tables.bots.validator),
  handler: async (ctx) => {
    return await ctx.db.query("bots").collect();
  },
});

export const resolveBySecret = query({
  args: { secretHash: v.string() },
  returns: v.union(schema.tables.bots.validator, v.null()),
  handler: async (ctx, args) => {
    const webhook = await ctx.db
      .query("webhooks")
      .withIndex("by_secretHash", (q) => q.eq("secretHash", args.secretHash))
      .unique();
    if (!webhook) {
      return null;
    }

    return await ctx.db
      .query("bots")
      .withIndex("by_botId", (q) => q.eq("botId", webhook.botId))
      .unique();
  },
});
