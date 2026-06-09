import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export const vWebhookSettings = v.object({
  webhookUrl: v.string(),
  allowedUpdates: v.array(v.string()),
  dropPendingUpdates: v.boolean(),
});

export const vBotIdentity = v.object({
  botId: v.float64(),
  botUsername: v.string(),
});

export const botFields = {
  token: v.string(),
  ...vBotIdentity.fields,
};

export default defineSchema({
  bots: defineTable(botFields).index("by_botId", ["botId"]),
  webhooks: defineTable({
    botUsername: v.string(),
    botId: v.float64(),
    secretHash: v.optional(v.string()),
    settings: vWebhookSettings,
  })
    .index("by_botUsername", ["botUsername"])
    .index("by_secretHash", ["secretHash"]),
});
