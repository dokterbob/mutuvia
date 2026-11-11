# Mutuvia

> _Together, we are more._ Mutual credit for the rest of us.

A minimal mutual credit app for small communities. Members send and receive credit obligations denominated in a configurable unit. No real money transfers — the ledger records mutual debts. Mobile-first, multilingual (EN / PT / NL / DE / ES), privacy-respecting.

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

With the default `.env.example` (`DEV_LOG_OTP=true`), SMS and email OTP codes are logged to the console — no Prelude or SMTP credentials needed.

---

## Deployment (Docker Compose)

Two deployment profiles are available. Choose **SQLite** for simplicity (single node, data in a volume) or **PostgreSQL** for scalability.

### Quick start

```bash
# 1. Create your .env from the template
cp .env.docker.example .env
# Edit .env — generate secrets:
#   bun run generate-secret  # paste output into QR_JWT_SECRET and BETTER_AUTH_SECRET
# Set APP_URL if deploying to a fixed domain; omit for Render (auto-detected).
# Also set PRELUDE_API_TOKEN or SMTP_HOST — the app refuses to start in
# production with neither configured.

# 2a. SQLite deployment
docker compose --profile sqlite up -d

# 2b. PostgreSQL deployment (also set DATABASE_URL and POSTGRES_PASSWORD in .env)
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
# Set DATABASE_URL and POSTGRES_PASSWORD in .env (must use the same password — see .env.docker.example)
docker compose --profile postgres up -d
```

### Environment variables

`APP_URL` only controls what the **app** builds (QR links, cookie security, trusted origins) — it does not change how the underlying server sees incoming requests. Auth routes (`/api/auth/*`) match on request path regardless of host, so they work the same whether you access the app via `APP_URL`'s domain, a LAN IP, or `localhost:<port>` directly. If you put a reverse proxy in front that terminates TLS, set `ORIGIN` (and/or `PROTOCOL_HEADER`/`HOST_HEADER`, read by `svelte-adapter-bun`) so the app knows the real public origin for anything that does depend on it — this affects `svelte-adapter-bun`'s own request handling, separate from `APP_URL`. The mismatch cuts both ways: an https `APP_URL` makes session cookies always `Secure`, so if browsers actually reach this server over plain http (TLS termination missing or misconfigured in front of it), the browser silently drops the cookie and sign-in loops forever with no error. A full deployment/reverse-proxy guide is coming in a later PR.

| Variable                       | Required | Default                            | Description                                                                                                                                                                                                                                                                       |
| ------------------------------ | -------- | ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `QR_JWT_SECRET`                | **Yes**  | —                                  | Min 32 chars. Signs QR JWT tokens.                                                                                                                                                                                                                                                |
| `BETTER_AUTH_SECRET`           | **Yes**  | —                                  | Min 32 chars. Signs Better Auth sessions.                                                                                                                                                                                                                                         |
| `APP_URL`                      | No       | auto-detected                      | Public base URL. Used in QR links and auth. On Render, falls back to `RENDER_EXTERNAL_URL`. In dev, falls back to the Vite server's network URL (LAN IP when `--host` is used).                                                                                                   |
| `PORT`                         | No       | `3000`                             | Server listen port.                                                                                                                                                                                                                                                               |
| `PUBLIC_APP_NAME`              | No       | `Mutuvia`                          | Display name for rebranding.                                                                                                                                                                                                                                                      |
| `PUBLIC_APP_TAGLINE`           | No       | `Together, we are more.`           | Tagline fallback (localized via i18n).                                                                                                                                                                                                                                            |
| `PUBLIC_COMMUNITY_DOC_URL`     | No       | —                                  | URL linked in Settings → About.                                                                                                                                                                                                                                                   |
| `DB_PROVIDER`                  | No       | `sqlite`                           | Database backend: `sqlite` or `pg`.                                                                                                                                                                                                                                               |
| `DB_FILE_NAME`                 | No       | `sqlite.db`                        | SQLite file path.                                                                                                                                                                                                                                                                 |
| `DATABASE_URL`                 | PG only  | —                                  | Full PostgreSQL connection URL including password.                                                                                                                                                                                                                                |
| `POSTGRES_PASSWORD`            | PG only  | `mutuvia`                          | Docker only: initialises the managed postgres container. Must match the password in `DATABASE_URL`.                                                                                                                                                                               |
| `UNIT_CODE`                    | No       | `EUR`                              | ISO 4217 code or custom unit identifier.                                                                                                                                                                                                                                          |
| `PUBLIC_UNIT_SYMBOL`           | No       | `€`                                | Displayed unit symbol.                                                                                                                                                                                                                                                            |
| `PUBLIC_UNIT_DISPLAY_NAME`     | No       | `euro`                             | Lowercase singular name for the unit.                                                                                                                                                                                                                                             |
| `QR_TTL_SECONDS`               | No       | `259200`                           | QR token validity window in seconds (default: 3 days).                                                                                                                                                                                                                            |
| `EXPIRED_QR_RETENTION_SECONDS` | No       | `259200`                           | How long expired QR records are kept before cleanup (default: 3 days).                                                                                                                                                                                                            |
| `MAX_TRANSACTION_AMOUNT`       | No       | `100000000`                        | Sanity bound on a single transaction's amount, in minor units (cents). Not a credit limit — only rejects fat-fingered or malicious amounts before they reach the ledger. Must not exceed `2147483647` (PostgreSQL `integer` max; ledger columns are `integer` on both providers). |
| `DEV_LOG_OTP`                  | No       | `false`                            | Prints OTPs to the console instead of sending them. Defaults off; set to `true` for local dev. Allowed in production (e.g. temporary debugging) but logs a loud startup warning and does **not** count as a configured delivery channel below.                                    |
| `PRELUDE_API_TOKEN`            | Prod     | —                                  | SMS OTP delivery via Prelude Verify. At least one of this or `SMTP_HOST` is required in production — the app refuses to start otherwise. Omit in dev — set `DEV_LOG_OTP=true` to see OTPs in the console.                                                                         |
| `SMTP_HOST`                    | Prod     | —                                  | SMTP server for email OTP. Works with any provider (Resend, Brevo, SES, etc.). Omit in dev — set `DEV_LOG_OTP=true` to see OTPs in the console.                                                                                                                                   |
| `SMTP_PORT`                    | No       | `587`                              | SMTP port (`587` for STARTTLS, `465` for implicit TLS).                                                                                                                                                                                                                           |
| `SMTP_SECURE`                  | No       | `false`                            | Set `true` for port 465 (implicit TLS); `false` uses STARTTLS.                                                                                                                                                                                                                    |
| `SMTP_USER`                    | No       | —                                  | SMTP username (required when your provider needs auth).                                                                                                                                                                                                                           |
| `SMTP_PASS`                    | No       | —                                  | SMTP password. Must be set together with `SMTP_USER`.                                                                                                                                                                                                                             |
| `SMTP_FROM`                    | No       | `{APP_NAME} <noreply@example.com>` | Sender address for OTP emails.                                                                                                                                                                                                                                                    |
| `PUBLIC_VAPID_KEY`             | Push     | —                                  | VAPID public key for Web Push. Generate with `bunx web-push generate-vapid-keys`. Required for push notifications to backgrounded PWA users.                                                                                                                                      |
| `PRIVATE_VAPID_KEY`            | Push     | —                                  | VAPID private key for Web Push.                                                                                                                                                                                                                                                   |
| `VAPID_SUBJECT`                | No       | `mailto:admin@example.com`         | VAPID contact URL (`mailto:` or `https:`).                                                                                                                                                                                                                                        |
| `PUSH_ENDPOINT_EXTRA_HOSTS`    | No       | —                                  | Comma-separated extra push-endpoint hosts to allow beyond the built-in browser vendor allowlist (`fcm.googleapis.com`, `updates.push.services.mozilla.com`, `*.push.apple.com`, `*.notify.windows.com`). Each entry is an exact host or `*.suffix`.                               |
| `ANDROID_PACKAGE_NAME`         | Android  | `org.mutuvia.app`                  | Android `applicationId` served in `/.well-known/assetlinks.json`.                                                                                                                                                                                                                 |
| `ANDROID_SHA256_FINGERPRINTS`  | Android  | —                                  | Comma-separated SHA-256 fingerprints of the APK signing certificate; serves `/.well-known/assetlinks.json`.                                                                                                                                                                       |
| `PUBLIC_SENTRY_DSN`            | No       | —                                  | Sentry DSN. Set to enable error tracking and the feedback widget.                                                                                                                                                                                                                 |
| `SENTRY_AUTH_TOKEN`            | CI       | —                                  | Sentry auth token for source map uploads. Only needed in CI builds.                                                                                                                                                                                                               |
| `SENTRY_ORG`                   | CI       | —                                  | Sentry organisation slug. Only needed in CI builds.                                                                                                                                                                                                                               |
| `SENTRY_PROJECT`               | CI       | —                                  | Sentry project slug. Only needed in CI builds.                                                                                                                                                                                                                                    |

### Bun adapter patch

Production builds depend on a local patch to `svelte-adapter-bun`,
[`patches/svelte-adapter-bun@1.0.1.patch`](patches/svelte-adapter-bun@1.0.1.patch), applied
automatically by `bun install` (`patchedDependencies` in `package.json`). **Do not remove it, and
re-create it whenever the adapter version changes.**

- **What it fixes:** the adapter re-bundles the server with rolldown but doesn't set `platform`,
  so rolldown defaults to the _browser_ platform. That resolves `@better-auth/core`'s
  `./async_hooks` export through its `browser` condition to a polyfill holding a single global
  "current request" slot instead of Node's `AsyncLocalStorage`. Concurrent requests then overwrite
  each other's auth request state and randomly fail with HTTP 500
  (`No request state found … within a runWithRequestState callback`). `bun run dev` is unaffected,
  since Vite keeps `better-auth` external there; only built servers (Docker, `bun run build`) are.
- **The patch:** one token in `dist/index.js`, `platform: "node"` on the rolldown call.
- **Guard:** `bun run build` ends with `scripts/check-server-bundle.ts`, which fails the build if
  the polyfill shows up in `build/server`. Bun only applies a patch to the exact version it names,
  so a version bump (e.g. a Dependabot PR) silently drops it; this check then fails CI instead of
  shipping the bug.
- **Bumping the adapter:** `bun patch svelte-adapter-bun`, re-apply the change in
  `node_modules/svelte-adapter-bun/dist/index.js`, then `bun patch --commit node_modules/svelte-adapter-bun`.
  Upgrading alone doesn't help: 1.0.2 has the same rolldown call.
- **Long term:** `svelte-adapter-bun` is deprecated in favour of the official
  `@sveltejs/adapter-bun`, which requires SvelteKit 3. Moving to it removes the need for this patch.

---

## Android app

An Android app lives under [`android/`](android/): a Trusted Web Activity that opens your deployment full-screen in Chrome, so Web Push, the camera scanner and sharing keep working.

- **Download**: `mutuvia-v<version>.apk` (plus a `.sha256` checksum) on the [GitHub Releases](https://github.com/dokterbob/mutuvia/releases) page. Allow "Install unknown apps" for your browser or file manager.
- **Your deployment must serve Digital Asset Links** at `/.well-known/assetlinks.json`, otherwise the app shows a URL bar. Set `ANDROID_PACKAGE_NAME` and `ANDROID_SHA256_FINGERPRINTS` (see the table above).
- **Per-community builds** (own host, name, signing key) are built with Gradle properties; the release workflow is `.github/workflows/android.yml`.

Setup, release procedure, key custody and troubleshooting: [docs/android.md](docs/android.md).

---

## Tech Stack

| Layer         | Choice                                                                          |
| ------------- | ------------------------------------------------------------------------------- |
| Framework     | SvelteKit (Svelte 5 with Runes)                                                 |
| Runtime       | Bun (via svelte-adapter-bun)                                                    |
| UI            | shadcn-svelte + Tailwind CSS v4                                                 |
| Auth          | Better Auth (SMS OTP via Prelude Verify, email OTP via SMTP)                    |
| ORM           | Drizzle ORM                                                                     |
| Database      | SQLite (default, WAL mode, via bun:sqlite) or PostgreSQL (via `DB_PROVIDER=pg`) |
| i18n          | Paraglide JS v2 (EN, PT, NL, DE, ES)                                            |
| QR            | jose (JWT) + qrcode                                                             |
| Realtime      | SSE (server-sent events) + Web Push (`web-push`, VAPID)                         |
| Observability | Sentry (optional — error tracking + feedback widget)                            |
| PWA           | vite-plugin-pwa (`@vite-pwa/sveltekit`) — installable, offline fallback page    |

---

## Scripts

| Command                      | Description                              |
| ---------------------------- | ---------------------------------------- |
| `bun run dev`                | Start development server                 |
| `bun run build`              | Production build (+ server-bundle check) |
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

### Upgrading to unique `user.email` / `user.phone_number`

A migration adds unique indexes on `user.email` and `user.phone_number`
(closing an account-takeover path where an attacker could pre-claim another
person's phone number). Both columns stay nullable — NULL never conflicts
with another NULL on either engine — but if your database already has
duplicate non-null values, the migration fails loudly (a clear "UNIQUE
constraint failed" / "could not create unique index" error) rather than
silently dropping or merging rows. Check for duplicates **before**
upgrading:

```sql
-- Same SQL on SQLite and PostgreSQL
SELECT phone_number, COUNT(*) FROM "user"
WHERE phone_number IS NOT NULL GROUP BY phone_number HAVING COUNT(*) > 1;

SELECT email, COUNT(*) FROM "user"
WHERE email IS NOT NULL GROUP BY email HAVING COUNT(*) > 1;
```

If either query returns rows, resolve the duplicates manually first (there
is no safe automatic merge — decide per case which account is real, migrate
its data via `app_users`/`connections`/`transactions`, then null out or
change the losing account's duplicate credential) before running
`bun run db:migrate`.

### Stale placeholder emails from phone number changes

Phone-only sign-ups get a deterministic placeholder email
(`<digits>@phone.placeholder`, see `src/lib/placeholder-email.ts`). Before
the fix shipped alongside the unique indexes above, changing phone number
from Settings updated only `phone_number` — the OLD placeholder stayed on
the row, silently reserving the OLD number forever (anyone who later
verified that released number would collide with it on the unique
`user_email_idx`). The settings phone-change feature predates the unique
indexes, so **any database that had the phone-change feature before this
fix can already have stale rows** — check with the detection query below.
The fix itself keeps every placeholder in sync going forward; this is only
needed to clean up rows that went stale before it existed.

```sql
-- Same SQL on SQLite and PostgreSQL — phone numbers are stored in E.164
-- format (a leading "+" then digits only), so stripping the "+" is
-- equivalent to makePlaceholderEmail's digit-stripping.
SELECT id, email, phone_number FROM "user"
WHERE email LIKE '%@phone.placeholder'
  AND (phone_number IS NULL OR email <> (substr(phone_number, 2) || '@phone.placeholder'));
```

Repair each returned row by setting
`email = substr(phone_number, 2) || '@phone.placeholder'` (or, if
`phone_number` is now `NULL`, resolving it the same manual way as a
duplicate credential above) — checking first that the target value isn't
already in use by another row, since that would just move the collision.

---

## Project Structure

```
messages/
├── en.json                  # English translations
├── pt.json                  # Portuguese translations
├── nl.json                  # Dutch translations
└── de.json                  # German translations
src/
├── hooks.server.ts          # i18n locale resolution + auth session
├── lib/
│   ├── auth-client.ts       # Better Auth client (phone + email OTP)
│   ├── config.ts            # Env-var config
│   ├── paraglide/           # Generated Paraglide runtime (gitignored)
│   ├── notifications.ts     # Typed NotificationEvent union + dedup (SeenEventIds)
│   ├── sse-client.ts        # SseManager singleton: SSE connection + SW message bridge
│   ├── sw-router.ts         # Push routing: focused window → postMessage, else → OS notification
│   ├── server/
│   │   ├── auth.ts          # Better Auth server setup
│   │   ├── balance.ts       # Balance computation, formatAmount, connections
│   │   ├── db.ts            # Drizzle db instance (delegates to db.sqlite or db.pg)
│   │   ├── db.sqlite.ts     # SQLite driver (bun:sqlite, WAL mode)
│   │   ├── db.pg.ts         # PostgreSQL driver (bun:sql)
│   │   ├── push-endpoint.ts # Push endpoint/keys validation + host allowlist (SSRF guard)
│   │   ├── push-sender.ts   # Best-effort Web Push delivery (VAPID), stale sub cleanup
│   │   ├── qr.ts            # JWT sign/verify (jose)
│   │   ├── schema.ts        # Re-exports active schema
│   │   ├── schema.sqlite.ts # Drizzle schema for SQLite
│   │   ├── schema.pg.ts     # Drizzle schema for PostgreSQL
│   │   └── sse-registry.ts  # In-memory per-user/session SSE fan-out registry, connection cap
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
│   └── api/
│       ├── events/          # SSE stream (real-time notifications)
│       ├── push/subscribe/  # Push subscription registration
│       └── push/unsubscribe/ # Push subscription removal
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
