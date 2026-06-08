/// <reference types="vite/client" />
import { httpRouter } from "convex/server";
import { afterEach, describe, expect, test, vi } from "vitest";
import { Telegram } from "./index.js";
import { components } from "./setup.test.js";

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), {
    headers: { "Content-Type": "application/json" },
  });
}

function getMeResponse() {
  return jsonResponse({
    ok: true,
    result: { id: 123, is_bot: true, first_name: "Demo", username: "demo_bot" },
  });
}

type RouteHandler = {
  _handler: (ctx: unknown, request: Request) => Promise<Response>;
};

function webhookRequest(secret: string | undefined, body: unknown) {
  const headers: Record<string, string> = {};
  if (secret !== undefined) {
    headers["X-Telegram-Bot-Api-Secret-Token"] = secret;
  }
  return new Request("https://demo.convex.site/telegram/webhook", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

describe("Telegram client", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  test("creates a client with a component reference", () => {
    const client = new Telegram(components.telegram, { token: "t" });
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

  test("api proxy can be awaited without calling a then method", async () => {
    const client = new Telegram(components.telegram, {
      token: "telegram-token",
    });
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(getMeResponse());
    vi.stubGlobal("fetch", fetchMock);

    await client.api.getMe();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.telegram.org/bottelegram-token/getMe",
      expect.objectContaining({ method: "POST" }),
    );
  });

  test("setupWebhook registers the webhook with the configured secret", async () => {
    vi.stubEnv("CONVEX_SITE_URL", "https://demo.convex.site");
    const client = new Telegram(components.telegram, {
      token: "telegram-token",
      webhookSecret: "s3cret",
    });
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(getMeResponse())
      .mockResolvedValueOnce(jsonResponse({ ok: true, result: true }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await client.setupWebhook({
      allowedUpdates: ["message", "callback_query"],
      dropPendingUpdates: false,
    });

    expect(result).toEqual({
      botUsername: "@demo_bot",
      webhookUrl: "https://demo.convex.site/telegram/webhook",
    });
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "https://api.telegram.org/bottelegram-token/setWebhook",
      expect.objectContaining({ method: "POST" }),
    );
    expect(JSON.parse(fetchMock.mock.calls[1]?.[1]?.body as string)).toEqual({
      url: "https://demo.convex.site/telegram/webhook",
      secret_token: "s3cret",
      allowed_updates: ["message", "callback_query"],
      drop_pending_updates: false,
    });
  });

  test("setupWebhook omits the secret when none is configured", async () => {
    vi.stubEnv("CONVEX_SITE_URL", "https://demo.convex.site");
    vi.stubEnv("TELEGRAM_WEBHOOK_SECRET", undefined);
    const client = new Telegram(components.telegram, {
      token: "telegram-token",
    });
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(getMeResponse())
      .mockResolvedValueOnce(jsonResponse({ ok: true, result: true }));
    vi.stubGlobal("fetch", fetchMock);

    await client.setupWebhook();

    const body = JSON.parse(fetchMock.mock.calls[1]?.[1]?.body as string) as {
      secret_token?: string;
    };
    expect(body.secret_token).toBeUndefined();
  });

  test("deleteWebhook removes the Telegram webhook", async () => {
    const client = new Telegram(components.telegram, {
      token: "telegram-token",
    });
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse({ ok: true, result: true }));
    vi.stubGlobal("fetch", fetchMock);

    await client.deleteWebhook({ dropPendingUpdates: false });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.telegram.org/bottelegram-token/deleteWebhook",
      expect.objectContaining({
        body: JSON.stringify({ drop_pending_updates: false }),
      }),
    );
  });

  test("registerRoutes verifies the secret and dispatches updates", async () => {
    const client = new Telegram(components.telegram, {
      token: "telegram-token",
      webhookSecret: "right-secret",
    });
    const http = httpRouter();
    const onUpdate = vi.fn().mockResolvedValue(undefined);
    const onMessage = vi.fn().mockResolvedValue(undefined);
    client.registerRoutes(http, { handlers: { message: onMessage }, onUpdate });
    const [[path, method, handler]] = http.getRoutes();

    expect(path).toBe("/telegram/webhook");
    expect(method).toBe("POST");

    const route = handler as unknown as RouteHandler;
    const rejected = await route._handler(
      {},
      webhookRequest("wrong-secret", { update_id: 1 }),
    );
    expect(rejected.status).toBe(401);
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
    const response = await route._handler(
      {},
      webhookRequest("right-secret", update),
    );

    expect(response.status).toBe(200);
    expect(onUpdate.mock.calls[0]?.[1]).toEqual(update);
    expect(onUpdate.mock.calls[0]?.[2].api).toBe(client.api);
    expect(onMessage.mock.calls[0]?.[1]).toEqual(update);
    expect(onMessage.mock.calls[0]?.[2].api).toBe(client.api);
  });

  test("registerRoutes accepts requests when no secret is configured", async () => {
    vi.stubEnv("TELEGRAM_WEBHOOK_SECRET", undefined);
    const client = new Telegram(components.telegram, {
      token: "telegram-token",
    });
    const http = httpRouter();
    const onMessage = vi.fn().mockResolvedValue(undefined);
    client.registerRoutes(http, { handlers: { message: onMessage } });
    const [[, , handler]] = http.getRoutes();

    const update = {
      update_id: 3,
      message: {
        message_id: 1,
        date: 1,
        chat: { id: 1, type: "private" },
        text: "hi",
      },
    };
    const response = await (handler as unknown as RouteHandler)._handler(
      {},
      webhookRequest(undefined, update),
    );

    expect(response.status).toBe(200);
    expect(onMessage).toHaveBeenCalledTimes(1);
  });

  test("registerRoutes returns 400 on malformed JSON", async () => {
    const client = new Telegram(components.telegram, {
      token: "telegram-token",
      webhookSecret: "right-secret",
    });
    const http = httpRouter();
    client.registerRoutes(http);
    const [[, , handler]] = http.getRoutes();

    const response = await (handler as unknown as RouteHandler)._handler(
      {},
      new Request("https://demo.convex.site/telegram/webhook", {
        method: "POST",
        headers: { "X-Telegram-Bot-Api-Secret-Token": "right-secret" },
        body: "not json",
      }),
    );

    expect(response.status).toBe(400);
  });
});
