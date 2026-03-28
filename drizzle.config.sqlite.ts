// SPDX-License-Identifier: AGPL-3.0-or-later

import { defineConfig } from 'drizzle-kit';

export default defineConfig({
	out: './drizzle/sqlite',
	schema: './src/lib/server/schema.sqlite.ts',
	dialect: 'sqlite',
	dbCredentials: {
		url: process.env.DB_FILE_NAME || 'sqlite.db'
	}
});
