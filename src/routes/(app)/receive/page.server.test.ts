// SPDX-License-Identifier: AGPL-3.0-or-later
// Regression test: after resuming a paused reusable QR from the home page,
// the resume action must redirect with 303 (not 307) so the browser follows
// the redirect with a GET instead of re-POSTing. A 307 redirect to
// `/receive?qrId=<id>` causes a POST without an action specifier → SvelteKit
// returns 404.

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Sentinel for redirect — lets tests detect the normal exit path without crashing
// ---------------------------------------------------------------------------

class MockRedirect extends Error {
	constructor(
		public status: number,
		public location: string
	) {
		super(`Redirect: ${status} → ${location}`);
		this.name = 'MockRedirect';
	}
}

// ---------------------------------------------------------------------------
// All mock factories in vi.hoisted() so they are available when vi.mock()
// factory callbacks execute (Vitest hoists vi.mock() calls to the top).
// ---------------------------------------------------------------------------

const { redirectMock, resumePaymentRequestMock, getPendingItemByIdMock, buildReusableUrlMock } =
	vi.hoisted(() => {
		const redirectMock = vi.fn().mockImplementation((status: number, location: string) => {
			throw new MockRedirect(status, location);
		});

		return {
			redirectMock,
			resumePaymentRequestMock: vi.fn().mockResolvedValue(undefined),
			getPendingItemByIdMock: vi.fn(),
			buildReusableUrlMock: vi.fn((id: string) => `http://localhost/send/${id}`)
		};
	});

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

// Sentry's SvelteKit plugin wraps the load function and inspects event.request —
// mock it out so tests can call load/actions directly without a full Sentry environment.
vi.mock('@sentry/sveltekit', () => ({
	wrapLoadWithSentry: (fn: unknown) => fn,
	wrapServerLoadWithSentry: (fn: unknown) => fn,
	sentryHandle: () => async (input: { event: unknown; resolve: (e: unknown) => unknown }) =>
		input.resolve(input.event),
	handleErrorWithSentry: vi.fn()
}));

vi.mock('@sveltejs/kit', () => ({
	redirect: redirectMock,
	fail: vi.fn((_status: number, data: unknown) => data),
	error: vi.fn((_status: number, msg: unknown) => {
		throw new Error(typeof msg === 'string' ? msg : JSON.stringify(msg));
	})
}));

vi.mock('$lib/server/payment-requests', () => ({
	getPendingItemById: getPendingItemByIdMock,
	pausePaymentRequest: vi.fn().mockResolvedValue(undefined),
	resumePaymentRequest: resumePaymentRequestMock,
	archivePaymentRequest: vi.fn().mockResolvedValue(undefined)
}));

vi.mock('$lib/server/qr', () => ({
	buildPaymentRequestUrl: vi.fn((id: string) => `http://localhost/accept/${id}`),
	buildReusableUrl: buildReusableUrlMock
}));

vi.mock('$lib/server/db', () => ({
	db: {
		insert: vi.fn().mockReturnValue({ values: vi.fn().mockResolvedValue(undefined) }),
		update: vi.fn().mockReturnValue({
			set: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) })
		})
	}
}));

vi.mock('$lib/server/schema', () => ({
	paymentRequests: 'paymentRequests'
}));

vi.mock('drizzle-orm', () => ({
	eq: vi.fn((a: unknown, b: unknown) => `${String(a)}=${String(b)}`),
	and: vi.fn((...args: unknown[]) => args.join('&&'))
}));

vi.mock('$lib/config', () => ({
	config: {
		appName: 'Mutuvia',
		unitCode: 'EUR',
		qrTtlSeconds: 300,
		appUrl: 'http://localhost'
	}
}));

vi.mock('$lib/server/currency', () => ({
	currencyFractionDigits: vi.fn(() => 2)
}));

vi.mock('$lib/server/share-text', () => ({
	shareText: vi.fn(() => 'Pay me on Mutuvia')
}));

// Import AFTER mocks are registered
import { actions, load } from './+page.server';

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const USER_ID = 'user-123';
const QR_ID = 'reusable-qr-abc';

function makeResumeEvent(qrId = QR_ID): Parameters<(typeof actions)['resume']>[0] {
	const formData = new FormData();
	formData.set('qrId', qrId);
	return {
		request: new Request('http://localhost/receive', { method: 'POST', body: formData }),
		locals: {
			session: { id: 'session-1' },
			appUser: { id: USER_ID, displayName: 'Alice' }
		},
		url: new URL('http://localhost/receive'),
		cookies: { set: vi.fn(), get: vi.fn(), delete: vi.fn() }
	} as unknown as Parameters<(typeof actions)['resume']>[0];
}

function makeLoadEvent(qrId?: string): Parameters<typeof load>[0] {
	const urlStr = qrId
		? `http://localhost/receive?qrId=${qrId}`
		: 'http://localhost/receive';
	return {
		locals: {
			session: { id: 'session-1' },
			appUser: { id: USER_ID, displayName: 'Alice' }
		},
		request: new Request(urlStr, { method: 'GET' }),
		url: new URL(urlStr),
		route: { id: '/(app)/receive' },
		cookies: { set: vi.fn(), get: vi.fn(), delete: vi.fn() }
	} as unknown as Parameters<typeof load>[0];
}

/** Run an action and swallow MockRedirects (the normal exit path). */
async function catchRedirect(fn: () => unknown): Promise<MockRedirect | undefined> {
	try {
		await fn();
		return undefined;
	} catch (e) {
		if (e instanceof MockRedirect) return e;
		throw e;
	}
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('resume action — reusable QR redirect (regression: issue #resume-404)', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		redirectMock.mockImplementation((status: number, location: string) => {
			throw new MockRedirect(status, location);
		});
		resumePaymentRequestMock.mockResolvedValue(undefined);
	});

	describe('Given a paused reusable QR that is being resumed', () => {
		it('When resume action is called → calls resumePaymentRequest with the correct qrId and userId', async () => {
			await catchRedirect(() => actions.resume(makeResumeEvent()));

			expect(resumePaymentRequestMock).toHaveBeenCalledWith(QR_ID, USER_ID);
		});

		it('When resume action is called → redirects to /receive?qrId=<id>', async () => {
			const caught = await catchRedirect(() => actions.resume(makeResumeEvent()));

			expect(caught).toBeDefined();
			expect(caught?.location).toBe(`/receive?qrId=${QR_ID}`);
		});

		it('When resume action is called → uses 303 redirect (not 307) so browser follows with GET', async () => {
			// A 307 redirect preserves the POST method — the browser would re-POST to
			// `/receive?qrId=<id>`, which has no matching action → SvelteKit returns 404.
			// A 303 redirect always uses GET, landing cleanly on the receive page.
			const caught = await catchRedirect(() => actions.resume(makeResumeEvent()));

			expect(caught).toBeDefined();
			expect(caught?.status).toBe(303);
		});
	});
});

describe('load — receive page with reusable QR via ?qrId= (regression: resume flow)', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		buildReusableUrlMock.mockImplementation((id: string) => `http://localhost/send/${id}`);
	});

	describe('Given an active reusable payment request loaded via ?qrId=', () => {
		beforeEach(() => {
			getPendingItemByIdMock.mockResolvedValue({
				id: QR_ID,
				direction: 'receive',
				status: 'active',
				reusable: true,
				amount: null,
				description: null,
				paymentCount: 3,
				expiresAt: null,
				isExpired: false
			});
		});

		it('When load is called with ?qrId=<id> → returns resumeQr with isReusable=true', async () => {
			const result = await load(makeLoadEvent(QR_ID));

			expect(result.resumeQr).not.toBeNull();
			expect(result.resumeQr?.isReusable).toBe(true);
		});

		it('When load is called with ?qrId=<id> → resumeQr.qrUrl uses buildReusableUrl', async () => {
			const result = await load(makeLoadEvent(QR_ID));

			expect(result.resumeQr?.qrUrl).toBe(`http://localhost/send/${QR_ID}`);
		});

		it('When load is called with ?qrId=<id> → resumeQr.paymentCount matches DB value', async () => {
			const result = await load(makeLoadEvent(QR_ID));

			expect(result.resumeQr?.paymentCount).toBe(3);
		});

		it('When load is called with ?qrId=<id> → resumeQr.expiresAt is null (reusable QRs never expire)', async () => {
			const result = await load(makeLoadEvent(QR_ID));

			expect(result.resumeQr?.expiresAt).toBeNull();
		});
	});

	describe('Given no qrId in the URL', () => {
		it('When load is called without ?qrId= → returns resumeQr as null', async () => {
			const result = await load(makeLoadEvent());

			expect(result.resumeQr).toBeNull();
			expect(getPendingItemByIdMock).not.toHaveBeenCalled();
		});
	});
});
