import type { TelegramUpdate } from "@gramio/types";
import type {
  GenericActionCtx,
  GenericDataModel,
  GenericMutationCtx,
  GenericQueryCtx,
  HttpRouter,
} from "convex/server";
import type { TelegramBot } from "./index.js";

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

export type TelegramUpdateHandler<
  T extends TelegramUpdateEvent = TelegramUpdateEvent,
> = (
  ctx: GenericActionCtx<GenericDataModel>,
  update: TelegramUpdateForEvent<T>,
) => Promise<void>;

/**
 * Map of event types to their handlers.
 * Users can provide handlers for any Telegram update event type.
 */
export type TelegramUpdateHandlers = {
  [K in TelegramUpdateEvent]?: TelegramUpdateHandler<K>;
};

export type RunnableTelegramUpdateHandler = (
  ctx: GenericActionCtx<GenericDataModel>,
  update: TelegramUpdate,
) => Promise<void>;

/**
 * Configuration for webhook registration.
 */
export type RegisterRoutesConfig = {
  /**
   * Optional webhook path. Defaults to `/telegram/webhook`.
   */
  webhookPath?: string;
  /**
   * Optional webhook secret. When set, the component verifies the
   * `X-Telegram-Bot-Api-Secret-Token` header.
   */
  webhookSecret?: string;
  /**
   * Optional handlers for specific update events.
   */
  handlers?: TelegramUpdateHandlers;
  /**
   * Optional handler for all update events.
   * This runs after default processing and before specific event handlers.
   */
  onUpdate?: TelegramUpdateHandler;
};

/**
 * Like {@link TelegramUpdateHandler}, but also receives the {@link TelegramBot}
 * the update was addressed to, resolved from the registry.
 */
export type RegistryUpdateHandler<
  T extends TelegramUpdateEvent = TelegramUpdateEvent,
> = (
  ctx: GenericActionCtx<GenericDataModel>,
  update: TelegramUpdateForEvent<T>,
  bot: TelegramBot,
) => Promise<void>;

/**
 * Map of event types to their registry handlers.
 */
export type RegistryUpdateHandlers = {
  [K in TelegramUpdateEvent]?: RegistryUpdateHandler<K>;
};

export type RunnableRegistryUpdateHandler = (
  ctx: GenericActionCtx<GenericDataModel>,
  update: TelegramUpdate,
  bot: TelegramBot,
) => Promise<void>;

/**
 * Configuration for a {@link TelegramBotRegistry}.
 */
export type TelegramBotRegistryOptions = {
  /**
   * Shared webhook path that every registered bot points at. Defaults to
   * `/telegram/webhook`. Must start with `/`.
   */
  webhookPath?: string;
  /**
   * Optional handlers for specific update events.
   */
  handlers?: RegistryUpdateHandlers;
  /**
   * Optional handler for all update events, run before the specific handlers.
   */
  onUpdate?: RegistryUpdateHandler;
};

/**
 * Type for the HttpRouter to be used in registerRoutes
 */
export type { HttpRouter };
