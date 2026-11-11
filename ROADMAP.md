# Roadmap

> Tracking what's done, what's next, and what's deferred. See the [MVP plan](community_credit_mvp_plan.md) for full specs.

---

## Done (MVP)

- [x] SvelteKit + Bun adapter + Tailwind v4 + shadcn-svelte
- [x] Drizzle ORM + SQLite (WAL mode) with schema and migrations
- [x] Better Auth: SMS OTP (Prelude Verify) + email OTP fallback, Drizzle adapter
- [x] 9-step onboarding flow (welcome, consent, phone/email, OTP, verified, intro x2, name entry)
- [x] Home screen with computed balance, send/receive actions, recent transactions
- [x] Send flow with first-send consent gate, QR generation (jose JWT), countdown, polling
- [x] Receive flow with QR generation and polling
- [x] Accept screen (`/accept/[jwt]`) with atomic settlement, connection upsert, first-time notice
- [x] Transaction history with all/sent/received filter
- [x] Settings: editable display name, language toggle, sign out, about
- [x] i18n: English, Portuguese, Dutch — all screens, canonical taglines preserved
- [x] QR status polling API for auto-transition
- [x] Balance always computed from ledger (never stored)
- [x] Seed script: 3 test users with varied balances
- [x] `.env.example` with all config documented
- [x] AGPL-3.0 license
- [x] **Android app** — Trusted Web Activity shell, signed APK on GitHub Releases (see [docs/android.md](docs/android.md))

---

## Next: Polish & Harden

These items improve what's already built before adding new features.

- [ ] **Theme pass** — Align shadcn-svelte theme (CSS variables in `layout.css`) with the mockup's forest/cream palette. Consistent use of ShadCN components across all screens.
- [ ] **Unit tests** — Balance utilities (`getBalance`, `formatAmount`, `getConnections`), QR JWT sign/verify, settlement atomicity.
- [x] **Security audit** (Sub-Agent H from the plan) — the bulk of this landed as a stack of
      hardening PRs (atomic settlement, strict amount validation, authz-gap fixes, push/SSE
      allowlisting + caps, production-mode enforcement, phone pre-claim/unique-index fix, rate
      limiting, QR expiry presets, CSP + security headers, and this PR's deploy/supply-chain
      hardening):
  - [x] No cross-user transaction history leak — authz-gap fixes (decline requires login,
        `/api/qr-status/[id]` party check, layout data trimmed)
  - [x] ~~`QR_JWT_SECRET` absent from all client bundles~~ — moot: there is no `QR_JWT_SECRET`
        anymore. QR/accept/send links carry a plain `crypto.randomUUID()` (the `payment_requests`
        primary key) since v0.3.0; nothing is signed, so nothing can leak a signing secret
  - [x] Server-side QR expiry enforced — `QR_TTL_SECONDS`/`REUSABLE_QR_TTL_SECONDS`/
        `QR_MAX_TTL_SECONDS`, derived from `expires_at` server-side wherever a QR is listed or
        opened, never trusting client-side state
  - [ ] Better Auth cookie flags correct (`HttpOnly`, `SameSite=Lax`) — relies on Better Auth's
        own defaults; not yet overridden or explicitly asserted by a test in this repo
  - [x] SQLite WAL mode active — `src/lib/server/db.sqlite.ts`
  - [x] Phone numbers not in `app_users` or application-layer logs — `phone_number` only exists on
        Better Auth's own `user` table, never on `app_users`; Sentry's shared PII scrubber
        (`src/lib/sentry-scrub.ts`) redacts phone-shaped strings everywhere else
  - [x] Dependency/deploy supply chain — non-root Docker image, pinned base image (tag + digest),
        pinned CI Actions (by commit SHA) and Bun version, Dependabot (bun/github-actions/docker),
        `bun audit` in CI (informational — see its PR for why)
- [ ] **Error handling** — Graceful error pages, network failure states in QR polling, form validation feedback.
- [ ] **Accessibility** — Keyboard navigation, focus management on step transitions, screen reader labels.
- [ ] **Responsive fine-tuning** — Test on small screens (320px), large phones, tablets.
- [ ] **SvelteKit 3 migration** — Resolves GHSA-pfhg-q3qv-9q6r and GHSA-27mw-82g8-phjj (Dependabot alerts #10, #11). Blocked on `svelte-adapter-bun` and `@vite-pwa/sveltekit` supporting Kit 3; also requires Vite 8, TypeScript 6 and `@sveltejs/vite-plugin-svelte` 7. Once done, remove the `//` path guard in `src/hooks.server.ts`.

---

## Post-MVP Features

Ordered roughly by community value and implementation readiness. See [section 12 of the plan](community_credit_mvp_plan.md#12-roadmap--post-mvp) for full descriptions.

### Near-term

- [ ] **Circular debt netting** — Surface suggestions to cancel circular debts (A→B→C→A) in one move. Testers identified this as the standout feature.
- [ ] **Passkeys** — Biometric one-tap sign-in. Introduce once friction reduction has clear value.
- [ ] **Invitation system** — Phone/email invites with contact list. Builds on implicit connections graph.
- [ ] **Push notifications** — Mobile push for received credits.

### Medium-term

- [ ] **Trusted contacts / direct transfer** — Skip QR for known members. Needs mutual consent UX design.
- [ ] **Re-auth per transaction** — Step-up authentication for high-value sends.
- [x] **Maximum transaction amount** — `MAX_TRANSACTION_AMOUNT` config (`src/lib/config.ts`), enforced by `parseAmount()` and re-checked in the settlement layer. This is a fixed operator-set sanity bound to catch fat-fingered/malicious amounts, not a community-governance feature — a per-community configurable version (if ever wanted) is still open.
- [ ] **Credit limits** — Community-configurable maximum negative balance.
- [ ] **Admin panel** — Member management, transaction oversight.

### Long-term

- [ ] **Zero-knowledge balance proofs** — Prove balance to a counterparty without server storing plaintext.
- [ ] **Multiple units** — Gold, silver, or custom units; per-transaction unit selection.
- [ ] **Transaction disputes** — Formal dispute and reversal flow.
- [ ] **Cooperative legal entity integration** — Compliance reporting.
- [ ] **Multi-community support** — Multiple ledgers per deployment.
- [ ] **Sustainability / credit contributions** — Optional credit ask from active users.
- [ ] **PWA offline transactions** — Offline transaction queuing (installable PWA shell + offline fallback page already done).

---

## Explicitly Out of Scope

These will not be implemented unless the community governance process decides otherwise:

- Real payment systems or external financial APIs
- Contact/friend management UI (connections are implicit, tracked silently)
- Balance or transaction limits (deferred to governance)
- Email notifications (email is auth-only)

---

_Last updated: 2026-11-11_
