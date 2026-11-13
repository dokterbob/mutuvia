// SPDX-License-Identifier: AGPL-3.0-or-later

import { betterAuth } from 'better-auth';
import { createAuthMiddleware, APIError, getSessionFromCtx, isAPIError } from 'better-auth/api';
import { phoneNumber, emailOTP } from 'better-auth/plugins';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { parsePhoneNumberFromString } from 'libphonenumber-js';
import Prelude from '@prelude.so/sdk';
import { db } from './db';
import { config } from '$lib/config';
import { sendOtpEmail } from './mailer';
import { makePlaceholderEmail, isPlaceholderEmail } from '$lib/placeholder-email';
import { closeSession } from './sse-registry';
import { maskPhone } from './phone-mask';
import { checkAndRecordOtpSend } from './otp-throttle';
import {
	canonicalE164,
	normalizeEmailDestination,
	normalizePhoneDestination
} from './otp-destination';

// Singleton client — created once at module load, reused across requests.
// null when PRELUDE_API_TOKEN is not set (dev/test fallback).
const prelude = config.preludeApiToken ? new Prelude({ apiToken: config.preludeApiToken }) : null;

// Marker stashed on `ctx.context` by `phoneNumberPlugin`'s `sendOTP` when
// Prelude reports a verification as `blocked`, and read back by `hooks.after`
// below to turn that into a real client-visible error. Needed because
// Better Auth's `runInBackgroundOrAwait` (context/create-context.mjs)
// unconditionally swallows anything `sendOTP` throws — including the
// fire-and-forget case, which is the default here since
// `advanced.backgroundTasks.handler` isn't configured — so a thrown error
// inside `sendOTP` itself can NEVER reach the client; `hooks.after` can,
// since it runs before the final response is produced (to-auth-endpoints.mjs).
//
// Two non-obvious things had to be verified empirically (see
// auth-abuse.test.ts, which exercises this end to end against a real,
// mocked-Prelude Better Auth instance) rather than assumed from reading the
// source, because `better-call`'s middleware plumbing is more layered than
// it looks:
//   1. The `ctx` object `sendOTP`'s second argument receives is NOT the same
//      object identity as the `ctx` a `hooks.after` `createAuthMiddleware`
//      callback receives for the same request — each gets its own freshly
//      constructed endpoint-context wrapper. Stashing directly on `ctx`
//      (confirmed via dumping `Object.keys(ctx)`) does not survive between
//      the two. `ctx.context`, however, IS the same object reference
//      throughout one request's whole before/endpoint/after chain — it's
//      built once per request in better-auth's to-auth-endpoints.mjs
//      (`context: { ...authContext, returned: undefined, ... }`, a *fresh
//      per-request copy* spread from the long-lived shared AuthContext, not
//      that singleton itself) — so mutating it is request-scoped and safe
//      under concurrency.
//   2. A plain string key is used, not a Symbol: an earlier attempt with a
//      Symbol-keyed property did not survive the trip (some context-merging
//      step in that plumbing likely iterates `Object.keys()`, which excludes
//      symbols) — switching to a string key, combined with #1, is what
//      actually worked end to end.
const PRELUDE_BLOCKED = '__mutuviaPreludeBlocked';

/**
 * Returns the normalized destination (see otp-destination.ts) an OTP would
 * be sent to for this request, or `null` if `path` isn't one of the
 * endpoints that actually triggers a send. Used by the throttle check in
 * `hooks.before` below.
 */
function otpSendDestination(path: string, body: unknown): string | null {
	if (!body || typeof body !== 'object') return null;
	const b = body as Record<string, unknown>;
	if (path === '/phone-number/send-otp' && typeof b.phoneNumber === 'string') {
		return normalizePhoneDestination(b.phoneNumber);
	}
	if (path === '/email-otp/send-verification-otp' && typeof b.email === 'string') {
		return normalizeEmailDestination(b.email);
	}
	if (path === '/email-otp/request-email-change' && typeof b.newEmail === 'string') {
		return normalizeEmailDestination(b.newEmail);
	}
	return null;
}

/**
 * Review fix (PR #136): the per-destination throttle key used to only
 * `.trim()` a phone number, so "+15550001111" and "+1 5550001111" landed in
 * different buckets — an attacker could spend unlimited distinct throttle
 * buckets against the same real number just by varying whitespace, fully
 * defeating the throttle. Canonicalizing the key alone isn't enough on its
 * own, though: `/phone-number/verify` writes `ctx.body.phoneNumber`
 * *directly* to `user.phone_number` (in both the `signUpOnVerification` and
 * `updatePhoneNumber` branches — see routes.mjs), so a non-canonical string
 * reaching that endpoint would also sidestep the unique index on
 * `user.phone_number` added in PR #135 ("+1 555…" and "+1555…" would count
 * as two different strings to SQLite/Postgres).
 *
 * Rejecting outright (rather than silently rewriting the body to the
 * canonical form) is the simpler and safer of the two options `canonicalE164`
 * and `normalizePhoneDestination`'s doc comments describe: it needs no
 * `hooks.before` request-mutation machinery, and it never second-guesses
 * what the caller meant. It also costs nothing for real users: the actual
 * client (PhoneInput / svelte-tel-input) always emits clean E.164 with no
 * internal whitespace, so only a non-standard caller is ever affected.
 *
 * Applied to both endpoints that accept a `phoneNumber` body field and can
 * trigger a send/write: `/phone-number/send-otp` (so a malformed number
 * never reaches the throttle count or Prelude) and `/phone-number/verify`
 * (so a malformed number never reaches `createUser`/`updateUser`). Uses the
 * exact same message Better Auth's own `phoneNumberValidator` rejection
 * already shows for a disallowed country (`PHONE_NUMBER_ERROR_CODES.
 * INVALID_PHONE_NUMBER` = "Invalid phone number") — this is not a new
 * user-facing string, so it needs no new i18n/localization entry.
 */
function rejectNonCanonicalPhoneNumber(path: string, body: unknown): void {
	if (path !== '/phone-number/send-otp' && path !== '/phone-number/verify') return;
	if (!body || typeof body !== 'object') return;
	const raw = (body as Record<string, unknown>).phoneNumber;
	if (typeof raw !== 'string') return;
	const canonical = canonicalE164(raw);
	if (!canonical || canonical !== raw) {
		throw new APIError('BAD_REQUEST', { message: 'Invalid phone number' });
	}
}

// ── Phone number pre-claim fix (see auth.test.ts for the end-to-end attack) ──
//
// `/sign-in/email-otp` creates a user via
// `parseUserInput(options, rest, "create")`, where `rest` is EVERY extra key
// in the request body (its zod schema is `z.object({...}).and(z.record(...))`,
// which accepts arbitrary extra keys). `parseUserInput` resolves the "input"
// field set via `getFields(options, "user", "input")`
// (node_modules/better-auth/dist/db/schema.mjs) — which, for "input" mode,
// starts from `user.additionalFields` and then layers each plugin's own
// schema fields ON TOP, so a plugin's field definition always wins over
// anything declared in `user.additionalFields`. That means there is no
// documented `betterAuth()` option that can mark the phone plugin's own
// `phoneNumber` field `input: false` (unlike `phoneNumberVerified`, which the
// plugin already declares with `input: false` itself — see
// node_modules/better-auth/dist/plugins/phone-number/schema.mjs). An
// attacker can therefore sign up by email while smuggling
// `phoneNumber: "<victim's number>"` in the body; when the victim later does
// an ordinary phone sign-in, `/phone-number/verify`'s `findOne` by phone
// number matches the attacker's pre-planted row and signs the victim into
// the attacker's account.
//
// Fixed two ways, per the PR:
// 1. (primary, defense-in-depth-first) `hooks.before` below rejects any
//    `/sign-in/email-otp` request whose body contains `phoneNumber` or
//    `phoneNumberVerified` — a real `APIError`, not silently stripped, using
//    the documented, stable `hooks.before` API.
// 2. (belt) We also flip the phone plugin's own `phoneNumber` field to
//    `input: false` by mutating the plugin instance's returned schema object
//    before it's used — `getFields` reads `plugin.schema.user.fields` off
//    the live object at request time, so this works, but it relies on an
//    internal shape, not a public option. If a future better-auth upgrade
//    changes that shape, this becomes a silent no-op — the hooks.before
//    check above and the real end-to-end attack test in auth.test.ts are the
//    actual safety net (that test re-demonstrates the live attack against
//    the real Better Auth instance on every run, so it would start failing
//    again if either defense regressed).
const phoneNumberPlugin = phoneNumber({
	signUpOnVerification: {
		getTempEmail: (phoneNumber) => makePlaceholderEmail(phoneNumber)
	},
	// SMS pumping (toll fraud) defense: reject phone numbers outside an
	// operator-configured country allowlist before an OTP is ever sent.
	// `false`/a thrown error both map to the same clean 400
	// (PHONE_NUMBER_ERROR_CODES.INVALID_PHONE_NUMBER — see
	// node_modules/better-auth/dist/plugins/phone-number/routes.mjs). Uses
	// `libphonenumber-js` (already pulled in transitively by
	// `svelte-tel-input`, the library `PhoneInput` itself uses — see
	// src/lib/components/ui/phone-input — now a direct dependency since
	// server code needs it independent of that client component) rather
	// than hand-rolled calling-code prefix matching, which breaks for the
	// many calling codes shared by multiple countries (+1, +44 extensions,
	// etc). `undefined` (country not determinable) is rejected whenever an
	// allowlist is configured — fail closed, since we can't confirm it's
	// allowed.
	phoneNumberValidator: (phone) => {
		const allowlist = config.phoneCountryAllowlist;
		if (!allowlist) return true;
		const country = parsePhoneNumberFromString(phone)?.country;
		return !!country && (allowlist as string[]).includes(country);
	},
	sendOTP: async ({ phoneNumber: phone, code }, ctx) => {
		if (!prelude) {
			if (config.devLogOtp) {
				console.log(`[DEV] OTP for ${phone}: ${code}`);
				return;
			}
			// Throw rather than silently return — Better Auth logs this via
			// its background-task error handler. Note this does NOT make
			// the failure visible in the HTTP response: Better Auth's
			// phone-number route always returns `{ message: "code sent" }`
			// regardless of what sendOTP does (likely to avoid leaking
			// phone-number enumeration signals), so "visible" here means
			// visible in server logs, not to the calling client.
			throw new Error('PRELUDE_API_TOKEN not configured — cannot send SMS OTP');
		}
		// SMS-pumping signal: pass what's cheaply available about the caller
		// so Prelude's own fraud detection can weigh it. `ip` comes from the
		// same always-trustworthy header `hooks.server.ts` sets (see
		// config.trustedIpHeader) — never a raw, client-spoofable header.
		const result = await prelude.verification.create({
			target: { type: 'phone_number', value: phone },
			options: { code_size: 6 },
			signals: {
				ip: ctx?.headers?.get(config.trustedIpHeader) ?? undefined,
				user_agent: ctx?.headers?.get('user-agent') ?? undefined,
				app_version: config.appVersion
			}
		});
		if (result.status === 'blocked') {
			// Never log the phone number unmasked. `result.reason` is one of a
			// fixed small set of enum strings (e.g. "suspicious",
			// "repeated_attempts") — never derived from the phone number
			// itself, so it's safe to log as-is.
			console.error(`Prelude blocked verification for ${maskPhone(phone)}: ${result.reason}`);
			// See the PRELUDE_BLOCKED comment above: this is how the client
			// actually finds out, since a throw here would be swallowed.
			if (ctx) (ctx.context as unknown as Record<string, boolean>)[PRELUDE_BLOCKED] = true;
		}
	},
	// Only override verification when Prelude is configured —
	// without it, Better Auth's internal verification handles dev/test
	...(prelude
		? {
				verifyOTP: async ({ phoneNumber: phone, code }: { phoneNumber: string; code: string }) => {
					try {
						const result = await prelude.verification.check({
							target: { type: 'phone_number', value: phone },
							code
						});
						return result.status === 'success';
					} catch (err) {
						console.error('Prelude verification check failed:', err);
						return false;
					}
				}
			}
		: {}),
	otpLength: 6
});

const phoneNumberField = phoneNumberPlugin.schema?.user?.fields?.phoneNumber as
	| { input?: boolean }
	| undefined;
if (phoneNumberField) {
	phoneNumberField.input = false;
}

export const auth = betterAuth({
	// Deliberately NOT setting `baseURL`. Better Auth's own route matcher
	// (isAuthPath, in better-auth/dist/integrations/svelte-kit.mjs) compares
	// the incoming request's origin against `baseURL`'s origin and 404s on
	// any mismatch — direct port access, a LAN IP, or a proxy that doesn't
	// preserve Host would all then break every /api/auth/* route with no
	// diagnostic. Leaving it unset makes Better Auth derive the origin from
	// each request instead (see getBaseURL in better-auth/dist/utils/url.mjs),
	// which is what correctly happened before `trustedOrigins` below existed.
	// Cookie security is driven explicitly instead (next line) rather than
	// through baseURL or Better Auth's own `isProduction`, which is baked at
	// build time and unreliable — see patches/svelte-adapter-bun@*.patch.
	advanced: {
		useSecureCookies: config.appUrl.startsWith('https://'),
		ipAddress: {
			// Better Auth's default (`x-forwarded-for`) is a raw, client-settable
			// header — reading it directly would let a client pick its own
			// rate-limit bucket. `config.trustedIpHeader` instead names a header
			// `src/hooks.server.ts` always sets itself, from SvelteKit's own
			// `event.getClientAddress()`, after stripping any client-supplied
			// value of that same header first. See README's "Reverse proxy /
			// client IP" section.
			ipAddressHeaders: [config.trustedIpHeader]
		}
	},
	// Explicit, not `?? config.isProduction` — see `config.rateLimitEnabled`'s
	// own doc comment for why. `storage: 'database'` needs the `rateLimit`
	// table (schema.sqlite.ts / schema.pg.ts) and is NOT self-pruning — see
	// the PR description for what that means operationally.
	rateLimit: {
		enabled: config.rateLimitEnabled,
		storage: 'database',
		window: 60,
		max: 20,
		customRules: {
			// Better Auth's own default special rules already cover
			// `/sign-in/*` (3/10s) and `/email-otp/send-verification-otp`
			// (3/60s) — these are set explicitly anyway so the policy for
			// every OTP-sending/verifying endpoint is documented in one place
			// rather than split between here and Better Auth's defaults.
			'/phone-number/send-otp': { window: 60, max: 3 },
			'/email-otp/send-verification-otp': { window: 60, max: 3 },
			'/phone-number/verify': { window: 60, max: 5 },
			'/sign-in/email-otp': { window: 60, max: 5 }
		}
	},
	database: drizzleAdapter(db, {
		provider: config.dbProvider
	}),
	emailAndPassword: {
		enabled: false
	},
	plugins: [
		emailOTP({
			sendVerificationOTP: async ({ email, otp }) => {
				await sendOtpEmail(email, otp);
			},
			otpLength: 6,
			changeEmail: {
				enabled: true
			}
		}),
		phoneNumberPlugin
	],
	session: {
		expiresIn: 60 * 60 * 24 * 30, // 30 days
		updateAge: 60 * 60 * 24 // 1 day
	},
	trustedOrigins: [config.appUrl],
	// Endpoints registered by Better Auth core/plugins that this app never
	// calls (neither the client nor any `auth.api.*` server call) and that
	// would otherwise be live, reachable attack surface:
	//   - `/sign-in/phone-number`, `/phone-number/request-password-reset`,
	//     `/phone-number/reset-password` — password-based phone sign-in;
	//     `emailAndPassword.enabled: false` does NOT gate these (confirmed
	//     against node_modules/better-auth/dist/plugins/phone-number/routes.mjs
	//     — they call `ctx.context.password.verify()` directly, unconditionally).
	//   - `/email-otp/request-password-reset`, `/forget-password/email-otp`,
	//     `/email-otp/reset-password` — password-reset-via-email-OTP, same
	//     story: no password is ever set in this app.
	//   - `/email-otp/check-verification-otp` — reveals whether a given OTP
	//     is still valid without consuming it; unused and only useful for
	//     probing.
	//   - `/sign-up/email`, `/sign-in/email`, `/change-password`,
	//     `/reset-password`, `/forget-password`, `/set-password`,
	//     `/delete-user` — the core email+password flows. These stay live
	//     even with `emailAndPassword.enabled: false` (confirmed:
	//     node_modules/better-auth/dist/api/routes/{sign-in,sign-up}.mjs
	//     check the flag internally and 400; `/change-password`,
	//     `/delete-user`, `/reset-password`, etc. in update-user.mjs /
	//     password.mjs are not gated by it at all and would operate on
	//     accounts that can never have a password in this app).
	//   - `/update-user` — not used by this app (display name is a separate
	//     SvelteKit form action against `app_users`, not Better Auth's `user`
	//     row). Also closes a second route to the same
	//     phoneNumber-pre-claim-shaped bug: `/update-user`'s `rest` goes
	//     through the same `parseUserInput(options, rest, "update")`, so
	//     without this, any authenticated user could set their OWN
	//     `phoneNumber` via `/update-user` with no OTP verification at all.
	//   - `/list-sessions`, `/revoke-session`, `/revoke-sessions`,
	//     `/revoke-other-sessions` — not used by the client. Disabling them
	//     as HTTP paths does NOT affect the server-side
	//     `auth.api.revokeOtherSessions(...)` call below — `disabledPaths` is
	//     enforced only inside the HTTP router (confirmed
	//     node_modules/better-auth/dist/api/index.mjs:165-167); `auth.api.*`
	//     calls the endpoint function directly and never goes through it.
	disabledPaths: [
		'/sign-in/phone-number',
		'/phone-number/request-password-reset',
		'/phone-number/reset-password',
		'/email-otp/request-password-reset',
		'/forget-password/email-otp',
		'/email-otp/reset-password',
		'/email-otp/check-verification-otp',
		'/sign-up/email',
		'/sign-in/email',
		'/change-password',
		'/reset-password',
		'/forget-password',
		'/set-password',
		'/delete-user',
		'/update-user',
		'/list-sessions',
		'/revoke-session',
		'/revoke-sessions',
		'/revoke-other-sessions',
		// Review fix (PR #135, nit): found via an exhaustive enumeration of
		// every route the live Better Auth instance registers (see
		// auth.test.ts's "every registered route is accounted for" test) —
		// all live, parameterless, and unused by this app (no social
		// provider is configured; no password is ever set; this app's own
		// `authClient.emailOtp.*` calls never use the `email-verification`
		// OTP type `/email-otp/verify-email` needs).
		'/change-email',
		'/send-verification-email',
		'/verify-email',
		'/verify-password',
		'/update-session',
		'/account-info',
		'/get-access-token',
		'/link-social',
		'/list-accounts',
		'/refresh-token',
		'/sign-in/social',
		'/unlink-account',
		'/request-password-reset',
		'/delete-user/callback',
		'/email-otp/verify-email'
	],
	hooks: {
		before: createAuthMiddleware(async (ctx) => {
			// Primary defense for the phone-number pre-claim attack (see the
			// long comment above `phoneNumberPlugin` and auth.test.ts): reject
			// outright rather than silently stripping, so an attacker sees a
			// clean failure instead of a signup that "worked" but quietly
			// dropped their payload.
			if (
				ctx.path === '/sign-in/email-otp' &&
				ctx.body &&
				typeof ctx.body === 'object' &&
				('phoneNumber' in ctx.body || 'phoneNumberVerified' in ctx.body)
			) {
				throw new APIError('BAD_REQUEST', {
					message: 'phoneNumber is not allowed on this endpoint'
				});
			}

			// Must run before the throttle check below — see
			// rejectNonCanonicalPhoneNumber's doc comment.
			rejectNonCanonicalPhoneNumber(ctx.path, ctx.body);

			// Per-destination OTP send throttle — independent of client IP
			// (which Better Auth's own `rateLimit` below already covers).
			// This has to run as a `hooks.before` check that THROWS, rather
			// than inside `sendOTP`/`sendVerificationOTP`: Better Auth's
			// `runInBackgroundOrAwait` swallows anything those throw (see the
			// PRELUDE_BLOCKED comment above), so this is the only place a
			// throttle rejection can actually reach the client as a 429. Every
			// endpoint that triggers an OTP send to a destination the caller
			// controls goes through this — not just the obvious sign-in send
			// endpoints, but also `requestEmailChange` (which sends to an
			// arbitrary new address).
			const destination = config.otpThrottleEnabled ? otpSendDestination(ctx.path, ctx.body) : null;
			if (destination && (await mayConsumeOtpQuota(ctx))) {
				const result = await checkAndRecordOtpSend(destination);
				if (!result.ok) {
					throw new APIError('TOO_MANY_REQUESTS', {
						message: 'Too many attempts. Please try again later.',
						retryAfterSeconds: result.retryAfterSeconds
					});
				}
			}
		}),
		// Server-side session revocation on credential change (so it can't be
		// skipped by a client). Both endpoints below keep the CURRENT session
		// alive and only reuse it (no new session/token is minted on a
		// successful credential change — confirmed in routes.mjs for both),
		// so `auth.api.revokeOtherSessions` — which excludes the session
		// matching the request's own cookie — is exactly the right primitive.
		//
		// IMPORTANT — `hooks.after` runs on FAILED requests too, not just
		// successful ones (verified against the installed source,
		// node_modules/better-auth/dist/api/to-auth-endpoints.mjs: a thrown
		// `APIError` is caught, stored as `internalContext.context.returned`,
		// and `runAfterHooks` still runs — using that same `ctx.context` —
		// BEFORE the error is re-thrown to the caller). An earlier version of
		// this comment claimed the opposite; it was wrong, and so was the
		// code: a WRONG OTP on `/phone-number/verify`
		// (`updatePhoneNumber: true`) or `/email-otp/change-email` changed
		// nothing, yet still revoked every other session for the user
		// (confirmed live: 2 sessions → 1, on both paths — see
		// auth.test.ts). Gated below on `!isAPIError(ctx.context.returned)`
		// — `returned` holds the endpoint's normal return value on success,
		// or the thrown `APIError` instance itself on failure (same source).
		//
		// Only two endpoints actually change a *verified* credential on an
		// existing account:
		//   - `/phone-number/verify` with `updatePhoneNumber: true` (settings
		//     page phone change) — the OTHER use of this same endpoint is
		//     phone sign-in/sign-up, which must NOT trigger this (there is no
		//     "other sessions to revoke" concept for a brand new sign-in).
		//   - `/email-otp/change-email` (settings page email change) — this
		//     endpoint always requires an existing session
		//     (`sensitiveSessionMiddleware`), so no extra path-shape guard is
		//     needed there.
		after: createAuthMiddleware(async (ctx) => {
			const isPhoneCredentialChange =
				ctx.path === '/phone-number/verify' && ctx.body?.updatePhoneNumber === true;
			const isEmailCredentialChange = ctx.path === '/email-otp/change-email';
			const succeeded = !isAPIError(ctx.context.returned);
			if ((isPhoneCredentialChange || isEmailCredentialChange) && succeeded) {
				await revokeOtherSessionsForCredentialChange(ctx.headers ?? new Headers());
			}
			// Review fix (PR #135 follow-up — see auth.test.ts's "stale
			// placeholder email release" describe block): a phone number
			// change must also refresh a phone-only user's placeholder
			// email, or the OLD number stays reserved forever. See
			// releaseStalePlaceholderEmail's own doc comment for why.
			if (isPhoneCredentialChange && succeeded) {
				await releaseStalePlaceholderEmail(ctx);
			}

			// See the PRELUDE_BLOCKED comment above `phoneNumberPlugin`: this is
			// the only way a `blocked` Prelude result can reach the client,
			// since the throw it would otherwise need lives inside `sendOTP`,
			// which Better Auth always swallows.
			if ((ctx.context as unknown as Record<string, boolean>)[PRELUDE_BLOCKED]) {
				throw new APIError('FORBIDDEN', {
					message: 'Unable to send verification code to this phone number.'
				});
			}
		})
	},
	databaseHooks: {
		session: {
			delete: {
				// Fires on every session deletion (sign-out, revoke-session, etc.),
				// in-process and synchronously with the request that caused it —
				// so a signed-out session's SSE stream(s) close immediately rather
				// than waiting for the next keepalive re-validation tick (see
				// src/routes/api/events/+server.ts).
				after: async (session) => {
					closeSession(session.id);
				}
			}
		}
	}
});

/**
 * Revokes every OTHER session for the user behind `headers`, keeping the
 * current session alive. Called after a successful email/phone change (see
 * src/routes/(app)/settings/+page.svelte and the hooks wired below) so a
 * stolen/shared session can't survive the legitimate owner re-securing their
 * credentials. Goes through `auth.api.revokeOtherSessions` (not a raw DB
 * delete) specifically so `databaseHooks.session.delete.after` above still
 * fires per revoked session and closes its SSE stream(s) — confirmed
 * `internalAdapter.deleteSession` (what `revoke-other-sessions` calls
 * internally) goes through the same hook path as any other session delete
 * (node_modules/better-auth/dist/db/internal-adapter.mjs).
 */
export async function revokeOtherSessionsForCredentialChange(headers: Headers): Promise<void> {
	try {
		await auth.api.revokeOtherSessions({ headers });
	} catch (err) {
		// Never let a revocation failure mask the credential change itself —
		// the change already happened; losing the "revoke other sessions"
		// side effect is a lesser failure than surfacing a 500 on a request
		// that otherwise succeeded.
		console.error('Failed to revoke other sessions after credential change:', err);
	}
}

/** The context object `hooks.after` handlers receive — reused here so this
 * helper's parameter type always matches what's actually passed to it. */
type AuthMiddlewareContext = Parameters<Parameters<typeof createAuthMiddleware>[0]>[0];

/**
 * Whether this request may be charged against `destination`'s per-destination
 * OTP budget. The throttle has to run in `hooks.before` (see the comment at
 * its call site), i.e. BEFORE the endpoint's own checks — so without this, a
 * request the endpoint is about to reject would still spend the budget of a
 * destination it never sends to. That matters for
 * `/email-otp/request-email-change`: it sends only after
 * `sensitiveSessionMiddleware` finds a (non-cached) session, and never to the
 * user's own current address. Codex review (PR #136): unauthenticated calls
 * naming someone else's address could otherwise lock that address out of
 * sign-in OTPs (3 per 10 minutes, then the daily cap) without sending them
 * anything. So mirror exactly those two eligibility checks here; the
 * atomic check-and-record below still runs for every eligible request.
 *
 * The "same address" check must use the ENDPOINT's equality (both sides
 * `.toLowerCase()`, nothing else — see request-email-change in
 * better-auth's email-otp routes.mjs), not the throttle key's alias folding:
 * `user+tag@gmail.com` normalizes to the same bucket as `user@gmail.com`,
 * yet Better Auth treats it as a different address and DOES send to it.
 * Comparing normalized keys exempted exactly those sends from the throttle
 * (Codex review, PR #136, second round).
 *
 * The sign-in send endpoints (`/phone-number/send-otp`,
 * `/email-otp/send-verification-otp`) are unauthenticated by design and
 * always attempt a send, so they are always charged.
 */
async function mayConsumeOtpQuota(ctx: AuthMiddlewareContext): Promise<boolean> {
	if (ctx.path !== '/email-otp/request-email-change') return true;
	const session = await getSessionFromCtx(ctx, { disableCookieCache: true });
	if (!session) return false;
	const newEmail = (ctx.body as { newEmail: string }).newEmail;
	return (session.user.email ?? '').toLowerCase() !== newEmail.toLowerCase();
}

/**
 * Refreshes a phone-only user's placeholder email after a successful phone
 * number change (`/phone-number/verify` with `updatePhoneNumber: true`).
 *
 * Why this is needed: a phone-only sign-up gets a deterministic placeholder
 * email from `getTempEmail` above (`<digits>@phone.placeholder`, see
 * src/lib/placeholder-email.ts). Better Auth's own `updatePhoneNumber`
 * branch (node_modules/better-auth/dist/plugins/phone-number/routes.mjs)
 * only updates the `phoneNumber` column — nothing there touches `email`.
 * Left alone, the user's OLD placeholder stays on their row forever, while
 * the OLD phone number itself becomes free again (the unique
 * `user_phone_number_idx` only constrains the CURRENT value). If a
 * different person later verifies that released number,
 * `signUpOnVerification`'s `createUser` call computes the SAME
 * deterministic placeholder for them — with no lookup-by-temp-email guard
 * beforehand — and the unique `user_email_idx` on the `user` table rejects
 * the insert outright, even though their OTP verified correctly (confirmed
 * live in auth.test.ts's "stale placeholder email release" describe block,
 * on both SQLite and PostgreSQL since both engines enforce the same unique
 * index — see schema.sqlite.ts / schema.pg.ts).
 *
 * Reusing `isPlaceholderEmail`/`makePlaceholderEmail` (the same helpers that
 * already drive the settings UI, src/routes/(app)/settings/+page.svelte)
 * keeps a phone-only user's placeholder always pointing at their CURRENT
 * number, so the OLD number is released the moment the change succeeds. A
 * real (non-placeholder) email is never touched.
 *
 * Edge case — the freshly computed placeholder for the NEW number already
 * belongs to some OTHER row: only reachable from a placeholder that went
 * stale before this fix existed (pre-existing deployed data — see README's
 * "Upgrading" section for the detection query and repair hint), since this
 * fix keeps every placeholder in sync with its owner's current number going
 * forward and the unique `user_phone_number_idx` already prevents two users
 * from sharing a `phoneNumber`. If it still happens, `updateUser` below
 * throws on the same unique `user_email_idx`; we catch and log rather than
 * rethrow. This runs in `hooks.after`, strictly after the phone-number
 * change itself already committed and already returned success to the
 * caller, so rethrowing here couldn't undo that write — it would only turn
 * an already-successful request into a confusing 500. Worst case: the phone
 * number change stands, the user's email stays the (now stale again) old
 * placeholder, and the failure is logged for manual cleanup.
 *
 * Exported only for auth.test.ts, which drives the concurrent-email-change
 * race directly (it can't be reproduced deterministically through the API).
 */
export async function releaseStalePlaceholderEmail(ctx: AuthMiddlewareContext): Promise<void> {
	const returnedUser = (
		ctx.context.returned as
			| { user?: { id?: string; email?: string | null; phoneNumber?: string | null } }
			| undefined
	)?.user;
	if (!returnedUser?.id || !returnedUser.phoneNumber) return;
	const oldPlaceholder = returnedUser.email;
	if (!oldPlaceholder || !isPlaceholderEmail(oldPlaceholder)) return;

	const newPlaceholder = makePlaceholderEmail(returnedUser.phoneNumber);
	if (oldPlaceholder === newPlaceholder) return;

	try {
		// Compare-and-set, not an unconditional write: `returnedUser` is a
		// snapshot from when the phone change committed, and the
		// revokeOtherSessionsForCredentialChange await above leaves a window
		// in which a concurrent, independently verified email change (the
		// settings page offers both flows) can replace the placeholder with a
		// real address. Only refresh while the row still holds exactly the old
		// placeholder AND the phone number this change set — otherwise a
		// later credential change has won and must not be overwritten. The
		// Drizzle adapter compiles this to a single
		// `UPDATE … WHERE id = ? AND email = ? AND phone_number = ?`.
		await ctx.context.adapter.update({
			model: 'user',
			where: [
				{ field: 'id', value: returnedUser.id },
				{ field: 'email', value: oldPlaceholder },
				{ field: 'phoneNumber', value: returnedUser.phoneNumber }
			],
			update: { email: newPlaceholder, updatedAt: new Date() }
		});
	} catch (err) {
		console.error('Failed to refresh placeholder email after phone change:', err);
	}
}
