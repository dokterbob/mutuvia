// SPDX-License-Identifier: AGPL-3.0-or-later
// Seeds 3 test users with varied balances and connections

import { drizzle } from 'drizzle-orm/bun-sqlite';
import { Database } from 'bun:sqlite';
import { user, appUsers, transactions, connections } from '../src/lib/server/schema';

const dbFile = process.env.DB_FILE_NAME || 'sqlite.db';
const sqlite = new Database(dbFile);
sqlite.exec('PRAGMA journal_mode = WAL;');
sqlite.exec('PRAGMA foreign_keys = ON;');

const db = drizzle({ client: sqlite });

const now = new Date();

// Create Better Auth users
const authUsers = [
	{ id: 'ba-user-1', name: 'Ana', email: 'ana@test.local', phone: '+351912345678' },
	{ id: 'ba-user-2', name: 'Bruno', email: 'bruno@test.local', phone: '+351923456789' },
	{ id: 'ba-user-3', name: 'Carla', email: 'carla@test.local', phone: '+351934567890' }
];

for (const u of authUsers) {
	db.insert(user)
		.values({
			id: u.id,
			name: u.name,
			email: u.email,
			emailVerified: false,
			phoneNumber: u.phone,
			phoneNumberVerified: true,
			createdAt: now,
			updatedAt: now
		})
		.run();
}

// Create app users
const appUserRecords = [
	{ id: 'app-user-1', betterAuthUserId: 'ba-user-1', displayName: 'Ana' },
	{ id: 'app-user-2', betterAuthUserId: 'ba-user-2', displayName: 'Bruno' },
	{ id: 'app-user-3', betterAuthUserId: 'ba-user-3', displayName: 'Carla' }
];

for (const au of appUserRecords) {
	db.insert(appUsers)
		.values({ ...au, createdAt: now })
		.run();
}

// Create transactions: Ana sends 1000 (€10) to Bruno, Bruno sends 500 (€5) to Carla
db.insert(transactions)
	.values({
		id: 'tx-1',
		fromUserId: 'app-user-1',
		toUserId: 'app-user-2',
		amount: 1000,
		unitCode: 'EUR',
		note: 'Vegetables from the garden',
		createdAt: new Date(now.getTime() - 86400000) // 1 day ago
	})
	.run();

db.insert(transactions)
	.values({
		id: 'tx-2',
		fromUserId: 'app-user-2',
		toUserId: 'app-user-3',
		amount: 500,
		unitCode: 'EUR',
		note: 'Fresh bread',
		createdAt: now
	})
	.run();

// Create connections: Ana-Bruno, Bruno-Carla
db.insert(connections)
	.values({ userAId: 'app-user-1', userBId: 'app-user-2', createdAt: now })
	.run();
db.insert(connections)
	.values({ userAId: 'app-user-2', userBId: 'app-user-3', createdAt: now })
	.run();

console.log('Seeded 3 users, 2 transactions, 2 connections.');
console.log('Ana: balance = -10.00 EUR');
console.log('Bruno: balance = +5.00 EUR');
console.log('Carla: balance = +5.00 EUR');

sqlite.close();
