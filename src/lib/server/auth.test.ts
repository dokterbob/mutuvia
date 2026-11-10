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

import { describe, test, expect, beforeEach, afterAll, vi } from 'vitest';
import { rmSync } from 'node:fs';
import { migrate } from 'drizzle-orm/bun-sqlite/migrator';
import { eq } from 'drizzle-orm';
import * as schema from './schema.sqlite';

const { TEST_DB_FILE } = vi.hoisted(() => ({
	TEST_DB_FILE: `.vitest-auth-sqlite-${process.pid}.db`
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
	config: {
		dbFileName: TEST_DB_FILE,
		dbProvider: 'sqlite',
		appUrl: 'http://localhost:5173',
		preludeApiToken: '',
		devLogOtp: true,
		smtpHost: ''
	}
}));

const { sqlite, db: liveDb } = await import('./db.sqlite');
const { auth } = await import('./auth');

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
		'/revoke-other-sessions'
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
});
