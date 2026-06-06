import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel.js";
import type { QueryCtx } from "./_generated/server.js";
import { mutation, query } from "./_generated/server.js";
import { normalizeUsername } from "./utils";

// ============================================================================
// Bot credentials
// ============================================================================

export const saveBotCredentials = mutation({
  args: {
    token: v.string(),
    botUsername: v.string(),
  },
  returns: v.string(),
  handler: async (ctx, args) => {
    const botUsername = normalizeUsername(args.botUsername);
    const existing = await getBotCredentialsByUsername(ctx, botUsername);
    if (existing !== null) {
      await ctx.db.patch("botCredentials", existing._id, {
        token: args.token,
        username: botUsername,
      });
      return botUsername;
    }
    await ctx.db.insert("botCredentials", {
      token: args.token,
      username: botUsername,
    });
    return botUsername;
  },
});

export const deleteBotCredentials = mutation({
  args: {
    botUsername: v.string(),
  },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const existing = await getBotCredentialsByUsername(ctx, args.botUsername);
    if (existing === null) {
      return false;
    }

    const webhook = await ctx.db
      .query("webhooks")
      .withIndex("by_bot_id", (q) => q.eq("botId", existing._id))
      .unique();
    if (webhook !== null) {
      await ctx.db.delete("webhooks", webhook._id);
    }

    await ctx.db.delete("botCredentials", existing._id);
    return true;
  },
});

export const getBotToken = query({
  args: {
    botUsername: v.string(),
  },
  returns: v.string(),
  handler: async (ctx, args) => {
    const existing = await getBotCredentialsByUsername(ctx, args.botUsername);
    if (existing === null) {
      throw new Error(`Bot ${args.botUsername} not found in database`);
    }

    return existing.token;
  },
});

async function getBotCredentialsByUsername(
  ctx: QueryCtx,
  botUsername: string,
): Promise<Doc<"botCredentials"> | null> {
  const username = normalizeUsername(botUsername);
  return await ctx.db
    .query("botCredentials")
    .withIndex("by_username", (q) => q.eq("username", username))
    .unique();
}

// ============================================================================
// Webhook secrets
// ============================================================================

export const saveWebhookSecret = mutation({
  args: {
    botUsername: v.string(),
    webhookSecretToken: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const botCredentials = await getBotCredentialsByUsername(
      ctx,
      args.botUsername,
    );
    if (botCredentials === null) {
      throw new Error(`Bot ${args.botUsername} not found in database`);
    }

    const existing = await ctx.db
      .query("webhooks")
      .withIndex("by_bot_id", (q) => q.eq("botId", botCredentials._id))
      .unique();
    if (existing !== null) {
      await ctx.db.patch("webhooks", existing._id, {
        webhookSecretToken: args.webhookSecretToken,
      });
      return;
    }
    await ctx.db.insert("webhooks", {
      botId: botCredentials._id,
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
    const botCredentials = await getBotCredentialsByUsername(
      ctx,
      args.botUsername,
    );
    if (botCredentials === null) {
      return false;
    }

    const existing = await ctx.db
      .query("webhooks")
      .withIndex("by_bot_id", (q) => q.eq("botId", botCredentials._id))
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

    const botCredentials = await ctx.db.get("botCredentials", existing.botId);
    if (botCredentials === null) {
      return {
        isValid: false as const,
      };
    }

    return {
      isValid: true as const,
      botUsername: botCredentials.username,
    };
  },
});
