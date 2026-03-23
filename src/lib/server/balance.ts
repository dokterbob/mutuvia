// SPDX-License-Identifier: AGPL-3.0-or-later

import { db } from './db';
import { transactions, connections, appUsers } from './schema';
import { eq, or, and, sql } from 'drizzle-orm';

export function getBalance(userId: string): number {
	const result = db
		.select({
			balance: sql<number>`
				COALESCE(SUM(CASE WHEN ${transactions.toUserId} = ${userId} THEN ${transactions.amount} ELSE 0 END), 0)
				- COALESCE(SUM(CASE WHEN ${transactions.fromUserId} = ${userId} THEN ${transactions.amount} ELSE 0 END), 0)
			`
		})
		.from(transactions)
		.where(or(eq(transactions.fromUserId, userId), eq(transactions.toUserId, userId)))
		.get();

	return result?.balance ?? 0;
}

export function formatAmount(amount: number, decimalPlaces: number, symbol: string): string {
	const value = amount / Math.pow(10, decimalPlaces);
	const formatted = value.toFixed(decimalPlaces);
	return `${symbol}\u00A0${formatted}`;
}

export function getConnections(userId: string) {
	const rows = db
		.select()
		.from(connections)
		.where(or(eq(connections.userAId, userId), eq(connections.userBId, userId)))
		.all();

	const connectedIds = rows.map((r) => (r.userAId === userId ? r.userBId : r.userAId));

	if (connectedIds.length === 0) return [];

	return db
		.select()
		.from(appUsers)
		.where(
			sql`${appUsers.id} IN (${sql.join(
				connectedIds.map((id) => sql`${id}`),
				sql`, `
			)})`
		)
		.all();
}

export function upsertConnection(userIdA: string, userIdB: string) {
	const [lower, higher] = userIdA < userIdB ? [userIdA, userIdB] : [userIdB, userIdA];

	const existing = db
		.select()
		.from(connections)
		.where(and(eq(connections.userAId, lower), eq(connections.userBId, higher)))
		.get();

	if (!existing) {
		db.insert(connections)
			.values({
				userAId: lower,
				userBId: higher,
				createdAt: new Date()
			})
			.run();
	}
}
