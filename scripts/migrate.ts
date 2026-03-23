// SPDX-License-Identifier: AGPL-3.0-or-later
// Applies Drizzle migrations using bun:sqlite (no better-sqlite3 needed)

import { drizzle } from 'drizzle-orm/bun-sqlite';
import { migrate } from 'drizzle-orm/bun-sqlite/migrator';
import { Database } from 'bun:sqlite';

const dbFile = process.env.DB_FILE_NAME || 'sqlite.db';
const sqlite = new Database(dbFile);
sqlite.exec('PRAGMA journal_mode = WAL;');
sqlite.exec('PRAGMA foreign_keys = ON;');

const db = drizzle({ client: sqlite });

console.log(`Migrating database: ${dbFile}`);
migrate(db, { migrationsFolder: './drizzle' });
console.log('Migration complete.');

sqlite.close();
