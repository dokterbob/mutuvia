// SPDX-License-Identifier: AGPL-3.0-or-later

import { drizzle } from 'drizzle-orm/bun-sql';
import { config } from '$lib/config';
import * as schema from './schema';

export const db = drizzle({ connection: { url: config.databaseUrl }, schema });
export const sqlite = null;
