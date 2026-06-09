import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export const vWebhookSettings = v.object({
  webhookUrl: v.string(),
  allowedUpdates: v.array(v.string()),
  dropPendingUpdates: v.boolean(),
});

export default defineSchema({
  webhooks: defineTable({
    botUsername: v.string(),
    botId: v.float64(),
    secretHash: v.optional(v.string()),
    settings: vWebhookSettings,
  }).index("by_botUsername", ["botUsername"]),
});
