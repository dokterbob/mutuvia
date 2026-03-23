# Mutuvia

> *Together, we are more.* Mutual credit for the rest of us.

A minimal mutual credit app for small communities. Members send and receive credit obligations denominated in a configurable unit. No real money transfers — the ledger records mutual debts. Mobile-first, bilingual (EN / PT / NL), privacy-respecting.

**The FOSS package is named *Mutuvia*. Any community deploying it may rebrand freely** via the `APP_NAME` and `APP_TAGLINE` environment variables.

---

## Quick Start

```bash
# Install dependencies
bun install

# Set up environment
cp .env.example .env
# Edit .env — at minimum set QR_JWT_SECRET (32+ chars)

# Run database migration
bun run db:migrate

# (Optional) Seed test data: 3 users, 2 transactions
bun run db:seed

# Start dev server
bun run dev
```

Open [http://localhost:5173](http://localhost:5173).

In development, SMS and email OTP codes are logged to the console (no Twilio credentials needed).

---

## Tech Stack

| Layer | Choice |
|---|---|
| Framework | SvelteKit (Svelte 5 with Runes) |
| Runtime | Bun (via svelte-adapter-bun) |
| UI | shadcn-svelte + Tailwind CSS v4 |
| Auth | Better Auth (SMS OTP via Twilio, email OTP fallback) |
| ORM | Drizzle ORM |
| Database | SQLite (WAL mode, via bun:sqlite) |
| i18n | Custom store-based (EN, PT, NL) |
| QR | jose (JWT) + qrcode |

---

## Scripts

| Command | Description |
|---|---|
| `bun run dev` | Start development server |
| `bun run build` | Production build |
| `bun run preview` | Preview production build |
| `bun run check` | Type-check (svelte-check) |
| `bun run lint` | Prettier + ESLint |
| `bun run format` | Auto-format |
| `bun test` | Run tests |
| `bun run db:generate` | Generate Drizzle migration |
| `bun run db:migrate` | Apply migrations (bun:sqlite) |
| `bun run db:seed` | Seed test data |

---

## Configuration

All values in `.env`. See [`.env.example`](.env.example) for full documentation.

Key settings for rebranding:
- `PUBLIC_APP_NAME` — Display name (default: `Mutuvia`)
- `PUBLIC_APP_TAGLINE` — Displayed tagline fallback (localized via i18n)
- `PUBLIC_UNIT_SYMBOL` / `UNIT_CODE` / `PUBLIC_UNIT_DISPLAY_NAME` — Currency unit

---

## Project Structure

```
src/
├── hooks.server.ts          # Auth session resolution
├── lib/
│   ├── auth-client.ts       # Better Auth client (phone + email OTP)
│   ├── config.ts            # Env-var config
│   ├── i18n/                # EN, PT, NL translations
│   ├── server/
│   │   ├── auth.ts          # Better Auth server setup
│   │   ├── balance.ts       # Balance computation, formatAmount, connections
│   │   ├── db.ts            # Drizzle + bun:sqlite
│   │   ├── qr.ts            # JWT sign/verify (jose)
│   │   └── schema.ts        # Full Drizzle schema
│   └── components/ui/       # shadcn-svelte components
├── routes/
│   ├── onboarding/          # 9-step onboarding flow
│   ├── (app)/
│   │   ├── home/            # Balance card, recent transactions
│   │   ├── send/            # Send flow with QR
│   │   ├── receive/         # Receive flow with QR
│   │   ├── history/         # Transaction history
│   │   └── settings/        # Display name, language, sign out
│   ├── accept/[token]/      # QR acceptance screen
│   └── api/qr-status/[id]/  # Polling endpoint
scripts/
├── migrate.ts               # DB migration runner
└── seed.ts                  # Test data seeder
```

---

## Roadmap

See [ROADMAP.md](ROADMAP.md) for the full roadmap. Highlights:

- **Polish & harden** — Theme pass, unit tests, security audit, accessibility
- **Circular debt netting** — Cancel circular debts in one move (top community request)
- **Passkeys** — Biometric sign-in once friction reduction proves valuable
- **Invitation system** — Invite by phone/email, building on the implicit connections graph
- **Trusted contacts** — Skip QR for known members
- **Admin panel** — Member management, transaction oversight

---

## License

[AGPL-3.0](LICENSE). Any community may deploy and rebrand freely under AGPL terms. Changes that affect user data or credits must be made available to users.
