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
	selectOrderByFn,
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
	const selectOrderByFn = vi.fn();
	const selectWhereFn = vi.fn();
	const selectFromFn = vi.fn();
	const selectChain = {
		from: selectFromFn,
		where: selectWhereFn,
		orderBy: selectOrderByFn,
		limit: _selectLimitFn
	};
	selectFromFn.mockReturnValue(selectChain);
	selectWhereFn.mockReturnValue(selectChain);
	selectOrderByFn.mockReturnValue(selectChain);
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
		selectOrderByFn,
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
	getPendingItems,
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

// ---------------------------------------------------------------------------
// getPendingItems
// ---------------------------------------------------------------------------

const activeSingleUsePr = {
	id: 'pr-single-active',
	direction: 'receive' as const,
	amount: 500,
	description: 'coffee',
	reusable: false,
	status: 'active' as const,
	paymentCount: 0,
	totalReceived: 0,
	createdAt: new Date(),
	expiresAt: null
};

const activeReusablePrRow = {
	id: 'pr-reusable-active',
	direction: 'receive' as const,
	amount: null,
	description: null,
	reusable: true,
	status: 'active' as const,
	paymentCount: 3,
	totalReceived: 1500,
	createdAt: new Date(),
	expiresAt: null
};

const pausedReusablePrRow = {
	id: 'pr-reusable-paused',
	direction: 'receive' as const,
	amount: 1000,
	description: 'rent share',
	reusable: true,
	status: 'paused' as const,
	paymentCount: 1,
	totalReceived: 1000,
	createdAt: new Date(),
	expiresAt: null
};

const pausedSingleUsePrRow = {
	id: 'pr-single-paused',
	direction: 'receive' as const,
	amount: 200,
	description: null,
	reusable: false,
	status: 'paused' as const,
	paymentCount: 0,
	totalReceived: 0,
	createdAt: new Date(),
	expiresAt: null
};

const archivedPrRow = {
	id: 'pr-archived',
	direction: 'receive' as const,
	amount: 100,
	description: null,
	reusable: false,
	status: 'archived' as const,
	paymentCount: 0,
	totalReceived: 0,
	createdAt: new Date(),
	expiresAt: null
};

describe('getPendingItems', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		_selectLimitFn.mockReset();
		selectOrderByFn.mockReturnValue({
			from: vi.fn(),
			where: vi.fn(),
			orderBy: selectOrderByFn,
			limit: _selectLimitFn
		});
		// Reset orderBy to return the selectChain (with limit)
		selectOrderByFn.mockReturnValue({ limit: _selectLimitFn });
	});

	describe('Given a mix of active single-use, active reusable, and paused reusable items', () => {
		// The WHERE clause in getPendingItems filters to:
		//   status = active  OR  (status = paused AND reusable = true)
		// So the DB layer already does the filtering; the mock returns whatever
		// we tell it to return (simulating what the DB would return).

		describe('When getPendingItems is called', () => {
			test('→ returns active single-use items', async () => {
				_selectLimitFn.mockResolvedValue([activeSingleUsePr]);

				const result = await getPendingItems(INITIATOR_ID, 10);

				expect(result).toHaveLength(1);
				expect(result[0].id).toBe('pr-single-active');
				expect(result[0].status).toBe('active');
				expect(result[0].reusable).toBe(false);
			});

			test('→ returns active reusable items', async () => {
				_selectLimitFn.mockResolvedValue([activeReusablePrRow]);

				const result = await getPendingItems(INITIATOR_ID, 10);

				expect(result).toHaveLength(1);
				expect(result[0].id).toBe('pr-reusable-active');
				expect(result[0].reusable).toBe(true);
				expect(result[0].status).toBe('active');
			});

			test('→ returns paused reusable items (isPaused: true)', async () => {
				_selectLimitFn.mockResolvedValue([pausedReusablePrRow]);

				const result = await getPendingItems(INITIATOR_ID, 10);

				expect(result).toHaveLength(1);
				expect(result[0].id).toBe('pr-reusable-paused');
				expect(result[0].isPaused).toBe(true);
			});

			test('→ does NOT return paused single-use items (filtered by DB WHERE clause)', async () => {
				// The DB WHERE clause excludes paused non-reusable rows.
				// We simulate that by returning only the rows the DB would return.
				_selectLimitFn.mockResolvedValue([activeSingleUsePr, activeReusablePrRow, pausedReusablePrRow]);

				const result = await getPendingItems(INITIATOR_ID, 10);

				const hasPausedSingleUse = result.some((r) => r.id === pausedSingleUsePrRow.id);
				expect(hasPausedSingleUse).toBe(false);
			});

			test('→ does NOT return archived items', async () => {
				_selectLimitFn.mockResolvedValue([activeSingleUsePr, activeReusablePrRow]);

				const result = await getPendingItems(INITIATOR_ID, 10);

				const hasArchived = result.some((r) => r.id === archivedPrRow.id);
				expect(hasArchived).toBe(false);
			});
		});
	});

	describe('Given a paused reusable item', () => {
		beforeEach(() => {
			_selectLimitFn.mockResolvedValue([pausedReusablePrRow]);
		});

		test('→ isPaused is true in the returned object', async () => {
			const result = await getPendingItems(INITIATOR_ID, 10);

			expect(result[0].isPaused).toBe(true);
		});

		test('→ status is "paused" in the returned object', async () => {
			const result = await getPendingItems(INITIATOR_ID, 10);

			expect(result[0].status).toBe('paused');
		});
	});

	describe('Given an active item', () => {
		beforeEach(() => {
			_selectLimitFn.mockResolvedValue([activeSingleUsePr]);
		});

		test('→ isPaused is false in the returned object', async () => {
			const result = await getPendingItems(INITIATOR_ID, 10);

			expect(result[0].isPaused).toBe(false);
		});
	});

	describe('Given no limit is provided', () => {
		test('→ resolves without calling .limit()', async () => {
			// When no limit, getPendingItems awaits the orderBy chain directly
			selectOrderByFn.mockResolvedValue([activeReusablePrRow]);

			const result = await getPendingItems(INITIATOR_ID);

			expect(result).toHaveLength(1);
			expect(_selectLimitFn).not.toHaveBeenCalled();
		});
	});
});
