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
  RunnableTelegramUpdateHandler,
  TelegramUpdateEvent,
} from "./types.js";
import { env } from "../component/_generated/server.js";

export type {
  HttpRouter,
  RegisterRoutesConfig,
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
  private readonly webhookPath: string;
  private readonly webhookSecret: string | undefined;

  constructor(
    public readonly component: TelegramComponent,
    options?: TelegramOptions,
  ) {
    this.api = botApiProxy(() => getRequiredToken(options?.token));
    this.webhookPath = getWebhookPath(options?.webhookPath);
    this.webhookSecret = getWebhookSecret(options?.webhookSecret);
  }

  /**
   * Point Telegram at this deployment's webhook endpoint. Run once after
   * deploying the route registered with {@link registerRoutes}. When a webhook
   * secret is configured it is sent as `secret_token`.
   *
   * @see https://core.telegram.org/bots/api#setwebhook
   */
  async setupWebhook(
    options?: SetupWebhookOptions,
  ): Promise<SetupWebhookResult> {
    const { dropPendingUpdates = true, allowedUpdates = ["message"] } =
      options ?? {};
    const me = await this.api.getMe();
    if (!me.is_bot || !me.username) {
      throw new Error("Failed to fetch bot details from Telegram getMe.");
    }
    const webhookUrl = getWebhookUrl(options?.url, this.webhookPath);

    await this.api.setWebhook({
      url: webhookUrl,
      secret_token: this.webhookSecret,
      allowed_updates: allowedUpdates,
      drop_pending_updates: dropPendingUpdates,
    });

    return { botUsername: `@${me.username}`, webhookUrl };
  }

  /**
   * Stop receiving updates by removing the webhook from Telegram.
   *
   * @see https://core.telegram.org/bots/api#deletewebhook
   */
  async deleteWebhook(options?: DeleteWebhookOptions): Promise<void> {
    const { dropPendingUpdates = true } = options ?? {};
    await this.api.deleteWebhook({ drop_pending_updates: dropPendingUpdates });
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

export default TelegramBot;
