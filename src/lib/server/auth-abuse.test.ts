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

	test('Given a mixed-case email, when throttled, then it is normalized to the same destination as a clean lowercase send', async () => {
		const { auth } = await import('./auth');
		const email = 'Norm@Example.com';

		for (let i = 0; i < 3; i++) {
			const res = await auth.handler(
				new Request('http://localhost:5173/api/auth/email-otp/send-verification-otp', {
					method: 'POST',
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({ email, type: 'sign-in' })
				})
			);
			expect(res.status).toBe(200);
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

	// Better Auth rejects a space-padded address as INVALID_EMAIL before
	// sending, so — now that the throttle records at delivery, not in
	// hooks.before — such requests must not spend the real address's budget.
	test('Given space-padded email sends that Better Auth rejects as invalid, then they do not count against that address', async () => {
		const { auth } = await import('./auth');
		const email = 'padded@example.com';
		const send = (address: string) =>
			auth.handler(
				new Request('http://localhost:5173/api/auth/email-otp/send-verification-otp', {
					method: 'POST',
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({ email: address, type: 'sign-in' })
				})
			);

		for (let i = 0; i < 5; i++) {
			expect((await send(` ${email} `)).status).toBe(400);
		}

		expect((await send(email)).status).toBe(200);
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

	// Review fix (PR #136): the throttle key used to be only `.trim()`ed, so
	// "+15550001111" and "+1 5550001111" landed in different buckets — an
	// attacker could spend unlimited distinct buckets against the same real
	// number just by varying whitespace. Non-canonical phone input is now
	// rejected outright (400) before it ever reaches the throttle or Prelude.
	test('Given 5 whitespace-variant forms of the same phone number, when each is attempted, then all 5 are rejected as invalid — none reaches the throttle or Prelude', async () => {
		const { auth } = await import('./auth');
		const variants = [
			'+1 5550005555',
			'+1  5550005555',
			' +15550005555',
			'+15550005555 ',
			'+1 555 000 5555'
		];

		for (const variant of variants) {
			const r = await auth.handler(
				new Request('http://localhost:5173/api/auth/phone-number/send-otp', {
					method: 'POST',
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({ phoneNumber: variant })
				})
			);
			expect(r.status).toBe(400);
		}
		expect(preludeCreateMock).not.toHaveBeenCalled();

		// None of the rejected attempts consumed any throttle budget: the
		// canonical form still has its full 3-send allowance.
		for (let i = 0; i < 3; i++) {
			const r = await auth.handler(
				new Request('http://localhost:5173/api/auth/phone-number/send-otp', {
					method: 'POST',
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({ phoneNumber: '+15550005555' })
				})
			);
			expect(r.status).toBe(200);
		}
	});

	test('Given a phone number that cannot possibly be a real number, when sent, then it is rejected before reaching the throttle or Prelude', async () => {
		const { auth } = await import('./auth');

		const r = await auth.handler(
			new Request('http://localhost:5173/api/auth/phone-number/send-otp', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ phoneNumber: 'not-a-phone-number' })
			})
		);

		expect(r.status).toBe(400);
		expect(preludeCreateMock).not.toHaveBeenCalled();
	});

	test('Given a fictional-but-structurally-plausible NANP test number, when sent, then it is accepted (isPossible, not isValid, is the predicate)', async () => {
		const { auth } = await import('./auth');

		const r = await auth.handler(
			new Request('http://localhost:5173/api/auth/phone-number/send-otp', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ phoneNumber: '+15550009999' })
			})
		);

		expect(r.status).toBe(200);
	});

	// Same input-canonicalization requirement applies to /phone-number/verify
	// — not just send-otp — since it's the endpoint that actually writes
	// `user.phone_number` (directly from the request body) when it creates or
	// updates a user. A non-canonical phoneNumber there would sidestep the
	// unique index added in PR #135.
	test('Given a whitespace-variant phone number, when /phone-number/verify is called, then it is rejected for its FORMAT — not generically for a missing/wrong OTP', async () => {
		const { auth } = await import('./auth');

		// A real OTP was actually sent to the canonical form — if the format
		// check didn't run before Better Auth's own OTP lookup, this request
		// would instead fail with "OTP not found" (a different, confounding
		// 400), not prove the format check ran at all.
		await auth.api.sendPhoneNumberOTP({ body: { phoneNumber: '+15550007777' } });
		const [verRow] = liveDb
			.select()
			.from(schema.verification)
			.where(eq(schema.verification.identifier, '+15550007777'))
			.all();
		const code = verRow.value.split(':')[0];

		const r = await auth.handler(
			new Request('http://localhost:5173/api/auth/phone-number/verify', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ phoneNumber: '+1 5550007777', code })
			})
		);

		expect(r.status).toBe(400);
		const body = await r.json();
		expect(body.message).toBe('Invalid phone number');
	});

	// Review fix (PR #136): the email throttle key only lowercased+trimmed,
	// so plus-addressing and Gmail dot variants each got their own bucket —
	// an attacker could again spend unlimited distinct buckets against the
	// same real mailbox. Both are now folded into one key for throttling
	// purposes (the delivered/stored address is never altered).
	test('Given 3 Gmail plus-addressing/dot variants of the same mailbox, when a 4th variant is attempted, then it is throttled as the same destination', async () => {
		const { auth } = await import('./auth');
		const variants = ['victim+a@gmail.com', 'vic.tim@gmail.com', 'VICTIM+b@GMAIL.COM'];

		for (const email of variants) {
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
				body: JSON.stringify({ email: 'victim+c@googlemail.com', type: 'sign-in' })
			})
		);

		expect(fourth.status).toBe(429);
	});

	test('Given plus-addressing on a non-Gmail domain, when 3 variants are sent, then a 4th is throttled as the same destination', async () => {
		const { auth } = await import('./auth');
		const variants = ['buyer+a@example.com', 'buyer+b@example.com', 'buyer+c@example.com'];

		for (const email of variants) {
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
				body: JSON.stringify({ email: 'buyer+d@example.com', type: 'sign-in' })
			})
		);

		expect(fourth.status).toBe(429);
	});

	test('Given Gmail plus/dot variants, when a real OTP send happens, then the DELIVERED/STORED address is never altered by the throttle normalization', async () => {
		const { auth } = await import('./auth');
		const email = 'vic.tim+tag@gmail.com';

		await auth.api.sendVerificationOTP({ body: { email, type: 'sign-in' } });

		const [verRow] = liveDb
			.select()
			.from(schema.verification)
			.where(eq(schema.verification.identifier, `sign-in-otp-${email.toLowerCase()}`))
			.all();
		// The verification row (and therefore the address the OTP is actually
		// sent to) still uses the exact address the caller gave, untouched by
		// the throttle's alias-folding.
		expect(verRow).toBeTruthy();
	});
});
