# Telegram component example

A minimal Convex backend that installs `convex-telegram`, registers the webhook
route, and echoes incoming messages back to the sender. There is no frontend —
you drive it from Telegram and the Convex dashboard.

## Setup

1. From the repository root, start the dev deployment (this also builds the
   component on every change):

   ```sh
   pnpm install
   pnpm dev
   ```

2. Create a bot with [@BotFather](https://t.me/BotFather) and set its token on
   the deployment:

   ```sh
   npx convex env set TELEGRAM_BOT_TOKEN <your-token>
   ```

3. Point Telegram at this deployment's webhook:

   ```sh
   npx convex run telegram:setupWebhook
   ```

## Try it

- Message your bot on Telegram. It replies `You said: ...` and stores the
  message in the `messages` table (visible in the dashboard).
- Send a message yourself:

  ```sh
  npx convex run telegram:sendMessage '{ "chatId": <your-chat-id>, "text": "Hi" }'
  ```

- Stop receiving updates:

  ```sh
  npx convex run telegram:deleteWebhook
  ```

## What's where

- `convex/convex.config.ts` — installs the Telegram component.
- `convex/telegram.ts` — constructs the client and exposes setup / send actions.
- `convex/http.ts` — registers the webhook route and handles updates.
- `convex/schema.ts` — the `messages` table used by the handler.
