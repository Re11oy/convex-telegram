# Telegram support inbox example

A full-stack demo for the [`convex-telegram`](../README.md) component: a
Telegram-style support inbox backed by Convex.

## Run it

```sh
# from the repository root
pnpm install
pnpm dev            # Convex backend + component rebuild
pnpm dev:frontend   # Vite dev server (in a second terminal)
```

Then create a bot with [@BotFather](https://t.me/BotFather) and configure it
(from the repository root):

```sh
npx convex env set TELEGRAM_BOT_TOKEN <your-token>
npx convex env set TELEGRAM_WEBHOOK_SECRET <random-string>   # recommended
npx convex run telegram:setupWebhook
```

## Try it

- Message your bot on Telegram — the conversation shows up in the inbox.
- Reply from the composer — the message is stored and delivered on Telegram.
- Stop receiving updates with `npx convex run telegram:deleteWebhook`.

## What's where

- `convex/convex.config.ts` — installs the Telegram component.
- `convex/schema.ts` — the `messages` table (`chatId`, `username?`, `text`,
  `direction`, `telegramMessageId?`).
- `convex/http.ts` — the webhook route; records inbound messages.
- `convex/messages.ts` — `listTopics` (UI feed), `recordInbound`, and `send`
  (persists the reply and enqueues durable delivery via `bot.outbound.send`).
- `convex/telegram.ts` — the client, `setupWebhook` / `deleteWebhook`, and
  `handleOutboundEvent` (links delivery outcomes back to `messages`).
- `convex/crons.ts` — daily cleanup of old delivered/failed outbound rows.
- `src/App.tsx` — the inbox UI (chat list, conversation, composer).
