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

Releases are cut by the maintainers from a clean `main`. Versioning, the
changelog, and publishing are wired through npm lifecycle scripts, so the usual
flow is a single command.

### Cut a release

```sh
pnpm release   # patch bump, published under the `latest` tag
pnpm alpha     # prerelease bump, published under the `alpha` tag
```

Each command runs, in order:

1. **`preversion`** — the full gate: clean install (`--frozen-lockfile`), clean
   rebuild, test, typecheck, and lint. The release aborts if any check fails.
2. **`pnpm version`** bumps the version in `package.json`.
3. **`version`** — ensures you are logged in to npm
   (`pnpm whoami`/`pnpm login`), then opens [CHANGELOG.md](./CHANGELOG.md) in
   your editor with a new `## <version>` heading already inserted at the top.
   Write the notes for the release and save; the file is formatted with Prettier
   and staged so it lands in the version commit.
4. The version commit and git tag are created, the package is published to npm,
   and both are pushed with `git push --follow-tags`.

