# AGENTS.md

Guidance for AI coding agents working in this repository. See also
[CONTRIBUTING.md](./CONTRIBUTING.md) and [README.md](./README.md).

## What this is

`convex-telegram` is a [Convex](https://convex.dev) component for Telegram bots.
It sends messages through the typed Telegram Bot API and can receive updates
through a verified webhook.

## Layout

- `src/component/` — the component: `convex.config.ts`, an empty `schema.ts`,
  and committed `_generated/` types.
- `src/client/` — the app-side `Telegram` client and its public types (sending,
  webhook setup, and route registration).
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
- Use Conventional Commits — see [CONTRIBUTING.md](./CONTRIBUTING.md#commits).
