/// <reference types="vite/client" />
import workpool from "@convex-dev/workpool/test";
import { convexTest } from "convex-test";
import { internalMutationGeneric } from "convex/server";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api } from "./_generated/api.js";
import schema from "./schema.js";
import { vOnOutboundEventArgs, type OnOutboundEventArgs } from "./shared.js";

const baseModules = import.meta.glob(["./**/*.ts", "!./**/*.test.ts"]);

// A synthetic root module standing in for the app's onOutboundEvent handler.
const events: OnOutboundEventArgs[] = [];
const EVENT_HANDLE = "function://;testEvents:record";
const testEventsModule = {
  record: internalMutationGeneric({
    args: vOnOutboundEventArgs,
    handler: async (_ctx, args: OnOutboundEventArgs) => {
      events.push(args);
      return null;
    },
  }),
};

function setup() {
  const t = convexTest(schema, {
    ...baseModules,
    "./testEvents.ts": async () => testEventsModule,
  });
  workpool.register(t);
  return t;
}

function telegramResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const ok = (messageId: number) => () =>
  telegramResponse({ ok: true, result: { message_id: messageId } });
const apiError =
  (
    code: number,
    description: string,
    parameters?: { retry_after?: number; migrate_to_chat_id?: number },
  ) =>
  () =>
    telegramResponse(
      { ok: false, error_code: code, description, parameters },
      code,
    );

// Returns each response factory in turn; the last one repeats.
function mockFetch(...responses: (() => Response)[]) {
  const calls: { url: string; body: Record<string, unknown> }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: unknown, init?: RequestInit) => {
      calls.push({
        url: String(url),
        body: JSON.parse(String(init?.body)) as Record<string, unknown>,
      });
      const next = responses.length > 1 ? responses.shift()! : responses[0];
      return next();
    }),
  );
  return calls;
}

const PARAMS = { chat_id: 42, text: "hello" };

async function enqueue(t: ReturnType<typeof setup>) {
  return await t.mutation(api.outbound.enqueue, {
    method: "sendMessage",
    params: PARAMS,
    clientRef: "app-message-1",
    onOutboundEvent: EVENT_HANDLE,
  });
}

describe("outbound", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubEnv("TELEGRAM_BOT_TOKEN", "test-token");
    events.length = 0;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.useRealTimers();
  });

  test("delivers a message and reports sent", async () => {
    const t = setup();
    const calls = mockFetch(ok(777));

    const id = await enqueue(t);
    await expect(t.query(api.outbound.status, { id })).resolves.toMatchObject({
      status: "waiting",
      attemptCount: 0,
    });

    await t.finishAllScheduledFunctions(vi.runAllTimers);

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(
      "https://api.telegram.org/bottest-token/sendMessage",
    );
    expect(calls[0].body).toEqual(PARAMS);
    await expect(t.query(api.outbound.status, { id })).resolves.toMatchObject({
      status: "sent",
      telegramMessageId: 777,
      attemptCount: 0,
    });
    expect(events).toEqual([
      {
        id,
        event: "sent",
        clientRef: "app-message-1",
        telegramMessageId: 777,
      },
    ]);
  });

  test("permanent 4xx fails the message with the Telegram error", async () => {
    const t = setup();
    const calls = mockFetch(apiError(403, "Forbidden: bot was blocked"));

    const id = await enqueue(t);
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    expect(calls).toHaveLength(1);
    await expect(t.query(api.outbound.status, { id })).resolves.toMatchObject({
      status: "failed",
      errorCode: 403,
      errorMessage: "Forbidden: bot was blocked",
    });
    expect(events).toEqual([
      {
        id,
        event: "failed",
        clientRef: "app-message-1",
        errorCode: 403,
        errorMessage: "Forbidden: bot was blocked",
      },
    ]);
  });

  test("429 defers by retry_after, then sends", async () => {
    const t = setup();
    const calls = mockFetch(
      apiError(429, "Too Many Requests", { retry_after: 7 }),
      ok(888),
    );

    const id = await enqueue(t);
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    expect(calls).toHaveLength(2);
    await expect(t.query(api.outbound.status, { id })).resolves.toMatchObject({
      status: "sent",
      telegramMessageId: 888,
      attemptCount: 1,
    });
  });

  test("migrate_to_chat_id rewrites params and resends", async () => {
    const t = setup();
    const calls = mockFetch(
      apiError(400, "Bad Request: group upgraded", {
        migrate_to_chat_id: -100999,
      }),
      ok(5),
    );

    const id = await enqueue(t);
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    expect(calls).toHaveLength(2);
    expect(calls[1].body).toEqual({ ...PARAMS, chat_id: -100999 });
    await expect(t.query(api.outbound.status, { id })).resolves.toMatchObject({
      status: "sent",
      attemptCount: 1,
    });
  });

  test("5xx retries within workpool without consuming deferrals", async () => {
    const t = setup();
    const calls = mockFetch(apiError(502, "Bad Gateway"), ok(9));

    const id = await enqueue(t);
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    expect(calls).toHaveLength(2);
    await expect(t.query(api.outbound.status, { id })).resolves.toMatchObject({
      status: "sent",
      attemptCount: 0,
    });
  });

  test("persistent 5xx exhausts the retry budget and fails", async () => {
    const t = setup();
    const calls = mockFetch(apiError(500, "Internal Server Error"));

    const id = await enqueue(t);
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    expect(calls).toHaveLength(5);
    const status = await t.query(api.outbound.status, { id });
    expect(status?.status).toBe("failed");
    expect(status?.errorMessage).toContain("500");
    expect(events).toHaveLength(1);
    expect(events[0].event).toBe("failed");
  });

  test("perpetual 429 fails after the deferral budget", async () => {
    const t = setup();
    const calls = mockFetch(
      apiError(429, "Too Many Requests", { retry_after: 1 }),
    );

    const id = await enqueue(t);
    // 21 delivery cycles exceed finishAllScheduledFunctions' iteration
    // budget, so pump the scheduler until the row goes terminal.
    for (let i = 0; i < 500; i++) {
      vi.runAllTimers();
      await t.finishInProgressScheduledFunctions();
      const status = await t.query(api.outbound.status, { id });
      if (status?.status !== "waiting") {
        break;
      }
    }

    // Initial delivery + 20 deferrals.
    expect(calls).toHaveLength(21);
    await expect(t.query(api.outbound.status, { id })).resolves.toMatchObject({
      status: "failed",
      errorMessage: "deferral budget exhausted",
      attemptCount: 20,
    });
  });

  test("cancel while waiting wins over the phantom job", async () => {
    const t = setup();
    const calls = mockFetch(ok(1));

    const id = await enqueue(t);
    await expect(t.mutation(api.outbound.cancel, { id })).resolves.toBe(true);
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    expect(calls).toHaveLength(0);
    await expect(t.query(api.outbound.status, { id })).resolves.toMatchObject({
      status: "cancelled",
    });
    expect(events).toEqual([
      { id, event: "cancelled", clientRef: "app-message-1" },
    ]);
  });

  test("cancel on a terminal row is a no-op", async () => {
    const t = setup();
    mockFetch(ok(1));

    const id = await enqueue(t);
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    await expect(t.mutation(api.outbound.cancel, { id })).resolves.toBe(false);
    await expect(t.query(api.outbound.status, { id })).resolves.toMatchObject({
      status: "sent",
    });
    expect(events).toHaveLength(1);
  });

  test("enqueue fails fast without TELEGRAM_BOT_TOKEN", async () => {
    const t = setup();
    vi.stubEnv("TELEGRAM_BOT_TOKEN", "");

    await expect(enqueue(t)).rejects.toThrow(/requires the TELEGRAM_BOT_TOKEN/);
  });

  test("token removed after enqueue fails without burning retries", async () => {
    const t = setup();
    const calls = mockFetch(ok(1));

    const id = await enqueue(t);
    vi.stubEnv("TELEGRAM_BOT_TOKEN", "");
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    expect(calls).toHaveLength(0);
    await expect(t.query(api.outbound.status, { id })).resolves.toMatchObject({
      status: "failed",
      errorMessage: "TELEGRAM_BOT_TOKEN is not set",
    });
  });

  test("status returns null for unknown ids", async () => {
    const t = setup();
    await expect(
      t.query(api.outbound.status, { id: "not-an-id" }),
    ).resolves.toBeNull();
  });

  test("cleanup deletes terminal rows but never waiting ones", async () => {
    const t = setup();
    mockFetch(ok(1), apiError(429, "Too Many Requests", { retry_after: 3600 }));

    const sentId = await enqueue(t);
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    // This one defers for an hour and stays `waiting`.
    const waitingId = await enqueue(t);
    await t.finishInProgressScheduledFunctions();

    vi.advanceTimersByTime(1000);
    await t.mutation(api.outbound.cleanupOldOutboundMessages, { olderThan: 0 });

    await expect(
      t.query(api.outbound.status, { id: sentId }),
    ).resolves.toBeNull();
    await expect(
      t.query(api.outbound.status, { id: waitingId }),
    ).resolves.toMatchObject({ status: "waiting" });
  });
});
