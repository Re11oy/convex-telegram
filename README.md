# convex-telegram

A Convex component for integrating
[Telegram Bot API](https://core.telegram.org/bots) through typed API client
based on [@gramio/types](https://www.npmjs.com/package/@gramio/types).

[![npm version](https://badge.fury.io/js/convex-telegram.svg)](https://badge.fury.io/js/convex-telegram)

## What you can do

- **Send messages** (and call any Bot API method) with the typed `bot.api.*`
  client.
- **Send durably** with `bot.outbound.*`: enqueue from a mutation and the
  component retries until Telegram accepts the message, honouring flood limits
  and reporting the outcome back to your app.
- **Receive updates** (messages, callback queries, …) by registering a webhook
  route and handling typed updates.

## Installation

```bash
pnpm add convex-telegram
# or: npm install convex-telegram
```

## Setup

### 1. Create a bot and set the token

Create a bot with [@BotFather](https://t.me/BotFather)
([docs](https://core.telegram.org/bots/features#botfather)) to get a token, then
set it on your deployment:

```bash
npx convex env set TELEGRAM_BOT_TOKEN <your-bot-token>
```

### 2. Add the component

`convex/convex.config.ts`:

```ts
import { defineApp } from "convex/server";
import telegram from "convex-telegram/convex.config";

const app = defineApp();
app.use(telegram);

export default app;
```

### 3. Create the bot client

`convex/telegram.ts`:

```ts
import { TelegramBot } from "convex-telegram";
import { components } from "./_generated/api";

export const bot = new TelegramBot(components.telegram);
```

You can now [send messages](#sending-messages). To also
[receive messages](#receiving-messages), register a webhook.

## Sending messages

Call any [Bot API method](https://core.telegram.org/bots/api#available-methods)
through `bot.api` from a Convex action or webhook handler:

```ts
import { action } from "./_generated/server";
import { v } from "convex/values";
import { bot } from "./telegram";

export const sendMessage = action({
  args: { chatId: v.union(v.string(), v.float64()), text: v.string() },
  returns: v.null(),
  handler: async (_ctx, args) => {
    await bot.api.sendMessage({ chat_id: args.chatId, text: args.text });
    return null;
  },
});
```

`bot.api.*` is raw and immediate: if the call fails (crash, restart, 429, 5xx),
the message is gone. For production sends, use the durable path below.

## Durable sending

`bot.outbound.send` enqueues the message inside your mutation — transactional
with your app state — and the component delivers it in the background: 5xx and
network errors are retried with backoff, `429` flood waits are honoured using
Telegram's exact `retry_after`, and group→supergroup migrations are rewritten
and resent automatically.

The guarantee is **eventually accepted by the Telegram Bot API**: a retry after
an ambiguous failure (crash mid-send) may deliver a duplicate, and Telegram
offers no idempotency key or per-device delivery receipts. Same-chat messages
are sent in enqueue order on the happy path; a retry may reorder them.

Requires the `TELEGRAM_BOT_TOKEN` environment variable (the client `token`
option only configures `bot.api`).

```ts
import { mutation } from "./_generated/server";
import { v } from "convex/values";
import { bot } from "./telegram";

export const replyToUser = mutation({
  args: { chatId: v.float64(), text: v.string() },
  handler: async (ctx, args) => {
    const id = await bot.outbound.send(ctx, {
      chat_id: args.chatId,
      text: args.text,
    });
    return id; // durable handle for bot.outbound.status / cancel
  },
});
```

### Reacting to outcomes

Pass `onOutboundEvent` to run a mutation whenever a message reaches a terminal
state (`sent` / `failed` / `cancelled`). `clientRef` links the event back to
your own records:

```ts
// convex/telegram.ts
import { TelegramBot, vOnOutboundEventArgs } from "convex-telegram";
import { components, internal } from "./_generated/api";
import { internalMutation } from "./_generated/server";

export const bot: TelegramBot = new TelegramBot(components.telegram, {
  onOutboundEvent: internal.telegram.handleOutboundEvent,
});

export const handleOutboundEvent = internalMutation({
  args: vOnOutboundEventArgs,
  handler: async (ctx, event) => {
    // event: { id, event, clientRef?, telegramMessageId?, errorCode?, errorMessage? }
  },
});
```

Event delivery is best-effort; `bot.outbound.status(ctx, id)` is the source of
truth and returns `null` once the row has been cleaned up. When a chat blocks
the bot, the message fails with the Telegram error — whether to stop sending to
that chat is your app's policy.

### Cleanup

Delivered rows are kept for inspection until you delete them. Register a cron —
**without it the table grows forever**:

```ts
// convex/crons.ts
import { cronJobs } from "convex/server";
import { components, internal } from "./_generated/api";
import { internalMutation } from "./_generated/server";

export const cleanupTelegramOutbound = internalMutation({
  args: {},
  handler: async (ctx) => {
    await ctx.runMutation(
      components.telegram.outbound.cleanupOldOutboundMessages,
      { olderThan: 7 * 24 * 60 * 60 * 1000 },
    );
  },
});

const crons = cronJobs();
crons.daily(
  "telegram outbound cleanup",
  { hourUTC: 4, minuteUTC: 0 },
  internal.crons.cleanupTelegramOutbound,
  {},
);
export default crons;
```

## Receiving messages

To receive [updates](https://core.telegram.org/bots/api#getting-updates) you
register an HTTP route and point Telegram at it.

### 1. Configure a webhook secret (optional)

```bash
npx convex env set TELEGRAM_WEBHOOK_SECRET <random-string>
```

The component always verifies the `X-Telegram-Bot-Api-Secret-Token` header. Set
this to control the secret yourself; when unset, `setupWebhook` generates one
and incoming requests are verified against its stored hash.

### 2. Register the webhook route

`convex/http.ts`:

```ts
import { httpRouter } from "convex/server";
import { registerRoutes } from "convex-telegram";
import { components } from "./_generated/api";
import { bot } from "./telegram";

const http = httpRouter();

registerRoutes(http, components.telegram, {
  handlers: {
    message: async (_ctx, update) => {
      await bot.api.sendMessage({
        chat_id: update.message.chat.id,
        text: "Thanks for the message.",
      });
    },
  },
});

export default http;
```

The route defaults to `/telegram/webhook`.

### 3. Point Telegram at your deployment

Run `setupWebhook` once after deploying the HTTP route:

```ts
import { action } from "./_generated/server";
import { v } from "convex/values";
import { bot } from "./telegram";

export const setupWebhook = action({
  args: {},
  returns: v.object({ botUsername: v.string(), webhookUrl: v.string() }),
  handler: async () => {
    return await bot.setupWebhook({
      allowedUpdates: ["message", "callback_query"],
    });
  },
});
```

`setupWebhook` uses `CONVEX_SITE_URL` to build the webhook URL:

```text
https://<deployment>.convex.site/telegram/webhook
```

Pass `url` to `setupWebhook` if your public webhook URL is not based on
`CONVEX_SITE_URL`.

Handler keys match fields on the
[Telegram update](https://core.telegram.org/bots/api#update) object (`message`,
`callback_query`, …). `onUpdate` runs for every update before specific handlers.

## API Reference

### TelegramBot

```ts
const bot = new TelegramBot(components.telegram, {
  token: "...", // optional, defaults to TELEGRAM_BOT_TOKEN (bot.api only)
  webhookSecret: "...", // optional, defaults to TELEGRAM_WEBHOOK_SECRET
  webhookPath: "/telegram/webhook",
  onOutboundEvent: internal.telegram.handleOutboundEvent, // optional
});
```

| Method                                  | Description                                                           |
| --------------------------------------- | --------------------------------------------------------------------- |
| `bot.api`                               | Typed [Bot API](https://core.telegram.org/bots/api) client, immediate |
| `bot.outbound.send(ctx, params, opts?)` | Durably queue a `sendMessage`, returns an `OutboundMessageId`         |
| `bot.outbound.status(ctx, id)`          | `{ status, telegramMessageId?, … }` or `null` once cleaned up         |
| `bot.outbound.cancel(ctx, id)`          | Cancel a still-`waiting` message, returns whether it took effect      |
| `bot.setupWebhook()`                    | Calls Telegram `setWebhook`, returns `{ botUsername, webhookUrl }`    |
| `bot.deleteWebhook()`                   | Calls Telegram `deleteWebhook`                                        |

### registerRoutes

```ts
registerRoutes(http, components.telegram, {
  webhookPath: "/telegram/webhook",
  onUpdate: async (ctx, update) => { ... },
  handlers: { message: async (ctx, update) => { ... } },
});
```

## Example

A runnable, backend-only example lives in [`example/`](./example). It installs
the component, echoes incoming messages, and stores them in a `messages` table.
See [`example/README.md`](./example/README.md) to run it against a Convex
deployment.

## Testing

Use the package test helper to register the component in
[`convex-test`](https://docs.convex.dev/testing/convex-test):

```ts
import telegram from "convex-telegram/test";

telegram.register(t);
```

## Development

This repo runs the example app against an anonymous local Convex backend (no
account required), which also regenerates component types on change.

```bash
pnpm install
pnpm dev          # run the example app and rebuild the component on change
```

Run the same checks as CI:

```bash
pnpm build
pnpm test
pnpm typecheck
pnpm lint
```

See [CONTRIBUTING.md](./CONTRIBUTING.md) for details.

## License

[Apache-2.0](./LICENSE)
