// SPDX-License-Identifier: AGPL-3.0-or-later

import { drizzle } from 'drizzle-orm/bun-sqlite';
import { Database } from 'bun:sqlite';
import { config } from '$lib/config';
import * as schema from './schema';

export const sqlite = new Database(config.dbFileName);
sqlite.exec('PRAGMA journal_mode = WAL;');
sqlite.exec('PRAGMA foreign_keys = ON;');

export const db = drizzle({ client: sqlite, schema });
