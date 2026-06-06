import type { APIMethods, TelegramUpdate } from "@gramio/types";
import type {
  GenericActionCtx,
  GenericDataModel,
  HttpRouter,
} from "convex/server";

export type ActionCtx = Pick<GenericActionCtx<GenericDataModel>, "runMutation">;

export type TelegramUpdateEvent = Exclude<keyof TelegramUpdate, "update_id">;

export type TelegramUpdateForEvent<
  T extends TelegramUpdateEvent = TelegramUpdateEvent,
> = T extends TelegramUpdateEvent
  ? TelegramUpdate & { [K in T]-?: NonNullable<TelegramUpdate[K]> }
  : never;

export type TelegramBotUsername = string & { __isBotUsername: true };

export type TelegramBot = {
  username: TelegramBotUsername;
  api: APIMethods;
};

export type TelegramUpdateHandler<
  T extends TelegramUpdateEvent = TelegramUpdateEvent,
> = (
  ctx: GenericActionCtx<GenericDataModel>,
  update: TelegramUpdateForEvent<T>,
  bot: TelegramBot,
) => Promise<void>;

export type TelegramUpdateHandlers = {
  [K in TelegramUpdateEvent]?: TelegramUpdateHandler<K>;
};

export type RunnableTelegramUpdateHandler = (
  ctx: GenericActionCtx<GenericDataModel>,
  update: TelegramUpdate,
  bot: TelegramBot,
) => Promise<void>;

export type RegisterRoutesConfig = {
  handlers?: TelegramUpdateHandlers;

  onUpdate?: TelegramUpdateHandler;
};

export type { HttpRouter };
