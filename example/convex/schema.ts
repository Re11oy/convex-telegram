import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  messages: defineTable({
    chatId: v.float64(),
    username: v.optional(v.string()),
    text: v.string(),
    direction: v.union(v.literal("inbound"), v.literal("outbound")),
    // Set by handleOutboundEvent once Telegram accepts the message.
    telegramMessageId: v.optional(v.float64()),
  }).index("by_chat", ["chatId", "direction"]),
});
