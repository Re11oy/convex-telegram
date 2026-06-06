# AGENTS.md

Guidance for AI coding agents working in this repository. See also
[CONTRIBUTING.md](./CONTRIBUTING.md) and [README.md](./README.md).

## What this is

`convex-telegram` is a [Convex](https://convex.dev) component for Telegram bots.
It registers and verifies webhooks, dispatches typed updates, and exposes the
raw Telegram Bot API. The component never stores the bot token.

## Layout

- `src/component/` — the component: schema, functions, `convex.config.ts`, and
  committed `_generated/` types.
- `src/client/` — the app-side `Telegram` client and its public types.
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
- Keep the bot token out of component state; it is read from
  `TELEGRAM_BOT_TOKEN` on the app side and resolved lazily.
- Run `pnpm build && pnpm test && pnpm typecheck && pnpm lint` before
  committing.
- Use Conventional Commits — see [CONTRIBUTING.md](./CONTRIBUTING.md#commits).
