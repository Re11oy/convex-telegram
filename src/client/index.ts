import type {
  APIMethodParams,
  APIMethods,
  TelegramAPIResponse,
  TelegramUpdate,
} from "@gramio/types";
import { httpActionGeneric } from "convex/server";
import type { ComponentApi } from "../component/_generated/component.js";
import type {
  HttpRouter,
  RegisterRoutesConfig,
  ActionCtx,
  RegistryUpdateHandler,
  RegistryUpdateHandlers,
  RunnableTelegramUpdateHandler,
  RunnableRegistryUpdateHandler,
  TelegramBotRegistryOptions,
  TelegramUpdateEvent,
} from "./types.js";
import { env } from "../component/_generated/server.js";

export type {
  HttpRouter,
  RegisterRoutesConfig,
  RegistryUpdateHandler,
  RegistryUpdateHandlers,
  TelegramBotRegistryOptions,
  TelegramUpdateEvent,
  TelegramUpdateForEvent,
  TelegramUpdateHandler,
  TelegramUpdateHandlers,
} from "./types.js";

const TBA_BASE_URL = "https://api.telegram.org/bot";
const DEFAULT_WEBHOOK_PATH = "/telegram/webhook";

export type TelegramComponent = ComponentApi;

export type TelegramOptions = {
  /** Bot token. Defaults to `TELEGRAM_BOT_TOKEN`. */
  token?: string;
  /**
   * Secret used to verify incoming webhook requests. Defaults to
   * `TELEGRAM_WEBHOOK_SECRET`. When unset, webhook requests are not verified.
   *
   * @see https://core.telegram.org/bots/api#setwebhook (`secret_token`)
   */
  webhookSecret?: string;
  /** Webhook route path. Defaults to `/telegram/webhook`. Must start with `/`. */
  webhookPath?: string;
  /** Bot id. Populated when the registry builds a bot from a saved record. */
  botId?: number;
  /** Bot username ("@name"). Populated from a saved record by the registry. */
  username?: string;
};

export type SetupWebhookOptions = {
  allowedUpdates?: TelegramUpdateEvent[];
  dropPendingUpdates?: boolean;
  url?: string;
};

export type SetupWebhookResult = {
  botUsername: string;
  webhookUrl: string;
};

export type DeleteWebhookOptions = {
  dropPendingUpdates?: boolean;
};

export class TelegramBot {
  /**
   * Typed Telegram Bot API client. Use it to send messages or call any method.
   *
   * @see https://core.telegram.org/bots/api#available-methods
   */
  public readonly api: APIMethods;
  public readonly botId: number | undefined;
  public readonly username: string | undefined;
  private readonly webhookPath: string;
  private readonly webhookSecret: string | undefined;

  constructor(
    public readonly component: TelegramComponent,
    options?: TelegramOptions,
  ) {
    this.api = botApiProxy(() => getRequiredToken(options?.token));
    this.botId = options?.botId;
    this.username = options?.username;
    this.webhookPath = getWebhookPath(options?.webhookPath);
    this.webhookSecret = getWebhookSecret(options?.webhookSecret);
  }

  /**
   * Point Telegram at this deployment's webhook endpoint. Run once after
   * deploying the route registered with {@link registerRoutes}.
   *
   * @see https://core.telegram.org/bots/api#setwebhook
   */
  async setupWebhook(
    ctx: ActionCtx,
    options?: SetupWebhookOptions,
  ): Promise<SetupWebhookResult> {
    const { 
      dropPendingUpdates = true, 
      allowedUpdates = ["message"] } = options ?? {};
    const me = await this.api.getMe();
    if (!me.is_bot || !me.username) {
      throw new Error("Failed to fetch bot details from Telegram getMe.");
    }
    return applyWebhook(this.api, ctx, this.component, {
      me: { id: me.id, username: me.username },
      webhookSecret: this.webhookSecret,
      webhookPath: this.webhookPath,
      url: options?.url,
      allowedUpdates,
      dropPendingUpdates,
    });
  }

  /**
   * Stop receiving updates by removing the webhook from Telegram.
   *
   * @see https://core.telegram.org/bots/api#deletewebhook
   */
  async deleteWebhook(
    ctx: ActionCtx,
    options?: DeleteWebhookOptions,
  ): Promise<void> {
    const { dropPendingUpdates = true } = options ?? {};
    const me = await this.api.getMe();
    await this.api.deleteWebhook({ drop_pending_updates: dropPendingUpdates });
    if (me.is_bot && me.username) {
      await ctx.runMutation(this.component.webhooks.remove, {
        botUsername: `@${me.username}`,
      });
    }
  }
}

export type RegisterBotOptions = {
  token: string;
  /**
   * Update types to subscribe to. When omitted, the bot is saved but no
   * webhook is registered (it can still send messages).
   *
   * @see https://core.telegram.org/bots/api#setwebhook (`allowed_updates`)
   */
  allowedUpdates?: TelegramUpdateEvent[];
};

export type RegisteredBot = {
  botId: number;
  username: string;
};

export class TelegramBotRegistry {
  private readonly webhookPath: string;
  private readonly handlers: RegistryUpdateHandlers;
  private readonly onUpdate: RegistryUpdateHandler | undefined;

  constructor(
    public readonly component: TelegramComponent,
    options?: TelegramBotRegistryOptions,
  ) {
    this.webhookPath = getWebhookPath(options?.webhookPath);
    this.handlers = options?.handlers ?? {};
    this.onUpdate = options?.onUpdate;
  }

  /** Save a bot by its token. When `allowedUpdates` is given, also setup a webhook for the bot. */
  async registerBot(
    ctx: ActionCtx,
    options: RegisterBotOptions,
  ): Promise<RegisteredBot> {
    const { token, allowedUpdates } = options;
    const webhookSecret = allowedUpdates ? generateWebhookSecret() : undefined;
    const api = botApiProxy(() => token);
    const me = await api.getMe();
    if (!me.is_bot || !me.username) {
      throw new Error("Failed to fetch bot details from Telegram getMe.");
    }

    const botUsername = `@${me.username}`;
    await ctx.runMutation(this.component.bots.upsert, {
      token,
      botId: me.id,
      botUsername,
    });

    if (allowedUpdates) {
      await applyWebhook(api, ctx, this.component, {
        me: { id: me.id, username: me.username },
        webhookSecret,
        webhookPath: this.webhookPath,
        allowedUpdates,
        dropPendingUpdates: true,
      });
    }

    return { botId: me.id, username: botUsername };
  }

  /** Remove a bot's webhook (if any) and its registration. */
  async unregisterBot(ctx: ActionCtx, botId: number): Promise<void> {
    const bot = await ctx.runQuery(this.component.bots.getByBotId, { botId });
    if (!bot) {
      return;
    }
    const api = botApiProxy(() => bot.token);
    await api.deleteWebhook({ drop_pending_updates: true });
    await ctx.runMutation(this.component.webhooks.remove, {
      botUsername: bot.botUsername,
    });
    await ctx.runMutation(this.component.bots.remove, { botId });
  }

  /** Load a saved bot as a ready-to-use {@link TelegramBot}. */
  async getBot(ctx: ActionCtx, botId: number): Promise<TelegramBot> {
    const bot = await ctx.runQuery(this.component.bots.getByBotId, { botId });
    if (!bot) {
      throw new Error(`No Telegram bot registered with id ${botId}.`);
    }
    return new TelegramBot(this.component, {
      token: bot.token,
      botId: bot.botId,
      username: bot.botUsername,
    });
  }

  /** List the registered bots, without their tokens. */
  async listBots(ctx: ActionCtx): Promise<RegisteredBot[]> {
    const bots = await ctx.runQuery(this.component.bots.list, {});
    return bots.map((bot) => ({ botId: bot.botId, username: bot.botUsername }));
  }

  /**
   * Register the single webhook route shared by every bot. Each inbound update
   * is matched to its bot via the `X-Telegram-Bot-Api-Secret-Token` header,
   * which both authenticates the request and selects the bot.
   */
  registerRoutes(http: HttpRouter) {
    const { component, webhookPath, handlers, onUpdate } = this;

    http.route({
      path: webhookPath,
      method: "POST",
      handler: httpActionGeneric(async (ctx, request) => {
        const providedSecret =
          request.headers.get("X-Telegram-Bot-Api-Secret-Token") ?? "";
        const bot = await ctx.runQuery(component.bots.resolveBySecret, {
          secretHash: await sha256Hex(providedSecret),
        });
        if (!bot) {
          return new Response("Unauthorized", { status: 401 });
        }

        let update: TelegramUpdate;
        try {
          update = (await request.json()) as TelegramUpdate;
        } catch {
          return new Response("Bad Request", { status: 400 });
        }

        const telegramBot = new TelegramBot(component, {
          token: bot.token,
          botId: bot.botId,
          username: bot.botUsername,
        });

        try {
          await (onUpdate as RunnableRegistryUpdateHandler | undefined)?.(
            ctx,
            update,
            telegramBot,
          );

          for (const eventType of getUpdateEventTypes(update)) {
            await (
              handlers[eventType] as RunnableRegistryUpdateHandler | undefined
            )?.(ctx, update, telegramBot);
          }
        } catch (error) {
          console.error("Error processing Telegram webhook:", error);
          return new Response("Error processing webhook", { status: 500 });
        }

        return new Response(null, { status: 200 });
      }),
    });
  }
}

export function registerRoutes(
  http: HttpRouter,
  _component: TelegramComponent,
  config?: RegisterRoutesConfig,
) {
  const webhookSecret = getWebhookSecret(config?.webhookSecret);
  const webhookPath = getWebhookPath(config?.webhookPath);
  const { handlers = {}, onUpdate } = config ?? {};

  http.route({
    path: webhookPath,
    method: "POST",
    handler: httpActionGeneric(async (ctx, request) => {
      if (webhookSecret !== undefined) {
        const providedSecret = request.headers.get(
          "X-Telegram-Bot-Api-Secret-Token",
        );
        if (providedSecret !== webhookSecret) {
          return new Response("Unauthorized", { status: 401 });
        }
      }

      let update: TelegramUpdate;
      try {
        update = (await request.json()) as TelegramUpdate;
      } catch {
        return new Response("Bad Request", { status: 400 });
      }

      try {
        await (onUpdate as RunnableTelegramUpdateHandler | undefined)?.(
          ctx,
          update,
        );

        for (const eventType of getUpdateEventTypes(update)) {
          await (
            handlers[eventType] as RunnableTelegramUpdateHandler | undefined
          )?.(ctx, update);
        }
      } catch (error) {
        console.error("Error processing Telegram webhook:", error);
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

function botApiProxy(getToken: () => string) {
  return new Proxy({} as APIMethods, {
    get: (_target: APIMethods, method: string | symbol) => {
      if (method === "then") {
        return undefined;
      }

      const apiMethod = method as keyof APIMethods;
      return async (params?: APIMethodParams<typeof apiMethod>) => {
        const token = getToken();
        const response = await fetch(`${TBA_BASE_URL}${token}/${apiMethod}`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: params === undefined ? undefined : JSON.stringify(params),
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

function getRequiredToken(token: string | undefined) {
  const value = (token ?? env.TELEGRAM_BOT_TOKEN ?? "").trim();
  if (value === "") {
    throw new Error("Telegram bot token is required.");
  }
  return value;
}

function getWebhookSecret(secret: string | undefined) {
  return secret ?? env.TELEGRAM_WEBHOOK_SECRET;
}

function getWebhookPath(webhookPath: string | undefined) {
  const path = webhookPath ?? DEFAULT_WEBHOOK_PATH;
  if (!path.startsWith("/")) {
    throw new Error("Telegram webhookPath must start with '/'.");
  }
  return path;
}

function getWebhookUrl(url: string | undefined, webhookPath: string) {
  if (url !== undefined) {
    if (!url.startsWith("https://")) {
      throw new Error("Telegram webhook URL must start with 'https://'.");
    }
    return url;
  }

  const siteUrl = process.env.CONVEX_SITE_URL;
  if (!siteUrl) {
    throw new Error(
      "CONVEX_SITE_URL is required to build the Telegram webhook URL.",
    );
  }
  return `${siteUrl}${webhookPath}`;
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function generateWebhookSecret(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function applyWebhook(
  api: APIMethods,
  ctx: ActionCtx,
  component: TelegramComponent,
  params: {
    me: { id: number; username: string };
    webhookSecret: string | undefined;
    webhookPath: string;
    url?: string;
    allowedUpdates: TelegramUpdateEvent[];
    dropPendingUpdates: boolean;
  },
): Promise<SetupWebhookResult> {
  const webhookUrl = getWebhookUrl(params.url, params.webhookPath);
  await api.setWebhook({
    url: webhookUrl,
    secret_token: params.webhookSecret,
    allowed_updates: params.allowedUpdates,
    drop_pending_updates: params.dropPendingUpdates,
  });

  const botUsername = `@${params.me.username}`;
  await ctx.runMutation(component.webhooks.create, {
    botUsername,
    botId: params.me.id,
    secretHash: params.webhookSecret
      ? await sha256Hex(params.webhookSecret)
      : undefined,
    settings: {
      webhookUrl,
      allowedUpdates: params.allowedUpdates,
      dropPendingUpdates: params.dropPendingUpdates,
    },
  });

  return { botUsername, webhookUrl };
}

export default TelegramBot;
