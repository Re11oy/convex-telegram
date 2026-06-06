import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  messages: defineTable({
    chatId: v.float64(),
    text: v.optional(v.string()),
    username: v.optional(v.string()),
  }).index("by_chat", ["chatId"]),
});
