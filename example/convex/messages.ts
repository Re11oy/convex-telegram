import { v } from "convex/values";
import { internal } from "./_generated/api.js";
import { internalMutation, mutation, query } from "./_generated/server.js";
import { bot } from "./telegram.js";

const WELCOME_MESSAGE = [
  "This is a Convex component example.",
  "",
  "Drop a message here and watch it appear in the live inbox:",
  "https://convex-telegram.vercel.app/",
  "",
  "Read more about the component:",
  "https://www.convex.dev/components/convex-telegram",
].join("\n");

const THREAD_TTL_MS = 60 * 60 * 1000;

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
      topic.messages.unshift({
        mine: m.direction === "outbound",
        text: m.text,
      });
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
    const existing = await ctx.db
      .query("messages")
      .withIndex("by_chat", (q) => q.eq("chatId", chatId))
      .first();
    const isFirstMessage = existing === null;

    await ctx.db.insert("messages", {
      chatId,
      username,
      text,
      direction: "inbound",
    });

    if (isFirstMessage) {
      const welcomeId = await ctx.db.insert("messages", {
        chatId,
        text: WELCOME_MESSAGE,
        direction: "outbound",
      });
      await bot.outbound.send(
        ctx,
        { chat_id: chatId, text: WELCOME_MESSAGE },
        { clientRef: welcomeId },
      );
      await ctx.scheduler.runAfter(
        THREAD_TTL_MS,
        internal.messages.deleteThread,
        { chatId },
      );
    }
  },
});

// A reply typed into the composer is outbound. Persist it and enqueue durable
// delivery in the same transaction; the component retries until Telegram
// accepts it and reports back via handleOutboundEvent (linked by clientRef).
export const send = mutation({
  args: { chatId: v.float64(), text: v.string() },
  handler: async (ctx, { chatId, text }) => {
    const messageId = await ctx.db.insert("messages", {
      chatId,
      text,
      direction: "outbound",
    });
    await bot.outbound.send(
      ctx,
      { chat_id: chatId, text },
      { clientRef: messageId },
    );
  },
});

export const deleteThread = internalMutation({
  args: { chatId: v.float64() },
  returns: v.number(),
  handler: async (ctx, { chatId }) => {
    const messages = await ctx.db
      .query("messages")
      .withIndex("by_chat", (q) => q.eq("chatId", chatId))
      .collect();

    for (const message of messages) {
      await ctx.db.delete("messages", message._id);
    }

    console.log(`Removed ${messages.length} message(s) for chat ${chatId}.`);
    return messages.length;
  },
});
