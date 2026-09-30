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
pnpm codegen      # regenerate committed _generated code (component + example)
pnpm test         # vitest (with typecheck)
pnpm typecheck    # package + example
pnpm lint         # eslint
pnpm format       # prettier --write
```

## Conventions

- Generated code under `_generated/` is committed. Don't edit it by hand; run
  `pnpm codegen` after changing the component or updating `convex`. It needs a
  Convex deployment, so CI can't regenerate it.
- Relative imports use explicit `.js` extensions (NodeNext module resolution).
- Run `pnpm build && pnpm test && pnpm typecheck && pnpm lint` and
  `pnpm format:check` before committing.
- When guides links to another doc for details, open and read that doc before
  acting.
- Use Conventional Commits — read
  [CONTRIBUTING.md#commits](./CONTRIBUTING.md#commits) first. Summary is an
  imperative `type(scope): …` line; the body explains the "why" (the diff
  already shows the "what"), and only when it isn't obvious.
- Releases are automated
  ([CONTRIBUTING.md#releasing](./CONTRIBUTING.md#releasing)): don't bump the
  version or edit `CHANGELOG.md`. Use `feat`/`fix` only for changes to the
  published package.
