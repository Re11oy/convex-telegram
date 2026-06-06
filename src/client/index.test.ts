import { httpRouter } from "convex/server";
import { afterEach, describe, expect, test, vi } from "vitest";
import schema from "../component/schema.js";
import { initConvexTest } from "../component/setup.test.js";
import { TelegramAPI } from "./index.js";
import { components } from "./setup.test.js";
import type { ActionCtx } from "./types.js";

const componentModules = {
  ...import.meta.glob("../component/_generated/*.ts"),
  ...import.meta.glob("../component/convex.config.ts"),
  ...import.meta.glob("../component/lib.ts"),
  ...import.meta.glob("../component/schema.ts"),
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

describe("TelegramAPI client", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  test("creates a client with a component reference", () => {
    const client = new TelegramAPI(components.telegram);

    expect(client.component).toBeDefined();
  });

  test("saveBotCredentials trims token, verifies bot identity, and persists credentials", async () => {
    const t = initClientTest();
    const client = new TelegramAPI(components.telegram);
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
    const ctx = actionCtx(t);

    const botUsername = await client.saveBotCredentials(ctx, {
      token: "  telegram-token  ",
    });

    expect(botUsername).toBe("@demo_bot");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.telegram.org/bottelegram-token/getMe",
      expect.objectContaining({
        method: "POST",
      }),
    );
    expect(
      await t.query(components.telegram.lib.getBotToken, { botUsername }),
    ).toBe("telegram-token");
  });

  test("subscribeForUpdates sets a webhook and stores the secret", async () => {
    vi.stubEnv("CONVEX_SITE_URL", "https://demo.convex.site");
    const t = initClientTest();
    const botUsername = await t.mutation(
      components.telegram.lib.saveBotCredentials,
      {
        token: "telegram-token",
        botUsername: "demo_bot",
      },
    );
    const client = new TelegramAPI(components.telegram);
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ ok: true, result: { url: "" } }))
      .mockResolvedValueOnce(jsonResponse({ ok: true, result: true }));
    vi.stubGlobal("fetch", fetchMock);
    const ctx = actionCtx(t);

    await client.subscribeForUpdates(ctx, botUsername, {
      allowedUpdates: ["message", "callback_query"],
      dropPendingUpdates: false,
    });

    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "https://api.telegram.org/bottelegram-token/setWebhook",
      expect.objectContaining({
        method: "POST",
      }),
    );
    expect(JSON.parse(fetchMock.mock.calls[1]?.[1]?.body as string)).toEqual(
      expect.objectContaining({
        url: "https://demo.convex.site/telegram/webhook",
        allowed_updates: ["message", "callback_query"],
        drop_pending_updates: false,
      }),
    );
    const setWebhookBody = JSON.parse(
      fetchMock.mock.calls[1]?.[1]?.body as string,
    ) as { secret_token: string };
    expect(
      await t.query(components.telegram.lib.findWebhookSecret, {
        webhookSecretToken: setWebhookBody.secret_token,
      }),
    ).toEqual({ isValid: true, botUsername });
  });

  test("bot API proxy can be awaited without calling a then method", async () => {
    const t = initClientTest();
    const botUsername = await t.mutation(
      components.telegram.lib.saveBotCredentials,
      {
        token: "telegram-token",
        botUsername: "demo_bot",
      },
    );
    const client = new TelegramAPI(components.telegram);
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
    const ctx = actionCtx(t);

    const bot = await client.bot(ctx, botUsername);
    await bot.getMe();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.telegram.org/bottelegram-token/getMe",
      expect.objectContaining({
        method: "POST",
      }),
    );
  });

  test("registerRoutes rejects bad secrets and dispatches valid updates", async () => {
    const t = initClientTest();
    const botUsername = await t.mutation(
      components.telegram.lib.saveBotCredentials,
      {
        token: "telegram-token",
        botUsername: "demo_bot",
      },
    );
    await t.mutation(components.telegram.lib.saveWebhookSecret, {
      botUsername,
      webhookSecretToken: "right-secret",
    });
    const client = new TelegramAPI(components.telegram);
    const http = httpRouter();
    const onEvent = vi.fn().mockResolvedValue(undefined);
    const onMessage = vi.fn().mockResolvedValue(undefined);
    client.registerRoutes(http, {
      events: { message: onMessage },
      onEvent,
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
    expect(onEvent).not.toHaveBeenCalled();

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
    expect(onEvent).toHaveBeenCalledWith(ctx, botUsername, update);
    expect(onMessage).toHaveBeenCalledWith(ctx, botUsername, update);
  });
});
