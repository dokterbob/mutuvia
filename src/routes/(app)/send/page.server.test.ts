// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Route-level regression tests for the amount-validation fix: `createQr`
// used to parse the submitted amount with `parseFloat`, which accepted
// exponential notation, "Infinity", and unbounded values. It now delegates
// to the shared `parseAmount()` (unit-tested in `$lib/server/amount.test.ts`)
// — these tests only check that the route wires it up and rejects cleanly,
// not every parsing edge case again.
//
// `$lib/server/amount` and `$lib/config` are deliberately NOT mocked away
// from each other: parseAmount's own import of `$lib/config` picks up the
// same mocked `config.maxTransactionAmount` below, so this exercises the
// real parser end to end.

import { describe, test, expect, vi, beforeEach } from 'vitest';

const { dbInsertMock, insertValuesFn } = vi.hoisted(() => {
	const insertValuesFn = vi.fn().mockResolvedValue(undefined);
	const dbInsertMock = vi.fn().mockReturnValue({ values: insertValuesFn });
	return { dbInsertMock, insertValuesFn };
});

vi.mock('$lib/server/db', () => ({ db: { insert: dbInsertMock, update: vi.fn() } }));
vi.mock('$lib/server/schema', () => ({ appUsers: {}, paymentRequests: {} }));
vi.mock('drizzle-orm', () => ({
	eq: vi.fn((a: unknown, b: unknown) => ({ eq: [a, b] })),
	and: vi.fn((...args: unknown[]) => ({ and: args }))
}));
vi.mock('$lib/server/qr', () => ({
	buildPaymentRequestUrl: vi.fn((id: string) => `https://example.test/send/${id}`)
}));
vi.mock('$lib/config', () => ({
	config: { qrTtlSeconds: 300, maxTransactionAmount: 100_000_000, appName: 'Mutuvia' }
}));
vi.mock('$lib/server/currency', () => ({
	currencyFractionDigits: vi.fn(() => 2)
}));
vi.mock('$lib/server/payment-requests', () => ({
	getPendingItemById: vi.fn().mockResolvedValue(null)
}));
vi.mock('$lib/server/share-text', () => ({ shareText: vi.fn(() => 'share text') }));
vi.mock('@sveltejs/kit', () => ({
	redirect: vi.fn(),
	fail: vi.fn((status: number, data: unknown) => ({ status, ...(data as object) }))
}));

const { actions } = await import('./+page.server');

function formDataWith(amount: string | null, note = ''): FormData {
	const fd = new FormData();
	if (amount !== null) fd.set('amount', amount);
	fd.set('note', note);
	return fd;
}

const locals = {
	appUser: { id: 'user-1', displayName: 'Ana', sendConsentAt: new Date() }
};

beforeEach(() => {
	dbInsertMock.mockClear();
	insertValuesFn.mockClear();
});

describe('send createQr — amount validation', () => {
	describe.each([
		['exponential notation', '1e9'],
		['Infinity', 'Infinity'],
		['trailing garbage', '10abc'],
		['negative', '-1'],
		['zero', '0'],
		['too many decimal places', '1.234'],
		['comma decimal separator', '1,50'],
		['above the sanity bound', '1000000.01'],
		['empty string', ''],
		['missing field', null]
	])('Given amount is %s (%j)', (_label, amountValue) => {
		test('When createQr is submitted → rejects with a 400 and does not write anything', async () => {
			const request = { formData: () => Promise.resolve(formDataWith(amountValue)) };

			const result = await actions.createQr({ request, locals } as never);

			expect(result).toMatchObject({ status: 400 });
			expect(dbInsertMock).not.toHaveBeenCalled();
		});
	});

	describe('Given a valid amount', () => {
		test('When createQr is submitted → inserts exactly once with the parsed minor-unit amount', async () => {
			const request = { formData: () => Promise.resolve(formDataWith('10.50')) };

			const result = await actions.createQr({ request, locals } as never);

			expect(dbInsertMock).toHaveBeenCalledTimes(1);
			expect(insertValuesFn).toHaveBeenCalledWith(expect.objectContaining({ amount: 1050 }));
			expect(result).toMatchObject({ qrUrl: expect.stringContaining('/send/') });
		});
	});

	describe('Given the amount is exactly at the sanity bound', () => {
		test('When createQr is submitted → accepts it', async () => {
			const request = { formData: () => Promise.resolve(formDataWith('1000000.00')) };

			const result = await actions.createQr({ request, locals } as never);

			expect(insertValuesFn).toHaveBeenCalledWith(expect.objectContaining({ amount: 100_000_000 }));
			expect(result).toMatchObject({ qrUrl: expect.any(String) });
		});
	});
});
