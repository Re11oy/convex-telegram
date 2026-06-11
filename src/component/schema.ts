import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { vOutboundStatus } from "./shared.js";

export const vWebhookSettings = v.object({
  webhookUrl: v.string(),
  allowedUpdates: v.array(v.string()),
  dropPendingUpdates: v.boolean(),
});

export default defineSchema({
  webhooks: defineTable({
    botUsername: v.string(),
    botId: v.float64(),
    secretHash: v.string(),
    settings: vWebhookSettings,
  })
    .index("by_botUsername", ["botUsername"])
    .index("by_secretHash", ["secretHash"]),

  outboundMessages: defineTable({
    method: v.string(),
    // Native Convex value, dashboard-readable. Single source of truth
    // including chat_id (patched in place on migrate_to_chat_id).
    params: v.any(),
    status: vOutboundStatus,
    telegramMessageId: v.optional(v.float64()),
    errorCode: v.optional(v.float64()),
    errorMessage: v.optional(v.string()),
    // Counts 429/migrate deferrals, not workpool's internal 5xx retries.
    attemptCount: v.number(),
    clientRef: v.optional(v.string()),
    // App event handle, frozen at send time so concurrently configured
    // clients can't clobber each other's callbacks. Never the bot token.
    onOutboundEvent: v.optional(v.string()),
    // MAX_SAFE_INTEGER until terminal, so the cleanup scan never sees
    // waiting rows.
    finalizedAt: v.number(),
  }).index("by_finalizedAt", ["finalizedAt"]),
});
