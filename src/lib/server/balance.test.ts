// SPDX-License-Identifier: AGPL-3.0-or-later

import { describe, test, expect, vi, beforeEach } from 'vitest';

// ── db chain mock ──────────────────────────────────────────────────────────────
// selectMock holds the rows returned by the next db.select() call.
let selectRows: unknown[] = [];

const mockDb = {
	select: vi.fn().mockReturnThis(),
	from: vi.fn().mockReturnThis(),
	leftJoin: vi.fn().mockReturnThis(),
	where: vi.fn().mockReturnThis(),
	groupBy: vi.fn().mockImplementation(() => Promise.resolve(selectRows)),
	limit: vi.fn().mockImplementation(() => Promise.resolve(selectRows))
};

vi.mock('$lib/server/db', () => ({ db: mockDb }));
vi.mock('$lib/server/schema', () => ({
	transactions: { fromUserId: 'from_user_id', toUserId: 'to_user_id', amount: 'amount' },
	appUsers: { id: 'id', displayName: 'display_name' },
	connections: {}
}));
vi.mock('drizzle-orm', () => ({
	eq: vi.fn((col, val) => ({ col, val })),
	or: vi.fn((...args) => ({ or: args })),
	and: vi.fn((...args) => ({ and: args })),
	sql: Object.assign(
		vi.fn((strings: TemplateStringsArray, ...values: unknown[]) => ({ sql: strings, values })),
		{
			join: vi.fn()
		}
	)
}));

function setRows(rows: unknown[]) {
	selectRows = rows;
}

const { getContactBalances, getContactBalance } = await import('./balance.js');

beforeEach(() => {
	vi.clearAllMocks();
	// Re-wire the chain after clearAllMocks resets return values
	mockDb.select.mockReturnThis();
	mockDb.from.mockReturnThis();
	mockDb.leftJoin.mockReturnThis();
	mockDb.where.mockReturnThis();
	mockDb.groupBy.mockImplementation(() => Promise.resolve(selectRows));
	mockDb.limit.mockImplementation(() => Promise.resolve(selectRows));
});

describe('getContactBalances', () => {
	describe('given no transactions', () => {
		test('returns an empty array', async () => {
			setRows([]);
			const result = await getContactBalances('user1');
			expect(result).toEqual([]);
		});
	});

	describe('given rows with a known display name', () => {
		test('maps id, name, and balance correctly', async () => {
			setRows([{ id: 'user2', name: 'Alice', balance: 500 }]);
			const result = await getContactBalances('user1');
			expect(result).toEqual([{ id: 'user2', name: 'Alice', balance: 500 }]);
		});
	});

	describe('given a row with null display name', () => {
		test("uses 'Unknown' as fallback", async () => {
			setRows([{ id: 'user3', name: null, balance: 100 }]);
			const result = await getContactBalances('user1');
			expect(result[0].name).toBe('Unknown');
		});
	});

	describe('given pg returning SUM as a string', () => {
		test('coerces string balance to number', async () => {
			setRows([{ id: 'user4', name: 'Bob', balance: '250' }]);
			const result = await getContactBalances('user1');
			expect(result[0].balance).toBe(250);
			expect(typeof result[0].balance).toBe('number');
		});
	});

	describe('sign semantics', () => {
		test('positive balance means counterparty owes the user', async () => {
			setRows([{ id: 'user5', name: 'Carol', balance: 300 }]);
			const result = await getContactBalances('user1');
			expect(result[0].balance).toBeGreaterThan(0);
		});

		test('negative balance means user owes the counterparty', async () => {
			setRows([{ id: 'user6', name: 'Dave', balance: -150 }]);
			const result = await getContactBalances('user1');
			expect(result[0].balance).toBeLessThan(0);
		});
	});

	describe('given multiple contacts', () => {
		test('maps all rows', async () => {
			setRows([
				{ id: 'u2', name: 'Alice', balance: 100 },
				{ id: 'u3', name: 'Bob', balance: -50 }
			]);
			const result = await getContactBalances('user1');
			expect(result).toHaveLength(2);
		});
	});
});

describe('getContactBalance', () => {
	describe('given shared transactions', () => {
		test('returns signed balance (positive = they owe)', async () => {
			setRows([{ balance: 400 }]);
			const result = await getContactBalance('user1', 'user2');
			expect(result).toBe(400);
		});

		test('returns negative when user owes counterparty', async () => {
			setRows([{ balance: -200 }]);
			const result = await getContactBalance('user1', 'user2');
			expect(result).toBe(-200);
		});
	});

	describe('given no shared transactions', () => {
		test('returns 0', async () => {
			setRows([]);
			const result = await getContactBalance('user1', 'user2');
			expect(result).toBe(0);
		});
	});

	describe('given pg returning SUM as a string', () => {
		test('coerces string to number', async () => {
			setRows([{ balance: '350' }]);
			const result = await getContactBalance('user1', 'user2');
			expect(result).toBe(350);
			expect(typeof result).toBe('number');
		});
	});
});
