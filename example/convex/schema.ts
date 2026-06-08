import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  messages: defineTable({
    chatId: v.float64(),
    username: v.optional(v.string()),
    text: v.string(),
    direction: v.union(v.literal("inbound"), v.literal("outbound")),
  }).index("by_chat", ["chatId", "direction"]),
});
