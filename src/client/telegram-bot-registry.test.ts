/// <reference types="vite/client" />
import { httpRouter } from "convex/server";
import { afterEach, describe, expect, test, vi } from "vitest";
import { TelegramBotRegistry } from "./index.js";
import {
  components,
  getMeResponse,
  jsonResponse,
  setupTest,
  webhookRequest,
  type RouteHandler,
} from "./setup.test.js";

describe("TelegramBotRegistry", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  test("registerBot saves the bot without a webhook when no updates are requested", async () => {
    const t = setupTest();
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(getMeResponse());
    vi.stubGlobal("fetch", fetchMock);
    const registry = new TelegramBotRegistry(components.telegram);

    await t.action(async (ctx) => {
      const result = await registry.registerBot(ctx, { token: "telegram-token" });
      expect(result).toEqual({ botId: 123, username: "@demo_bot" });

      const bots = await registry.listBots(ctx);
      expect(bots).toEqual([{ botId: 123, username: "@demo_bot" }]);
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test("registerBot subscribes a webhook and routes a matching update to the bot", async () => {
    vi.stubEnv("CONVEX_SITE_URL", "https://demo.convex.site");
    const t = setupTest();
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(getMeResponse())
      .mockResolvedValueOnce(jsonResponse({ ok: true, result: true }));
    vi.stubGlobal("fetch", fetchMock);

    const onMessage = vi.fn().mockResolvedValue(undefined);
    const registry = new TelegramBotRegistry(components.telegram, {
      handlers: { message: onMessage },
    });
    const http = httpRouter();
    registry.registerRoutes(http);
    const [[, , handler]] = http.getRoutes();
    const route = handler as unknown as RouteHandler;

    const update = {
      update_id: 1,
      message: {
        message_id: 10,
        date: 1,
        chat: { id: 42, type: "private" },
        text: "Hello",
      },
    };

    await t.action(async (ctx) => {
      await registry.registerBot(ctx, {
        token: "telegram-token",
        allowedUpdates: ["message"],
      });

      const setWebhookBody = JSON.parse(
        fetchMock.mock.calls[1]?.[1]?.body as string,
      ) as { secret_token: string; allowed_updates: string[] };
      expect(setWebhookBody.secret_token).toMatch(/^[0-9a-f]{64}$/);
      expect(setWebhookBody.allowed_updates).toEqual(["message"]);

      const response = await route._handler(
        ctx,
        webhookRequest(setWebhookBody.secret_token, update),
      );
      expect(response.status).toBe(200);
    });

    expect(onMessage.mock.calls[0]?.[1]).toEqual(update);
    expect(onMessage.mock.calls[0]?.[2]).toMatchObject({
      botId: 123,
      username: "@demo_bot",
    });
  });

  test("getBot returns a client bound to the saved token and identity", async () => {
    const t = setupTest();
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockImplementation(() => Promise.resolve(getMeResponse()));
    vi.stubGlobal("fetch", fetchMock);
    const registry = new TelegramBotRegistry(components.telegram);

    await t.action(async (ctx) => {
      await registry.registerBot(ctx, { token: "saved-token" });

      const bot = await registry.getBot(ctx, 123);
      expect(bot.botId).toBe(123);
      expect(bot.username).toBe("@demo_bot");

      await bot.api.getMe();
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.telegram.org/botsaved-token/getMe",
      expect.objectContaining({ method: "POST" }),
    );
  });

  test("registerRoutes returns 401 when no bot matches the secret", async () => {
    const t = setupTest();
    const registry = new TelegramBotRegistry(components.telegram);
    const http = httpRouter();
    registry.registerRoutes(http);
    const [[, , handler]] = http.getRoutes();
    const route = handler as unknown as RouteHandler;

    await t.action(async (ctx) => {
      const response = await route._handler(
        ctx,
        webhookRequest("unknown-secret", { update_id: 1 }),
      );
      expect(response.status).toBe(401);
    });
  });
});
