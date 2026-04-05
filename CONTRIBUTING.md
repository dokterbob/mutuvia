# Contributing to Mutuvia

Mutuvia is a FOSS mutual credit app for small communities — designed to be self-hosted and community-deployable. Contributions are welcome.

## Setup

```sh
bun install          # installs deps and registers the pre-commit hook
cp .env.example .env # fill in required values (see README)
bun run db:migrate   # apply database migrations
bun run dev          # start the dev server
```

Requires [Bun](https://bun.sh) 1.1+. PostgreSQL is optional — SQLite is the default (`DB_PROVIDER=sqlite`). To use PostgreSQL locally: `docker compose up -d`, then set `DB_PROVIDER=pg`.

## Git Workflow

- **Never commit directly to `main`.** Always create a branch, open a PR, and let CI pass before merging.
- Branch names are free-form; keep them short and descriptive.
- One logical change per PR where possible.

## Pre-commit Hook

`bun install` registers a pre-commit hook via `bun-git-hooks`. On each commit it runs:

- `bun run format` (Prettier) on all staged files
- `bun run lint:fix` + `bun run check` (ESLint + svelte-check) on staged `.js`/`.ts` files

To skip in an emergency: `SKIP_BUN_GIT_HOOKS=1 git commit`

## Before Submitting a PR

Run these locally and fix any failures before pushing:

```sh
bun run lint:fix          # auto-fix formatting and ESLint issues
bun run check             # type-check (svelte-check)
bun run test              # unit tests
bun run test:e2e          # E2E tests
```

Run `lint:fix` first, then the remaining three in parallel. CI runs the same checks — green locally means green in CI.

## Testing

See [docs/testing.md](docs/testing.md) for the full testing guide, including layer strategy (unit / E2E), Vitest conventions, and Playwright patterns.

## AI Agents

If you're an AI agent working in this codebase, read [AGENTS.md](AGENTS.md) first — it contains agent-specific instructions, key conventions, and the Context7 library IDs for up-to-date documentation.
