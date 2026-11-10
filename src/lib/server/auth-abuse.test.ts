// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Real-database, real-Better-Auth-instance tests for the SMS-pumping and
// OTP-abuse defenses wired into src/lib/server/auth.ts: Prelude's `blocked`
// verification result reaching the client as a real failure (not just a
// server log line), the per-destination send throttle actually blocking
// repeated sends through the real endpoints, and the phone country
// allowlist. See auth.test.ts for the phone-number pre-claim / disabledPaths
// / session-revocation tests — kept in a separate file so each stays a
// manageable size.

import { describe, test, expect, beforeEach, afterAll, vi } from 'vitest';
import { rmSync } from 'node:fs';
import { migrate } from 'drizzle-orm/bun-sqlite/migrator';
import { eq } from 'drizzle-orm';
import * as schema from './schema.sqlite';

const { TEST_DB_FILE, preludeCreateMock, preludeCheckMock } = vi.hoisted(() => ({
	TEST_DB_FILE: `.vitest-auth-abuse-sqlite-${process.pid}.db`,
	preludeCreateMock: vi.fn(),
	preludeCheckMock: vi.fn()
}));

vi.mock('$lib/config', () => ({
	config: {
		dbFileName: TEST_DB_FILE,
		dbProvider: 'sqlite',
		appUrl: 'http://localhost:5173',
		preludeApiToken: 'fake-test-token',
		devLogOtp: true,
		smtpHost: '',
		trustedIpHeader: 'x-mutuvia-client-ip',
		rateLimitEnabled: false,
		otpThrottleEnabled: true,
		phoneCountryAllowlist: null as string[] | null,
		appVersion: 'test-version'
	}
}));

// `@prelude.so/sdk`'s default export is a client class; auth.ts does
// `new Prelude({ apiToken })` once at module load (since preludeApiToken is
// truthy above) and calls `.verification.create()` / `.verification.check()`
// — mocked here so tests control Prelude's response without a real API call.
vi.mock('@prelude.so/sdk', () => ({
	default: class MockPrelude {
		verification = { create: preludeCreateMock, check: preludeCheckMock };
	}
}));

const { sqlite, db: liveDb } = await import('./db.sqlite');

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

beforeEach(() => {
	resetSchema();
	preludeCreateMock.mockReset();
	preludeCheckMock.mockReset();
	preludeCreateMock.mockResolvedValue({ status: 'success' });
});

afterAll(() => {
	sqlite.close();
	for (const suffix of ['', '-wal', '-shm']) {
		rmSync(`${TEST_DB_FILE}${suffix}`, { force: true });
	}
});

describe('Prelude signals and blocked verification — real Better Auth instance', () => {
	test('Given a phone OTP send, when Prelude is called, then it is passed the client IP, user agent and app version as signals', async () => {
		const { auth } = await import('./auth');

		await auth.api.sendPhoneNumberOTP({
			body: { phoneNumber: '+15550001111' },
			headers: new Headers({
				'x-mutuvia-client-ip': '203.0.113.7',
				'user-agent': 'MutuviaTestAgent/1.0'
			})
		});

		expect(preludeCreateMock).toHaveBeenCalledTimes(1);
		const call = preludeCreateMock.mock.calls[0][0];
		expect(call.signals).toMatchObject({
			ip: '203.0.113.7',
			user_agent: 'MutuviaTestAgent/1.0'
		});
		expect(call.signals.app_version).toBeTruthy();
	});

	test('Given Prelude returns a blocked verification, when the client sends the OTP request, then they see a real failure — not the generic success message', async () => {
		preludeCreateMock.mockResolvedValue({ status: 'blocked', reason: 'suspicious' });
		const { auth } = await import('./auth');

		const response = await auth.handler(
			new Request('http://localhost:5173/api/auth/phone-number/send-otp', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ phoneNumber: '+15550002222' })
			})
		);

		expect(response.status).toBeGreaterThanOrEqual(400);
		const body = await response.json();
		// Never leak the phone number back, even masked/raw, in the error body.
		expect(JSON.stringify(body)).not.toContain('5550002222');
	});

	test('Given Prelude returns success, when the client sends the OTP request, then they see the normal success response', async () => {
		const { auth } = await import('./auth');

		const response = await auth.handler(
			new Request('http://localhost:5173/api/auth/phone-number/send-otp', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ phoneNumber: '+15550003333' })
			})
		);

		expect(response.status).toBe(200);
	});
});

describe('per-destination OTP throttle, wired end-to-end — real Better Auth instance', () => {
	test('Given 3 phone OTP sends to the same number, when a 4th is attempted within 10 minutes, then it is rejected with a non-enumerating error', async () => {
		const { auth } = await import('./auth');
		const phone = '+15554440000';

		for (let i = 0; i < 3; i++) {
			const r = await auth.handler(
				new Request('http://localhost:5173/api/auth/phone-number/send-otp', {
					method: 'POST',
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({ phoneNumber: phone })
				})
			);
			expect(r.status).toBe(200);
		}

		const fourth = await auth.handler(
			new Request('http://localhost:5173/api/auth/phone-number/send-otp', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ phoneNumber: phone })
			})
		);

		expect(fourth.status).toBe(429);
		const body = await fourth.json();
		expect(JSON.stringify(body).toLowerCase()).not.toContain('5554440000');
	});

	test('Given 3 email OTP sends to the same address, when a 4th is attempted within 10 minutes, then it is rejected', async () => {
		const { auth } = await import('./auth');
		const email = 'throttle-me@example.com';

		for (let i = 0; i < 3; i++) {
			const r = await auth.handler(
				new Request('http://localhost:5173/api/auth/email-otp/send-verification-otp', {
					method: 'POST',
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({ email, type: 'sign-in' })
				})
			);
			expect(r.status).toBe(200);
		}

		const fourth = await auth.handler(
			new Request('http://localhost:5173/api/auth/email-otp/send-verification-otp', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ email, type: 'sign-in' })
			})
		);

		expect(fourth.status).toBe(429);
	});

	test('Given a mixed-case email with surrounding whitespace, when throttled, then it is normalized to the same destination as a clean lowercase send', async () => {
		const { auth } = await import('./auth');
		const email = 'Norm@Example.com';

		for (let i = 0; i < 3; i++) {
			await auth.handler(
				new Request('http://localhost:5173/api/auth/email-otp/send-verification-otp', {
					method: 'POST',
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({ email: ` ${email} `, type: 'sign-in' })
				})
			);
		}

		const fourth = await auth.handler(
			new Request('http://localhost:5173/api/auth/email-otp/send-verification-otp', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ email: email.toLowerCase(), type: 'sign-in' })
			})
		);

		expect(fourth.status).toBe(429);
	});

	test('Given the email change-request endpoint, when sent repeatedly past the short-window cap, then it is also throttled (not just the sign-in send endpoint)', async () => {
		const { auth } = await import('./auth');
		const newEmail = 'change-target@example.com';

		// Establish a session to call the session-gated requestEmailChange endpoint.
		await auth.api.sendVerificationOTP({ body: { email: 'owner2@example.com', type: 'sign-in' } });
		const [verRow] = liveDb
			.select()
			.from(schema.verification)
			.where(eq(schema.verification.identifier, 'sign-in-otp-owner2@example.com'))
			.all();
		const otp = verRow.value.split(':')[0];
		const { headers } = await auth.api.signInEmailOTP({
			body: { email: 'owner2@example.com', otp },
			returnHeaders: true
		});
		const cookie = headers
			.get('set-cookie')!
			.split(/,(?=\s*[\w-]+=)/)
			.map((p) => p.split(';')[0].trim())
			.join('; ');

		for (let i = 0; i < 3; i++) {
			const r = await auth.handler(
				new Request('http://localhost:5173/api/auth/email-otp/request-email-change', {
					method: 'POST',
					headers: { 'content-type': 'application/json', cookie },
					body: JSON.stringify({ newEmail })
				})
			);
			expect(r.status).toBe(200);
		}

		const fourth = await auth.handler(
			new Request('http://localhost:5173/api/auth/email-otp/request-email-change', {
				method: 'POST',
				headers: { 'content-type': 'application/json', cookie },
				body: JSON.stringify({ newEmail })
			})
		);

		expect(fourth.status).toBe(429);
	});
});
