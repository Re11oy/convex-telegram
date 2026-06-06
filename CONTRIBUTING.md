# Contributing

## Running locally

Install dependencies and start the example app against a Convex dev deployment.
`convex dev` rebuilds the component whenever you change files in `src/`.

```sh
pnpm install
pnpm dev
```

Set the bot token on your dev deployment before exercising the webhook:

```sh
npx convex env set TELEGRAM_BOT_TOKEN <your-token>
```

## Checks

The same checks run in CI. Run them before opening a pull request:

```sh
pnpm install
pnpm build
pnpm test
pnpm typecheck
pnpm lint
```

## Commits

This project uses [Conventional Commits](https://www.conventionalcommits.org)
(semantic commits). Write each commit message as a type, an optional scope, and
a short imperative description:

```text
<type>(<optional scope>): <description>
```

Common types:

- `feat` — a new feature
- `fix` — a bug fix
- `docs` — documentation only
- `refactor` — code change that neither fixes a bug nor adds a feature
- `test` — adding or updating tests
- `chore` — tooling, dependencies, or build changes

Examples:

```text
feat: add allowedUpdates option to setupWebhook
fix(client): resolve the bot token lazily
docs: explain webhook secret verification
chore(deps): bump convex to 1.36.1
```

Keep the summary under ~72 characters and use the body to explain the "why" when
it is not obvious. Mark breaking changes with a `!` after the type
(`feat!: ...`) or a `BREAKING CHANGE:` footer.

## Releasing

Releases are cut by the maintainers with `pnpm release` (patch) or `pnpm alpha`
(prerelease). Both run the full `preversion` gate, publish to npm, and push the
tag.
