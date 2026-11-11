# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **Android app** — Trusted Web Activity shell, with signed APKs published on GitHub Releases. See [docs/android.md](docs/android.md).
- **Configurable QR expiry** — creators can now pick an expiry preset (1 hour, 1 day, 3 days, 1 week, 30 days, or "never" for reusable QRs) when creating a QR; operators can set defaults and an optional hard cap via new env vars. ([#137](https://github.com/dokterbob/mutuvia/pull/137))

### Changed

- `generate-secret` now documents and is used solely for generating `BETTER_AUTH_SECRET`; the stale `QR_JWT_SECRET` references (dead since the v0.3.0 move to UUID-based QR links) are gone from the README, `AGENTS.md`, the `.env*` example files, and `scripts/generate-secret.ts`. ([#139](https://github.com/dokterbob/mutuvia/pull/139))

### Removed

- Sentry's interactive feedback widget — it cannot render under the new strict Content-Security-Policy. ([#138](https://github.com/dokterbob/mutuvia/pull/138))
- `android.googleapis.com` is no longer on the default Web Push endpoint allowlist (it's the legacy pre-2019 GCM endpoint form); add it back via `PUSH_ENDPOINT_EXTRA_HOSTS` if still needed. ([#133](https://github.com/dokterbob/mutuvia/pull/133))

### Fixed

- Production builds no longer fail with intermittent HTTP 500s under concurrent requests. The Bun adapter bundled Better Auth's single-request browser polyfill instead of Node's `AsyncLocalStorage`; a local adapter patch fixes this, and `bun run build` now checks for it. See README → "Bun adapter patch".
- Push notification icon path now points at the generated `/pwa-192x192.png` (the previous path did not exist).

### Security

- **Ledger integrity** — fixed a race that let a one-time payment request be accepted twice, or accepted while being declined, writing duplicate or inconsistent ledger rows; settlement now runs as a single atomic claim-then-write transaction on both database providers. ([#130](https://github.com/dokterbob/mutuvia/pull/130))
- **Strict amount validation** — transaction and payment-request amounts are now parsed strictly (no more `parseFloat` quirks like `1e9` or unbounded values) and bounded by a new `MAX_TRANSACTION_AMOUNT` setting; the database now rejects non-positive amounts and self-payments at the schema level. ([#131](https://github.com/dokterbob/mutuvia/pull/131))
- **Authorization gaps** — declining a payment request now requires signing in (an initiator can no longer decline their own request); a payment request's data is no longer shown to a visitor who isn't a party to it; the health-check endpoint no longer reveals the database error message or provider to unauthenticated callers; pages no longer ship the whole session object to the browser. ([#132](https://github.com/dokterbob/mutuvia/pull/132))
- **Push and realtime hardening** — push subscription endpoints are now validated against an allowlist of real browser push vendors (closing a server-side request forgery risk), capped at 10 per user, and re-checked before each send; live update connections are capped at 5 per user and are torn down immediately on sign-out or session revocation. ([#133](https://github.com/dokterbob/mutuvia/pull/133))
- **Production mode enforcement** — a packaged build now actually runs in production mode (a packaging bug meant it never had before); the app now refuses to start in production with a missing, short, or placeholder `BETTER_AUTH_SECRET`, or with no OTP delivery channel configured. ([#134](https://github.com/dokterbob/mutuvia/pull/134))
- **Account-takeover and auth cleanup** — closed a bug that let an attacker pre-claim someone else's phone number during email sign-up; `user.email` and `user.phone_number` are now enforced unique at the database level; unused Better Auth endpoints (password-based flows, session listing, etc.) are disabled; changing your email or phone number now signs out every other active session. ([#135](https://github.com/dokterbob/mutuvia/pull/135))
- **Abuse limits** — sign-in and OTP requests are now rate-limited by real client IP (database-backed, survives restarts); a separate per-destination throttle caps OTP sends to any one phone number or email address regardless of IP; an optional `PHONE_COUNTRY_ALLOWLIST` guards against SMS-pumping fraud. ([#136](https://github.com/dokterbob/mutuvia/pull/136))
- **Security headers and CSP** — the app now sends a strict, nonce-based Content-Security-Policy plus HSTS, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy` and related headers on every response; the QR scanner's WASM module is now self-hosted instead of loaded from a third-party CDN; Sentry error/replay reports now scrub phone numbers, emails and session data before upload. ([#138](https://github.com/dokterbob/mutuvia/pull/138))
- **Deployment hardening** — the Docker image now runs as a non-root user with a pinned, digest-verified base image; dependency updates are now tracked automatically via Dependabot, including for the Android app's Gradle dependencies; the Android app now excludes its local data from cloud backups and device-to-device transfers; added a `SECURITY.md` with vulnerability-reporting instructions. ([#139](https://github.com/dokterbob/mutuvia/pull/139))

### Upgrade notes

- Database migrations now refuse to run if existing data violates the new rules — check first: non-positive-amount or self-payment transactions ([#131](https://github.com/dokterbob/mutuvia/pull/131)), and duplicate `user.email`/`user.phone_number` values ([#135](https://github.com/dokterbob/mutuvia/pull/135)). See [README's "Upgrading" checklist](README.md#upgrading) for the exact detection queries.
- The Docker image now runs as a non-root user (uid/gid 1000). Before the first start on an existing SQLite volume or bind mount, `chown -R 1000:1000` its data directory — see the same "Upgrading" checklist for the exact commands. ([#139](https://github.com/dokterbob/mutuvia/pull/139))
- In production, the app now refuses to start with a weak, missing, or placeholder `BETTER_AUTH_SECRET`, or with neither Prelude nor SMTP configured for OTP delivery. `POSTGRES_PASSWORD` no longer has a default in `docker-compose.yml` — it must be set explicitly.
- New environment variables:
  - `MAX_TRANSACTION_AMOUNT` — sanity ceiling on a single transaction or payment-request amount, in minor units; default `100000000` (1,000,000.00). ([#131](https://github.com/dokterbob/mutuvia/pull/131))
  - `PUSH_ENDPOINT_EXTRA_HOSTS` — extra push-endpoint hosts allowed beyond the built-in browser-vendor allowlist; default empty (none). ([#133](https://github.com/dokterbob/mutuvia/pull/133))
  - `DEV_LOG_OTP` — prints OTP codes to the console when no real delivery channel is configured; default `false`. ([#134](https://github.com/dokterbob/mutuvia/pull/134))
  - `TRUSTED_IP_HEADER` — header name the rate limiter reads the client IP from; default `x-mutuvia-client-ip`. ([#136](https://github.com/dokterbob/mutuvia/pull/136))
  - `PHONE_COUNTRY_ALLOWLIST` — comma-separated ISO 3166-1 country codes allowed to sign up or request an OTP; default unset (no restriction). ([#136](https://github.com/dokterbob/mutuvia/pull/136))
  - `REUSABLE_QR_TTL_SECONDS` — default expiry for a reusable QR; default unset ("never expire"). ([#137](https://github.com/dokterbob/mutuvia/pull/137))
  - `QR_MAX_TTL_SECONDS` — optional upper bound on any QR's expiry; default unset (no bound). ([#137](https://github.com/dokterbob/mutuvia/pull/137))
  - `PUBLIC_SENTRY_TRACES_SAMPLE_RATE` — fraction of transactions sampled for Sentry performance tracing; default `0.1` (10%). ([#138](https://github.com/dokterbob/mutuvia/pull/138))
  - `SENTRY_TUNNEL_MAX_BODY_BYTES` — cap on a single `/sentry-tunnel` request body, in bytes; default `5000000` (5 MB). ([#138](https://github.com/dokterbob/mutuvia/pull/138))
  - `SENTRY_TUNNEL_UPSTREAM_TIMEOUT_MS` — timeout on the `/sentry-tunnel` → Sentry ingest upstream fetch, in milliseconds; default `5000` (5s). ([#138](https://github.com/dokterbob/mutuvia/pull/138))
  - `HSTS_MAX_AGE_SECONDS` — HSTS max-age, in seconds; default `15552000` (180 days). ([#138](https://github.com/dokterbob/mutuvia/pull/138))
  - `HSTS_INCLUDE_SUBDOMAINS` — whether HSTS applies to subdomains; default `false`. ([#138](https://github.com/dokterbob/mutuvia/pull/138))
- Behind a reverse proxy, also set `ADDRESS_HEADER`/`XFF_DEPTH` and either `ORIGIN` or `PROTOCOL_HEADER` — see [README's "Reverse proxy, TLS and NODE_ENV" section](README.md#reverse-proxy-tls-and-node_env).
- Users with a legacy Android-Chrome push subscription (an `android.googleapis.com` endpoint) will stop receiving push notifications until their browser registers a new subscription; the app attempts this automatically each time they create a send or receive QR code. ([#133](https://github.com/dokterbob/mutuvia/pull/133))

## [0.4.0] - 2026-10-27

### Added

- **Contacts** — a Contacts screen lists your balance with each person you've traded with; a detail page shows your shared transaction history. ([#123](https://github.com/dokterbob/mutuvia/pull/123))

### Fixed

- "Copy link" on payment requests now copies only the URL, not the full share message. ([#121](https://github.com/dokterbob/mutuvia/pull/121))

### Security

- Upgraded `nodemailer` 8.0.4 → 10.2.1, fixing 12 advisories (incl. 3 high: addressparser DoS and a file-access bypass).
- Requests whose path starts with `//` are now rejected with 404, mitigating the SvelteKit open-redirect advisory GHSA-pfhg-q3qv-9q6r until the SvelteKit 3 migration.

## [0.3.0] - 2026-05-29

### Added

- **Reusable payment QR codes** — create a permanent QR code on the Receive screen; each scan starts a new transaction. Supports pause and archive states, and shows a live payment count to the merchant. ([#115](https://github.com/dokterbob/mutuvia/pull/115))

### Changed

- QR accept URLs now use short UUIDs instead of signed JWTs — significantly smaller, less-dense, easier-to-scan QR codes. Removes the `QR_JWT_SECRET` env var requirement. ([#114](https://github.com/dokterbob/mutuvia/pull/114))

### Fixed

- Sentry server-side error capture no longer crashes on Bun — switched server SDK init to `@sentry/bun`, which excludes Node.js-incompatible integrations. ([#117](https://github.com/dokterbob/mutuvia/pull/117))

## [0.2.0] - 2026-05-04

### Added

- **Credential management** — add or change email and phone number directly from the Settings page with inline OTP verification. ([#106](https://github.com/dokterbob/mutuvia/pull/106))
- **Spanish language support** — full `es` locale with translation key validation wired into `bun run lint`. ([#105](https://github.com/dokterbob/mutuvia/pull/105))
- **What's new dialog** — shown automatically on first app load after a version update; skipped for new installs and repeat visits. ([#108](https://github.com/dokterbob/mutuvia/pull/108))
- OG meta tags and PWA manifest screenshots for a richer browser install UI. ([#104](https://github.com/dokterbob/mutuvia/pull/104), [#107](https://github.com/dokterbob/mutuvia/pull/107))

### Changed

- Replaced the immediate-cancel X on pending transaction rows with a chevron navigation affordance; added a confirmation dialog before cancelling on the QR screens. ([#101](https://github.com/dokterbob/mutuvia/pull/101))

### Fixed

- Auth endpoints (phone OTP, email OTP, session management) now work on custom domains — removed `baseURL` from Better Auth config so the origin is always derived from the incoming request. ([#110](https://github.com/dokterbob/mutuvia/pull/110))
- Route protection moved to `hooks.server.ts` to prevent null `appUser` crashes; SvelteKit runs layout and page loads in parallel so the layout redirect alone was not sufficient. ([#102](https://github.com/dokterbob/mutuvia/pull/102))

## [0.1.0] - 2026-04-10

Initial release.
