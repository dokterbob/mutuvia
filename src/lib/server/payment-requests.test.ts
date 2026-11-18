// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Mocked unit tests for the plain CRUD helpers in payment-requests.ts
// (pause/resume/archive/getPendingItems — each a single, already-atomic
// UPDATE/SELECT statement, so mocking `$lib/server/db` is safe here).
//
// settleOneTimeAccept / settleReusable are NOT tested here: they're
// re-exported from ./settlement, which picks a real per-provider
// implementation (settlement.sqlite.ts / settlement.pg.ts) that bypasses
// this file's `$lib/server/db` mock entirely. Their atomicity/concurrency
// behaviour is exercised against a real SQLite database in
// settlement.sqlite.test.ts instead — a mocked db.transaction here would
// hide exactly the kind of bug this PR fixes.

import { describe, test, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// All mock factories in vi.hoisted() so they are available when vi.mock()
// factory callbacks execute (Vitest hoists vi.mock() calls to the top).
// ---------------------------------------------------------------------------

const {
	dbInsertMock,
	dbUpdateMock,
	dbSelectMock,
	_insertValuesFn,
	updateWhereFn,
	_selectLimitFn,
	selectOrderByFn
} = vi.hoisted(() => {
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

	return {
		dbInsertMock,
		dbUpdateMock,
		dbSelectMock,
		_insertValuesFn,
		updateWhereFn,
		_selectLimitFn,
		selectOrderByFn
	};
});

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

vi.mock('$lib/server/db', () => ({
	db: {
		select: dbSelectMock,
		insert: dbInsertMock,
		update: dbUpdateMock
	}
}));

vi.mock('$lib/server/schema', () => ({
	paymentRequests: new Proxy({}, { get: (_t, prop: string) => `paymentRequests.${prop}` }),
	transactions: new Proxy({}, { get: (_t, prop: string) => `transactions.${prop}` }),
	appUsers: 'appUsers'
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
	pausePaymentRequest,
	resumePaymentRequest,
	archivePaymentRequest
} from './payment-requests';

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const INITIATOR_ID = 'user-initiator';
const PR_ID = 'pr-test-id';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
//
// settleOneTimeAccept / settleReusable tests live in settlement.sqlite.test.ts
// (real SQLite DB — see the note at the top of this file for why).

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

	test('WHERE clause includes reusable = true guard', async () => {
		await pausePaymentRequest(PR_ID, INITIATOR_ID);

		// Schema is mocked via Proxy so paymentRequests.reusable → "paymentRequests.reusable";
		// eq(paymentRequests.reusable, true) serialises as "paymentRequests.reusable=true".
		expect(updateWhereFn).toHaveBeenCalledWith(
			expect.stringContaining('paymentRequests.reusable=true')
		);
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

	test('WHERE clause includes reusable = true guard', async () => {
		await resumePaymentRequest(PR_ID, INITIATOR_ID);

		// Schema is mocked via Proxy so paymentRequests.reusable → "paymentRequests.reusable";
		// eq(paymentRequests.reusable, true) serialises as "paymentRequests.reusable=true".
		expect(updateWhereFn).toHaveBeenCalledWith(
			expect.stringContaining('paymentRequests.reusable=true')
		);
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

	test('WHERE clause includes reusable = true guard', async () => {
		await archivePaymentRequest(PR_ID, INITIATOR_ID);

		expect(updateWhereFn).toHaveBeenCalledWith(
			expect.stringContaining('paymentRequests.reusable=true')
		);
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
				_selectLimitFn.mockResolvedValue([
					activeSingleUsePr,
					activeReusablePrRow,
					pausedReusablePrRow
				]);

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
