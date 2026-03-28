# Mutuvia

> _Together, we are more._ Mutual credit for the rest of us.

A minimal mutual credit app for small communities. Members send and receive credit obligations denominated in a configurable unit. No real money transfers — the ledger records mutual debts. Mobile-first, bilingual (EN / PT / NL), privacy-respecting.

**The FOSS package is named _Mutuvia_. Any community deploying it may rebrand freely** via the `APP_NAME` and `APP_TAGLINE` environment variables.

---

## Quick Start

```bash
# Install dependencies (also installs the pre-commit format hook)
bun install

# Set up environment
cp .env.example .env
# Generate a secure QR_JWT_SECRET and add it to .env:
echo "QR_JWT_SECRET=$(bun run generate-secret)" >> .env

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

## Deployment (Docker Compose)

Two deployment profiles are available. Choose **SQLite** for simplicity (single node, data in a volume) or **PostgreSQL** for scalability.

### Quick start

```bash
# 1. Create your .env from the template
cp .env.docker.example .env
# Edit .env — set APP_URL, and generate secrets:
#   bun run generate-secret  # paste output into QR_JWT_SECRET and BETTER_AUTH_SECRET

# 2a. SQLite deployment
docker compose --profile sqlite up -d

# 2b. PostgreSQL deployment (also set POSTGRES_PASSWORD in .env)
docker compose --profile postgres up -d
```

**Migrations run automatically on startup.** The container is safe to restart or redeploy.

The server listens on port `3000` by default. Override with `PORT=<port>` in `.env`.

### SQLite

Data is stored in `/data/sqlite.db` inside the container, backed by a named Docker volume (`sqlite-data`). No extra services required.

```bash
docker compose --profile sqlite up -d
```

### PostgreSQL

Starts the app and a managed Postgres 17 container. The app waits for Postgres to be healthy before starting.

```bash
# Set POSTGRES_PASSWORD in .env (defaults to 'mutuvia' if unset — change in production)
docker compose --profile postgres up -d
```

### Environment variables

| Variable                   | Required | Default                  | Description                                          |
| -------------------------- | -------- | ------------------------ | ---------------------------------------------------- |
| `QR_JWT_SECRET`            | **Yes**  | —                        | Min 32 chars. Signs QR JWT tokens.                   |
| `BETTER_AUTH_SECRET`       | **Yes**  | —                        | Min 32 chars. Signs Better Auth sessions.            |
| `APP_URL`                  | **Yes**  | `http://localhost:5173`  | Public base URL. Used in QR links.                   |
| `BETTER_AUTH_URL`          | **Yes**  | —                        | Same as `APP_URL`. Required by Better Auth.          |
| `POSTGRES_PASSWORD`        | PG only  | `mutuvia`                | Postgres password. Change in production.             |
| `TWILIO_ACCOUNT_SID`       | Prod     | —                        | SMS OTP delivery. Omit in dev — OTPs log to console. |
| `TWILIO_AUTH_TOKEN`        | Prod     | —                        | Twilio auth token.                                   |
| `TWILIO_PHONE_NUMBER`      | Prod     | —                        | Sender number in E.164 format (`+15550001234`).      |
| `DB_FILE_NAME`             | No       | `/data/sqlite.db`        | SQLite file path inside the container.               |
| `PORT`                     | No       | `3000`                   | Server listen port.                                  |
| `PUBLIC_APP_NAME`          | No       | `Mutuvia`                | Display name for rebranding.                         |
| `PUBLIC_APP_TAGLINE`       | No       | `Together, we are more.` | Tagline fallback (localized via i18n).               |
| `UNIT_CODE`                | No       | `EUR`                    | ISO 4217 code or custom unit identifier.             |
| `PUBLIC_UNIT_SYMBOL`       | No       | `€`                      | Displayed unit symbol.                               |
| `PUBLIC_UNIT_DISPLAY_NAME` | No       | `euro`                   | Lowercase singular name for the unit.                |
| `UNIT_DECIMAL_PLACES`      | No       | `2`                      | Decimal places used by `formatAmount()`.             |
| `QR_TTL_SECONDS`           | No       | `600`                    | QR token validity window in seconds.                 |
| `PUBLIC_COMMUNITY_DOC_URL` | No       | —                        | URL linked in Settings → About.                      |

---

## Tech Stack

| Layer         | Choice                                                                          |
| ------------- | ------------------------------------------------------------------------------- |
| Framework     | SvelteKit (Svelte 5 with Runes)                                                 |
| Runtime       | Bun (via svelte-adapter-bun)                                                    |
| UI            | shadcn-svelte + Tailwind CSS v4                                                 |
| Auth          | Better Auth (SMS OTP via Twilio, email OTP fallback)                            |
| ORM           | Drizzle ORM                                                                     |
| Database      | SQLite (default, WAL mode, via bun:sqlite) or PostgreSQL (via `DB_PROVIDER=pg`) |
| i18n          | Paraglide JS v2 (EN, PT, NL)                                                    |
| QR            | jose (JWT) + qrcode                                                             |
| Observability | Sentry (optional — error tracking + feedback widget)                            |
| PWA           | vite-plugin-pwa (`@vite-pwa/sveltekit`) — installable, offline fallback page    |

---

## Scripts

| Command                      | Description                              |
| ---------------------------- | ---------------------------------------- |
| `bun run dev`                | Start development server                 |
| `bun run build`              | Production build                         |
| `bun run preview`            | Preview production build                 |
| `bun run check`              | Type-check (svelte-check)                |
| `bun run lint`               | Prettier + ESLint                        |
| `bun run format`             | Auto-format                              |
| `bun test`                   | Run tests                                |
| `bun run db:generate:sqlite` | Generate Drizzle migration (SQLite)      |
| `bun run db:generate:pg`     | Generate Drizzle migration (PostgreSQL)  |
| `bun run db:migrate`         | Apply migrations (honours `DB_PROVIDER`) |
| `bun run db:push:pg`         | Push schema to local PG (no migration)   |
| `bun run db:seed`            | Seed test data                           |
| `bun run generate-secret`    | Generate a secure QR_JWT_SECRET          |

---

## Configuration

All values in `.env`. See [`.env.example`](.env.example) for full documentation.

Key settings for rebranding:

- `PUBLIC_APP_NAME` — Display name (default: `Mutuvia`)
- `PUBLIC_APP_TAGLINE` — Displayed tagline fallback (localized via i18n)
- `PUBLIC_UNIT_SYMBOL` / `UNIT_CODE` / `PUBLIC_UNIT_DISPLAY_NAME` — Currency unit

### Database provider

- `DB_PROVIDER` — `sqlite` (default) or `pg`

### PostgreSQL (local development)

```bash
# Start a local PostgreSQL container on port 5432
docker compose --profile dev up -d

# Set in .env:
DB_PROVIDER=pg
DATABASE_URL=postgres://mutuvia:mutuvia@localhost:5432/mutuvia

# Push schema (no migration file needed for local dev)
bun run db:push:pg

# Or generate + apply a migration
bun run db:generate:pg
DB_PROVIDER=pg bun run db:migrate
```

---

## Project Structure

```
messages/
├── en.json                  # English translations
├── pt.json                  # Portuguese translations
└── nl.json                  # Dutch translations
src/
├── hooks.server.ts          # i18n locale resolution + auth session
├── lib/
│   ├── auth-client.ts       # Better Auth client (phone + email OTP)
│   ├── config.ts            # Env-var config
│   ├── paraglide/           # Generated Paraglide runtime (gitignored)
│   ├── server/
│   │   ├── auth.ts          # Better Auth server setup
│   │   ├── balance.ts       # Balance computation, formatAmount, connections
│   │   ├── db.ts            # Drizzle db instance (delegates to db.sqlite or db.pg)
│   │   ├── db.sqlite.ts     # SQLite driver (bun:sqlite, WAL mode)
│   │   ├── db.pg.ts         # PostgreSQL driver (bun:sql)
│   │   ├── qr.ts            # JWT sign/verify (jose)
│   │   ├── schema.ts        # Re-exports active schema
│   │   ├── schema.sqlite.ts # Drizzle schema for SQLite
│   │   └── schema.pg.ts     # Drizzle schema for PostgreSQL
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
├── migrate.ts               # DB migration runner (SQLite + PG)
└── seed.ts                  # Test data seeder
drizzle.config.sqlite.ts     # Drizzle Kit config for SQLite
drizzle.config.pg.ts         # Drizzle Kit config for PostgreSQL
docker-compose.yml           # Local PostgreSQL container
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
