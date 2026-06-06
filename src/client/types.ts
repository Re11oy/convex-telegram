import type { TelegramUpdate } from "@gramio/types";
import type {
  GenericActionCtx,
  GenericDataModel,
  GenericMutationCtx,
  GenericQueryCtx,
  HttpRouter,
} from "convex/server";

// Type utils follow

export type QueryCtx = Pick<GenericQueryCtx<GenericDataModel>, "runQuery">;
export type MutationCtx = Pick<
  GenericMutationCtx<GenericDataModel>,
  "runQuery" | "runMutation"
>;
export type ActionCtx = Pick<
  GenericActionCtx<GenericDataModel>,
  "runQuery" | "runMutation" | "runAction"
>;

// Webhook Event Handler Types

export type TelegramUpdateEvent = Exclude<keyof TelegramUpdate, "update_id">;

export type TelegramUpdateForEvent<
  T extends TelegramUpdateEvent = TelegramUpdateEvent,
> = T extends TelegramUpdateEvent
  ? TelegramUpdate & { [K in T]-?: NonNullable<TelegramUpdate[K]> }
  : never;

/**
 * Handler function for a specific Telegram update webhook.
 * Receives the action context and the full Telegram update object.
 */
export type TelegramUpdateHandler<
  T extends TelegramUpdateEvent = TelegramUpdateEvent,
> = (
  ctx: GenericActionCtx<GenericDataModel>,
  botUsername: TelegramBotUsername,
  update: TelegramUpdateForEvent<T>,
) => Promise<void>;

/**
 * Map of event types to their handlers.
 * Users can provide handlers for any Telegram Update webhook type.
 */
export type TelegramUpdateHandlers = {
  [K in TelegramUpdateEvent]?: TelegramUpdateHandler<K>;
};

export type RunnableTelegramUpdateHandler = (
  ctx: ActionCtx,
  botUsername: TelegramBotUsername,
  update: TelegramUpdate,
) => Promise<void>;

export type TelegramBotUsername = string & { __isBotUsername: true };

/**
 * Configuration for Telegram webhook route registration.
 */
export type RegisterRoutesConfig = {
  /**
   * Optional update handlers keyed by a Telegram update type.
   */
  events?: TelegramUpdateHandlers;

  /**
   * Optional generic update handler that runs before the specific update handler.
   */
  onEvent?: TelegramUpdateHandler;
};

/**
 * Type for the HttpRouter to be used in registerRoutes
 */
export type { HttpRouter };
