# convex-telegram

A [Convex](https://convex.dev) component for Telegram bots. It registers
webhooks, verifies Telegram webhook requests, dispatches typed updates to your
app, and gives you direct typed access to the Telegram Bot API.

The component does not store your bot token. Keep the token in your Convex app
environment and pass it to the app-side `Telegram` client.

## Features

- Single-bot setup with `TELEGRAM_BOT_TOKEN`
- Webhook registration with generated Telegram secret tokens
- Webhook request verification using `X-Telegram-Bot-Api-Secret-Token`
- Typed handlers for Telegram update keys like `message`, `callback_query`, and
  `chat_member`
- Direct `telegram.api.*` access for any Telegram Bot API method

## Installation

```bash
pnpm add convex-telegram
# or: npm install convex-telegram
```

`convex` is a peer dependency (`>=1.36.0`).

## Quick Start

### 1. Add the component

`convex/convex.config.ts`:

```ts
import { defineApp } from "convex/server";
import telegram from "convex-telegram/convex.config";

const app = defineApp();
app.use(telegram);

export default app;
```

### 2. Configure the bot token

```bash
npx convex env set TELEGRAM_BOT_TOKEN=<your-bot-token>
```

### 3. Create the Telegram client

`convex/telegram.ts`:

```ts
import { Telegram } from "convex-telegram";
import { components } from "./_generated/api";

// The token is read from TELEGRAM_BOT_TOKEN by default.
export const telegram = new Telegram(components.telegram);
```

### 4. Register webhook routes

`convex/http.ts`:

```ts
import { httpRouter } from "convex/server";
import { telegram } from "./telegram";

const http = httpRouter();

telegram.registerRoutes(http, {
  onUpdate: async (_ctx, update, bot) => {
    console.log("Telegram update", bot.username, update.update_id);
  },
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

### 5. Set up the Telegram webhook

Run this from a Convex action after deploying the HTTP route:

```ts
import { action } from "./_generated/server";
import { v } from "convex/values";
import { telegram } from "./telegram";

export const setupTelegramWebhook = action({
  args: {},
  returns: v.object({
    botUsername: v.string(),
    webhookUrl: v.string(),
  }),
  handler: async (ctx) => {
    return await telegram.setupWebhook(ctx, {
      allowedUpdates: ["message", "callback_query"],
      dropPendingUpdates: true,
    });
  },
});
```

`setupWebhook` uses `CONVEX_SITE_URL` and registers:

```text
https://<deployment>.convex.site/telegram/webhook
```

Pass `url` to `setupWebhook` if your public webhook URL is not based on
`CONVEX_SITE_URL`.

## Direct Bot API Access

Use `telegram.api` from actions or webhook handlers for any Telegram Bot API
method:

```ts
await telegram.api.sendMessage({
  chat_id: 42,
  text: "Hello from Convex",
});

await telegram.api.answerCallbackQuery({
  callback_query_id: update.callback_query.id,
});
```

The component intentionally does not wrap every Bot API method. `telegram.api`
is the raw typed escape hatch for methods that do not need component state.

## API Reference

### `new Telegram(component, options)`

Options:

- `token?: string` overrides `TELEGRAM_BOT_TOKEN`.
- `webhookPath?: string` defaults to `/telegram/webhook` and must start with
  `/`.

### Methods

- `telegram.api` is a typed Telegram Bot API client.
- `telegram.setupWebhook(ctx, options?)` verifies the bot with `getMe`, creates
  a webhook secret, calls Telegram `setWebhook`, stores the secret, and returns
  `{ botUsername, webhookUrl }`.
- `telegram.deleteWebhook(ctx, options?)` calls Telegram `deleteWebhook` and
  deletes the stored webhook secret.
- `telegram.registerRoutes(http, config?)` mounts the webhook HTTP route.

`setupWebhook` options:

- `allowedUpdates?: TelegramUpdateEvent[]` defaults to `["message"]`.
- `dropPendingUpdates?: boolean` defaults to `true`.
- `url?: string` overrides the generated webhook URL and must start with
  `https://`.

`deleteWebhook` options:

- `dropPendingUpdates?: boolean` defaults to `true`.

### Webhook handlers

Handlers receive `(ctx, update, bot)`.

- `ctx` is the Convex HTTP action context.
- `update` is the Telegram update. Specific handlers narrow the matching update
  key.
- `bot.username` is the normalized bot username, including the leading `@`.
- `bot.api` is the same typed Telegram Bot API client as `telegram.api`.

```ts
telegram.registerRoutes(http, {
  onUpdate: async (ctx, update, bot) => {
    await ctx.runMutation(internal.telegram.logUpdate, {
      botUsername: bot.username,
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

`onUpdate` runs before specific handlers. If an update contains multiple
Telegram update keys, every matching specific handler runs in object-key order.

## Webhook Behavior

- Missing or invalid webhook secret returns `401`.
- Malformed JSON returns `400`.
- Handler failures are logged and return `500`, allowing Telegram to retry the
  update.
- Successful dispatch returns `200`.

## Component Tables

### `webhooks`

- `botUsername: string` is the normalized bot username from Telegram `getMe`.
- `webhookSecretToken: string` is the secret expected in
  `X-Telegram-Bot-Api-Secret-Token`.

Indexes:

- `by_bot_username`
- `by_webhook_secret_token`

## Example

A runnable, backend-only example lives in [`example/`](./example). It installs
the component, echoes incoming messages, and stores them in a `messages` table.
See [`example/README.md`](./example/README.md) to run it against a Convex
deployment.

## Testing

Use the package test helper to register the component in `convex-test`:

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
  component/   # component schema, functions, config, generated types
  client/      # app-side Telegram client and public types
example/       # runnable example app (Convex backend)
dist/          # built output published to npm
```

## License

[Apache-2.0](./LICENSE)
