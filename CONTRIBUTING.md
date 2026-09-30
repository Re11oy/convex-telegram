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

Releases are automated with
[release-please](https://github.com/googleapis/release-please) and published by
the [Release workflow](./.github/workflows/release.yml). Don't bump the version
or edit [CHANGELOG.md](./CHANGELOG.md) by hand.

1. Every push to `main` first runs the full gate (clean install, build, test,
   typecheck, lint); nothing below happens unless it passes.
2. release-please then updates an open release PR. It bumps the version in
   `package.json` and adds a CHANGELOG entry based on the commit types since the
   last release: `fix` → patch, `feat` → minor, and while the version is below
   1.0.0 a breaking change also bumps the minor version. PRs are squash-merged,
   so the PR title is the commit that counts. Use `feat` and `fix` only for
   changes to the published package; repository tooling (CI, Renovate, pnpm
   settings) is `ci` or `chore`. Commits that only touch `.github/` are left out
   either way.
3. Merging the release PR tags the release (`vX.Y.Z`) and creates the GitHub
   release.
4. The workflow then builds the tag and publishes it to npm with
   [trusted publishing](https://docs.npmjs.com/trusted-publishers): no npm token
   is stored anywhere, and npm attaches a provenance attestation. A prerelease
   version such as `0.2.0-alpha.0` is published under its label's dist-tag
   (`alpha`), not `latest`.

The release PR is opened with the workflow's built-in token, so CI does not run
on it; the gate in step 1 runs on the merge commit instead. If publishing fails
after the release was created, fix the cause and use "Re-run failed jobs" on
that workflow run to publish the same tag.

For quick previews, every PR and push to `main` also gets an installable
[pkg.pr.new](https://pkg.pr.new) build; the link is posted on the PR.

Trusted publishing is configured on npmjs.com under the package's settings:
repository `Re11oy/convex-telegram`, workflow `release.yml`, environment `npm`.
