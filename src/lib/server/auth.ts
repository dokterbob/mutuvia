// SPDX-License-Identifier: AGPL-3.0-or-later

import { betterAuth } from 'better-auth';
import { createAuthMiddleware, APIError, isAPIError } from 'better-auth/api';
import { phoneNumber, emailOTP } from 'better-auth/plugins';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import Prelude from '@prelude.so/sdk';
import { db } from './db';
import { config } from '$lib/config';
import { sendOtpEmail } from './mailer';
import { makePlaceholderEmail } from '$lib/placeholder-email';
import { closeSession } from './sse-registry';
import { maskPhone } from './phone-mask';

// Singleton client — created once at module load, reused across requests.
// null when PRELUDE_API_TOKEN is not set (dev/test fallback).
const prelude = config.preludeApiToken ? new Prelude({ apiToken: config.preludeApiToken }) : null;

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
	sendOTP: async ({ phoneNumber: phone, code }) => {
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
		const result = await prelude.verification.create({
			target: { type: 'phone_number', value: phone },
			options: { code_size: 6 }
		});
		if (result.status === 'blocked') {
			console.error(`Prelude blocked verification for ${maskPhone(phone)}: ${result.reason}`);
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
		useSecureCookies: config.appUrl.startsWith('https://')
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
