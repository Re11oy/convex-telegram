import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  webhooks: defineTable({
    botUsername: v.string(),
    webhookSecretToken: v.string(),
  })
    .index("by_bot_username", ["botUsername"])
    .index("by_webhook_secret_token", ["webhookSecretToken"]),
});
