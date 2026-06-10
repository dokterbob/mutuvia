// SPDX-License-Identifier: AGPL-3.0-or-later

export interface ContactRow {
	id: string;
	name: string;
	balance: number;
	formattedBalance: string;
}

export type Filter = 'all' | 'positive' | 'negative';
export type Sort = 'name' | 'amount';

export interface FilterOptions {
	query: string;
	filter: Filter;
	sort: Sort;
}

export function filterSortContacts(contacts: ContactRow[], opts: FilterOptions): ContactRow[] {
	const q = opts.query.trim().toLowerCase();

	const filtered = contacts.filter((c) => {
		if (q && !c.name.toLowerCase().includes(q)) return false;
		if (opts.filter === 'positive' && c.balance <= 0) return false;
		if (opts.filter === 'negative' && c.balance >= 0) return false;
		return true;
	});

	return [...filtered].sort((a, b) => {
		if (opts.sort === 'name') return a.name.localeCompare(b.name);
		return b.balance - a.balance;
	});
}
