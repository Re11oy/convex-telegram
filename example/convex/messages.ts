import { v } from "convex/values";
import { internal } from "./_generated/api.js";
import { internalMutation, mutation, query } from "./_generated/server.js";

// The last 50 messages, grouped by chat into conversation topics. Topics are
// ordered by most-recent activity; messages within a topic are chronological.
// `mine` is true for our own (outbound) replies.
export const listTopics = query({
  args: {},
  handler: async (ctx) => {
    const recent = await ctx.db.query("messages").order("desc").take(50);

    const topics = new Map<
      number,
      {
        chatId: number;
        name?: string;
        messages: { mine: boolean; text: string }[];
      }
    >();
    for (const m of recent) {
      let topic = topics.get(m.chatId);
      if (!topic) {
        topic = { chatId: m.chatId, messages: [] };
        topics.set(m.chatId, topic);
      }
      // `recent` is newest-first, so the first username we see is the latest.
      topic.name ??= m.username;
      // Prepend to keep each topic chronological.
      topic.messages.unshift({ mine: m.direction === "outbound", text: m.text });
    }

    return [...topics.values()].map((t) => ({
      chatId: t.chatId,
      name: t.name ?? `User ${t.chatId}`,
      preview: t.messages[t.messages.length - 1].text,
      messages: t.messages,
    }));
  },
});

// A message received from Telegram (inbound, from the user to us).
export const recordInbound = internalMutation({
  args: {
    chatId: v.float64(),
    username: v.optional(v.string()),
    text: v.string(),
  },
  handler: async (ctx, { chatId, username, text }) => {
    await ctx.db.insert("messages", {
      chatId,
      username,
      text,
      direction: "inbound",
    });
  },
});

// A reply typed into the composer is outbound. Persist it, then deliver it to
// Telegram from a scheduled action (mutations can't call `fetch`).
export const send = mutation({
  args: { chatId: v.float64(), text: v.string() },
  handler: async (ctx, { chatId, text }) => {
    await ctx.db.insert("messages", { chatId, text, direction: "outbound" });
    await ctx.scheduler.runAfter(0, internal.telegram.deliverToTelegram, {
      chatId,
      text,
    });
  },
});
