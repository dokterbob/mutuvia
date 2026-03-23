# Community Credit App — MVP Plan
> **Document purpose:** Planning and specification for a Claude Code agent. Sections marked `[SUB-AGENT]` are discrete units of work for delegation. Intentionally non-prescriptive about implementation details — those are researched during execution. Focus is on UX flows, feature specs, data model, and tech stack.
>
> **Package name:** `mutuvia`
> **License:** AGPL-3.0. `LICENSE` file in project root. Standard AGPL header in all source files.
> **Product name:** Configurable via `APP_NAME` env var (see section 2). The FOSS package is named *Mutuvia*; any community deploying it may rebrand freely under AGPL terms.

---

## 0. Project Summary

A minimal mutual credit app for a small community. Members send and receive credit obligations denominated in a configurable unit (default: euro). No real money transfers. The ledger records mutual debts. Mobile-first, bilingual (EN / PT), privacy-respecting.

**Core loop:**
1. A taps Send, enters an amount, a QR code appears.
2. B scans the QR with their phone camera — the OS opens the app's accept screen.
3. B sees the amount and A's current balance (not A's history), and accepts or declines.
4. On acceptance, A's balance decreases, B's increases. The ledger records one transaction.

**The one-line pitch (use this to guide all copy decisions):** *"We already have everything we need. We just lack the means to exchange it."*

**The killer example (use this in onboarding and community docs, not the dancer story which depends on fixed euro costs):**
> António grows vegetables. Sofia is a physiotherapist whose patients can't afford sessions. Miguel bakes bread. All three want what the others have, but nobody has spare cash. With the app: António gives Sofia credit for a session. Sofia uses that credit to buy bread from Miguel. Miguel uses it to pay António for vegetables. António's back gets better. Sofia's fridge is full. Miguel has customers. Nobody paid a euro. Nobody went without. The chain of exchange already existed — the app just made it flow.

**The USP in plain language:** Mutual credit creates liquidity from thin air. Every credit issued has a positive side and a negative side that cancel out. The community can trade to the extent of its trust, not to the extent of its cash.

**Note for all agents:** This is a trust-based community tool. Every UX and copy decision should reinforce clarity and simplicity. It should feel like a community notebook, not a fintech product.

---

## 1. Tech Stack

| Layer | Choice | Notes |
|---|---|---|
| Framework | SvelteKit | Mobile-first |
| Runtime | Deno | Deno-compatible SvelteKit adapter |
| UI | shadcn-svelte | Svelte port of shadcn/ui |
| Auth | Better Auth | SMS OTP primary; see section 3 |
| ORM | Drizzle ORM | Schema-first, type-safe |
| Database | SQLite (via Drizzle) | Single file; WAL mode |
| i18n | Paraglide JS v2 | EN + PT + NL |
| QR generation | Client-side library | No server round-trip |
| QR scanning | Browser camera API | Plain HTTPS link; see section 5 |

**No PWA in MVP** — deferred to roadmap (section 12).
**No payment processors, external financial APIs, or email in MVP** (email OTP is a fallback auth method only, not used for notifications).

---

## 2. Configuration

All operator/community values in `src/lib/config.ts`, populated from environment variables. Never hardcoded in application code.

| Config key | Env variable | Default | Notes |
|---|---|---|---|
| `appName` | `APP_NAME` | `Mutuvia` | Display name shown throughout the UI — header, welcome screen, browser tab title, emails. Override to rebrand (e.g. `Mombucha`). |
| `appTagline` | `APP_TAGLINE` | `Together, we are more.` | Fallback default used if no translation key is found. The displayed tagline is always sourced from intlayer (`welcome.tagline`) so it renders in the user's language. See section 9 for the canonical translations. |
| `unitCode` | `UNIT_CODE` | `EUR` | ISO 4217 or custom string |
| `unitSymbol` | `UNIT_SYMBOL` | `€` | Display symbol |
| `unitDisplayName` | `UNIT_DISPLAY_NAME` | `euro` | Lowercase singular for copy |
| `decimalPlaces` | `UNIT_DECIMAL_PLACES` | `2` | Determines decimal position. `amount / 10^decimalPlaces` = display value. 2 → euros, 3 → milligrams, 0 → whole units. |
| `qrTtlSeconds` | `QR_TTL_SECONDS` | `600` | QR token validity window |
| `appUrl` | `APP_URL` | (required) | Base URL; used in QR links |
| `communityDocUrl` | `COMMUNITY_DOC_URL` | `` | Link in Settings > About |
| `qrJwtSecret` | `QR_JWT_SECRET` | (required) | HS256 signing secret; min 32 chars |

| `twilioAccountSid` | `TWILIO_ACCOUNT_SID` | (required) | Twilio credentials for SMS OTP |
| `twilioAuthToken` | `TWILIO_AUTH_TOKEN` | (required) | |
| `twilioPhoneNumber` | `TWILIO_PHONE_NUMBER` | (required) | E.164 format sender number |

**On amounts:** All amounts in the database and API are integers. `decimalPlaces` is the sole source of truth for interpretation. No maximum transaction amount in MVP — a community governance decision not yet made.

---

## 3. Authentication — Better Auth with Twilio

Better Auth (https://better-auth.com) with the `phoneNumber` plugin, using Twilio as the SMS provider. No external OIDC provider required. Agents must consult current Better Auth docs before implementing.

### Sign-in methods

| Method | Role | Notes |
|---|---|---|
| **SMS OTP** | Primary credential. Used on first login and on any new device. | Better Auth `phoneNumber` plugin; Twilio as SMS provider via env vars |
| **Email OTP** | Fallback for users without reliable SMS. Offered as "use email instead" on the phone entry screen. | Better Auth `emailOtp` plugin |

**Passkeys are not in MVP.** They will be introduced once the app has real traction and the value of reducing friction is proven. See roadmap.

### Session behaviour
- Sessions are **persistent and long-lived** in MVP. Users should not need to re-authenticate frequently.
- Re-authentication per transaction is explicitly deferred to the roadmap.
- Better Auth manages session storage. Use the Drizzle adapter.

### Display name
- With SMS auth there is no identity provider to source a name from.
- The user enters their display name during onboarding (step 3 — see section 6).
- Stored in `app_users.display_name`. Editable in Settings.
- Minimum 2 characters, maximum 40 characters.

### What we store
- Better Auth stores the phone number in its own `account` / `user` tables.
- In `app_users` we store only: a FK to Better Auth's user ID, the display name, and `created_at`.
- No email addresses stored unless the user chose the email fallback path (Better Auth handles that internally).

---

## 4. Data Model

### Better Auth managed tables
`user`, `session`, `account`, `verification` — owned by Better Auth. Do not modify. Reference by FK only.

### `app_users`
Application-specific user data only.

| Field | Type | Notes |
|---|---|---|
| `id` | text PK | UUID |
| `better_auth_user_id` | text unique FK → user.id | |
| `display_name` | text | Entered during onboarding; editable |
| `send_consent_at` | timestamp nullable | Set the first time the user completes the first-send consent screen. Null = has never initiated a send. Used to gate the consent screen: shown once, never again. Stored server-side so it follows the user across devices. |
| `created_at` | timestamp | |

### `transactions`
The ledger. A record existing = the transaction completed. No status field in MVP.

| Field | Type | Notes |
|---|---|---|
| `id` | text PK | UUID |
| `from_user_id` | text FK → app_users.id | Balance decreases |
| `to_user_id` | text FK → app_users.id | Balance increases |
| `amount` | integer | In smallest unit per `decimalPlaces`; always positive |
| `unit_code` | text | Value of `UNIT_CODE` at time of transaction |
| `note` | text nullable | Optional description, max 120 chars. Displayed prominently in send/receive flows as the place to record repayment conditions, context, or agreements. Shown to both parties on the accept screen and in transaction history. |
| `pending_qr_id` | text nullable FK → pending_qr.id | The QR that produced this transaction |
| `created_at` | timestamp | |

### `pending_qr`
Short-lived. Represents an initiated but not yet settled exchange.

| Field | Type | Notes |
|---|---|---|
| `id` | text PK | UUID; travels as `jti` inside the signed JWT, not raw in the URL |
| `initiating_user_id` | text FK → app_users.id | |
| `direction` | text | `send` (initiator balance ↓ on accept) or `receive` (initiator balance ↑) |
| `amount` | integer | |
| `note` | text nullable | |
| `created_at` | timestamp | |
| `expires_at` | timestamp | `created_at + QR_TTL_SECONDS` |
| `status` | text | `pending` / `completed` / `declined` |

**No `transaction_id` on `pending_qr`.** To find the transaction a QR produced: `SELECT * FROM transactions WHERE pending_qr_id = ?`. Eliminates circular FK entirely. Settlement = insert `transaction` + update `pending_qr.status` in one SQLite transaction.

**`expired` is not stored.** Derived at runtime: `expires_at < now()`.

### `connections`
Implicit social graph. A connection is created the first time a transaction completes between two users. Bidirectional: one row per pair, lower UUID first to avoid duplicates.

| Field | Type | Notes |
|---|---|---|
| `user_a_id` | text FK → app_users.id | Lower UUID of the pair |
| `user_b_id` | text FK → app_users.id | Higher UUID of the pair |
| `created_at` | timestamp | First transaction between this pair |

**Primary key:** `(user_a_id, user_b_id)`.

This table seeds the future trust propagation / flow network features. In MVP it is written silently on transaction settlement and not surfaced in the UI. A utility function `getConnections(userId)` returns all connected users.

### Derived: balance
Always computed. Never stored. Balance = `SUM(amount) WHERE to_user_id = user` minus `SUM(amount) WHERE from_user_id = user`. Expose as a typed utility function.

---

## 5. QR Codes and Signed Tokens

**Principle:** QR URL must not expose raw DB IDs. Must work with a standard phone camera. Token must be partially client-verifiable before a server call.

### Token generation
When a user confirms an amount, the server:
1. Creates the `pending_qr` record.
2. Signs a JWT (HS256, `qrJwtSecret`) containing: `jti` (pending_qr.id), `iss` (APP_URL), `iat`, `exp`, `amt`, `dir`, `dn` (initiator display name).
3. Returns the signed JWT to the client.

QR encodes: `[APP_URL]/accept/[signed-jwt]`

A standard camera opens this URL in the browser — no deep-link config needed.

### Client-side pre-check
Decode JWT (no signature verify — client has no secret). Check `exp` and `iss`. On failure: render "This link has expired or is invalid" with no server call.

### Server-side acceptance
1. Verify JWT signature and `exp`.
2. Look up `pending_qr` by `jti`. Confirm `status = pending` and `expires_at` not passed.
3. Single SQLite transaction: insert `transactions` + update `pending_qr.status = completed`.
4. Return completed transaction.

**Note to [SUB-AGENT E]:** Research a Deno-compatible JWT library (e.g. `jose`). `qrJwtSecret` must never appear in any client bundle.

---

## 6. Onboarding Flow

The onboarding has two distinct phases:

**Phase 1 — Authentication** (getting into the app)
Shown to everyone on first visit and on new devices.

1. **Welcome screen** — app name, one-line description, "Get started" CTA.
2. **Consent screen** — four plain-language points:
   - No real money moves — credit records mutual obligations, not transfers.
   - We store almost nothing — only your phone number and a display name.
   - Other members see your balance when you transact with them.
   - Open source and community-owned — the code is public, any community can run their own instance, and changes that affect your data or credits will always be announced in advance.
   - CTA: "I understand, continue."
3. **Phone number entry** — E.164 input with country prefix. "Send code" CTA. "Use email instead" secondary link.
4. **OTP entry** — 6-digit code. 30-second resend countdown. Auto-advances on completion to a brief "verified" confirmation screen, then proceeds to Phase 2.

**Phase 2 — App introduction** (understanding the system)
Shown once, after first successful authentication. Can be skipped via "Skip intro" link.

5. **Intro step 1** — "A ledger of trust." What credit means. No real money. Include the local multiplier concept in plain language: the community can trade to the extent of its trust, not to the extent of its cash. Reference the one-line pitch.
6. **Intro step 2** — "Negative is normal." What the balance means.
7. **Intro step 3 — Name entry** — "What should we call you?" Display name input (required, 2–40 chars). This is where the display name is set, since there is no identity provider to source it from. Welcome message shown below input. CTA: "Enter the community."

After step 7 → Home.

**Returning users** skip both phases entirely and go directly to Home.
**Returning users on a new device** go through Phase 1 only (OTP), then directly to Home — no Phase 2 repeat.

---

## 7. Screens and UX Flows

### 7.1 Home

1. Header — app name (left), settings icon (right)
2. Balance card — large centred amount. Positive: affirming colour. Negative: distinct but non-alarming. Captions: *"The community owes you"* (positive) / *"You owe the community"* (negative) / *"You're all square"* (zero). **Do not use** "your balance grows as the community trusts you" — this confused testers. The zero state on first use should read simply: *"Your balance starts at zero. Send or receive credit to get started."*
3. Two large thumb-reachable buttons: `Send` and `Receive`.
4. Last 5 transactions — other member's name, signed amount, relative time. "See all" link.

---

### 7.2 Send Flow

**Step 0 — First-send consent (once only)**
Shown the very first time a user taps Send, before the amount screen. Never shown again once acknowledged (`app_users.send_consent_at` is set on confirmation).

> **"You are extending credit"**
>
> When you send credit to someone, you are lending them value. You trust that they will contribute back to the community over time — directly to you, or to others.
>
> There is no automatic repayment. If you have agreed on specific conditions — a timeframe, a service in return, anything — write them in the description when you send. That note belongs to the transaction record.
>
> The system works best when people do not demand repayment. But you always have the right to ask.

Two buttons: **"I understand, let's go"** (sets `send_consent_at`, proceeds to amount entry) and **"Not now"** (returns to Home without setting the flag).

---

**Step 1 — Amount and description**
- Large numeric input; unit symbol from config.
- Description field — optional, max 120 chars. Displayed prominently, not as an afterthought. Placeholder: *"What's this for? Any conditions? (optional)"*. This field is the place to record repayment agreements, context, or anything the other person should see. It travels with the transaction permanently.
- CTA: "Generate QR"

**Step 2 — QR display**
- Full-screen QR.
- Caption: "Show this to the other person. They scan it to accept."
- Countdown to expiry.
- Cancel (sets `pending_qr.status = declined`).
- On expiry: greyed out, "Expired — tap to go back."
- Auto-transitions on acceptance (poll every 2s or SSE — agent chooses simplest).

**Step 3 — Confirmation**
- "✓ Done. You sent [symbol][amount] to [name]." Updated balance. CTA: "Back to home"

---

### 7.3 Receive Flow

**Step 1 — Amount and description**
- Same input as Send. Helper: *"Enter the amount you'd like to request."* `direction: receive`.
- Description field — optional, max 120 chars. Same prominence as Send. Placeholder: *"What's this for? (optional)"*.

**Step 2 — QR display**
- Same QR component. Caption: "Ask the other person to scan this to send you credit."

**Step 3 — Confirmation**
- "✓ Done. You received [symbol][amount] from [name]." Updated balance.

---

### 7.4 Accept Screen (`/accept/[jwt]`)

Works for unauthenticated scanners — Better Auth redirects to sign-in (Phase 1 only, no intro) then returns here.

1. "[Name] wants to send you [symbol][amount]" or "[Name] is requesting [symbol][amount] from you"
2. Note if present.
3. "[Name]'s current balance: [balance]" — balance only, no history.
4. First-time notice (once; dismissed via `localStorage`): "Accepting records a community credit — not real money. Balances will update in your shared ledger."
5. `Accept` (primary) and `Decline` (ghost).

---

### 7.5 Transaction History

Full list, reverse chronological. Row: other member's name, signed amount, note, date. Toggle: All / Sent / Received. Simple scroll. No pagination.

---

### 7.6 Settings

- Display name — editable, saved server-side.
- Language — EN / PT, persisted in session.
- Sign out.
- About — one paragraph + `communityDocUrl` link.

---

## 8. Notifications

In-app only. No push. No email (except as auth fallback).

- Transaction completions update relevant screens in place (poll or SSE).
- First-time credit notice on Accept screen is the only persistent dismissible notice (`localStorage`).
- All help text is inline, contextual, two sentences max.

---

## 9. Internationalisation (intlayer)

- All user-facing strings in intlayer. No hardcoded copy.
- Locales: `en` (default), `pt`, `nl`.
- Language preference in session; persists across devices.
- Toggle in Settings and on all onboarding steps (top-right corner).
- Key convention: `[screen].[element].[variant]` — e.g. `home.balance.caption_positive`.
- Unit values via interpolation, never baked into translation strings: `"You sent {amount} {unitDisplayName} to {name}"`.
- `APP_NAME` and `APP_TAGLINE` are env-var fallbacks only. All displayed strings — including app name and tagline — are sourced from intlayer so they render correctly per locale.

### Canonical translations for fixed brand strings

| Key | `en` | `pt` | `nl` |
|---|---|---|---|
| `welcome.tagline` | Together, we are more. | Juntos, somos mais. | Samen zijn we méér. |

The punctuation is part of the canonical string in all three languages. The accent on *méér* in Dutch is intentional emphasis — must be preserved exactly in the locale file.
---

## 10. Security and Privacy

- No route may return one user's transaction history to another user.
- Accept screen exposes only: amount, note, initiator display name, initiator balance.
- All ledger-modifying routes verify authenticated user server-side before acting.
- QR expiry enforced server-side. Client check is UX only.
- `qrJwtSecret` never in any client bundle.
- Better Auth cookie flags: verify `HttpOnly` and `SameSite=Lax` are not overridden.
- SQLite WAL mode enabled.
- Phone numbers are held exclusively by Better Auth's managed tables. `app_users` contains no PII beyond display name.

---

## 11. Sub-Agent Work Breakdown

Read the full document before starting any sub-task. Do less and flag rather than expanding scope.

---

### [SUB-AGENT A] — Scaffolding
**Depends on:** Nothing
**Delivers:**
- SvelteKit + Deno adapter; package name `mutuvia` in `package.json`
- AGPL-3.0 `LICENSE`; header template in `README.md`; `README.md` to note that `APP_NAME` and `APP_TAGLINE` are the rebranding entry points
- shadcn-svelte
- Drizzle + SQLite with WAL mode
- intlayer SDK; `en`, `pt`, and `nl` locale files (stub keys); `welcome.tagline` pre-populated with canonical strings from section 9
- Better Auth with `phoneNumber` and `emailOtp` plugins; Twilio configured as SMS provider via env vars; Drizzle adapter wired
- `src/lib/config.ts` per section 2
- `.env.example` with every variable documented
- `README.md` with setup instructions

---

### [SUB-AGENT B] — Schema, Migrations, Balance Logic
**Depends on:** [A]
**Delivers:**
- Drizzle schema: `app_users`, `transactions`, `pending_qr`, `connections` per section 4
- Initial migration
- Balance utility function with unit tests (zero, positive, negative, empty)
- `formatAmount(amount: number, decimalPlaces: number, symbol: string): string` utility with tests
- `getConnections(userId): app_users[]` utility — returns all users connected to a given user
- Seed script: 3 test users with varied balances and at least one connection between them

---

### [SUB-AGENT C] — Auth and Onboarding
**Depends on:** [A], [B]
**Delivers:**
- Better Auth SMS OTP sign-in flow end-to-end via Twilio
- Email OTP fallback flow
- Middleware: unauthenticated → Phase 1 auth screens
- Middleware: authenticated but no `app_users` record → Phase 2 intro screens
- Middleware: authenticated + `app_users` record → Home (skip all onboarding)
- All 7 onboarding screens per section 6, including display name entry on step 7
- `app_users` record created on name submission
- All strings in intlayer; language toggle on all auth and intro screens

---

### [SUB-AGENT D] — Home and Transaction History
**Depends on:** [B], [C]
**Delivers:**
- Home screen per section 7.1
- Transaction history per section 7.5
- Server API routes for authenticated user's own balance and transactions
- All strings in intlayer; amounts via `formatAmount`

---

### [SUB-AGENT E] — QR Flows and Accept Screen
**Depends on:** [B], [C]
**Delivers:**
- JWT sign/verify utility (`jose` or equivalent; document choice)
- Server route: create `pending_qr` → sign JWT → return to client
- Client-side QR rendering; reusable expiry countdown component
- First-send consent screen per section 7.2 step 0: shown once, sets `app_users.send_consent_at` on confirmation via a server route; gate is checked server-side before rendering amount entry
- Send flow per section 7.2
- Receive flow per section 7.3
- `/accept/[jwt]` per section 7.4
- Client-side JWT pre-check
- Atomic settlement: single SQLite transaction — insert `transactions`, update `pending_qr.status`, upsert `connections` for the pair (insert if not exists, ignore if exists)
- **Note:** `connections` upsert is silent — not surfaced in UI in MVP but seeds the future trust graph
- Decline action
- First-time notice (`localStorage`)
- Redirect-after-login for unauthenticated scanners (skips Phase 2 intro)
- Polling or SSE for screen auto-transition (document choice)
- All strings in intlayer

---

### [SUB-AGENT F] — Settings
**Depends on:** [C]
**Delivers:**
- Settings screen per section 7.6
- Editable display name with server-side save
- Language toggle wired to intlayer; preference in session
- Sign out; About section with `communityDocUrl`

---

### [SUB-AGENT G] — Translations (PT + NL)
**Depends on:** All other sub-agents (all keys finalised)
**Delivers:**
- Complete `pt` translations
- Complete `nl` translations
- `welcome.tagline` canonical strings verified against section 9 (including *méér* accent in `nl`)
- Review of `en` tone: plain, warm, non-fintech
- Unit interpolation verified in all three languages (word order differs — test all variants)
- Language toggle verified across all screens for all three locales

---

### [SUB-AGENT H] — Security Audit
**Depends on:** All other sub-agents
**Delivers:**
- No cross-user transaction history leak (verified)
- `qrJwtSecret` absent from all client bundles (verified)
- Server-side QR expiry enforced (verified)
- Better Auth cookie flags correct (verified)
- SQLite WAL mode active (verified)
- Phone numbers not present in `app_users` or any application-layer log (verified)
- All findings documented and fixed

---

## 12. Roadmap — Post-MVP

| Item | Notes |
|---|---|
| **Circular debt netting** | When A owes B, B owes C, and C owes A, surface a visible suggestion to cancel all three in one move. The math already resolves through balances; this adds the UI that makes it legible and satisfying. Multiple testers independently identified this as the standout selling point. |
| **Zero-knowledge balance proofs** | Allow users to prove their balance to a counterparty without the server ever storing it in plain text. Long-term privacy roadmap. |
| **Passkeys** | Biometric one-tap sign-in. Introduce once the app has real traction and reducing friction is clearly valuable. |
| **Invitation system** | Phone/email invites with a contact list. Users explicitly invite others by number or email. Builds on the implicit network already mapped by QR transactions. |
| **Sustainability / credit contributions** | Optional credit ask from active users to support ongoing development. Target active users only; never required. Implement only after the community is established and the value is self-evident. No consent language needed in MVP — this will be introduced transparently when the time comes. |
| **Re-auth per transaction** | Step-up authentication for high-value sends |
| **Maximum transaction amount** | Community governance decision; add as config when decided |
| **Trusted contacts / direct transfer** | Skip QR for known members. Mutual consent UX needs a dedicated planning sub-agent before any implementation |
| **Multiple units** | Gold, silver, or custom units; per-transaction unit selection |
| **Admin panel** | Member management, transaction oversight |
| **Credit limits** | Community-configurable maximum negative balance |
| **Transaction disputes** | Formal dispute and reversal flow |
| **Cooperative legal entity integration** | Compliance reporting |
| **Push notifications** | Mobile push for received credits |
| **Multi-community support** | Multiple ledgers per deployment |

---

## 13. Explicitly Out of Scope for MVP

Flag, do not implement, if any request edges toward:

- PWA / service worker / offline mode
- Push notifications
- Re-auth per transaction
- Contact/friend management
- Balance or transaction limits
- Admin panel
- Dispute or reversal flows
- Multiple unit denominations
- Any real payment system or external financial API

---

*End of plan. Read in full before starting any sub-task. When in doubt, do less and flag.*
