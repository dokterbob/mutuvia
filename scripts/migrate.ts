// SPDX-License-Identifier: AGPL-3.0-or-later
// Applies Drizzle migrations using the active DB provider (bun:sqlite or bun:sql).

const provider = process.env.DB_PROVIDER || 'sqlite';

if (provider === 'pg') {
	const { drizzle } = await import('drizzle-orm/bun-sql');
	const { migrate } = await import('drizzle-orm/bun-sql/migrator');
	const { SQL } = await import('bun');

	const url = process.env.DATABASE_URL || 'postgres://mutuvia:mutuvia@localhost:5432/mutuvia';
	const client = new SQL(url);
	const db = drizzle({ client });

	console.log(`Migrating PostgreSQL: ${url}`);
	await migrate(db, { migrationsFolder: './drizzle/pg' });
	console.log('Migration complete.');

	await client.end();
} else {
	const { drizzle } = await import('drizzle-orm/bun-sqlite');
	const { migrate } = await import('drizzle-orm/bun-sqlite/migrator');
	const { Database } = await import('bun:sqlite');

	const dbFile = process.env.DB_FILE_NAME || 'sqlite.db';
	const sqlite = new Database(dbFile);
	// Do NOT enable WAL mode here: writes must land in the main DB file so that
	// a subsequent bun:sqlite connection (the dev server) sees a fully-populated
	// database without relying on WAL replay across separate processes.
	// The dev server promotes to WAL mode after opening.
	const db = drizzle({ client: sqlite });

	console.log(`Migrating database: ${dbFile}`);
	// FK checks must be off during migration: SQLite cannot change this mid-transaction,
	// so the PRAGMA in migration SQL files only works when it runs at connection level.
	sqlite.exec('PRAGMA foreign_keys = OFF;');
	migrate(db, { migrationsFolder: './drizzle/sqlite' });
	sqlite.exec('PRAGMA foreign_keys = ON;');
	console.log('Migration complete.');

	sqlite.close();
}
