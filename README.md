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

**Reverse proxy / client IP**: Better Auth's rate limiter (used for the auth endpoints — see the table below) keys on a client IP taken from the HTTP header named by `TRUSTED_IP_HEADER` (default `x-mutuvia-client-ip`). The app always manages that header itself: on every request, `src/hooks.server.ts` strips any client-supplied value and sets it from SvelteKit's `event.getClientAddress()` — a client can never choose its own rate-limit bucket, and limiting is never silently skipped for lack of a determinable IP (unlike pointing Better Auth directly at a raw, spoofable header like the default `x-forwarded-for`). Behind a reverse proxy, `event.getClientAddress()` is only correct once you set `ADDRESS_HEADER` (the proxy header to trust, e.g. `X-Forwarded-For`) and usually `XFF_DEPTH` (how many trusted proxy hops to skip) — both are `svelte-adapter-bun`'s own env vars, read directly, not wrapped by this app. Without `ADDRESS_HEADER`, rate limiting still runs, but behind a proxy it buckets every visitor by the proxy's own address instead of their real IP — the app warns loudly about this at startup in production.

**Rate-limit table growth**: the `rate_limit` table (one row per IP+endpoint bucket Better Auth has seen) is **not pruned by Better Auth itself** — rows accumulate indefinitely. For a small-community deployment this stays small in practice, but a periodic manual cleanup (e.g. `DELETE FROM rate_limit WHERE last_request < <cutoff>`) is worth scheduling for long-running deployments; an automated job is out of scope for this PR.

**Per-destination OTP throttle — a deliberate lockout trade-off**: the 3-sends-per-10-minutes / 10-per-day limit (`src/lib/server/otp-throttle.ts`) is keyed on the destination (phone number or email) being sent to, not on who's asking — by design, since that's what stops SMS pumping/toll fraud and OTP-spam against a destination the _attacker_ doesn't own. The unavoidable flip side: anyone who knows a victim's phone number or email can spend that same 10/day budget themselves — one request every ~2.5 hours is well under the per-IP rate limit above and still exhausts the destination's whole daily allowance — denying the real owner any OTP for up to a day. Every accepted send counts against the limit regardless of whether the downstream SMS/email delivery (or the eventual verification) succeeds — the throttle can't know the outcome at send time, and a failed/retried send is exactly the kind of repeated attempt it exists to bound. An operator sees this as the targeted user being unable to sign in or change their email/phone, with no distinct error beyond the usual translated "too many attempts" message (deliberately non-enumerating — it must not reveal whether the destination is throttled because it's real or because it's a stranger's number). We considered clearing a destination's throttle history on its own successful verification (so a legitimate owner who gets through once isn't still locked out by an attacker's earlier sends) but have not implemented it — it would need its own review of whether a successful verification is itself abusable to reset the budget before the next abusive window. Lowering the limits was ruled out as a fix, since that only shrinks the attacker's cost, not the victim's exposure.

**What the throttle key does and doesn't normalise**: for phone numbers, the request is rejected outright unless it's already the exact canonical E.164 form (so there is nothing left to normalise by the time a number reaches the throttle — whitespace-variant forms of the same number never get their own separate budget, because they're never accepted in the first place). For email addresses, the key lowercases, strips any `+suffix` (RFC 5233 plus-addressing, every domain), and — Gmail/Googlemail specifically — also strips dots from the local part and folds `googlemail.com` into `gmail.com`, so look-alike addresses that actually deliver to the same inbox share one budget. This is deliberately **not** exhaustive: other providers' own alias schemes (e.g. hyphen-based sub-addressing, or a catch-all domain that accepts any local part) are not collapsed, and each such alias gets its own throttle budget. That residual gap — and a related one on the phone side — is bounded by the per-IP rate limiter above, which doesn't care about the destination string at all.

The phone-side nuance: the format check uses `libphonenumber-js`'s "possible" (length/shape) test, not full validity, so two numbers that are merely structurally plausible but not both real, assigned numbers — e.g. `+39612345678` alongside `+390612345678` — are each accepted and each get their own throttle budget. These are not aliases of one handset (unlike the email cases above); they're simply different, or non-existent, numbers, so there is no real destination being double-counted — and any actual abuse through this gap is still bounded by the per-IP limiter and by Prelude's own fraud checks on the send itself.

| Variable                            | Required | Default                            | Description                                                                                                                                                                                                                                                                            |
| ----------------------------------- | -------- | ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `QR_JWT_SECRET`                     | **Yes**  | —                                  | Min 32 chars. Signs QR JWT tokens.                                                                                                                                                                                                                                                     |
| `BETTER_AUTH_SECRET`                | **Yes**  | —                                  | Min 32 chars. Signs Better Auth sessions.                                                                                                                                                                                                                                              |
| `APP_URL`                           | No       | auto-detected                      | Public base URL. Used in QR links and auth. On Render, falls back to `RENDER_EXTERNAL_URL`. In dev, falls back to the Vite server's network URL (LAN IP when `--host` is used).                                                                                                        |
| `PORT`                              | No       | `3000`                             | Server listen port.                                                                                                                                                                                                                                                                    |
| `PUBLIC_APP_NAME`                   | No       | `Mutuvia`                          | Display name for rebranding.                                                                                                                                                                                                                                                           |
| `PUBLIC_APP_TAGLINE`                | No       | `Together, we are more.`           | Tagline fallback (localized via i18n).                                                                                                                                                                                                                                                 |
| `PUBLIC_COMMUNITY_DOC_URL`          | No       | —                                  | URL linked in Settings → About.                                                                                                                                                                                                                                                        |
| `DB_PROVIDER`                       | No       | `sqlite`                           | Database backend: `sqlite` or `pg`.                                                                                                                                                                                                                                                    |
| `DB_FILE_NAME`                      | No       | `sqlite.db`                        | SQLite file path.                                                                                                                                                                                                                                                                      |
| `DATABASE_URL`                      | PG only  | —                                  | Full PostgreSQL connection URL including password.                                                                                                                                                                                                                                     |
| `POSTGRES_PASSWORD`                 | PG only  | `mutuvia`                          | Docker only: initialises the managed postgres container. Must match the password in `DATABASE_URL`.                                                                                                                                                                                    |
| `UNIT_CODE`                         | No       | `EUR`                              | ISO 4217 code or custom unit identifier.                                                                                                                                                                                                                                               |
| `PUBLIC_UNIT_SYMBOL`                | No       | `€`                                | Displayed unit symbol.                                                                                                                                                                                                                                                                 |
| `PUBLIC_UNIT_DISPLAY_NAME`          | No       | `euro`                             | Lowercase singular name for the unit.                                                                                                                                                                                                                                                  |
| `QR_TTL_SECONDS`                    | No       | `259200`                           | Default expiry for a **one-time** QR, in seconds (default: 3 days). The creator can pick a different preset (1h/1d/3d/1w/30d) in the app; this is only the default selection.                                                                                                          |
| `REUSABLE_QR_TTL_SECONDS`           | No       | — (never)                          | Default expiry for a **reusable** QR, in seconds. Unset/empty means "never expire" — the historical behavior. See "QR expiry" below.                                                                                                                                                   |
| `QR_MAX_TTL_SECONDS`                | No       | — (unbounded)                      | Optional upper bound, in seconds, on any QR's expiry. Removes every preset above it, and removes "never" entirely (even for reusable QRs). The app refuses to start if `QR_TTL_SECONDS` or `REUSABLE_QR_TTL_SECONDS` would exceed it — see "QR expiry" below.                          |
| `EXPIRED_QR_RETENTION_SECONDS`      | No       | `259200`                           | How long expired QR records stay in the pending list before being hidden (default: 3 days). Display-only today — there is no background deletion job.                                                                                                                                  |
| `MAX_TRANSACTION_AMOUNT`            | No       | `100000000`                        | Sanity bound on a single transaction's amount, in minor units (cents). Not a credit limit — only rejects fat-fingered or malicious amounts before they reach the ledger. Must not exceed `2147483647` (PostgreSQL `integer` max; ledger columns are `integer` on both providers).      |
| `DEV_LOG_OTP`                       | No       | `false`                            | Prints OTPs to the console instead of sending them. Defaults off; set to `true` for local dev. Allowed in production (e.g. temporary debugging) but logs a loud startup warning and does **not** count as a configured delivery channel below.                                         |
| `TRUSTED_IP_HEADER`                 | No       | `x-mutuvia-client-ip`              | Header Better Auth's rate limiter reads the client IP from. The app manages this header itself on every request — see "Reverse proxy / client IP" above. Only change this if you have a specific reason to rename it.                                                                  |
| `RATE_LIMIT_DISABLE_FOR_TESTING`    | No       | `false`                            | Test-only kill switch for Better Auth's rate limiter. Only honoured when `NODE_ENV` is `development`/`test` (never in production, regardless of this value) — logs a loud startup warning whenever it's in effect. Used by Playwright's `webServer`; do not set in a real deployment.  |
| `OTP_THROTTLE_DISABLE_FOR_TESTING`  | No       | `false`                            | Same kill switch, for the independent per-destination OTP send throttle (3 sends/10 min, 10/day per phone number or email). Same production fail-closed behaviour and startup warning as above.                                                                                        |
| `PHONE_COUNTRY_ALLOWLIST`           | No       | —                                  | Comma-separated ISO 3166-1 alpha-2 country codes (e.g. `PT,NL,DE,ES,FR`). When set, phone sign-up/OTP is restricted to numbers resolving to one of these countries — an SMS-pumping (toll fraud) defense. A number whose country can't be determined is rejected whenever this is set. |
| `PRELUDE_API_TOKEN`                 | Prod     | —                                  | SMS OTP delivery via Prelude Verify. At least one of this or `SMTP_HOST` is required in production — the app refuses to start otherwise. Omit in dev — set `DEV_LOG_OTP=true` to see OTPs in the console.                                                                              |
| `SMTP_HOST`                         | Prod     | —                                  | SMTP server for email OTP. Works with any provider (Resend, Brevo, SES, etc.). Omit in dev — set `DEV_LOG_OTP=true` to see OTPs in the console.                                                                                                                                        |
| `SMTP_PORT`                         | No       | `587`                              | SMTP port (`587` for STARTTLS, `465` for implicit TLS).                                                                                                                                                                                                                                |
| `SMTP_SECURE`                       | No       | `false`                            | Set `true` for port 465 (implicit TLS); `false` uses STARTTLS.                                                                                                                                                                                                                         |
| `SMTP_USER`                         | No       | —                                  | SMTP username (required when your provider needs auth).                                                                                                                                                                                                                                |
| `SMTP_PASS`                         | No       | —                                  | SMTP password. Must be set together with `SMTP_USER`.                                                                                                                                                                                                                                  |
| `SMTP_FROM`                         | No       | `{APP_NAME} <noreply@example.com>` | Sender address for OTP emails.                                                                                                                                                                                                                                                         |
| `PUBLIC_VAPID_KEY`                  | Push     | —                                  | VAPID public key for Web Push. Generate with `bunx web-push generate-vapid-keys`. Required for push notifications to backgrounded PWA users.                                                                                                                                           |
| `PRIVATE_VAPID_KEY`                 | Push     | —                                  | VAPID private key for Web Push.                                                                                                                                                                                                                                                        |
| `VAPID_SUBJECT`                     | No       | `mailto:admin@example.com`         | VAPID contact URL (`mailto:` or `https:`).                                                                                                                                                                                                                                             |
| `PUSH_ENDPOINT_EXTRA_HOSTS`         | No       | —                                  | Comma-separated extra push-endpoint hosts to allow beyond the built-in browser vendor allowlist (`fcm.googleapis.com`, `updates.push.services.mozilla.com`, `*.push.apple.com`, `*.notify.windows.com`). Each entry is an exact host or `*.suffix`.                                    |
| `ANDROID_PACKAGE_NAME`              | Android  | `org.mutuvia.app`                  | Android `applicationId` served in `/.well-known/assetlinks.json`.                                                                                                                                                                                                                      |
| `ANDROID_SHA256_FINGERPRINTS`       | Android  | —                                  | Comma-separated SHA-256 fingerprints of the APK signing certificate; serves `/.well-known/assetlinks.json`.                                                                                                                                                                            |
| `PUBLIC_SENTRY_DSN`                 | No       | —                                  | Sentry DSN. Set to enable error tracking (session replay is deliberately not used — see "Security headers" → "Sentry" below). (The interactive feedback widget is deliberately not used — see "Security headers" below.)                                                               |
| `SENTRY_AUTH_TOKEN`                 | CI       | —                                  | Sentry auth token for source map uploads. Only needed in CI builds.                                                                                                                                                                                                                    |
| `SENTRY_ORG`                        | CI       | —                                  | Sentry organisation slug. Only needed in CI builds.                                                                                                                                                                                                                                    |
| `SENTRY_PROJECT`                    | CI       | —                                  | Sentry project slug. Only needed in CI builds.                                                                                                                                                                                                                                         |
| `PUBLIC_SENTRY_TRACES_SAMPLE_RATE`  | No       | `0.1`                              | Fraction (0–1) of transactions sampled for Sentry performance tracing. Shared by client and server init — see "Security headers" below.                                                                                                                                                |
| `SENTRY_TUNNEL_MAX_BODY_BYTES`      | No       | `5000000`                          | Cap on a single `/sentry-tunnel` request body, enforced against actual bytes streamed (never the client-supplied `Content-Length`).                                                                                                                                                    |
| `SENTRY_TUNNEL_UPSTREAM_TIMEOUT_MS` | No       | `5000`                             | Timeout, in milliseconds, on the `/sentry-tunnel` → Sentry ingest upstream fetch.                                                                                                                                                                                                      |
| `HSTS_MAX_AGE_SECONDS`              | No       | `15552000`                         | `Strict-Transport-Security` max-age, in seconds (180 days). Only sent when BOTH `APP_URL` is https AND the current request is itself seen as https — see "Security headers" below and "Reverse proxy / client IP" above (`ORIGIN`/`PROTOCOL_HEADER`).                                  |
| `HSTS_INCLUDE_SUBDOMAINS`           | No       | `false`                            | Adds `includeSubDomains` to the HSTS header. Off by default — see "Security headers" below for why.                                                                                                                                                                                    |

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

## Security headers

Every response from the SvelteKit server (pages, form actions, API endpoints, the SSE stream,
Better Auth routes) carries a baseline set of security headers, applied in one place
(`src/hooks.server.ts`'s `handle`, backed by `src/lib/server/security-headers.ts`). A few requests
never reach that code at all — see "Known gaps" below.

- **Content-Security-Policy** — set via `svelte.config.js`'s `kit.csp` (`mode: 'auto'`, nonce-based
  — nothing in this app is prerendered). `default-src 'self'`; `script-src 'self' wasm-unsafe-eval`
  (the QR scanner's self-hosted WASM module needs the latter); `style-src 'self'` with
  `style-src-attr 'unsafe-inline'` (inline `style="..."` attributes only — bits-ui's floating-ui
  positioning, Svelte transitions — not whole `<style>` blocks, which stay nonce-gated);
  `img-src 'self' data: blob:`; `connect-src 'self'` (Sentry goes through the same-origin
  `/sentry-tunnel`; Web Push delivery is the browser's own PushManager, not a page `fetch`);
  `worker-src 'self'`;
  `frame-ancestors 'none'`; `base-uri 'self'`; `form-action 'self'`;
  `object-src 'none'`. `upgrade-insecure-requests` is deliberately **not** set — it would force
  every request to https even for local dev / the E2E suite, which run over plain http.
- **`Strict-Transport-Security`** — only when BOTH `APP_URL` is https AND the current request is
  itself seen as https via `event.url.protocol`. Both are required: `svelte-adapter-bun`'s own
  `get_origin()` (`dist/files/handler.js`) defaults a request's protocol to `https` whenever
  neither its `ORIGIN` nor `PROTOCOL_HEADER` env var is configured, regardless of whether real
  traffic is actually arriving over TLS — so `event.url.protocol` alone is not trustworthy on an
  all-http deployment that hasn't set either. Requiring `APP_URL` to also be https closes that for
  an all-http deployment; see "Reverse proxy / client IP" above for configuring `ORIGIN`/
  `PROTOCOL_HEADER` correctly when `APP_URL` genuinely is https behind a proxy — the app warns
  loudly at startup if it's https and neither is set, since in that case HSTS could still be sent
  on a request that actually arrived over plain http (e.g. missing/misconfigured TLS
  termination). `HSTS_MAX_AGE_SECONDS` / `HSTS_INCLUDE_SUBDOMAINS` control it; `includeSubDomains`
  and `preload` are off by default, since this app can't know whether you control every subdomain
  of your deployment's domain.
- **`X-Content-Type-Options: nosniff`**, **`Referrer-Policy: no-referrer`**,
  **`Permissions-Policy: camera=(self), geolocation=(), microphone=()`** (camera is granted to
  same-origin content for the QR scanner; geolocation/microphone are never used),
  **`X-Frame-Options: DENY`** and **`Cross-Origin-Opener-Policy: same-origin`** (legacy/defense-in-
  depth backups for `frame-ancestors`).
- **`Cache-Control: private, no-store`** — on every response for a signed-in user, every
  `/accept/*` / `/send/*` response regardless of auth state (these carry per-recipient QR/payment
  data in the URL and must never be cached by a shared/intermediate cache), every `/api/auth/*`
  response (Better Auth's own routes — including the exact response that _creates_ a session,
  e.g. `POST /api/auth/sign-in/email-otp`, which the "signed-in user" check alone can't catch
  since it judges auth state from the session that existed _before_ the request), and any response
  that sets a cookie at all. Never overrides a `Cache-Control` a route already set itself (the SSE
  stream's `no-cache`, `/.well-known/assetlinks.json`'s `public, max-age=3600`). Hashed, immutable
  static assets (`/_app/immutable/*`) are served directly by `svelte-adapter-bun`'s own static file
  handler, which never reaches this logic at all — their own
  `public,max-age=31536000,immutable` is untouched. A CDN/shared cache in front of this app should
  respect `Cache-Control` as given; no additional `Vary` tuning was needed since nothing here
  varies by a header a cache would need to key on beyond what SvelteKit already adds (`Vary:
Accept` when a route serves both a page and an endpoint).
- **`X-Robots-Tag: noindex, nofollow`** — on `/accept/*` and `/send/*` only (header-based so it
  reaches crawlers that don't render a `<meta>` tag). `robots.txt` otherwise allows crawling
  everything — these two prefixes are excluded this way instead, so a direct visit still works
  normally for people, just not for indexers.

### Known gaps (cannot be fixed from `handle`)

A few responses never reach `src/hooks.server.ts`'s `handle` hook at all, so they carry none of
the headers above:

- **SvelteKit's built-in CSRF origin check** answers its plain-text 403 _before_ `handle` runs for
  a cross-origin form submission (a protection this app also relies on) — see
  `src/hooks.server.ts`'s own comment on this for the full list of pre-`handle` gaps (that same
  comment also covers a malformed-URI 400, a canonical trailing-slash 308, and a couple of
  SvelteKit-internal `/${app_dir}/*` paths).
- **Every static file `svelte-adapter-bun` serves directly** — `/service-worker.js`,
  `/manifest.webmanifest`, everything under `/_app/immutable/*`, and the self-hosted
  `/wasm/zxing_reader.wasm` — gets **no security headers at all**, including the service worker
  script itself. If you terminate TLS at a reverse proxy in front of this app, that's the natural
  place to add `X-Content-Type-Options: nosniff` (and, if you want one, a CSP) to those static
  responses too — this app does not attempt to patch `svelte-adapter-bun` to add them itself.

**QR scanner WASM**: `src/lib/components/qr-scanner.svelte` self-hosts `zxing-wasm`'s
`zxing_reader.wasm` (via `barcode-detector`'s ponyfill) at `/wasm/zxing_reader.wasm`, instead of
letting it load from `fastly.jsdelivr.net` at runtime — keeping `connect-src`/`script-src`
same-origin and avoiding an unpinned third-party fetch. `vite.config.ts` copies the file from
`node_modules/zxing-wasm` at config-load time (both `bun run dev` and `bun run build`) rather than
committing a binary, and `src/lib/wasm-integrity.test.ts` asserts the served copy's sha256 still
matches `node_modules` (and matches `barcode-detector`'s own exported `ZXING_WASM_SHA256`) — so a
dependency bump can never silently leave a stale `.wasm` behind.

**Sentry — what the scrubber structurally guarantees vs. best-effort pattern matching**:
`src/lib/sentry-scrub.ts` is a shared, pure, table-driven-tested scrubber used by both
`src/hooks.client.ts` and `src/instrumentation.server.ts`'s `beforeSend`/`beforeSendTransaction`.
Rather than enumerating fields to scrub one at a time (every review round found another one —
`span.data`, `contexts.trace`, stack-frame `vars`, ... — because enumeration can only close the
instance of a bug, not the class), it walks the **entire** event recursively and runs the pattern
matcher over **every string value AND every object key it finds, anywhere, at any depth**
(`extra: { 'jane@example.com': 1 }` has its key redacted too; two keys that redact to the same
string are de-duplicated deterministically by suffixing, so nothing is silently dropped). A short
allowlist of structural fields is left untouched so Sentry's own grouping/correlation UI keeps
working — but, critically, that allowlist is **path-scoped, not a bare key name matched anywhere**:
`event_id`/`timestamp`/`release`/`environment`/`platform`/`sdk`/`modules`/... are exempt only
directly on the event root; `trace_id`/`span_id`/`op`/`status` only under `contexts.trace`; a
handful of correlation/timing fields only on a `spans[]`/`breadcrumbs[]` entry itself; and
`function`/`module`/`lineno`/`colno`/`in_app` only on an actual stack frame (matched by path
suffix, covering both exception and thread stacktraces). The exact same key name under
`extra`/`tags`/a custom `contexts.<name>`/breadcrumb `data`/span `data` gets NO exemption and is
scrubbed like anything else — an earlier version of this allowlist matched by bare key name
anywhere in the tree, which meant `extra.release`, `breadcrumbs[].data.filename`, etc. ALSO
survived untouched, leaking whatever PII had been placed under one of those names. Stack-frame
`filename`/`abs_path` are deliberately NOT exempt either (unlike `function`/`module`/line
numbers): a frame's URL can itself be a request URL carrying a route id or query string, and
redacting that doesn't harm symbolication of a bundle path. A field a future SDK version adds is
covered automatically; only a name collision at the SAME structural location as one of these
allowlisted fields could ever be missed. The walk is depth- and size-bounded (10 levels, 200
items) against pathological payloads — a subtree beyond the depth limit is replaced with a
`"[scrubbed: too deep]"` marker rather than returned unscrubbed. `Date` values are preserved as
ISO strings (not collapsed to `{}`); any other non-plain-object value (`RegExp`, `Map`, `Error`, a
custom class instance) is passed through unchanged — a known, accepted limit of pattern-matching,
not a guarantee such values never carry PII. If the scrubber itself throws for any reason, the
event is **dropped** (`beforeSend`/`beforeSendTransaction` return `null`) rather than risking an
unscrubbed event reaching Sentry — enforced in the app (`safeScrubSentryEvent`), not left to the
SDK's own error handling.

Within that pattern-matching layer: dynamic ids in `/accept/<id>`, `/send/<id>` and
`/api/qr-status/<id>` are replaced wherever a matching URL shape appears; known-sensitive
query-parameter **values** (`dest`, `email`, `phone`, `phoneNumber`, `to`, `otp`) are replaced
outright wherever that key appears in any URL/query string, regardless of path (not just
`/onboarding/otp`); every other query value — and, separately, any string overall, outside of a
`key=value` shape entirely — is percent-decoded ITERATIVELY (up to 3 passes, enough to unwrap
double-encoding like `jane%2540example.com`) before pattern-matching, so e.g.
`?note=jane%40example.com` or a double-encoded value hidden in a path segment is still caught.
Phone-number matching uses two narrow patterns instead of one open-ended one (which used to match
ISO-8601 timestamps and version strings as "phone numbers"): a leading `+` (the E.164 format this
app actually stores/logs numbers in — see `PHONE_COUNTRY_ALLOWLIST` and the phone-OTP flow above)
anchors a loose international pattern, and a human-typed local number needs the exact 3-3-4 digit
grouping (`555-123-4567`, `(555) 123-4567`) — neither an ISO date (4-2-2) nor a UUID segment
produces either shape. **Phone shapes deliberately NOT redacted**: a national number with no
leading `+` and no 3-3-4 grouping (e.g. a bare 10-digit run with no separators at all), or a
`00`-prefixed international dialling form. This app only ever stores/sends phone numbers in
canonical E.164 (always `+`-prefixed — enforced at the OTP/sign-in boundary, never accepted in any
other shape), so none of this app's OWN data ever uses those other shapes; the gap is only reachable
if a user types a number into FREE TEXT themselves (e.g. a support message) in one of those
formats. This is still pattern matching, not parsing a phone number properly — an unusual format
can still slip through either way, and a non-phone number that happens to fit one of the two
redacted shapes can still be redacted unnecessarily; both are accepted trade-offs.

This covers: breadcrumbs (including navigation/fetch URLs); exception `type`/`value`
(deliberately NOT exempt — `type` can carry a custom, PII-bearing error message); and the
`Referer` header. `user` is reduced to an opaque `id` only (dropping `email`/`username`/
`ip_address`, and anything else a custom `setUser()` call might attach) — if there's no `id`,
`user` is dropped entirely; this is a structural replacement, not pattern matching, so it's a
guarantee, not best-effort. Likewise `request.cookies` and `request.data` (the request body —
which, for an OTP send/verify request, is itself the phone number/email/code) are **stripped
entirely, not redacted**, as are the `Cookie` and `Authorization` request headers; this is fixed
at the source too, not just scrubbed after the fact — `src/instrumentation.server.ts`
explicitly configures Sentry's `requestDataIntegration` (a _default_ integration for
`@sentry/bun`/`@sentry/node` that otherwise attaches request cookies and body to every
server-side event) with `include: { cookies: false, data: false }`, so that data never reaches an
event in the first place. `sendDefaultPii` is never set anywhere in this app (keeping IP addresses
off by default).
**Session Replay is deliberately not enabled.** Its DOM recording captures the page URL and link
`href`s verbatim, with no scrubbing hook, so a page opened at `/accept/<id>` or
`/onboarding/otp?dest=…` would leak that payment id or contact detail even with all text and inputs
masked. **The feedback widget
(`Sentry.feedbackIntegration`) is deliberately not registered at all** — verified in a real
browser, not assumed: it injects its own `<style>` elements via plain DOM APIs
(`document.createElement('style')`), bypassing Svelte's compiled-output nonce handling entirely,
and Sentry's `styleNonce` option (which sets a `nonce="..."` attribute on those elements) cannot
fix that under this app's CSP — the nonce VALUE is read correctly client-side (via the `.nonce`
_IDL property_ of SvelteKit's own nonce'd hydration `<script>` tag, never via a `<meta>` tag or
`getAttribute('nonce')`, both of which would republish it as a readable content attribute and
defeat the browser's deliberate nonce-hiding), but that value is never actually authorized by the
`style-src` directive this app sends in the first place: SvelteKit only adds a `nonce-...` source
to `style-src` when its own SSR output renders an inline `<style>` tag, which never happens in a
production build (Vite extracts every Svelte component's styles into the external stylesheet).
CSP nonces are directive-scoped, so the widget's `<style>` tags are blocked
(`style-src-elem` violations) and render completely unstyled regardless. Re-enabling it would need
either sha256-hash-allowlisting its exact, version-pinned injected CSS as static `style-src`
sources, or adding `'unsafe-inline'` to `style-src` (weakening it for every inline `<style>`
element) — neither implemented here; see `src/hooks.client.ts`'s comment for the full reasoning.
`/sentry-tunnel`
(`src/routes/sentry-tunnel/+server.ts`) only forwards an envelope whose DSN **host and project id**
both match `PUBLIC_SENTRY_DSN` (host alone isn't enough — see the code comment for the open-proxy
risk that closes), reads the body as a size-capped stream rather than trusting
`Content-Length`, times out after `SENTRY_TUNNEL_UPSTREAM_TIMEOUT_MS` (default 5s) rather than
holding the connection open on a hung upstream, and rejects a mismatching `Origin`. It remains
intentionally unauthenticated (it must work for a crash on the sign-in page itself); a dedicated
rate limiter was considered and deferred, since the checks above already bound its blast radius.

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
| Observability | Sentry (optional — error tracking; no session replay)                           |
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

### QR expiry

The creator chooses an expiry for each QR from a fixed set of presets — 1 hour, 1 day, 3 days,
1 week, 30 days, or "never" (reusable QRs only). The server accepts only these preset keys, never
a raw number of seconds.

- `QR_TTL_SECONDS` / `REUSABLE_QR_TTL_SECONDS` set the **default** selection for one-time and
  reusable QRs respectively. If an operator's default doesn't exactly match one of the presets
  above, the app offers it as an extra "Default" option rather than silently rounding to the
  nearest preset.
- `QR_MAX_TTL_SECONDS` caps how long any QR — one-time or reusable — can be made to last. Setting
  it removes every preset above the cap, and removes "never" entirely, even for reusable QRs. If
  either `QR_TTL_SECONDS` or `REUSABLE_QR_TTL_SECONDS` would then exceed the cap (including
  `REUSABLE_QR_TTL_SECONDS` left unset, i.e. "never"), the app refuses to start rather than
  silently clamping — fix the conflicting env vars.
- Existing reusable QRs created before this feature (or before `QR_MAX_TTL_SECONDS` was set) have
  `expires_at IS NULL` in the database and are **not** retroactively expired — "never" means never,
  for QRs that were already created that way. `QR_MAX_TTL_SECONDS` only applies going forward, to
  new QRs.
- An expired reusable QR is treated as expired everywhere it's listed or opened, even though its
  database `status` stays `'active'` until the owner pauses or archives it — the pending list, the
  scan-to-pay landing page, and `/api/qr-status/[id]` all derive "expired" from `expires_at` rather
  than trusting `status` alone.
- `QR_TTL_SECONDS`, `REUSABLE_QR_TTL_SECONDS` and `QR_MAX_TTL_SECONDS` are each capped at
  315360000 seconds (10 years) — an absurdly large value (e.g. a stray extra digit) is rejected at
  boot instead of silently overflowing into an `Invalid Date` on the first QR created under it.
  `EXPIRED_QR_RETENTION_SECONDS` has no such ceiling — it's a retention window, not a QR lifetime.

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
