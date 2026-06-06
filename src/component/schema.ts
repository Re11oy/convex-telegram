import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  botCredentials: defineTable({
    token: v.string(),
    username: v.string(),
  }).index("by_username", ["username"]),

  webhooks: defineTable({
    botId: v.id("botCredentials"),
    webhookSecretToken: v.string(),
  })
    .index("by_bot_id", ["botId"])
    .index("by_webhook_secret_token", ["webhookSecretToken"]),
});
