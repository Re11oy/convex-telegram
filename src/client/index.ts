import type {
  APIMethodParams,
  APIMethods,
  TelegramAPIResponse,
  TelegramUpdate,
} from "@gramio/types";
import {
  type GenericActionCtx,
  type GenericDataModel,
  httpActionGeneric,
} from "convex/server";
import type { ComponentApi } from "../component/_generated/component.js";
import { normalizeUsername } from "../component/utils.js";
import type {
  ActionCtx,
  HttpRouter,
  RegisterRoutesConfig,
  RunnableTelegramUpdateHandler,
  TelegramBot,
  TelegramBotUsername,
  TelegramUpdateEvent,
} from "./types.js";

export type {
  ActionCtx,
  HttpRouter,
  RegisterRoutesConfig,
  TelegramBot,
  TelegramBotUsername,
  TelegramUpdateEvent,
  TelegramUpdateForEvent,
  TelegramUpdateHandler,
  TelegramUpdateHandlers,
} from "./types.js";

const TBA_BASE_URL = "https://api.telegram.org/bot";

export type TelegramComponent = ComponentApi;

export type TelegramOptions = {
  token?: string;
  webhookPath?: string;
};

export type SetupWebhookOptions = {
  allowedUpdates?: TelegramUpdateEvent[];
  dropPendingUpdates?: boolean;
  url?: string;
};

export type SetupWebhookResult = {
  botUsername: TelegramBotUsername;
  webhookUrl: string;
};

export type DeleteWebhookOptions = {
  dropPendingUpdates?: boolean;
};

export class Telegram {
  public readonly api: APIMethods;
  private readonly webhookPath: string;

  constructor(
    public readonly component: TelegramComponent,
    options?: TelegramOptions,
  ) {
    this.api = botApiProxy(() => getRequiredToken(options?.token));
    this.webhookPath = getWebhookPath(options?.webhookPath);
  }

  async setupWebhook(
    ctx: ActionCtx,
    options?: SetupWebhookOptions,
  ): Promise<SetupWebhookResult> {
    const { dropPendingUpdates = true, allowedUpdates = ["message"] } =
      options ?? {};
    const botUsername = await this.getBotUsername();
    const webhookUrl = getWebhookUrl(options?.url, this.webhookPath);
    const info = await this.api.getWebhookInfo();
    const webhookSecretToken = makeWebhookSecretToken();

    if (info.url !== "") {
      await this.api.deleteWebhook({
        drop_pending_updates: dropPendingUpdates,
      });
    }

    await this.api.setWebhook({
      url: webhookUrl,
      secret_token: webhookSecretToken,
      allowed_updates: allowedUpdates,
      drop_pending_updates: dropPendingUpdates,
    });
    await ctx.runMutation(this.component.lib.saveWebhookSecret, {
      botUsername,
      webhookSecretToken,
    });

    return { botUsername, webhookUrl };
  }

  async deleteWebhook(
    ctx: ActionCtx,
    options?: DeleteWebhookOptions,
  ): Promise<void> {
    const { dropPendingUpdates = true } = options ?? {};
    const botUsername = await this.getBotUsername();

    await this.api.deleteWebhook({
      drop_pending_updates: dropPendingUpdates,
    });
    await ctx.runMutation(this.component.lib.deleteWebhookSecret, {
      botUsername,
    });
  }

  registerRoutes(http: HttpRouter, config?: RegisterRoutesConfig) {
    registerRoutes(http, this.component, this.api, this.webhookPath, config);
  }

  private async getBotUsername() {
    const info = await this.api.getMe();
    if (!info.is_bot || !info.username) {
      throw new Error("Failed to fetch bot details");
    }

    return normalizeUsername(info.username);
  }
}

function registerRoutes(
  http: HttpRouter,
  component: ComponentApi,
  api: APIMethods,
  webhookPath: string,
  config?: RegisterRoutesConfig,
) {
  const { handlers = {}, onUpdate } = config ?? {};

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
          onUpdate as RunnableTelegramUpdateHandler | undefined,
          ctx,
          update,
          makeTelegramBot(secret.botUsername, api),
        );

        for (const eventType of getUpdateEventTypes(update)) {
          await callHandler(
            handlers[eventType] as RunnableTelegramUpdateHandler | undefined,
            ctx,
            update,
            makeTelegramBot(secret.botUsername, api),
          );
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

async function callHandler(
  handler: RunnableTelegramUpdateHandler | undefined,
  ctx: GenericActionCtx<GenericDataModel>,
  update: TelegramUpdate,
  bot: TelegramBot,
) {
  await handler?.(ctx, update, bot);
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
  const value = (token ?? process.env.TELEGRAM_BOT_TOKEN ?? "").trim();
  if (value === "") {
    throw new Error(
      "Telegram bot token is required. Pass `token` or set TELEGRAM_BOT_TOKEN.",
    );
  }
  return value;
}

function getWebhookPath(webhookPath: string | undefined) {
  const path = webhookPath ?? "/telegram/webhook";
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

function makeTelegramBot(botUsername: string, api: APIMethods): TelegramBot {
  return {
    username: normalizeUsername(botUsername),
    api,
  };
}

function makeWebhookSecretToken() {
  const alphabet =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-";
  const values = new Uint8Array(48);
  crypto.getRandomValues(values);

  return Array.from(values, (value) => alphabet[value % alphabet.length]).join(
    "",
  );
}

export default Telegram;
