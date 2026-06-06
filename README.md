# convex-telegram

A [Convex](https://convex.dev) component for storing Telegram bot credentials,
registering Telegram webhooks, and dispatching incoming Telegram updates to typed
handlers in your app.

## Features

- Bot credential storage inside the component namespace
- Webhook secret storage and lookup for Telegram webhook requests
- `TelegramAPI` client wrapper for Bot API calls
- Webhook route registration from the parent app's `convex/http.ts`
- Typed handlers for every Telegram `Update` key, such as `message`,
  `callback_query`, and `chat_member`

## Installation

```bash
pnpm add convex-telegram
# or: npm install convex-telegram
```

`convex` is a peer dependency (`>=1.36.0`).

## Quick Start

### 1. Add the component to the app

`convex/convex.config.ts`:

```ts
import { defineApp } from "convex/server";
import telegram from "convex-telegram/convex.config";

const app = defineApp();
app.use(telegram);

export default app;
```

### 2. Create the app-side client

`convex/telegram.ts`:

```ts
import { components } from "./_generated/api";
import { TelegramAPI } from "convex-telegram";

export const telegram = new TelegramAPI(components.telegram);
```

### 3. Register webhook routes

`convex/http.ts`:

```ts
import { httpRouter } from "convex/server";
import { telegram } from "./telegram";

const http = httpRouter();

telegram.registerRoutes(http, {
  events: {
    message: async (ctx, botUsername, update) => {
      console.log("Message for bot", botUsername, update.message.text);
    },
  },
  onEvent: async (ctx, botUsername, update) => {
    console.log("Telegram update", botUsername, update.update_id);
  },
});

export default http;
```

The route defaults to `/telegram/webhook`.

### 4. Save credentials and subscribe

Call these methods from an app action so environment variables stay in the app
boundary:

```ts
import { v } from "convex/values";
import { action } from "./_generated/server";
import { telegram } from "./telegram";

export const connectTelegramBot = action({
  args: { token: v.string() },
  returns: v.string(),
  handler: async (ctx, args) => {
    const botUsername = await telegram.saveBotCredentials(ctx, {
      token: args.token,
    });

    await telegram.subscribeForUpdates(ctx, botUsername, {
      allowedUpdates: ["message", "callback_query"],
      dropPendingUpdates: true,
    });

    return botUsername;
  },
});
```

`subscribeForUpdates` uses `CONVEX_SITE_URL` and registers:

```text
https://<deployment>.convex.site/telegram/webhook
```

### 5. Call the Telegram Bot API

`bot(ctx, botUsername)` returns a typed proxy for the Telegram Bot API, with the
bot token looked up from the component:

```ts
const bot = await telegram.bot(ctx, botUsername);

await bot.sendMessage({
  chat_id: 42,
  text: "Hello from Convex",
});
```

## API Reference

### TelegramAPI

```ts
const telegram = new TelegramAPI(components.telegram, {
  webhookPath: "/telegram/webhook",
});
```

| Method                                            | Description                                                            |
| ------------------------------------------------- | ---------------------------------------------------------------------- |
| `saveBotCredentials(ctx, { token })`              | Verifies the token with `getMe` and stores credentials by bot username |
| `subscribeForUpdates(ctx, botUsername, options?)` | Sets the Telegram webhook and stores a generated secret token          |
| `unsubscribe(ctx, botUsername, options?)`         | Deletes the Telegram webhook and stored webhook secret                 |
| `registerRoutes(http, config?)`                   | Mounts the webhook HTTP route in the app                               |
| `bot(ctx, botUsername)`                           | Returns a typed proxy for Telegram Bot API methods                     |

### Webhook handlers

Handlers receive the Convex action context, the Telegram bot username, and the
full Telegram update. Specific handlers narrow the update so the matching update
key is present:

```ts
telegram.registerRoutes(http, {
  events: {
    callback_query: async (ctx, botUsername, update) => {
      await ctx.runAction(internal.telegramCallbacks.handle, {
        botUsername,
        callbackQueryId: update.callback_query.id,
      });
    },
  },
});
```

`onEvent` runs for every update before the per-event handlers.

## Component Tables

### botCredentials

| Field      | Type   | Description                        |
| ---------- | ------ | ---------------------------------- |
| `token`    | string | Telegram bot token                 |
| `username` | string | Telegram bot username from `getMe` |

Index: `by_username`.

### webhooks

| Field                | Type   | Description                                          |
| -------------------- | ------ | ---------------------------------------------------- |
| `botId`              | id     | Internal reference to `botCredentials`               |
| `webhookSecretToken` | string | Secret expected in `X-Telegram-Bot-Api-Secret-Token` |

Indexes: `by_bot_id`, `by_webhook_secret_token`.

## Development

```bash
pnpm install
pnpm build:codegen   # regenerate src/component/_generated, then build dist/
pnpm test            # vitest run --typecheck
pnpm typecheck
pnpm lint
```

The tests follow the same structure as `get-convex/stripe`:

- Client tests mock Telegram `fetch` calls and exercise `TelegramAPI`
- Component tests use `convex-test` against `schema.ts` and `lib.ts`

## Project layout

```
src/
  component/   # runs in the Convex runtime (schema, lib, convex.config, _generated)
  client/      # runs in the app's functions (TelegramAPI wrapper, types)
dist/          # built output published to npm (gitignored)
```

## License

[Apache-2.0](./LICENSE)
