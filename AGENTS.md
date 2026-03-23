# Mutuvia — Agent Instructions

> Mutual credit app for small communities. See [ROADMAP.md](ROADMAP.md) for what's done, what's next, and what's deferred.

## Context7 Library IDs

Use these with `mcp__context7__query-docs` for up-to-date documentation:

| Library | Context7 ID | Notes |
|---|---|---|
| SvelteKit / Svelte 5 | `/sveltejs/svelte` | Runes, components, routing |
| Svelte Docs (comprehensive) | `/websites/svelte_dev` | 8203 snippets, tutorials + reference |
| Drizzle ORM | `/llmstxt/orm_drizzle_team_llms_txt` | SQLite schema, migrations, queries |
| Better Auth | `/llmstxt/better-auth_llms_txt` | Phone OTP, email OTP, Drizzle adapter |
| shadcn-svelte | `/llmstxt/shadcn-svelte_llms_txt` | UI components, CLI, Bits UI |
| Tailwind CSS v4 | `/websites/tailwindcss` | Utility classes, CSS variables |
| jose (JWT) | `/panva/jose` | JWT sign/verify, HS256 |

---

## Tech Stack

- **Framework**: SvelteKit (Svelte 5 with Runes) via Vite
- **Runtime**: Bun (via `svelte-adapter-bun`)
- **UI**: shadcn-svelte + Tailwind CSS v4
- **Auth**: Better Auth (SMS OTP via Twilio, email OTP fallback)
- **ORM**: Drizzle ORM with `bun:sqlite` (WAL mode, foreign keys ON)
- **Database**: SQLite — `better-sqlite3` as devDependency for Drizzle Kit migrations
- **i18n**: Custom store-based (EN, PT, NL) in `src/lib/i18n/`
- **QR**: jose (JWT HS256) + qrcode (client-side generation)

## Key Conventions

- **Bun over Node.js**: Use `bun`, `bun run`, `bun test`, `bunx` for everything
- **Vite scripts use `bunx --bun`**: Required so `bun:sqlite` imports resolve at build time
- **Bun loads `.env` automatically**: Don't use dotenv
- **Balance is always computed from the ledger** — never stored
- **Amounts are integers** (cents/smallest unit) — `formatAmount()` handles display
- **Connections are implicit** — upserted on transaction settlement, no friend management UI
- **Atomic settlement**: Insert transaction + update QR status + upsert connection in one SQLite transaction
- **QR flow uses polling** (2s interval via `/api/qr-status/[id]`), not SSE

## Scripts

| Command | Description |
|---|---|
| `bun run dev` | Start dev server (Vite + Bun) |
| `bun run build` | Production build |
| `bun run check` | Type-check (svelte-check) |
| `bun run lint` | Prettier + ESLint |
| `bun run format` | Auto-format |
| `bun test` | Run tests |
| `bun run db:generate` | Generate Drizzle migration |
| `bun run db:migrate` | Apply migrations |
| `bun run db:seed` | Seed test data (3 users, 2 transactions) |

## Testing

```ts
import { test, expect } from "bun:test";
```

## Key Files

- `src/lib/config.ts` — All env-var configuration (lazy getters)
- `src/lib/server/schema.ts` — Drizzle schema (user, session, account, verification, appUsers, transactions, pendingQr, connections)
- `src/lib/server/auth.ts` — Better Auth server setup
- `src/lib/server/balance.ts` — `getBalance`, `formatAmount`, `getConnections`, `upsertConnection`
- `src/lib/server/qr.ts` — JWT sign/verify/buildUrl with jose
- `src/lib/i18n/` — i18n store + EN/PT/NL translations
- `src/hooks.server.ts` — Auth session resolution, appUser lookup
- `src/routes/onboarding/` — 9-step onboarding flow
- `src/routes/(app)/` — Authenticated app screens (home, send, receive, history, settings)
- `src/routes/accept/[token]/` — QR acceptance screen
