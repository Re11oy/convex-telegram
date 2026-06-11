/* eslint-disable */
/**
 * Generated `ComponentApi` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type { FunctionReference } from "convex/server";

/**
 * A utility for referencing a Convex component's exposed API.
 *
 * Useful when expecting a parameter like `components.myComponent`.
 * Usage:
 * ```ts
 * async function myFunction(ctx: QueryCtx, component: ComponentApi) {
 *   return ctx.runQuery(component.someFile.someQuery, { ...args });
 * }
 * ```
 */
export type ComponentApi<Name extends string | undefined = string | undefined> =
  {
    outbound: {
      cancel: FunctionReference<
        "mutation",
        "internal",
        { id: string },
        boolean,
        Name
      >;
      cleanupOldOutboundMessages: FunctionReference<
        "mutation",
        "internal",
        { olderThan?: number },
        null,
        Name
      >;
      enqueue: FunctionReference<
        "mutation",
        "internal",
        {
          clientRef?: string;
          method: string;
          onOutboundEvent?: string;
          params: any;
        },
        string,
        Name
      >;
      status: FunctionReference<
        "query",
        "internal",
        { id: string },
        null | {
          attemptCount: number;
          clientRef?: string;
          errorCode?: number;
          errorMessage?: string;
          status: "waiting" | "sent" | "failed" | "cancelled";
          telegramMessageId?: number;
        },
        Name
      >;
    };
    webhooks: {
      create: FunctionReference<
        "mutation",
        "internal",
        {
          botId: number;
          botUsername: string;
          secretHash: string;
          settings: {
            allowedUpdates: Array<string>;
            dropPendingUpdates: boolean;
            webhookUrl: string;
          };
        },
        null,
        Name
      >;
      remove: FunctionReference<
        "mutation",
        "internal",
        { botUsername: string },
        null,
        Name
      >;
      verifySecretHash: FunctionReference<
        "query",
        "internal",
        { secretHash: string },
        boolean,
        Name
      >;
    };
  };
