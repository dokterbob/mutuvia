// SPDX-License-Identifier: AGPL-3.0-or-later

import { describe, test, expect } from 'vitest';
import { filterSortContacts } from './contacts-filter.js';
import type { ContactRow } from './contacts-filter.js';

const contacts: ContactRow[] = [
	{ id: '1', name: 'Alice', balance: 300, formattedBalance: '€3.00' },
	{ id: '2', name: 'Bob', balance: -150, formattedBalance: '-€1.50' },
	{ id: '3', name: 'Carol', balance: 0, formattedBalance: '€0.00' },
	{ id: '4', name: 'Dave', balance: 500, formattedBalance: '€5.00' },
	{ id: '5', name: 'Eve', balance: -80, formattedBalance: '-€0.80' }
];

describe('filterSortContacts — search', () => {
	test('empty query returns all contacts', () => {
		const result = filterSortContacts(contacts, { query: '', filter: 'all', sort: 'name' });
		expect(result).toHaveLength(5);
	});

	test('case-insensitive substring match', () => {
		const result = filterSortContacts(contacts, { query: 'alice', filter: 'all', sort: 'name' });
		expect(result).toHaveLength(1);
		expect(result[0].id).toBe('1');
	});

	test('partial name match', () => {
		const result = filterSortContacts(contacts, { query: 'ar', filter: 'all', sort: 'name' });
		expect(result).toHaveLength(1);
		expect(result[0].name).toBe('Carol');
	});

	test('query with no match returns empty array', () => {
		const result = filterSortContacts(contacts, {
			query: 'zzznomatch',
			filter: 'all',
			sort: 'name'
		});
		expect(result).toHaveLength(0);
	});

	test('whitespace-only query returns all contacts', () => {
		const result = filterSortContacts(contacts, { query: '   ', filter: 'all', sort: 'name' });
		expect(result).toHaveLength(5);
	});
});

describe('filterSortContacts — filter', () => {
	test('"all" includes positive, negative, and zero balances', () => {
		const result = filterSortContacts(contacts, { query: '', filter: 'all', sort: 'name' });
		expect(result).toHaveLength(5);
	});

	test('"positive" includes only contacts with balance > 0', () => {
		const result = filterSortContacts(contacts, { query: '', filter: 'positive', sort: 'name' });
		expect(result.every((c) => c.balance > 0)).toBe(true);
		expect(result).toHaveLength(2);
	});

	test('"positive" excludes zero-balance contacts', () => {
		const result = filterSortContacts(contacts, { query: '', filter: 'positive', sort: 'name' });
		expect(result.some((c) => c.balance === 0)).toBe(false);
	});

	test('"negative" includes only contacts with balance < 0', () => {
		const result = filterSortContacts(contacts, { query: '', filter: 'negative', sort: 'name' });
		expect(result.every((c) => c.balance < 0)).toBe(true);
		expect(result).toHaveLength(2);
	});

	test('"negative" excludes zero-balance contacts', () => {
		const result = filterSortContacts(contacts, { query: '', filter: 'negative', sort: 'name' });
		expect(result.some((c) => c.balance === 0)).toBe(false);
	});
});

describe('filterSortContacts — sort', () => {
	test('sort by name uses localeCompare order', () => {
		const result = filterSortContacts(contacts, { query: '', filter: 'all', sort: 'name' });
		const names = result.map((c) => c.name);
		expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
	});

	test('sort by amount is descending (highest balance first)', () => {
		const result = filterSortContacts(contacts, { query: '', filter: 'all', sort: 'amount' });
		const balances = result.map((c) => c.balance);
		for (let i = 1; i < balances.length; i++) {
			expect(balances[i - 1]).toBeGreaterThanOrEqual(balances[i]);
		}
	});
});

describe('filterSortContacts — combined', () => {
	test('search + filter narrows results correctly', () => {
		const result = filterSortContacts(contacts, {
			query: 'a',
			filter: 'positive',
			sort: 'name'
		});
		// Matches 'Alice' (pos) and 'Dave' (pos) — 'Carol' has zero balance (excluded by positive filter)
		// 'a' matches Alice, Carol, Dave. Filter to positive → Alice and Dave.
		expect(result.map((c) => c.name).sort()).toEqual(['Alice', 'Dave']);
	});

	test('does not mutate the original contacts array', () => {
		const original = [...contacts];
		filterSortContacts(contacts, { query: '', filter: 'all', sort: 'amount' });
		expect(contacts).toEqual(original);
	});
});
