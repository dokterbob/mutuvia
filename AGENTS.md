# Mutuvia — Agent Instructions

> Mutual credit app for small communities. See [ROADMAP.md](ROADMAP.md) for what's done, what's next, and what's deferred.

## Context7 Library IDs

Use these with `mcp__context7__query-docs` for up-to-date documentation:

| Library                     | Context7 ID                          | Notes                                                           |
| --------------------------- | ------------------------------------ | --------------------------------------------------------------- |
| SvelteKit / Svelte 5        | `/sveltejs/svelte`                   | Runes, components, routing                                      |
| Svelte Docs (comprehensive) | `/websites/svelte_dev`               | 8203 snippets, tutorials + reference                            |
| Drizzle ORM                 | `/llmstxt/orm_drizzle_team_llms_txt` | SQLite + PostgreSQL schema, migrations, queries                 |
| Better Auth                 | `/llmstxt/better-auth_llms_txt`      | Phone OTP, email OTP, Drizzle adapter                           |
| shadcn-svelte               | `/llmstxt/shadcn-svelte_llms_txt`    | UI components, CLI, Bits UI                                     |
| Tailwind CSS v4             | `/websites/tailwindcss`              | Utility classes, CSS variables                                  |
| jose (JWT)                  | `/panva/jose`                        | JWT sign/verify, HS256                                          |
| Paraglide JS                | `/opral/paraglide-js`                | i18n message functions, locale strategy                         |
| bits-ui                     | `/llmstxt/bits-ui_llms_txt`          | Headless primitives (Popover, Dialog, Command, etc.)            |
| shadcn-svelte-extras        | `/ieedan/shadcn-svelte-extras`       | CopyButton, LanguageSwitcher, PhoneInput — installed via jsrepo |

---

## Tech Stack

- **Framework**: SvelteKit (Svelte 5 with Runes) via Vite
- **Runtime**: Bun (via `svelte-adapter-bun`)
- **UI**: shadcn-svelte + Tailwind CSS v4
- **Auth**: Better Auth (SMS OTP via Prelude Verify, email OTP fallback)
- **ORM**: Drizzle ORM — SQLite (`bun:sqlite`, WAL mode, foreign keys ON) or PostgreSQL (`bun:sql`), selected via `DB_PROVIDER`
- **Database**: SQLite (default) or PostgreSQL — `better-sqlite3` as devDependency for Drizzle Kit SQLite migrations; local PG via `docker compose up -d`
- **i18n**: Paraglide JS v2 (EN, PT, NL, DE) — translation files in `messages/`, generated output in `src/lib/paraglide/` (gitignored)
- **QR**: jose (JWT HS256) + qrcode (client-side generation)

## Key Conventions

- **Bun over Node.js**: Use `bun`, `bun run`, `bun test`, `bunx` for everything
- **Vite scripts use `bunx --bun`**: Required so `bun:sqlite` imports resolve at build time
- **Bun loads `.env` automatically**: Don't use dotenv
- **`DB_PROVIDER`**: Set to `sqlite` (default) or `pg`; controls which driver and schema module are loaded at runtime
- **Balance is always computed from the ledger** — never stored
- **Amounts are integers** (cents/smallest unit) — `formatAmount()` handles display
- **Connections are implicit** — upserted on transaction settlement, no friend management UI
- **Atomic settlement**: Insert transaction + update QR status + upsert connection in one database transaction (SQLite or PG)
- **Real-time updates via SSE + Web Push** — `/api/events` streams notifications to open tabs; `web-push` (VAPID) delivers to backgrounded PWA users. Dedup via `SeenEventIds` FIFO set in the client.
- **Keep README.md in sync**: When changing the tech stack, project structure, scripts, or configuration, update `README.md` to reflect the change.

## Git Workflow

- **Always work on a branch** — never commit directly to `main`. Create a branch, open a PR, and let CI pass before merging.

## Code Quality

- **Run `bun install` first** — the pre-commit hook is registered by `bun install` via `bun-git-hooks`. Without it, linting won't run and the hook may not be present.
- **Generate Paraglide output before type-checking** — `src/lib/paraglide/` is gitignored and must exist before `svelte-check` runs. The pre-commit hook generates it automatically via `bun run check`, but if you run `svelte-check` directly on a fresh clone you need `bun run dev` or `bun run build` first.
- **Pre-commit hook** runs via `bun-git-hooks` (installed by `bun install`). Staged-lint rules:
  - `*` → `bun run format` (Prettier)
  - `**/*.{js,ts}` → `bun run lint:fix` then `bun run check` (Prettier + ESLint + svelte-check)
  - To skip: `SKIP_BUN_GIT_HOOKS=1 git commit`
- **Before submitting code**, run `bun run format` then `bun run lint` to catch any remaining issues.

## Scripts

| Command                      | Description                              |
| ---------------------------- | ---------------------------------------- |
| `bun run dev`                | Start dev server (Vite + Bun)            |
| `bun run build`              | Production build                         |
| `bun run check`              | Type-check (svelte-check)                |
| `bun run lint`               | Prettier + ESLint                        |
| `bun run format`             | Auto-format                              |
| `bun test`                   | Run tests                                |
| `bun run db:generate:sqlite` | Generate Drizzle migration (SQLite)      |
| `bun run db:generate:pg`     | Generate Drizzle migration (PostgreSQL)  |
| `bun run db:migrate`         | Apply migrations (honours `DB_PROVIDER`) |
| `bun run db:push:pg`         | Push schema to local PG (no migration)   |
| `bun run db:seed`            | Seed test data (3 users, 2 transactions) |
| `docker compose up -d`       | Start local PostgreSQL container         |
| `bun run generate-secret`    | Generate secure QR_JWT_SECRET            |

## Testing

**Approach**: TDD + BDD-style naming (`describe`/`it`, nested Given-When-Then) — tests are the spec.

**Layers**: unit (`foo.test.ts` co-located) → integration (`tests/integration/`) → E2E (`e2e/`).

```ts
import { describe, it, expect } from 'vitest';
```

## E2E Testing (Playwright)

Run with: `bunx playwright test` (starts dev server automatically).

**Always use subagents for Playwright browser inspection** — Playwright MCP tools are context-heavy.

**Always use subagents for writing or editing E2E tests** — Playwright test files are context-heavy and burn tokens quickly in the main conversation.

### Key patterns

- **Hydration**: Use `goto()` from `e2e/test-utils.ts` instead of `page.goto()` — waits for `body.hydrated` before returning. bits-ui components aren't active until hydration completes.
- **bits-ui portals**: Wait for portal content to mount after clicking a trigger (e.g. `await expect(page.getByRole('menu')).toBeVisible()`) before asserting on items inside.
- **Do NOT** add `reducedMotion: 'reduce'` to playwright.config.ts — breaks bits-ui portal mounting.
- **Thread safety**: Tests run in parallel locally (`fullyParallel: true`). Use the `email` fixture (from `e2e/test-utils.ts`) in all test files — it derives unique addresses from the test filename, making collisions impossible: `email('sender')` → `e2e-{filename}-sender@test.example`. Never add shared email exports to `test-utils.ts`.

## Key Files

- `src/lib/config.ts` — All env-var configuration (lazy getters), including `dbProvider`
- `src/lib/server/schema.ts` — Re-exports the active schema (delegates to `schema.sqlite.ts` or `schema.pg.ts`)
- `src/lib/server/schema.sqlite.ts` — Drizzle schema for SQLite (user, session, account, verification, appUsers, transactions, pendingQr, connections)
- `src/lib/server/schema.pg.ts` — Drizzle schema for PostgreSQL (same tables, PG types)
- `src/lib/server/db.ts` — Drizzle db instance (delegates to `db.sqlite.ts` or `db.pg.ts` based on `DB_PROVIDER`)
- `src/lib/server/db.sqlite.ts` — SQLite driver setup (`bun:sqlite`, WAL mode)
- `src/lib/server/db.pg.ts` — PostgreSQL driver setup (`bun:sql`)
- `drizzle.config.sqlite.ts` / `drizzle.config.pg.ts` — Drizzle Kit configs per provider
- `docker-compose.yml` — Local PostgreSQL container
- `src/lib/server/auth.ts` — Better Auth server setup
- `src/lib/server/balance.ts` — `getBalance`, `formatAmount`, `getConnections`, `upsertConnection`
- `src/lib/server/qr.ts` — JWT sign/verify/buildUrl with jose
- `src/lib/notifications.ts` — Typed `NotificationEvent` union, `SeenEventIds` dedup, `handleNotificationEvent` dispatcher
- `src/lib/sse-client.ts` — `SseManager` singleton: SSE connection + SW message bridge
- `src/lib/sw-router.ts` — Push routing: focused window → postMessage, else → OS notification
- `src/lib/server/sse-registry.ts` — In-memory per-user SSE controller registry + `emit()`
- `src/lib/server/push-sender.ts` — Best-effort Web Push delivery, stale sub cleanup
- `messages/` — EN/PT/NL translation JSON files (Paraglide source)
- `src/lib/paraglide/` — Generated Paraglide runtime (gitignored; regenerated by Vite plugin on dev/build)
- `project.inlang/settings.json` — Paraglide project config (locales, base locale)
- `src/hooks.server.ts` — Auth session resolution, appUser lookup
- `src/routes/onboarding/` — 9-step onboarding flow
- `src/routes/(app)/` — Authenticated app screens (home, send, receive, history, settings)
- `src/routes/accept/[token]/` — QR acceptance screen
