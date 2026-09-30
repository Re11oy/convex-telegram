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

## Example app deployments

Vercel deploys the example app and its Convex backend together (see
`vercel.json`): `main` goes to production, other branches get a preview.

Previews have no `TELEGRAM_BOT_TOKEN`. Don't give them the prod bot's token: a
bot has one webhook, and `setupWebhook` on a preview would take it from prod.

## Checks

The same checks run in CI. Run them before opening a pull request:

```sh
pnpm install
pnpm build
pnpm test
pnpm typecheck
pnpm lint
pnpm format:check
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

Releases are automated by
[release-please](https://github.com/googleapis/release-please) in
[`release.yml`](./.github/workflows/release.yml). Don't bump the version or edit
`CHANGELOG.md` by hand.

- The commit type decides the release: `fix` → patch, `feat` → minor. Use them
  only for changes to the published package; tooling is `ci` or `chore`. PRs are
  squash-merged, so the PR title is the commit.
- Merges to `main` update the release PR once the release checks pass. Merging
  it tags the release, and CI stages the package on npm (trusted publishing
  allows staging only).
- Publish by approving the staged version with 2FA (needs npm 11.15 or newer,
  e.g. `npx npm@11.20.0`):

  ```sh
  npm stage list convex-telegram
  npm stage approve <stage-id>
  ```

If staging fails, fix the cause and re-run the failed job.
