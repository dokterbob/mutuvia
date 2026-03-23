// SPDX-License-Identifier: AGPL-3.0-or-later

import { defineConfig } from 'drizzle-kit';

export default defineConfig({
	out: './drizzle',
	schema: './src/lib/server/schema.ts',
	dialect: 'sqlite',
	dbCredentials: {
		url: process.env.DB_FILE_NAME || 'sqlite.db'
	}
});
