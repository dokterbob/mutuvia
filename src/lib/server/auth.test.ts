// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Real-database, real-Better-Auth-instance tests for src/lib/server/auth.ts.
//
// These deliberately exercise the actual `auth` singleton (built from the
// actual `betterAuth({...})` config in auth.ts) against a real, migrated
// SQLite database — not mocks of Better Auth's internals — because the
// vulnerability this file guards against lives entirely inside Better
// Auth's own request-handling pipeline (zod body schemas that allow extra
// keys, field-level `input` flags, which DB row a plugin's `findOne` call
// happens to match). A test that mocks any of that could pass while the
// real attack still works.
//
// Attack (see auth.ts and the PR description for the full writeup):
// `/sign-in/email-otp`'s body schema is `z.object({...}).and(z.record(...))`,
// so extra keys pass validation. Better Auth spreads those extra keys
// (`rest`) into the new user it creates when the email is unseen. The
// phone-number plugin's own `phoneNumber` user field has no `input: false`,
// so an attacker signing up by email can smuggle `phoneNumber: "<victim>"`
// into their own new user row. When the victim later does a normal phone
// sign-in, `/phone-number/verify`'s `findOne` by phone number matches the
// attacker's pre-planted row (not a fresh one) and mints a session for it —
// logging the victim into the attacker's account.

import { describe, test, expect, beforeEach, afterEach, afterAll, vi } from 'vitest';
import { rmSync } from 'node:fs';
import { migrate } from 'drizzle-orm/bun-sqlite/migrator';
import { eq } from 'drizzle-orm';
import * as schema from './schema.sqlite';
import { makePlaceholderEmail } from '$lib/placeholder-email';

const { TEST_DB_FILE, configMock } = vi.hoisted(() => ({
	TEST_DB_FILE: `.vitest-auth-sqlite-${process.pid}.db`,
	// Mutable so the per-destination OTP throttle can be switched on for the
	// one describe block that exercises it (it is off everywhere else).
	configMock: { otpThrottleEnabled: false }
}));

// See settlement.sqlite.test.ts for why this must go through a `$lib/config`
// mock rather than mutating `process.env` (SvelteKit's `$env/dynamic/private`
// snapshot story) — and why DEV_LOG_OTP-equivalent (`devLogOtp: true`) is set
// here: with no Prelude/SMTP configured, leaving it false would make
// `sendOTP`/`sendVerificationOTP` throw on every call. Better Auth only logs
// that (fire-and-forget), but we don't want noisy/unhandled-rejection output
// in test runs when it's trivially avoidable — the OTP codes themselves are
// read straight out of the `verification` table below, not from these logs.
vi.mock('$lib/config', () => ({
	config: Object.assign(configMock, {
		dbFileName: TEST_DB_FILE,
		dbProvider: 'sqlite',
		appUrl: 'http://localhost:5173',
		preludeApiToken: '',
		devLogOtp: true,
		smtpHost: ''
	})
}));

const { sqlite, db: liveDb } = await import('./db.sqlite');
const { auth, releaseStalePlaceholderEmail } = await import('./auth');

function resetSchema() {
	const tables = sqlite
		.query<
			{ name: string },
			[]
		>(`SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'`)
		.all();
	sqlite.exec('PRAGMA foreign_keys = OFF;');
	for (const { name } of tables) {
		sqlite.exec(`DROP TABLE IF EXISTS "${name}"`);
	}
	sqlite.exec('PRAGMA foreign_keys = ON;');
	migrate(liveDb, { migrationsFolder: './drizzle/sqlite' });
}

/** Extracts the plaintext OTP code Better Auth stored for `identifier` (format `"<code>:<attempts>"`). */
function readOtp(identifier: string): string {
	const [row] = liveDb
		.select()
		.from(schema.verification)
		.where(eq(schema.verification.identifier, identifier))
		.all();
	if (!row) throw new Error(`No verification row found for identifier "${identifier}"`);
	const [code] = row.value.split(':');
	return code;
}

function findUserByEmail(email: string) {
	return liveDb.select().from(schema.user).where(eq(schema.user.email, email)).get();
}

function findUsersByPhone(phoneNumber: string) {
	return liveDb.select().from(schema.user).where(eq(schema.user.phoneNumber, phoneNumber)).all();
}

beforeEach(() => {
	resetSchema();
});

afterAll(() => {
	sqlite.close();
	for (const suffix of ['', '-wal', '-shm']) {
		rmSync(`${TEST_DB_FILE}${suffix}`, { force: true });
	}
});

describe('phone number pre-claim via /sign-in/email-otp — real Better Auth instance', () => {
	const ATTACKER_EMAIL = 'attacker@example.com';
	const VICTIM_PHONE = '+15550001111';

	async function attemptAttack() {
		await auth.api.sendVerificationOTP({ body: { email: ATTACKER_EMAIL, type: 'sign-in' } });
		const attackerOtp = readOtp(`sign-in-otp-${ATTACKER_EMAIL}`);

		// Attacker "signs in" (really signs up, since the email is unseen),
		// smuggling the victim's phone number as an extra body field. The
		// endpoint's zod schema (`z.object({...}).and(z.record(...))`) accepts
		// arbitrary extra keys, so this is not a type-level violation.
		return auth.api.signInEmailOTP({
			body: {
				email: ATTACKER_EMAIL,
				otp: attackerOtp,
				phoneNumber: VICTIM_PHONE
			} as unknown as { email: string; otp: string }
		});
	}

	test('Given an attacker tries to smuggle a victim phone number into /sign-in/email-otp, when they sign up, then the request is cleanly rejected and no account is created', async () => {
		await expect(attemptAttack()).rejects.toThrow();

		// A clean rejection, not a half-applied sign-up.
		expect(findUserByEmail(ATTACKER_EMAIL)).toBeFalsy();
		expect(findUsersByPhone(VICTIM_PHONE)).toHaveLength(0);
	});

	test('Given the attack was rejected, when the real victim later verifies their own phone, then they get a fresh account of their own', async () => {
		await expect(attemptAttack()).rejects.toThrow();

		// Victim does an ordinary phone sign-in for their own number — nothing
		// pre-planted should be sitting in the `user` table for it.
		await auth.api.sendPhoneNumberOTP({ body: { phoneNumber: VICTIM_PHONE } });
		const victimOtp = readOtp(VICTIM_PHONE);

		const result = await auth.api.verifyPhoneNumber({
			body: { phoneNumber: VICTIM_PHONE, code: victimOtp }
		});

		expect(result.user?.id).toBeTruthy();

		const phoneOwners = findUsersByPhone(VICTIM_PHONE);
		expect(phoneOwners).toHaveLength(1);
		expect(phoneOwners[0].id).toBe(result.user?.id);
		expect(phoneOwners[0].email).not.toBe(ATTACKER_EMAIL);
	});
});

describe('disabledPaths — real HTTP router', () => {
	// Mirrors how the app actually reaches these routes: a real Request into
	// `auth.handler` (what `svelteKitHandler`/`toSvelteKitHandler` call) —
	// `auth.api.*` server calls bypass the router (and `disabledPaths`)
	// entirely, so a test against `auth.api.*` wouldn't exercise the guard
	// this is meant to check.
	function request(path: string, body: Record<string, unknown> = {}) {
		return auth.handler(
			new Request(`http://localhost:5173/api/auth${path}`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify(body)
			})
		);
	}

	const disabled = [
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
		// Review fix (PR #135): live, unused, parameterless — same reasoning
		// as every other entry above.
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
	];

	test.each(disabled)(
		'Given %s is in disabledPaths, when requested, then it returns 404',
		async (path) => {
			const response = await request(path);
			expect(response.status).toBe(404);
		}
	);

	// Every path the client actually calls (see src/routes/onboarding/**,
	// src/routes/(app)/settings/+page.svelte) must still resolve — i.e. NOT
	// be blocked at the disabledPaths check. Any non-404 status proves the
	// request reached the endpoint's own logic.
	const used = [
		['/phone-number/send-otp', { phoneNumber: '+15551234567' }],
		['/phone-number/verify', { phoneNumber: '+15551234567', code: '000000' }],
		['/email-otp/send-verification-otp', { email: 'a@example.com', type: 'sign-in' }],
		['/sign-in/email-otp', { email: 'a@example.com', otp: '000000' }],
		['/email-otp/request-email-change', { newEmail: 'b@example.com' }],
		['/email-otp/change-email', { newEmail: 'b@example.com', otp: '000000' }],
		['/sign-out', {}]
	] as const;

	test.each(used)(
		'Given %s is used by the client, when requested, then it is not blocked by disabledPaths',
		async (path, body) => {
			const response = await request(path, body);
			expect(response.status).not.toBe(404);
		}
	);
});

// Review fix (PR #135, nit): rather than hand-maintaining a list of every
// endpoint Better Auth happens to register today, enumerate the REAL,
// currently-registered routes straight off the live `auth` instance (every
// wrapped function in `auth.api` carries its own `.path`, set by
// better-auth's to-auth-endpoints.mjs — `api[key].path = endpoint.path`) and
// check each one is accounted for. This is the thing that notices a future
// Better Auth upgrade adding a new live route we haven't looked at.
describe('every registered route is accounted for — real Better Auth instance', () => {
	// get-session and sign-out are core, always-needed; the rest are the six
	// endpoints the client actually calls (see src/routes/onboarding/** and
	// src/routes/(app)/settings/+page.svelte).
	const USED_PATHS = new Set([
		'/get-session',
		'/sign-out',
		'/phone-number/send-otp',
		'/phone-number/verify',
		'/email-otp/send-verification-otp',
		'/sign-in/email-otp',
		'/email-otp/request-email-change',
		'/email-otp/change-email'
	]);

	// Parameterized routes can't be disabled via `disabledPaths`, which
	// matches the literal, already-resolved incoming request path —
	// `/callback/:id` in that array would never match a real request like
	// `/callback/google`, so there is no way to disable a parameterized
	// route by exact-path matching. Both of the ones Better Auth registers
	// are inert regardless: no social provider is configured (so
	// `/callback/:id` never matches a real provider id), and nothing in
	// this app ever generates a `/request-password-reset` email containing
	// a `/reset-password/:token` link (no password is ever set). Recorded
	// here, rather than silently ignored, so this test still catches any
	// OTHER unaccounted-for route.
	const KNOWN_LIVE_PARAMETERIZED_PATHS = new Set(['/callback/:id', '/reset-password/:token']);

	// Core, always-on infrastructure routes — not auth-sensitive. `/ok`
	// (GET) returns `{ok: true}` with no data access; `/error` (GET)
	// renders a generic, non-data-leaking HTML error page. Both are
	// intended to always stay live regardless of which plugins are
	// configured (they're hidden from Better Auth's own generated OpenAPI
	// docs — HIDE_METADATA — rather than something apps are expected to
	// disable).
	const ALWAYS_LIVE_INFRA_PATHS = new Set(['/ok', '/error']);

	test('Given the real Better Auth instance, when every registered route is checked, then each one is either used, explicitly disabled, infra, or a documented parameterized exception', async () => {
		const { auth } = await import('./auth');

		const registeredPaths = new Set(
			Object.values(auth.api)
				.map((fn) => (fn as unknown as { path?: string }).path)
				.filter((p): p is string => typeof p === 'string')
		);
		// Sanity check on the enumeration mechanism itself — if this comes
		// back empty or tiny, `.path` stopped being attached and the rest of
		// this test would pass vacuously.
		expect(registeredPaths.size).toBeGreaterThan(20);

		const disabledPaths = new Set(auth.options.disabledPaths ?? []);

		const unaccountedFor = [...registeredPaths].filter(
			(path) =>
				!USED_PATHS.has(path) &&
				!disabledPaths.has(path) &&
				!KNOWN_LIVE_PARAMETERIZED_PATHS.has(path) &&
				!ALWAYS_LIVE_INFRA_PATHS.has(path)
		);

		expect(unaccountedFor).toEqual([]);
	});
});

describe('session revocation on credential change — real Better Auth instance', () => {
	/** Builds a `Cookie:` header from a `set-cookie` response header, so a
	 * follow-up `auth.api.*` call is recognised as "this session" — Better
	 * Auth signs its session cookie value, so a test can't construct one by
	 * hand; it must come from a real `set-cookie` response. */
	function cookieHeaderFrom(setCookie: string): string {
		return setCookie
			.split(/,(?=\s*[\w-]+=)/)
			.map((part) => part.split(';')[0].trim())
			.join('; ');
	}

	function sessionTokens(): string[] {
		return liveDb
			.select({ token: schema.session.token })
			.from(schema.session)
			.all()
			.map((r) => r.token);
	}

	test('Given a user has two active sessions, when they change their phone number from one of them, then the OTHER session is revoked and the current one survives', async () => {
		const phone = '+15552223333';

		// Session A: initial phone sign-up.
		await auth.api.sendPhoneNumberOTP({ body: { phoneNumber: phone } });
		const { headers: headersA } = await auth.api.verifyPhoneNumber({
			body: { phoneNumber: phone, code: readOtp(phone) },
			returnHeaders: true
		});
		const cookieA = cookieHeaderFrom(headersA.get('set-cookie')!);

		// Session B: a second device signing in with the same (already
		// verified) phone number — `/phone-number/verify` without
		// `updatePhoneNumber` always mints a fresh session.
		await auth.api.sendPhoneNumberOTP({ body: { phoneNumber: phone } });
		await auth.api.verifyPhoneNumber({ body: { phoneNumber: phone, code: readOtp(phone) } });

		expect(sessionTokens()).toHaveLength(2);

		// From session A, change to a new phone number.
		const newPhone = '+15559998888';
		await auth.api.sendPhoneNumberOTP({ body: { phoneNumber: newPhone } });
		await auth.api.verifyPhoneNumber({
			body: { phoneNumber: newPhone, code: readOtp(newPhone), updatePhoneNumber: true },
			headers: new Headers({ cookie: cookieA })
		});

		const remaining = sessionTokens();
		expect(remaining).toHaveLength(1);

		// Session A itself must still work — it was not revoked.
		const stillValid = await auth.api.getSession({ headers: new Headers({ cookie: cookieA }) });
		expect(stillValid?.user.phoneNumber).toBe(newPhone);
	});

	test('Given a user has two active sessions, when they change their email from one of them, then the OTHER session is revoked and the current one survives', async () => {
		const email = 'owner@example.com';

		// Session A: initial email sign-up.
		await auth.api.sendVerificationOTP({ body: { email, type: 'sign-in' } });
		const { headers: headersA } = await auth.api.signInEmailOTP({
			body: { email, otp: readOtp(`sign-in-otp-${email}`) },
			returnHeaders: true
		});
		const cookieA = cookieHeaderFrom(headersA.get('set-cookie')!);

		// Session B: a second device signing in with the same email.
		await auth.api.sendVerificationOTP({ body: { email, type: 'sign-in' } });
		await auth.api.signInEmailOTP({ body: { email, otp: readOtp(`sign-in-otp-${email}`) } });

		expect(sessionTokens()).toHaveLength(2);

		// From session A, change to a new email (requestEmailChange + changeEmail).
		const newEmail = 'owner-new@example.com';
		await auth.api.requestEmailChangeEmailOTP({
			body: { newEmail },
			headers: new Headers({ cookie: cookieA })
		});
		await auth.api.changeEmailEmailOTP({
			body: { newEmail, otp: readOtp(`change-email-otp-${email}-${newEmail}`) },
			headers: new Headers({ cookie: cookieA })
		});

		const remaining = sessionTokens();
		expect(remaining).toHaveLength(1);

		const stillValid = await auth.api.getSession({ headers: new Headers({ cookie: cookieA }) });
		expect(stillValid?.user.email).toBe(newEmail);
	});

	// Review fix (PR #135): `hooks.after` runs even when the endpoint (or an
	// earlier `hooks.before` check) throws — Better Auth's own
	// to-auth-endpoints.mjs catches a thrown APIError, stores it as
	// `ctx.context.returned`, and still runs `runAfterHooks` before
	// re-throwing. The session-revocation hook didn't check for this: a
	// WRONG OTP on `/phone-number/verify` (updatePhoneNumber:true) or
	// `/email-otp/change-email` changed nothing, yet still revoked every
	// other session for the user — confirmed live (2 sessions → 1) before
	// this fix.
	test('Given a WRONG OTP on /phone-number/verify (updatePhoneNumber:true), when the request fails, then the other session is NOT revoked', async () => {
		const phone = '+15552221111';

		await auth.api.sendPhoneNumberOTP({ body: { phoneNumber: phone } });
		const { headers: headersA } = await auth.api.verifyPhoneNumber({
			body: { phoneNumber: phone, code: readOtp(phone) },
			returnHeaders: true
		});
		const cookieA = cookieHeaderFrom(headersA.get('set-cookie')!);

		// Session B: a second device.
		await auth.api.sendPhoneNumberOTP({ body: { phoneNumber: phone } });
		await auth.api.verifyPhoneNumber({ body: { phoneNumber: phone, code: readOtp(phone) } });
		expect(sessionTokens()).toHaveLength(2);

		const newPhone = '+15559997777';
		await auth.api.sendPhoneNumberOTP({ body: { phoneNumber: newPhone } });
		await expect(
			auth.api.verifyPhoneNumber({
				body: { phoneNumber: newPhone, code: '000000', updatePhoneNumber: true },
				headers: new Headers({ cookie: cookieA })
			})
		).rejects.toThrow();

		expect(sessionTokens()).toHaveLength(2);
	});

	test('Given a WRONG OTP on /email-otp/change-email, when the request fails, then the other session is NOT revoked', async () => {
		const email = 'owner3@example.com';

		await auth.api.sendVerificationOTP({ body: { email, type: 'sign-in' } });
		const { headers: headersA } = await auth.api.signInEmailOTP({
			body: { email, otp: readOtp(`sign-in-otp-${email}`) },
			returnHeaders: true
		});
		const cookieA = cookieHeaderFrom(headersA.get('set-cookie')!);

		await auth.api.sendVerificationOTP({ body: { email, type: 'sign-in' } });
		await auth.api.signInEmailOTP({ body: { email, otp: readOtp(`sign-in-otp-${email}`) } });
		expect(sessionTokens()).toHaveLength(2);

		const newEmail = 'owner3-new@example.com';
		await auth.api.requestEmailChangeEmailOTP({
			body: { newEmail },
			headers: new Headers({ cookie: cookieA })
		});
		await expect(
			auth.api.changeEmailEmailOTP({
				body: { newEmail, otp: '000000' },
				headers: new Headers({ cookie: cookieA })
			})
		).rejects.toThrow();

		expect(sessionTokens()).toHaveLength(2);
	});

	test('Given a plain sign-in via /phone-number/verify (no updatePhoneNumber), when it succeeds, then no OTHER session is revoked — only an actual credential change does that', async () => {
		const phone = '+15552224444';

		await auth.api.sendPhoneNumberOTP({ body: { phoneNumber: phone } });
		await auth.api.verifyPhoneNumber({ body: { phoneNumber: phone, code: readOtp(phone) } });

		// Second device, same already-verified number — an ordinary sign-in,
		// not a credential change.
		await auth.api.sendPhoneNumberOTP({ body: { phoneNumber: phone } });
		await auth.api.verifyPhoneNumber({ body: { phoneNumber: phone, code: readOtp(phone) } });

		expect(sessionTokens()).toHaveLength(2);
	});
});

// Review finding (PR #135): a phone-only user's placeholder email
// (`<digits>@phone.placeholder`, from `getTempEmail` in auth.ts) is set once,
// at sign-up, from the phone number they had AT THAT TIME. Changing phone
// number via `/phone-number/verify` (`updatePhoneNumber: true`) only updates
// `phoneNumber` — nothing in Better Auth's own `updatePhoneNumber` branch
// (node_modules/better-auth/dist/plugins/phone-number/routes.mjs) touches
// `email`. The OLD placeholder is therefore left dangling on the user row,
// and the OLD phone number is free again (the unique `user_phone_number_idx`
// only constrains the CURRENT value). If a new person later signs up with
// that now-released number, `signUpOnVerification`'s `createUser` branch
// (same file, no `findOne`-by-temp-email guard beforehand) computes the same
// deterministic placeholder for them and the DB's unique `user_email_idx`
// rejects the insert outright — even though their OTP was verified
// correctly. Confirmed live below.
// Codex review (PR #136): the per-destination OTP throttle runs in
// hooks.before, ahead of `/email-otp/request-email-change`'s own session
// check — so unauthenticated calls naming someone else's address used to
// spend that address's sign-in OTP budget without sending it anything.
describe('per-destination OTP throttle vs request-email-change — real Better Auth instance', () => {
	beforeEach(() => {
		configMock.otpThrottleEnabled = true;
	});
	afterEach(() => {
		configMock.otpThrottleEnabled = false;
	});

	function throttleRowsFor(destination: string) {
		return sqlite
			.query<
				{ n: number },
				[string]
			>('SELECT COUNT(*) AS n FROM otp_throttle WHERE destination = ?')
			.get(destination)!.n;
	}

	test('Given unauthenticated email-change requests naming a victim address, then they are rejected without spending its quota, and the victim can still get a sign-in OTP', async () => {
		const victim = 'throttle-victim@example.com';

		for (let i = 0; i < 5; i++) {
			await expect(
				auth.api.requestEmailChangeEmailOTP({ body: { newEmail: victim }, headers: new Headers() })
			).rejects.toThrow();
		}

		expect(throttleRowsFor(victim)).toBe(0);
		await expect(
			auth.api.sendVerificationOTP({ body: { email: victim, type: 'sign-in' } })
		).resolves.toBeTruthy();
	});

	test('Given send-verification-otp calls with type change-email for a victim address, then Better Auth rejects them without spending its quota', async () => {
		const victim = 'change-type-victim@example.com';

		for (let i = 0; i < 5; i++) {
			await expect(
				auth.api.sendVerificationOTP({ body: { email: victim, type: 'change-email' } })
			).rejects.toThrow();
		}

		expect(throttleRowsFor(victim)).toBe(0);
	});

	test('Given email-verification OTP requests for an address with no account, then nothing is sent and its quota is untouched', async () => {
		const stranger = 'no-account@example.com';

		for (let i = 0; i < 5; i++) {
			await auth.api.sendVerificationOTP({ body: { email: stranger, type: 'email-verification' } });
		}

		expect(throttleRowsFor(stranger)).toBe(0);
	});

	test('Given a destination already at its short-window limit, then the next send is rejected with 429 before anything is sent or recorded', async () => {
		const email = 'at-limit@example.com';
		for (let i = 0; i < 3; i++) {
			await auth.api.sendVerificationOTP({ body: { email, type: 'sign-in' } });
		}
		expect(throttleRowsFor(email)).toBe(3);

		await expect(
			auth.api.sendVerificationOTP({ body: { email, type: 'sign-in' } })
		).rejects.toMatchObject({ statusCode: 429 });
		expect(throttleRowsFor(email)).toBe(3);
	});

	test('Given an authenticated email-change request to a +tag alias of the current address, then it is charged against the shared mailbox bucket', async () => {
		const owner = 'alias-owner@example.com';
		const alias = 'alias-owner+tag@example.com';
		await auth.api.sendVerificationOTP({ body: { email: owner, type: 'sign-in' } });
		const { headers } = await auth.api.signInEmailOTP({
			body: { email: owner, otp: readOtp(`sign-in-otp-${owner}`) },
			returnHeaders: true
		});
		const cookie = headers
			.get('set-cookie')!
			.split(/,(?=\s*[\w-]+=)/)
			.map((part) => part.split(';')[0].trim())
			.join('; ');
		const before = throttleRowsFor(owner); // the sign-in send above

		// Better Auth treats the alias as a different address and sends to it,
		// so it must count against the (alias-folded) mailbox bucket.
		await auth.api.requestEmailChangeEmailOTP({
			body: { newEmail: alias },
			headers: new Headers({ cookie })
		});

		expect(throttleRowsFor(owner)).toBe(before + 1);
	});

	test('Given an authenticated email-change request to a new address, then it is still charged against that address', async () => {
		const owner = 'throttle-owner@example.com';
		const newEmail = 'throttle-new@example.com';
		await auth.api.sendVerificationOTP({ body: { email: owner, type: 'sign-in' } });
		const { headers } = await auth.api.signInEmailOTP({
			body: { email: owner, otp: readOtp(`sign-in-otp-${owner}`) },
			returnHeaders: true
		});
		const cookie = headers
			.get('set-cookie')!
			.split(/,(?=\s*[\w-]+=)/)
			.map((part) => part.split(';')[0].trim())
			.join('; ');

		await auth.api.requestEmailChangeEmailOTP({
			body: { newEmail },
			headers: new Headers({ cookie })
		});

		expect(throttleRowsFor(newEmail)).toBe(1);
	});
});

describe('stale placeholder email release on phone change — real Better Auth instance', () => {
	test('Given a phone-only user changes their phone number, when a new user later signs up with the OLD (now-released) number, then the sign-up succeeds because the stale placeholder was released', async () => {
		const oldPhone = '+15553330001';
		const newPhone = '+15553330002';

		// Phone-only sign-up — gets the deterministic placeholder for oldPhone.
		await auth.api.sendPhoneNumberOTP({ body: { phoneNumber: oldPhone } });
		const { headers } = await auth.api.verifyPhoneNumber({
			body: { phoneNumber: oldPhone, code: readOtp(oldPhone) },
			returnHeaders: true
		});
		const cookie = headers
			.get('set-cookie')!
			.split(/,(?=\s*[\w-]+=)/)
			.map((part) => part.split(';')[0].trim())
			.join('; ');

		const beforeChange = findUsersByPhone(oldPhone)[0];
		expect(beforeChange.email).toBe(makePlaceholderEmail(oldPhone));

		// Settings-page phone change: oldPhone -> newPhone.
		await auth.api.sendPhoneNumberOTP({ body: { phoneNumber: newPhone } });
		await auth.api.verifyPhoneNumber({
			body: { phoneNumber: newPhone, code: readOtp(newPhone), updatePhoneNumber: true },
			headers: new Headers({ cookie })
		});

		// The user's placeholder should now track their NEW number, not the
		// old, now-released one.
		const afterChange = findUsersByPhone(newPhone)[0];
		expect(afterChange.id).toBe(beforeChange.id);
		expect(afterChange.email).toBe(makePlaceholderEmail(newPhone));
		expect(findUsersByPhone(oldPhone)).toHaveLength(0);

		// A different person now signs up with the released oldPhone number —
		// this must succeed and must NOT collide with afterChange's row.
		await auth.api.sendPhoneNumberOTP({ body: { phoneNumber: oldPhone } });
		const signupResult = await auth.api.verifyPhoneNumber({
			body: { phoneNumber: oldPhone, code: readOtp(oldPhone) }
		});

		expect(signupResult.user?.id).toBeTruthy();
		expect(signupResult.user?.id).not.toBe(afterChange.id);
		expect(signupResult.user?.email).toBe(makePlaceholderEmail(oldPhone));
	});

	describe('when the stored row changed after the phone-change snapshot was taken', () => {
		// Reproduces the race directly: `ctx.context.returned.user` is the
		// snapshot Better Auth returned when the phone change committed, while
		// a concurrent credential change has since rewritten the row.
		async function setup() {
			const oldPhone = '+15553330101';
			const newPhone = '+15553330102';
			await auth.api.sendPhoneNumberOTP({ body: { phoneNumber: oldPhone } });
			const { user } = await auth.api.verifyPhoneNumber({
				body: { phoneNumber: oldPhone, code: readOtp(oldPhone) }
			});
			const context = await auth.$context;
			// The phone change itself has already committed by the time the
			// after-hook runs.
			liveDb
				.update(schema.user)
				.set({ phoneNumber: newPhone })
				.where(eq(schema.user.id, user!.id))
				.run();
			const snapshot = {
				id: user!.id,
				email: makePlaceholderEmail(oldPhone),
				phoneNumber: newPhone
			};
			const ctx = {
				context: { ...context, returned: { user: snapshot } }
			} as unknown as Parameters<typeof releaseStalePlaceholderEmail>[0];
			return { id: user!.id, oldPhone, newPhone, ctx };
		}

		function storedEmail(id: string) {
			return liveDb.select().from(schema.user).where(eq(schema.user.id, id)).get()?.email;
		}

		test('Given a concurrent email change already stored a real email, then it is not overwritten with a placeholder', async () => {
			const { id, ctx } = await setup();
			liveDb
				.update(schema.user)
				.set({ email: 'verified-real@example.com' })
				.where(eq(schema.user.id, id))
				.run();

			await releaseStalePlaceholderEmail(ctx);

			expect(storedEmail(id)).toBe('verified-real@example.com');
		});

		test('Given a later phone change already moved the number on, then the placeholder is not rewritten for the stale number', async () => {
			const { id, oldPhone, ctx } = await setup();
			liveDb
				.update(schema.user)
				.set({ phoneNumber: '+15553330103' })
				.where(eq(schema.user.id, id))
				.run();

			await releaseStalePlaceholderEmail(ctx);

			expect(storedEmail(id)).toBe(makePlaceholderEmail(oldPhone));
		});

		test('Given the row is unchanged since the snapshot, then the placeholder is refreshed to the new number', async () => {
			const { id, newPhone, ctx } = await setup();

			await releaseStalePlaceholderEmail(ctx);

			expect(storedEmail(id)).toBe(makePlaceholderEmail(newPhone));
		});
	});

	test('Given a user with a real email changes their phone number, then their real email is left untouched', async () => {
		const email = 'real-email-owner@example.com';

		// Email sign-up first.
		await auth.api.sendVerificationOTP({ body: { email, type: 'sign-in' } });
		const { headers } = await auth.api.signInEmailOTP({
			body: { email, otp: readOtp(`sign-in-otp-${email}`) },
			returnHeaders: true
		});
		const cookie = headers
			.get('set-cookie')!
			.split(/,(?=\s*[\w-]+=)/)
			.map((part) => part.split(';')[0].trim())
			.join('; ');

		const phone = '+15553330099';
		await auth.api.sendPhoneNumberOTP({ body: { phoneNumber: phone } });
		await auth.api.verifyPhoneNumber({
			body: { phoneNumber: phone, code: readOtp(phone), updatePhoneNumber: true },
			headers: new Headers({ cookie })
		});

		const updated = findUserByEmail(email);
		expect(updated).toBeTruthy();
		expect(updated?.phoneNumber).toBe(phone);
	});
});
