// SPDX-License-Identifier: AGPL-3.0-or-later

import { defineConfig } from 'drizzle-kit';

export default defineConfig({
	out: './drizzle/pg',
	schema: './src/lib/server/schema.pg.ts',
	dialect: 'postgresql',
	dbCredentials: {
		url: process.env.DATABASE_URL || 'postgres://mutuvia:mutuvia@localhost:5432/mutuvia'
	}
});
