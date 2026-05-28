// SPDX-License-Identifier: AGPL-3.0-or-later

import { describe, test, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// All mock factories in vi.hoisted() so they are available when vi.mock()
// factory callbacks execute (Vitest hoists vi.mock() calls to the top).
// ---------------------------------------------------------------------------

const {
	upsertConnectionMock,
	dbInsertMock,
	dbUpdateMock,
	dbSelectMock,
	txInsertMock,
	txUpdateMock,
	txSelectMock,
	_insertValuesFn,
	updateWhereFn,
	_selectLimitFn,
	txInsertValuesFn,
	txUpdateWhereFn,
	txSelectLimitFn,
	dbTransactionMock
} = vi.hoisted(() => {
	// --- Outer db chains (for pause/resume/archive) ---
	const updateWhereFn = vi.fn().mockResolvedValue(undefined);
	const updateSetFn = vi.fn();
	updateSetFn.mockReturnValue({ where: updateWhereFn });
	const dbUpdateMock = vi.fn().mockReturnValue({ set: updateSetFn });

	const _insertValuesFn = vi.fn().mockResolvedValue(undefined);
	const dbInsertMock = vi.fn().mockReturnValue({ values: _insertValuesFn });

	const _selectLimitFn = vi.fn();
	const selectWhereFn = vi.fn();
	const selectFromFn = vi.fn();
	const selectChain = { from: selectFromFn, where: selectWhereFn, limit: _selectLimitFn };
	selectFromFn.mockReturnValue(selectChain);
	selectWhereFn.mockReturnValue(selectChain);
	const dbSelectMock = vi.fn().mockReturnValue(selectChain);

	// --- Transaction tx chains ---
	const txUpdateWhereFn = vi.fn().mockResolvedValue(undefined);
	const txUpdateSetFn = vi.fn();
	txUpdateSetFn.mockReturnValue({ where: txUpdateWhereFn });
	const txUpdateMock = vi.fn().mockReturnValue({ set: txUpdateSetFn });

	const txInsertValuesFn = vi.fn().mockResolvedValue(undefined);
	const txInsertMock = vi.fn().mockReturnValue({ values: txInsertValuesFn });

	const txSelectLimitFn = vi.fn();
	const txSelectWhereFn = vi.fn();
	const txSelectFromFn = vi.fn();
	const txSelectChain = {
		from: txSelectFromFn,
		where: txSelectWhereFn,
		limit: txSelectLimitFn
	};
	txSelectFromFn.mockReturnValue(txSelectChain);
	txSelectWhereFn.mockReturnValue(txSelectChain);
	const txSelectMock = vi.fn().mockReturnValue(txSelectChain);

	const mockTx = {
		select: txSelectMock,
		insert: txInsertMock,
		update: txUpdateMock
	};

	const dbTransactionMock = vi
		.fn()
		.mockImplementation(async (fn: (tx: typeof mockTx) => unknown) => fn(mockTx));

	return {
		upsertConnectionMock: vi.fn().mockResolvedValue(undefined),
		dbInsertMock,
		dbUpdateMock,
		dbSelectMock,
		txInsertMock,
		txUpdateMock,
		txSelectMock,
		_insertValuesFn,
		updateWhereFn,
		_selectLimitFn,
		txInsertValuesFn,
		txUpdateWhereFn,
		txSelectLimitFn,
		dbTransactionMock
	};
});

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

vi.mock('$lib/server/db', () => ({
	db: {
		select: dbSelectMock,
		insert: dbInsertMock,
		update: dbUpdateMock,
		transaction: dbTransactionMock
	}
}));

vi.mock('$lib/server/schema', () => ({
	paymentRequests: 'paymentRequests',
	transactions: 'transactions',
	appUsers: 'appUsers'
}));

vi.mock('$lib/server/balance', () => ({
	upsertConnection: upsertConnectionMock
}));

vi.mock('$lib/config', () => ({
	config: { unitCode: 'EUR', expiredQrRetentionSeconds: 259200 }
}));

vi.mock('drizzle-orm', () => ({
	eq: vi.fn((a: unknown, b: unknown) => `${String(a)}=${String(b)}`),
	and: vi.fn((...args: unknown[]) => args.join('&')),
	or: vi.fn((...args: unknown[]) => args.join('|')),
	desc: vi.fn((a: unknown) => `desc(${String(a)})`),
	gt: vi.fn((a: unknown, b: unknown) => `${String(a)}>${String(b)}`),
	isNull: vi.fn((a: unknown) => `isNull(${String(a)})`),
	inArray: vi.fn((a: unknown, b: unknown) => `${String(a)} IN (${String(b)})`),
	sql: Object.assign(
		(strings: TemplateStringsArray, ...values: unknown[]) =>
			strings.reduce(
				(acc, s, i) => acc + s + (values[i] !== undefined ? String(values[i]) : ''),
				''
			),
		{ join: vi.fn() }
	)
}));

vi.mock('$lib/server/currency', () => ({
	formatAmount: vi.fn().mockReturnValue('€10.00')
}));

// Import AFTER mocks are registered
import {
	settleReusable,
	pausePaymentRequest,
	resumePaymentRequest,
	archivePaymentRequest
} from './payment-requests';

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const INITIATOR_ID = 'user-initiator';
const SCANNER_ID = 'user-scanner';
const PR_ID = 'pr-test-id';

const activeReusablePr = {
	id: PR_ID,
	initiatingUserId: INITIATOR_ID,
	reusable: true,
	direction: 'receive' as const,
	amount: null, // open amount
	description: null,
	status: 'active' as const,
	initiatorName: 'Alice',
	createdAt: new Date(),
	updatedAt: new Date(),
	expiresAt: null,
	totalReceived: 0,
	paymentCount: 0
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('settleReusable', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		txSelectLimitFn.mockReset();
		txInsertValuesFn.mockResolvedValue(undefined);
		txUpdateWhereFn.mockResolvedValue(undefined);
		upsertConnectionMock.mockResolvedValue(undefined);
		dbTransactionMock.mockImplementation(async (fn: (tx: object) => unknown) =>
			fn({
				select: txSelectMock,
				insert: txInsertMock,
				update: txUpdateMock
			})
		);
	});

	describe('Given a valid active reusable payment request', () => {
		beforeEach(() => {
			txSelectLimitFn.mockResolvedValue([activeReusablePr]);
		});

		test('When settled with a valid amount → inserts transaction with correct fields', async () => {
			const result = await settleReusable(PR_ID, SCANNER_ID, 1000);

			expect(result).toMatchObject({ ok: true });
			expect(txInsertMock).toHaveBeenCalled();
			expect(txInsertValuesFn).toHaveBeenCalledWith(
				expect.objectContaining({
					fromUserId: SCANNER_ID,
					toUserId: INITIATOR_ID,
					amount: 1000,
					unitCode: 'EUR',
					paymentRequestId: PR_ID
				})
			);
		});

		test('When settled → increments totalReceived and paymentCount', async () => {
			await settleReusable(PR_ID, SCANNER_ID, 1000);

			expect(txUpdateMock).toHaveBeenCalled();
			expect(txUpdateWhereFn).toHaveBeenCalled();
		});

		test('When settled → calls upsertConnection', async () => {
			await settleReusable(PR_ID, SCANNER_ID, 1000);

			expect(upsertConnectionMock).toHaveBeenCalledWith(SCANNER_ID, INITIATOR_ID);
		});

		test('When settled → returns { ok: true, txId }', async () => {
			const result = await settleReusable(PR_ID, SCANNER_ID, 1000);

			expect(result).toMatchObject({ ok: true });
			if (result.ok) {
				expect(typeof result.txId).toBe('string');
				expect(result.txId.length).toBeGreaterThan(0);
			}
		});
	});

	describe('Given status is paused', () => {
		test('When settlement is attempted → returns { ok: false, status: 409 }', async () => {
			txSelectLimitFn.mockResolvedValue([{ ...activeReusablePr, status: 'paused' }]);

			const result = await settleReusable(PR_ID, SCANNER_ID, 1000);

			expect(result).toMatchObject({ ok: false, status: 409 });
		});
	});

	describe('Given self-send (scannerId === initiatingUserId)', () => {
		test('When settlement is attempted → returns { ok: false, status: 400 }', async () => {
			txSelectLimitFn.mockResolvedValue([activeReusablePr]);

			const result = await settleReusable(PR_ID, INITIATOR_ID, 1000);

			expect(result).toMatchObject({ ok: false, status: 400 });
		});
	});

	describe('Given a fixed amount payment request', () => {
		test('When scanner submits a different amount → returns { ok: false, status: 400 }', async () => {
			txSelectLimitFn.mockResolvedValue([{ ...activeReusablePr, amount: 500 }]);

			const result = await settleReusable(PR_ID, SCANNER_ID, 1000);

			expect(result).toMatchObject({ ok: false, status: 400 });
		});
	});

	describe('Given amount ≤ 0', () => {
		test('→ returns { ok: false, status: 400 }', async () => {
			const result = await settleReusable(PR_ID, SCANNER_ID, 0);

			expect(result).toMatchObject({ ok: false, status: 400 });
		});
	});
});

describe('pausePaymentRequest', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		updateWhereFn.mockResolvedValue(undefined);
	});

	test('calls update with status=paused', async () => {
		await pausePaymentRequest(PR_ID, INITIATOR_ID);

		expect(dbUpdateMock).toHaveBeenCalled();
		const setCall = dbUpdateMock.mock.results[0].value.set;
		expect(setCall).toHaveBeenCalledWith(expect.objectContaining({ status: 'paused' }));
	});
});

describe('resumePaymentRequest', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		updateWhereFn.mockResolvedValue(undefined);
	});

	test('calls update with status=active', async () => {
		await resumePaymentRequest(PR_ID, INITIATOR_ID);

		expect(dbUpdateMock).toHaveBeenCalled();
		const setCall = dbUpdateMock.mock.results[0].value.set;
		expect(setCall).toHaveBeenCalledWith(expect.objectContaining({ status: 'active' }));
	});
});

describe('archivePaymentRequest', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		updateWhereFn.mockResolvedValue(undefined);
	});

	test('calls update with status=archived', async () => {
		await archivePaymentRequest(PR_ID, INITIATOR_ID);

		expect(dbUpdateMock).toHaveBeenCalled();
		const setCall = dbUpdateMock.mock.results[0].value.set;
		expect(setCall).toHaveBeenCalledWith(expect.objectContaining({ status: 'archived' }));
	});
});
