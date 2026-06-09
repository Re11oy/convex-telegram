# convex-telegram

A Convex component for integrating
[Telegram Bot API](https://core.telegram.org/bots) through typed API client
based on [@gramio/types](https://www.npmjs.com/package/@gramio/types).

[![npm version](https://badge.fury.io/js/convex-telegram.svg)](https://badge.fury.io/js/convex-telegram)

## What you can do

- **Send messages** (and call any Bot API method) with the typed `bot.api.*`
  client.
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

## Receiving messages

To receive [updates](https://core.telegram.org/bots/api#getting-updates) you
register an HTTP route and point Telegram at it.

### 1. Configure a webhook secret (optional)

```bash
npx convex env set TELEGRAM_WEBHOOK_SECRET <random-string>
```

The component always verifies the `X-Telegram-Bot-Api-Secret-Token` header. Set
this to control the secret yourself; when unset, `setupWebhook` generates one and
incoming requests are verified against its stored hash.

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
  token: "...", // optional, defaults to TELEGRAM_BOT_TOKEN
  webhookSecret: "...", // optional, defaults to TELEGRAM_WEBHOOK_SECRET
  webhookPath: "/telegram/webhook",
});
```

| Method                | Description                                                        |
| --------------------- | ------------------------------------------------------------------ |
| `bot.api`             | Typed [Bot API](https://core.telegram.org/bots/api) client         |
| `bot.setupWebhook()`  | Calls Telegram `setWebhook`, returns `{ botUsername, webhookUrl }` |
| `bot.deleteWebhook()` | Calls Telegram `deleteWebhook`                                     |

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
