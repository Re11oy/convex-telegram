import { Workpool, vOnCompleteArgs } from "@convex-dev/workpool";
import type { FunctionHandle } from "convex/server";
import { v, type Infer } from "convex/values";
import { api, components, internal } from "./_generated/api.js";
import type { Doc, Id } from "./_generated/dataModel.js";
import {
  env,
  internalAction,
  internalMutation,
  internalQuery,
  mutation,
  query,
  type MutationCtx,
} from "./_generated/server.js";
import {
  vOutboundMessageStatus,
  vOutboundStatus,
  type OnOutboundEventArgs,
} from "./shared.js";

const TBA_BASE_URL = "https://api.telegram.org/bot";

// 5xx/network retries, handled inside a single workpool work item.
const RETRY = { maxAttempts: 5, initialBackoffMs: 1_000, base: 2 };
// 429/migrate deferrals re-enqueue a fresh work item; this bounds them.
const MAX_DEFERRALS = 20;
const DEFAULT_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
const CLEANUP_BATCH_SIZE = 100;
const PENDING_FINALIZED_AT = Number.MAX_SAFE_INTEGER;

const pool = new Workpool(components.workpool, { maxParallelism: 4 });

const vDeliverOutcome = v.union(
  // Row was no longer `waiting` (cancelled, or a crash-after-send re-run).
  v.object({ kind: v.literal("skipped") }),
  v.object({ kind: v.literal("sent"), telegramMessageId: v.float64() }),
  v.object({
    kind: v.literal("failed"),
    errorCode: v.optional(v.float64()),
    errorMessage: v.optional(v.string()),
  }),
  // 429 retry_after or migrate_to_chat_id; finalize re-enqueues.
  v.object({
    kind: v.literal("deferred"),
    retryAfterMs: v.number(),
    migrateToChatId: v.optional(v.float64()),
  }),
);
type DeliverOutcome = Infer<typeof vDeliverOutcome>;

type TelegramResponse =
  | { ok: true; result: { message_id: number } }
  | {
      ok: false;
      error_code?: number;
      description?: string;
      parameters?: { retry_after?: number; migrate_to_chat_id?: number };
    };

function requireToken(): string {
  const token = (env.TELEGRAM_BOT_TOKEN ?? "").trim();
  if (token === "") {
    throw new Error(
      "bot.outbound requires the TELEGRAM_BOT_TOKEN environment variable " +
        "(the client `token` option only configures bot.api).",
    );
  }
  return token;
}

export const enqueue = mutation({
  args: {
    method: v.string(),
    params: v.any(),
    clientRef: v.optional(v.string()),
    onOutboundEvent: v.optional(v.string()),
  },
  returns: v.id("outboundMessages"),
  handler: async (ctx, args) => {
    requireToken();

    // Latest options win (Resend pattern).
    const options = await ctx.db.query("lastOutboundOptions").first();
    if (options === null) {
      await ctx.db.insert("lastOutboundOptions", {
        onOutboundEvent: args.onOutboundEvent,
      });
    } else if (options.onOutboundEvent !== args.onOutboundEvent) {
      await ctx.db.patch("lastOutboundOptions", options._id, {
        onOutboundEvent: args.onOutboundEvent,
      });
    }

    const id = await ctx.db.insert("outboundMessages", {
      method: args.method,
      params: args.params,
      status: "waiting",
      attemptCount: 0,
      clientRef: args.clientRef,
      finalizedAt: PENDING_FINALIZED_AT,
    });
    await enqueueDeliver(ctx, id, 0);
    return id;
  },
});

export const getMessage = internalQuery({
  args: { id: v.id("outboundMessages") },
  returns: v.union(
    v.null(),
    v.object({ status: vOutboundStatus, method: v.string(), params: v.any() }),
  ),
  handler: async (ctx, { id }) => {
    const row = await ctx.db.get("outboundMessages", id);
    if (row === null) {
      return null;
    }
    return { status: row.status, method: row.method, params: row.params };
  },
});

// Pure classifier: zero DB writes. Throws only on 5xx/network so that
// workpool's retry budget is reserved for true transients; everything
// Telegram decided (accepted, flood-waited, rejected) is returned as data.
export const deliver = internalAction({
  args: { id: v.id("outboundMessages") },
  returns: vDeliverOutcome,
  handler: async (ctx, { id }): Promise<DeliverOutcome> => {
    const row = await ctx.runQuery(internal.outbound.getMessage, { id });
    if (row === null || row.status !== "waiting") {
      return { kind: "skipped" };
    }

    const token = (env.TELEGRAM_BOT_TOKEN ?? "").trim();
    if (token === "") {
      // A config error must not burn the retry budget.
      return { kind: "failed", errorMessage: "TELEGRAM_BOT_TOKEN is not set" };
    }

    // Network errors propagate out of fetch → workpool retries.
    const response = await fetch(`${TBA_BASE_URL}${token}/${row.method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(row.params),
    });

    let data: TelegramResponse;
    try {
      data = (await response.json()) as TelegramResponse;
    } catch {
      // 5xx or a proxy error page without a JSON body — transient.
      throw new Error(
        `Telegram Bot API "${row.method}" returned a non-JSON response (HTTP ${response.status})`,
      );
    }

    if (data.ok) {
      return { kind: "sent", telegramMessageId: data.result.message_id };
    }

    const { error_code, description, parameters } = data;
    if (error_code !== undefined && error_code >= 500) {
      throw new Error(
        `Telegram Bot API "${row.method}" failed (${error_code}): ${description}`,
      );
    }
    if (parameters?.retry_after !== undefined) {
      return { kind: "deferred", retryAfterMs: parameters.retry_after * 1000 };
    }
    if (parameters?.migrate_to_chat_id !== undefined) {
      return {
        kind: "deferred",
        retryAfterMs: 0,
        migrateToChatId: parameters.migrate_to_chat_id,
      };
    }
    return { kind: "failed", errorCode: error_code, errorMessage: description };
  },
});

// Sole writer of delivery outcomes and sole re-enqueuer.
export const finalize = internalMutation({
  args: vOnCompleteArgs(v.id("outboundMessages")),
  returns: v.null(),
  handler: async (ctx, { context: id, result }) => {
    const row = await ctx.db.get("outboundMessages", id);
    if (row === null || row.status !== "waiting") {
      return null;
    }

    if (result.kind === "canceled") {
      return null;
    }
    if (result.kind === "failed") {
      // 5xx/network retry budget exhausted.
      await finalizeRow(ctx, row, {
        status: "failed",
        errorMessage: result.error,
      });
      return null;
    }

    const outcome = result.returnValue as DeliverOutcome;
    switch (outcome.kind) {
      case "skipped":
        break;
      case "sent":
        await finalizeRow(ctx, row, {
          status: "sent",
          telegramMessageId: outcome.telegramMessageId,
        });
        break;
      case "failed":
        await finalizeRow(ctx, row, {
          status: "failed",
          errorCode: outcome.errorCode,
          errorMessage: outcome.errorMessage,
        });
        break;
      case "deferred":
        if (row.attemptCount >= MAX_DEFERRALS) {
          await finalizeRow(ctx, row, {
            status: "failed",
            errorMessage: "deferral budget exhausted",
          });
          break;
        }
        await ctx.db.patch("outboundMessages", row._id, {
          attemptCount: row.attemptCount + 1,
          ...(outcome.migrateToChatId !== undefined && {
            params: { ...row.params, chat_id: outcome.migrateToChatId },
          }),
        });
        await enqueueDeliver(ctx, row._id, outcome.retryAfterMs);
        break;
    }
    return null;
  },
});

export const status = query({
  args: { id: v.string() },
  returns: v.union(v.null(), vOutboundMessageStatus),
  handler: async (ctx, { id }) => {
    const normalized = ctx.db.normalizeId("outboundMessages", id);
    const row =
      normalized === null
        ? null
        : await ctx.db.get("outboundMessages", normalized);
    if (row === null) {
      return null;
    }
    return {
      status: row.status,
      telegramMessageId: row.telegramMessageId,
      errorCode: row.errorCode,
      errorMessage: row.errorMessage,
      clientRef: row.clientRef,
      attemptCount: row.attemptCount,
    };
  },
});

// Flag-only: the pending workpool job is not chased down; it eventually
// runs, sees a non-`waiting` row, and no-ops through the `skipped` path.
export const cancel = mutation({
  args: { id: v.string() },
  returns: v.boolean(),
  handler: async (ctx, { id }) => {
    const normalized = ctx.db.normalizeId("outboundMessages", id);
    const row =
      normalized === null
        ? null
        : await ctx.db.get("outboundMessages", normalized);
    if (row === null || row.status !== "waiting") {
      return false;
    }
    await finalizeRow(ctx, row, { status: "cancelled" });
    return true;
  },
});

// Deletes terminal rows only; `waiting` rows sit at MAX_SAFE_INTEGER and
// are never seen by this scan. The app owns the cron (see README).
export const cleanupOldOutboundMessages = mutation({
  args: { olderThan: v.optional(v.number()) },
  returns: v.null(),
  handler: async (ctx, { olderThan }) => {
    const cutoff = Date.now() - (olderThan ?? DEFAULT_RETENTION_MS);
    const rows = await ctx.db
      .query("outboundMessages")
      .withIndex("by_finalizedAt", (q) => q.lt("finalizedAt", cutoff))
      .take(CLEANUP_BATCH_SIZE);
    for (const row of rows) {
      await ctx.db.delete("outboundMessages", row._id);
    }
    if (rows.length === CLEANUP_BATCH_SIZE) {
      await ctx.scheduler.runAfter(0, api.outbound.cleanupOldOutboundMessages, {
        olderThan,
      });
    }
    return null;
  },
});

async function enqueueDeliver(
  ctx: MutationCtx,
  id: Id<"outboundMessages">,
  runAfterMs: number,
) {
  await pool.enqueueAction(
    ctx,
    internal.outbound.deliver,
    { id },
    {
      retry: RETRY,
      onComplete: internal.outbound.finalize,
      context: id,
      runAfter: runAfterMs,
    },
  );
}

type TerminalPatch = {
  status: "sent" | "failed" | "cancelled";
  telegramMessageId?: number;
  errorCode?: number;
  errorMessage?: string;
};

async function finalizeRow(
  ctx: MutationCtx,
  row: Doc<"outboundMessages">,
  patch: TerminalPatch,
) {
  await ctx.db.patch("outboundMessages", row._id, {
    ...patch,
    finalizedAt: Date.now(),
  });

  const options = await ctx.db.query("lastOutboundOptions").first();
  const handle = options?.onOutboundEvent;
  if (handle === undefined) {
    return;
  }
  // Best-effort: if the app handler throws, the event is lost — the row
  // keeps the truth and `status` is the fallback.
  await ctx.scheduler.runAfter(
    0,
    handle as FunctionHandle<"mutation", OnOutboundEventArgs>,
    {
      id: row._id as unknown as OnOutboundEventArgs["id"],
      event: patch.status,
      clientRef: row.clientRef,
      telegramMessageId: patch.telegramMessageId,
      errorCode: patch.errorCode,
      errorMessage: patch.errorMessage,
    },
  );
}
