/// <reference types="vite/client" />
import { httpRouter } from "convex/server";
import { afterEach, describe, expect, test, vi } from "vitest";
import schema from "../component/schema.js";
import { initConvexTest } from "../component/setup.test.js";
import { Telegram } from "./index.js";
import { components } from "./setup.test.js";
import type { ActionCtx } from "./types.js";

const componentModules = {
  ...import.meta.glob("../component/_generated/*.ts"),
  ...import.meta.glob("../component/convex.config.ts"),
  ...import.meta.glob("../component/lib.ts"),
  ...import.meta.glob("../component/schema.ts"),
  ...import.meta.glob("../component/utils.ts"),
};

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), {
    headers: { "Content-Type": "application/json" },
  });
}

function actionCtx(t: ReturnType<typeof initConvexTest>) {
  return {
    runQuery: t.query,
    runMutation: t.mutation,
    runAction: vi.fn(),
  } as unknown as ActionCtx;
}

function initClientTest() {
  const t = initConvexTest();
  t.registerComponent("telegram", schema, componentModules);
  return t;
}

describe("Telegram client", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  test("creates a client with a component reference and token", () => {
    const client = new Telegram(components.telegram, {
      token: "telegram-token",
    });

    expect(client.component).toBeDefined();
    expect(client.api).toBeDefined();
  });

  test("requires a bot token when calling the Telegram API", async () => {
    vi.stubEnv("TELEGRAM_BOT_TOKEN", "");
    const client = new Telegram(components.telegram);
    await expect(client.api.getMe()).rejects.toThrow(
      "Telegram bot token is required",
    );
  });

  test("setupWebhook sets a webhook and stores the secret", async () => {
    vi.stubEnv("CONVEX_SITE_URL", "https://demo.convex.site");
    const t = initClientTest();
    const client = new Telegram(components.telegram, {
      token: "telegram-token",
    });
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        jsonResponse({
          ok: true,
          result: {
            id: 123,
            is_bot: true,
            first_name: "Demo",
            username: "demo_bot",
          },
        }),
      )
      .mockResolvedValueOnce(jsonResponse({ ok: true, result: { url: "" } }))
      .mockResolvedValueOnce(jsonResponse({ ok: true, result: true }));
    vi.stubGlobal("fetch", fetchMock);
    const ctx = actionCtx(t);

    const result = await client.setupWebhook(ctx, {
      allowedUpdates: ["message", "callback_query"],
      dropPendingUpdates: false,
    });

    expect(result).toEqual({
      botUsername: "@demo_bot",
      webhookUrl: "https://demo.convex.site/telegram/webhook",
    });
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      "https://api.telegram.org/bottelegram-token/setWebhook",
      expect.objectContaining({
        method: "POST",
      }),
    );
    expect(fetchMock.mock.calls[1]?.[1]?.body).toBeUndefined();
    expect(JSON.parse(fetchMock.mock.calls[2]?.[1]?.body as string)).toEqual(
      expect.objectContaining({
        url: "https://demo.convex.site/telegram/webhook",
        allowed_updates: ["message", "callback_query"],
        drop_pending_updates: false,
      }),
    );
    const setWebhookBody = JSON.parse(
      fetchMock.mock.calls[2]?.[1]?.body as string,
    ) as { secret_token: string };
    expect(
      await t.query(components.telegram.lib.findWebhookSecret, {
        webhookSecretToken: setWebhookBody.secret_token,
      }),
    ).toEqual({ isValid: true, botUsername: "@demo_bot" });
  });

  test("api proxy can be awaited without calling a then method", async () => {
    const client = new Telegram(components.telegram, {
      token: "telegram-token",
    });
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse({
        ok: true,
        result: {
          id: 123,
          is_bot: true,
          first_name: "Demo",
          username: "demo_bot",
        },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await client.api.getMe();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.telegram.org/bottelegram-token/getMe",
      expect.objectContaining({
        method: "POST",
      }),
    );
  });

  test("deleteWebhook removes the Telegram webhook and stored secret", async () => {
    const t = initClientTest();
    await t.mutation(components.telegram.lib.saveWebhookSecret, {
      botUsername: "demo_bot",
      webhookSecretToken: "right-secret",
    });
    const client = new Telegram(components.telegram, {
      token: "telegram-token",
    });
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        jsonResponse({
          ok: true,
          result: {
            id: 123,
            is_bot: true,
            first_name: "Demo",
            username: "demo_bot",
          },
        }),
      )
      .mockResolvedValueOnce(jsonResponse({ ok: true, result: true }));
    vi.stubGlobal("fetch", fetchMock);

    await client.deleteWebhook(actionCtx(t), {
      dropPendingUpdates: false,
    });

    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "https://api.telegram.org/bottelegram-token/deleteWebhook",
      expect.objectContaining({
        body: JSON.stringify({ drop_pending_updates: false }),
      }),
    );
    expect(
      await t.query(components.telegram.lib.findWebhookSecret, {
        webhookSecretToken: "right-secret",
      }),
    ).toEqual({ isValid: false });
  });

  test("registerRoutes rejects bad secrets and dispatches valid updates", async () => {
    const t = initClientTest();
    await t.mutation(components.telegram.lib.saveWebhookSecret, {
      botUsername: "demo_bot",
      webhookSecretToken: "right-secret",
    });
    const client = new Telegram(components.telegram, {
      token: "telegram-token",
    });
    const http = httpRouter();
    const onUpdate = vi.fn().mockResolvedValue(undefined);
    const onMessage = vi.fn().mockResolvedValue(undefined);
    client.registerRoutes(http, {
      handlers: { message: onMessage },
      onUpdate,
    });
    const [[path, method, handler]] = http.getRoutes();

    expect(path).toBe("/telegram/webhook");
    expect(method).toBe("POST");

    const ctx = actionCtx(t);
    const request = new Request("https://demo.convex.site/telegram/webhook", {
      method: "POST",
      headers: { "X-Telegram-Bot-Api-Secret-Token": "wrong-secret" },
      body: JSON.stringify({ update_id: 1 }),
    });

    await expect(
      (
        handler as unknown as {
          _handler: (ctx: ActionCtx, request: Request) => Promise<Response>;
        }
      )._handler(ctx, request),
    ).resolves.toMatchObject({ status: 401 });
    expect(onUpdate).not.toHaveBeenCalled();

    const update = {
      update_id: 2,
      message: {
        message_id: 10,
        date: 1,
        chat: { id: 42, type: "private" },
        text: "Hello",
      },
    };
    const response = await (
      handler as unknown as {
        _handler: (ctx: ActionCtx, request: Request) => Promise<Response>;
      }
    )._handler(
      ctx,
      new Request("https://demo.convex.site/telegram/webhook", {
        method: "POST",
        headers: { "X-Telegram-Bot-Api-Secret-Token": "right-secret" },
        body: JSON.stringify(update),
      }),
    );

    expect(response.status).toBe(200);
    expect(onUpdate.mock.calls[0]?.[0]).toBe(ctx);
    expect(onUpdate.mock.calls[0]?.[1]).toEqual(update);
    expect(onUpdate.mock.calls[0]?.[2]).toMatchObject({
      username: "@demo_bot",
    });
    expect(onUpdate.mock.calls[0]?.[2].api).toBe(client.api);

    expect(onMessage.mock.calls[0]?.[0]).toBe(ctx);
    expect(onMessage.mock.calls[0]?.[1]).toEqual(update);
    expect(onMessage.mock.calls[0]?.[2]).toMatchObject({
      username: "@demo_bot",
    });
    expect(onMessage.mock.calls[0]?.[2].api).toBe(client.api);
  });
});
