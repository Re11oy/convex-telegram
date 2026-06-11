# AGENTS.md

Guidance for AI coding agents working in this repository. See also
[CONTRIBUTING.md](./CONTRIBUTING.md) and [README.md](./README.md).

## What this is

`convex-telegram` is a [Convex](https://convex.dev) component for Telegram bots.
It sends messages through the typed Telegram Bot API and can receive updates
through a verified webhook.

## Layout

- `src/component/` — the component: `convex.config.ts` (nests
  `@convex-dev/workpool`), `schema.ts`, `webhooks.ts`, `outbound.ts` (durable
  delivery), `shared.ts` (validators shared with the client), and committed
  `_generated/` types.
- `src/client/` — the app-side `TelegramBot` client and its public types
  (sending, durable outbound, webhook setup, and route registration).
- `example/convex/` — a runnable example app that installs the component.

## Commands

```sh
pnpm install
pnpm dev          # example app + component rebuild (anonymous local backend)
pnpm build        # tsc build to dist/
pnpm test         # vitest (with typecheck)
pnpm typecheck    # package + example
pnpm lint         # eslint
pnpm format       # prettier --write
```

## Conventions

- Generated code under `_generated/` is committed. Do not edit it by hand; run
  `pnpm build:codegen` (component) or `pnpm dev` (example) to regenerate.
- Relative imports use explicit `.js` extensions (NodeNext module resolution).
- Run `pnpm build && pnpm test && pnpm typecheck && pnpm lint` before
  committing.
- When guides links to another doc for details, open and read that doc before
  acting.
- Use Conventional Commits — read
  [CONTRIBUTING.md#commits](./CONTRIBUTING.md#commits) first. Summary is an
  imperative `type(scope): …` line; the body explains the "why" (the diff
  already shows the "what"), and only when it isn't obvious.
