// SPDX-License-Identifier: AGPL-3.0-or-later

import { db } from './db';
import { transactions, connections, appUsers } from './schema';
import { eq, or, and, sql } from 'drizzle-orm';

export interface ContactBalance {
	id: string;
	name: string;
	balance: number;
}

export async function getBalance(userId: string): Promise<number> {
	const [result] = await db
		.select({
			balance: sql<number>`
				COALESCE(SUM(CASE WHEN ${transactions.toUserId} = ${userId} THEN ${transactions.amount} ELSE 0 END), 0)
				- COALESCE(SUM(CASE WHEN ${transactions.fromUserId} = ${userId} THEN ${transactions.amount} ELSE 0 END), 0)
			`
		})
		.from(transactions)
		.where(or(eq(transactions.fromUserId, userId), eq(transactions.toUserId, userId)))
		.limit(1);

	// Number() guards pg returning SUM as a string; sqlite returns a number.
	return Number(result?.balance) || 0;
}

export async function getConnections(userId: string) {
	const rows = await db
		.select()
		.from(connections)
		.where(or(eq(connections.userAId, userId), eq(connections.userBId, userId)));

	const connectedIds = rows.map((r) => (r.userAId === userId ? r.userBId : r.userAId));

	if (connectedIds.length === 0) return [];

	return await db
		.select()
		.from(appUsers)
		.where(
			sql`${appUsers.id} IN (${sql.join(
				connectedIds.map((id) => sql`${id}`),
				sql`, `
			)})`
		);
}

export async function getContactBalances(userId: string): Promise<ContactBalance[]> {
	const otherId = sql<string>`CASE WHEN ${transactions.fromUserId} = ${userId}
		THEN ${transactions.toUserId} ELSE ${transactions.fromUserId} END`;

	const rows = await db
		.select({
			id: otherId,
			name: appUsers.displayName,
			balance: sql<number>`
				COALESCE(SUM(CASE WHEN ${transactions.toUserId} = ${userId} THEN ${transactions.amount} ELSE 0 END), 0)
				- COALESCE(SUM(CASE WHEN ${transactions.fromUserId} = ${userId} THEN ${transactions.amount} ELSE 0 END), 0)`
		})
		.from(transactions)
		.leftJoin(appUsers, sql`${appUsers.id} = ${otherId}`)
		.where(or(eq(transactions.fromUserId, userId), eq(transactions.toUserId, userId)))
		.groupBy(otherId, appUsers.displayName);

	// Number() guards pg returning SUM as a string; sqlite returns a number.
	return rows.map((r) => ({
		id: r.id,
		name: r.name ?? 'Unknown',
		balance: Number(r.balance) || 0
	}));
}

export async function getContactBalance(userId: string, otherId: string): Promise<number> {
	const [r] = await db
		.select({
			balance: sql<number>`
				COALESCE(SUM(CASE WHEN ${transactions.toUserId} = ${userId} THEN ${transactions.amount} ELSE 0 END), 0)
				- COALESCE(SUM(CASE WHEN ${transactions.fromUserId} = ${userId} THEN ${transactions.amount} ELSE 0 END), 0)`
		})
		.from(transactions)
		.where(
			or(
				and(eq(transactions.fromUserId, userId), eq(transactions.toUserId, otherId)),
				and(eq(transactions.fromUserId, otherId), eq(transactions.toUserId, userId))
			)
		)
		.limit(1);
	return Number(r?.balance) || 0;
}

// `upsertConnection` (insert-on-settlement, keyed on the sorted user-id pair)
// used to live here, but every real caller settled the connection row
// through the settlement transaction directly — this standalone,
// non-transaction-aware version was dead in production and has been
// removed, along with its real-SQLite test (balance.sqlite.test.ts). See
// settlement.sqlite.ts / settlement.pg.ts for the connection upsert that's
// actually used (same `insert().onConflictDoNothing()` pattern, run against
// the active transaction).
