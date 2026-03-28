// SPDX-License-Identifier: AGPL-3.0-or-later
// Seeds 3 test users with varied balances and connections

const provider = process.env.DB_PROVIDER || 'sqlite';

// Import the correct schema for the active provider
const { user, appUsers, transactions, connections } =
	provider === 'pg'
		? await import('../src/lib/server/schema.pg.js')
		: await import('../src/lib/server/schema.sqlite.js');

const now = new Date();

// Create Better Auth users
const authUsers = [
	{ id: 'ba-user-1', name: 'Ana', email: 'ana@test.local', phone: '+351912345678' },
	{ id: 'ba-user-2', name: 'Bruno', email: 'bruno@test.local', phone: '+351923456789' },
	{ id: 'ba-user-3', name: 'Carla', email: 'carla@test.local', phone: '+351934567890' }
];

const appUserRecords = [
	{ id: 'app-user-1', betterAuthUserId: 'ba-user-1', displayName: 'Ana' },
	{ id: 'app-user-2', betterAuthUserId: 'ba-user-2', displayName: 'Bruno' },
	{ id: 'app-user-3', betterAuthUserId: 'ba-user-3', displayName: 'Carla' }
];

if (provider === 'pg') {
	const { drizzle } = await import('drizzle-orm/bun-sql');
	const { SQL } = await import('bun');

	const url = process.env.DATABASE_URL || 'postgres://mutuvia:mutuvia@localhost:5432/mutuvia';
	const client = new SQL(url);
	const db = drizzle({ client });

	for (const u of authUsers) {
		await db.insert(user).values({
			id: u.id,
			name: u.name,
			email: u.email,
			emailVerified: false,
			phoneNumber: u.phone,
			phoneNumberVerified: true,
			createdAt: now,
			updatedAt: now
		});
	}

	for (const au of appUserRecords) {
		await db.insert(appUsers).values({ ...au, createdAt: now });
	}

	await db.insert(transactions).values({
		id: 'tx-1',
		fromUserId: 'app-user-1',
		toUserId: 'app-user-2',
		amount: 1000,
		unitCode: 'EUR',
		note: 'Vegetables from the garden',
		createdAt: new Date(now.getTime() - 86400000)
	});

	await db.insert(transactions).values({
		id: 'tx-2',
		fromUserId: 'app-user-2',
		toUserId: 'app-user-3',
		amount: 500,
		unitCode: 'EUR',
		note: 'Fresh bread',
		createdAt: now
	});

	await db.insert(connections).values({ userAId: 'app-user-1', userBId: 'app-user-2', createdAt: now });
	await db.insert(connections).values({ userAId: 'app-user-2', userBId: 'app-user-3', createdAt: now });

	await client.end();
} else {
	const { drizzle } = await import('drizzle-orm/bun-sqlite');
	const { Database } = await import('bun:sqlite');

	const dbFile = process.env.DB_FILE_NAME || 'sqlite.db';
	const sqlite = new Database(dbFile);
	sqlite.exec('PRAGMA journal_mode = WAL;');
	sqlite.exec('PRAGMA foreign_keys = ON;');
	const db = drizzle({ client: sqlite });

	for (const u of authUsers) {
		await db.insert(user).values({
			id: u.id,
			name: u.name,
			email: u.email,
			emailVerified: false,
			phoneNumber: u.phone,
			phoneNumberVerified: true,
			createdAt: now,
			updatedAt: now
		});
	}

	for (const au of appUserRecords) {
		await db.insert(appUsers).values({ ...au, createdAt: now });
	}

	await db.insert(transactions).values({
		id: 'tx-1',
		fromUserId: 'app-user-1',
		toUserId: 'app-user-2',
		amount: 1000,
		unitCode: 'EUR',
		note: 'Vegetables from the garden',
		createdAt: new Date(now.getTime() - 86400000)
	});

	await db.insert(transactions).values({
		id: 'tx-2',
		fromUserId: 'app-user-2',
		toUserId: 'app-user-3',
		amount: 500,
		unitCode: 'EUR',
		note: 'Fresh bread',
		createdAt: now
	});

	await db.insert(connections).values({ userAId: 'app-user-1', userBId: 'app-user-2', createdAt: now });
	await db.insert(connections).values({ userAId: 'app-user-2', userBId: 'app-user-3', createdAt: now });

	sqlite.close();
}

console.log('Seeded 3 users, 2 transactions, 2 connections.');
console.log('Ana: balance = -10.00 EUR');
console.log('Bruno: balance = +5.00 EUR');
console.log('Carla: balance = +5.00 EUR');
