import type {
  APIMethodParams,
  APIMethods,
  TelegramAPIResponse,
  TelegramUpdate,
} from "@gramio/types";
import { httpActionGeneric } from "convex/server";
import type { ComponentApi } from "../component/_generated/component.js";
import { makeWebhookSecretToken } from "../component/utils";
import type {
  ActionCtx,
  HttpRouter,
  RegisterRoutesConfig,
  RunnableTelegramUpdateHandler,
  TelegramBotUsername,
  TelegramUpdateEvent,
} from "./types.js";

const TBA_BASE_URL = "https://api.telegram.org/bot";

export type TelegramComponent = ComponentApi;

/**
 * Client wrapper for the `telegram` Convex component.
 *
 * ## 1. Register the component (`convex/convex.config.ts`)
 *
 * ```ts
 * import { defineApp } from "convex/server";
 * import telegram from "convex-telegram/convex.config";
 *
 * const app = defineApp();
 * app.use(telegram);
 * export default app;
 * ```
 *
 * ## 2. Instantiate (e.g. `convex/telegram.ts`)
 *
 * ```ts
 * import { components } from "./_generated/api";
 * import { TelegramAPI } from "convex-telegram";
 *
 * export const telegram = new TelegramAPI(components.telegram);
 * ```
 *
 * ## 3. Register the webhook route (`convex/http.ts`)
 *
 * ```ts
 * import { httpRouter } from "convex/server";
 * import { internal } from "./_generated/api";
 * import { telegram } from "./telegram";
 *
 * const http = httpRouter();
 *
 * telegram.registerRoutes(http, {
 *   events: {
 *     message: async (ctx, botUsername, update) => {
 *       await ctx.runAction(internal.messages.store, {
 *         botUsername,
 *         chatId: update.message.chat.id,
 *         text: update.message.text,
 *       });
 *     },
 *   },
 * });
 *
 * export default http;
 * ```
 *
 * ## 4. Save credentials and subscribe a bot
 *
 * ```ts
 * const botUsername = await telegram.saveBotCredentials(ctx, {
 *   token: process.env.TELEGRAM_BOT_TOKEN!,
 * });
 * await telegram.subscribeForUpdates(ctx, botUsername);
 * ```
 *
 * ## 5. Send a message
 *
 * ```ts
 * const bot = await telegram.bot(ctx, botUsername);
 * await bot.sendMessage({
 *   chat_id: update.message.chat.id,
 *   text: "Hello!",
 * });
 * ```
 */
export class TelegramAPI {
  private readonly webhookPath: string;

  /**
   * Creates a Telegram component client.
   *
   * @param component The component to use, like `components.telegram` from
   * `./_generated/api.ts`.
   * @param options to use for this component.
   */
  constructor(
    public readonly component: TelegramComponent,
    options?: {
      /**
       * Optional webhook path. Defaults to "/telegram/webhook"
       *
       * HTTPS URL or app-relative path Telegram will POST updates to.
       * App-relative paths are prefixed with CONVEX_SITE_URL.
       */
      webhookPath?: string;
    },
  ) {
    this.webhookPath = options?.webhookPath ?? "/telegram/webhook";
  }

  async saveBotCredentials(
    ctx: ActionCtx,
    args: {
      token: string;
    },
  ) {
    const token = args.token.trim();
    if (token === "") {
      throw new Error("Telegram bot token is required");
    }

    const bot = botApiProxy(token);
    const info = await bot.getMe();
    if (!info.is_bot || !info.username) {
      throw new Error("Failed to fetch bot details");
    }

    const botUsername = await ctx.runMutation(
      this.component.lib.saveBotCredentials,
      {
        token,
        botUsername: info.username,
      },
    );
    return botUsername as TelegramBotUsername;
  }

  async subscribeForUpdates(
    ctx: ActionCtx,
    botUsername: string,
    args?: {
      /** A list of update types the bot is subscribed to. Default: ["message"] */
      allowedUpdates?: TelegramUpdateEvent[];
      /** Drop all pending updates when registering the webhook. */
      dropPendingUpdates?: boolean;
    },
  ) {
    const { dropPendingUpdates = true, allowedUpdates = ["message"] } =
      args ?? {};

    const token = await ctx.runQuery(this.component.lib.getBotToken, {
      botUsername,
    });
    const bot = botApiProxy(token);
    const info = await bot.getWebhookInfo();
    const webhookSet = info.url !== "";

    if (webhookSet) {
      console.warn("Webhook already configured, delete old one");
      await bot.deleteWebhook({ drop_pending_updates: dropPendingUpdates });
    }

    // Set up new webhook
    const secret = makeWebhookSecretToken();
    await bot.setWebhook({
      url: `${process.env.CONVEX_SITE_URL}${this.webhookPath}`,
      secret_token: secret,
      allowed_updates: allowedUpdates,
      drop_pending_updates: dropPendingUpdates,
    });
    await ctx.runMutation(this.component.lib.saveWebhookSecret, {
      botUsername,
      webhookSecretToken: secret,
    });
    console.info("New webhook registered");
  }

  async unsubscribe(
    ctx: ActionCtx,
    botUsername: string,
    args?: {
      /** Drop all pending updates when removing the webhook. */
      dropPendingUpdates?: boolean;
    },
  ) {
    const { dropPendingUpdates = true } = args ?? {};

    const token = await ctx.runQuery(this.component.lib.getBotToken, {
      botUsername,
    });
    const bot = botApiProxy(token);
    const info = await bot.getWebhookInfo();
    const webhookSet = info.url !== "";

    if (webhookSet) {
      await bot.deleteWebhook({ drop_pending_updates: dropPendingUpdates });

      console.warn("Webhook was deleted");
    }

    await ctx.runMutation(this.component.lib.deleteWebhookSecret, {
      botUsername,
    });
  }

  /**
   * Register an HTTP route that Telegram will POST updates to.
   *
   * The generated handler:
   * 1. Reads the `X-Telegram-Bot-Api-Secret-Token` header
   * 2. Uses the secret to find the registered bot — returns 401 if missing
   * 3. Parses the request body as a Telegram Update
   * 4. Calls handlers so your app can handle the event
   *
   * Call this in `convex/http.ts` before exporting the router.
   */
  registerRoutes(http: HttpRouter, config?: RegisterRoutesConfig) {
    registerRoutes(http, this.component, this.webhookPath, config);
  }

  async bot(ctx: ActionCtx, botUsername: string) {
    const token = await ctx.runQuery(this.component.lib.getBotToken, {
      botUsername,
    });

    return botApiProxy(token);
  }
}

function registerRoutes(
  http: HttpRouter,
  component: ComponentApi,
  webhookPath: string,
  config?: RegisterRoutesConfig,
) {
  const { events = {}, onEvent } = config ?? {};

  http.route({
    path: webhookPath,
    method: "POST",
    handler: httpActionGeneric(async (ctx, request) => {
      const providedSecret =
        request.headers.get("X-Telegram-Bot-Api-Secret-Token") ?? "";

      const secret = await ctx.runQuery(component.lib.findWebhookSecret, {
        webhookSecretToken: providedSecret,
      });

      if (!secret.isValid) {
        return new Response("Unauthorized", { status: 401 });
      }

      let update: TelegramUpdate;
      try {
        update = (await request.json()) as TelegramUpdate;
      } catch {
        return new Response("Bad Request", { status: 400 });
      }
      try {
        await callHandler(
          onEvent as RunnableTelegramUpdateHandler | undefined,
          ctx,
          secret.botUsername as TelegramBotUsername,
          update,
        );

        for (const eventType of getUpdateEventTypes(update)) {
          await callHandler(
            events[eventType] as RunnableTelegramUpdateHandler | undefined,
            ctx,
            secret.botUsername as TelegramBotUsername,
            update,
          );
        }
      } catch (error) {
        console.error("❌ Error processing webhook:", error);
        return new Response("Error processing webhook", { status: 500 });
      }

      return new Response(null, { status: 200 });
    }),
  });
}

function getUpdateEventTypes(update: TelegramUpdate) {
  const eventTypes: TelegramUpdateEvent[] = [];

  for (const key of Object.keys(update) as (keyof TelegramUpdate)[]) {
    if (key === "update_id" || update[key] === undefined) {
      continue;
    }
    eventTypes.push(key);
  }

  return eventTypes;
}

async function callHandler(
  handler: RunnableTelegramUpdateHandler | undefined,
  ctx: ActionCtx,
  botUsername: TelegramBotUsername,
  update: TelegramUpdate,
) {
  await handler?.(ctx, botUsername, update);
}

function botApiProxy(token: string) {
  return new Proxy({} as APIMethods, {
    get: (_target: APIMethods, method: string | symbol) => {
      if (method === "then") {
        return undefined;
      }

      const apiMethod = method as keyof APIMethods;
      return async (params: APIMethodParams<typeof apiMethod>) => {
        const response = await fetch(`${TBA_BASE_URL}${token}/${apiMethod}`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(params),
        });

        const data = (await response.json()) as TelegramAPIResponse;
        if (!data.ok) {
          throw new Error(
            `Telegram Bot API "${apiMethod}" failed` +
              (data.error_code ? ` (${data.error_code})` : "") +
              (data.description ? `: ${data.description}` : ""),
          );
        }

        return data.result;
      };
    },
  });
}

export default TelegramAPI;
