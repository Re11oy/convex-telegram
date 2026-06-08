import type { TelegramUpdate } from "@gramio/types";
import type {
  GenericActionCtx,
  GenericDataModel,
  HttpRouter,
} from "convex/server";

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

export type TelegramUpdateHandlers = {
  [K in TelegramUpdateEvent]?: TelegramUpdateHandler<K>;
};

export type RunnableTelegramUpdateHandler = (
  ctx: GenericActionCtx<GenericDataModel>,
  update: TelegramUpdate,
) => Promise<void>;

export type RegisterRoutesConfig = {
  webhookPath?: string;
  webhookSecret?: string;
  handlers?: TelegramUpdateHandlers;
  onUpdate?: TelegramUpdateHandler;
};

export type { HttpRouter };
