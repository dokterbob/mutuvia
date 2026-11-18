// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Route-level regression tests for the amount-validation fix: the `send`
// action (and the `startFastTrack`/`startFullOnboarding` cookie-setting
// actions) used to parse the submitted amount with `parseFloat`, which
// accepted exponential notation, "Infinity", and unbounded values. They now
// delegate to the shared `parseAmount()` (unit-tested in
// `$lib/server/amount.test.ts`) — these tests only check that the route
// wires it up and rejects cleanly, not every parsing edge case again.

import { describe, test, expect, vi, beforeEach } from 'vitest';

class MockRedirect extends Error {
	constructor(
		public status: number,
		public location: string
	) {
		super(`Redirect: ${status} -> ${location}`);
	}
}

const { settleReusableMock, dbSelectMock, selectLimitFn } = vi.hoisted(() => {
	const selectLimitFn = vi.fn().mockResolvedValue([]);
	const selectFromFn = vi.fn();
	const selectWhereFn = vi.fn();
	const selectChain = { from: selectFromFn, where: selectWhereFn, limit: selectLimitFn };
	selectFromFn.mockReturnValue(selectChain);
	selectWhereFn.mockReturnValue(selectChain);
	const dbSelectMock = vi.fn().mockReturnValue(selectChain);
	return { settleReusableMock: vi.fn(), dbSelectMock, selectLimitFn };
});

vi.mock('@sentry/sveltekit', () => ({
	wrapLoadWithSentry: (fn: unknown) => fn,
	wrapServerLoadWithSentry: (fn: unknown) => fn,
	sentryHandle: () => async (input: { event: unknown; resolve: (e: unknown) => unknown }) =>
		input.resolve(input.event),
	handleErrorWithSentry: vi.fn()
}));
vi.mock('$lib/server/db', () => ({ db: { select: dbSelectMock } }));
vi.mock('$lib/server/schema', () => ({ paymentRequests: {} }));
vi.mock('drizzle-orm', () => ({ eq: vi.fn((a: unknown, b: unknown) => ({ eq: [a, b] })) }));
vi.mock('$lib/server/currency', () => ({
	formatAmount: vi.fn((amount: number) => `€${(amount / 100).toFixed(2)}`),
	currencyFractionDigits: vi.fn(() => 2)
}));
vi.mock('$lib/server/balance', () => ({ getBalance: vi.fn().mockResolvedValue(0) }));
vi.mock('$lib/server/payment-requests', () => ({ settleReusable: settleReusableMock }));
vi.mock('$lib/server/sse-registry', () => ({ emit: vi.fn() }));
vi.mock('$lib/server/push-sender', () => ({
	sendPushToUser: vi.fn().mockResolvedValue(undefined)
}));
vi.mock('$lib/config', () => ({
	config: { qrTtlSeconds: 300, maxTransactionAmount: 100_000_000, unitCode: 'EUR' }
}));
vi.mock('@sveltejs/kit', () => ({
	redirect: vi.fn((status: number, location: string) => {
		throw new MockRedirect(status, location);
	}),
	error: vi.fn((status: number, msg: unknown) => {
		throw new Error(`${status}: ${typeof msg === 'string' ? msg : JSON.stringify(msg)}`);
	}),
	fail: vi.fn((status: number, data: unknown) => ({ status, ...(data as object) }))
}));

const { actions, load } = await import('./+page.server');

function formDataWith(amount: string | null): FormData {
	const fd = new FormData();
	if (amount !== null) fd.set('amount', amount);
	return fd;
}

function makeCookies() {
	const store = new Map<string, string>();
	return {
		get: (name: string) => store.get(name),
		set: (name: string, value: string) => store.set(name, value),
		delete: (name: string) => store.delete(name),
		_store: store
	};
}

beforeEach(() => {
	vi.clearAllMocks();
	settleReusableMock.mockReset();
	selectLimitFn.mockResolvedValue([]);
});

describe('send/[id] send action — amount validation', () => {
	const locals = { session: {}, appUser: { id: 'user-1', displayName: 'Bruno' } };

	describe.each([
		['exponential notation', '1e9'],
		['Infinity', 'Infinity'],
		['trailing garbage', '10abc'],
		['negative', '-1'],
		['zero', '0'],
		['too many decimal places', '1.234'],
		['above the sanity bound', '1000000.01'],
		['empty string', ''],
		['missing field', null]
	])('Given amount is %s (%j)', (_label, amountValue) => {
		test('When send is submitted → rejects with a 400 and never calls settleReusable', async () => {
			const request = { formData: () => Promise.resolve(formDataWith(amountValue)) };
			const cookies = makeCookies();

			const result = await actions.send({
				params: { id: 'pr-1' },
				request,
				locals,
				cookies
			} as never);

			expect(result).toMatchObject({ status: 400 });
			expect(settleReusableMock).not.toHaveBeenCalled();
		});
	});

	test('Given a valid amount, When send is submitted → calls settleReusable with the parsed minor-unit amount', async () => {
		settleReusableMock.mockResolvedValue({ ok: true, txId: 'tx-1' });
		const request = { formData: () => Promise.resolve(formDataWith('10.50')) };
		const cookies = makeCookies();

		const result = await actions.send({
			params: { id: 'pr-1' },
			request,
			locals,
			cookies
		} as never);

		expect(settleReusableMock).toHaveBeenCalledWith('pr-1', 'user-1', 1050);
		expect(result).toMatchObject({ success: true });
	});
});

describe('send/[id] startFastTrack/startFullOnboarding — cookie amount validation', () => {
	test('Given an invalid amount, When startFastTrack is submitted → stores no amount cookie (parseAmount returns null)', async () => {
		const request = { formData: () => Promise.resolve(formDataWith('1e9')) };
		const cookies = makeCookies();

		await expect(
			actions.startFastTrack({ params: { id: 'pr-1' }, cookies, request } as never)
		).rejects.toThrow(MockRedirect);

		expect(cookies._store.has('qr_amount')).toBe(false);
	});

	test('Given a valid amount, When startFullOnboarding is submitted → stores the parsed minor-unit amount in the cookie', async () => {
		const request = { formData: () => Promise.resolve(formDataWith('10.50')) };
		const cookies = makeCookies();

		await expect(
			actions.startFullOnboarding({ params: { id: 'pr-1' }, cookies, request } as never)
		).rejects.toThrow(MockRedirect);

		expect(cookies._store.get('qr_amount')).toBe('1050');
	});
});

describe('send/[id] load — tampered qr_amount cookie', () => {
	const reusableQr = {
		id: 'pr-1',
		status: 'active',
		reusable: true,
		expiresAt: null,
		initiatingUserId: 'initiator-1',
		amount: null,
		description: null,
		initiatorName: 'Ana'
	};

	beforeEach(() => {
		selectLimitFn.mockResolvedValue([reusableQr]);
	});

	describe.each([
		['trailing garbage', '10abc'],
		['exponential notation', '1e9'],
		['negative sign', '-5'],
		['above the sanity bound', '100000001']
	])('Given an unauthenticated scanner with a tampered cookie (%s: %j)', (_label, tampered) => {
		test('When load runs → prefilledAmount is null, not the tampered value', async () => {
			const cookies = makeCookies();
			cookies.get = () => tampered;

			const result = await load({
				params: { id: 'pr-1' },
				locals: {},
				cookies
			} as never);

			expect(result).toMatchObject({ needsAuth: true, prefilledAmount: null });
		});
	});

	describe.each([
		['trailing garbage', '10abc'],
		['exponential notation', '1e9'],
		['negative sign', '-5'],
		['above the sanity bound', '100000001']
	])(
		'Given an authenticated, non-initiating scanner with a tampered cookie (%s: %j)',
		(_label, tampered) => {
			test('When load runs → prefilledAmount is null, not the tampered value', async () => {
				const cookies = makeCookies();
				cookies.get = () => tampered;

				const result = await load({
					params: { id: 'pr-1' },
					locals: { session: {}, appUser: { id: 'scanner-1', displayName: 'Bruno' } },
					cookies
				} as never);

				expect(result).toMatchObject({ needsAuth: false, prefilledAmount: null });
			});
		}
	);

	test('Given a genuine stored amount cookie, When load runs → prefilledAmount is the parsed value', async () => {
		const cookies = makeCookies();
		cookies.get = () => '1050';

		const result = await load({
			params: { id: 'pr-1' },
			locals: {},
			cookies
		} as never);

		expect(result).toMatchObject({ needsAuth: true, prefilledAmount: 1050 });
	});
});
