# convex-telegram

A [Convex](https://convex.dev) component for
[Telegram bots](https://core.telegram.org/bots). Send messages through the typed
[Generated Telegram Bot API client](https://github.com/gramiojs/types) and, when
you need to react to users, receive updates through a verified webhook.

## What you can do

- **Send messages** (and call any Bot API method) with the typed
  `telegram.api.*` client.
- **Receive updates** (messages, callback queries, …) by registering a webhook
  route and handling typed updates.

## Installation

```bash
pnpm add convex-telegram
# or: npm install convex-telegram
```

`convex` is a peer dependency (`>=1.40.0`).

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

### 3. Create the Telegram client

`convex/telegram.ts`:

```ts
import { Telegram } from "convex-telegram";
import { components } from "./_generated/api";

// The token is read from TELEGRAM_BOT_TOKEN by default.
export const telegram = new Telegram(components.telegram);
```

You can now [send messages](#sending-messages). To also
[receive messages](#receiving-messages), register a webhook.

## Sending messages

Call any [Bot API method](https://core.telegram.org/bots/api#available-methods)
through `telegram.api` from a Convex action or webhook handler:

```ts
import { action } from "./_generated/server";
import { v } from "convex/values";
import { telegram } from "./telegram";

export const sendMessage = action({
  args: { chatId: v.union(v.string(), v.float64()), text: v.string() },
  returns: v.null(),
  handler: async (_ctx, args) => {
    await telegram.api.sendMessage({ chat_id: args.chatId, text: args.text });
    return null;
  },
});
```

## Receiving messages

To receive [updates](https://core.telegram.org/bots/api#getting-updates) you
register an HTTP route and point Telegram at it.

### 1. (Recommended) configure a webhook secret

Telegram can attach a secret token to every webhook request so you can verify it
really came from Telegram. Set any random string and the component will both
register it and verify it:

```bash
npx convex env set TELEGRAM_WEBHOOK_SECRET <random-string>
```

If `TELEGRAM_WEBHOOK_SECRET` is not set, the webhook is left open and requests
are not verified — only do this for local testing. See `secret_token` in the
[setWebhook docs](https://core.telegram.org/bots/api#setwebhook).

### 2. Register the webhook route

`convex/http.ts`:

```ts
import { httpRouter } from "convex/server";
import { telegram } from "./telegram";

const http = httpRouter();

telegram.registerRoutes(http, {
  handlers: {
    message: async (_ctx, update, bot) => {
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

After deploying the HTTP route, run `setupWebhook` once from an action. It calls
Telegram [`setWebhook`](https://core.telegram.org/bots/api#setwebhook) and, if
configured, registers your secret:

```ts
import { action } from "./_generated/server";
import { v } from "convex/values";
import { telegram } from "./telegram";

export const setupWebhook = action({
  args: {},
  returns: v.object({ botUsername: v.string(), webhookUrl: v.string() }),
  handler: async () => {
    return await telegram.setupWebhook({
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

### Handling updates

Handlers receive `(ctx, update, bot)`:

- `ctx` is the Convex HTTP action context (use `ctx.runQuery` /
  `ctx.runMutation` to reach your app's functions).
- `update` is the [Telegram update](https://core.telegram.org/bots/api#update).
  Specific handlers narrow it to the matching key (e.g. `message` is non-null).
- `bot.api` is the same typed Bot API client as `telegram.api`.

```ts
import { internal } from "./_generated/api";

telegram.registerRoutes(http, {
  onUpdate: async (ctx, update) => {
    await ctx.runMutation(internal.telegram.logUpdate, {
      updateId: update.update_id,
    });
  },
  handlers: {
    callback_query: async (_ctx, update, bot) => {
      await bot.api.answerCallbackQuery({
        callback_query_id: update.callback_query.id,
      });
    },
  },
});
```

`onUpdate` runs for every update before the specific handlers. Each handler key
matches a field on the Telegram update object.

## API Reference

### `new Telegram(component, options?)`

- `component` — the installed component, e.g. `components.telegram`.
- `options.token?` — bot token. Defaults to `TELEGRAM_BOT_TOKEN`.
- `options.webhookSecret?` — webhook secret. Defaults to
  `TELEGRAM_WEBHOOK_SECRET`. When unset, webhook requests are not verified.
- `options.webhookPath?` — route path. Defaults to `/telegram/webhook` and must
  start with `/`.

### Methods

- `telegram.api` — typed [Bot API](https://core.telegram.org/bots/api) client.
- `telegram.setupWebhook(options?)` — verifies the bot with `getMe`, calls
  Telegram `setWebhook` (sending the secret when configured), and returns
  `{ botUsername, webhookUrl }`.
  - `allowedUpdates?: TelegramUpdateEvent[]` defaults to `["message"]`.
  - `dropPendingUpdates?: boolean` defaults to `true`.
  - `url?: string` overrides the generated URL and must start with `https://`.
- `telegram.deleteWebhook(options?)` — calls Telegram `deleteWebhook`.
  - `dropPendingUpdates?: boolean` defaults to `true`.
- `telegram.registerRoutes(http, config?)` — mounts the webhook HTTP route.
  - `config.onUpdate?` runs for every update.
  - `config.handlers?` maps an update key to a typed handler.

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

## Project Layout

```text
src/
  component/   # component config, schema, generated types
  client/      # app-side Telegram client and public types
example/       # runnable example app (Convex backend)
dist/          # built output published to npm
```

## License

[Apache-2.0](./LICENSE)
