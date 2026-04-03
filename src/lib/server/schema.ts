// SPDX-License-Identifier: AGPL-3.0-or-later

import { config } from '$lib/config';

const mod =
	config.dbProvider === 'pg' ? await import('./schema.pg') : await import('./schema.sqlite');

// Type-assert to SQLite types for static analysis — runtime exports are dialect-correct.
type SqliteSchema = typeof import('./schema.sqlite');
export const {
	user,
	session,
	account,
	verification,
	appUsers,
	transactions,
	pendingQr,
	connections,
	pushSubscriptions
} = mod as unknown as SqliteSchema;
