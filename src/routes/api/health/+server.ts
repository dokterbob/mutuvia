import { json } from '@sveltejs/kit';
import { sql } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { config } from '$lib/config';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async () => {
	try {
		await db.run(sql`SELECT 1`);
		return json({ status: 'ok', db: 'ok', dbProvider: config.dbProvider });
	} catch (err) {
		return json(
			{ status: 'error', db: 'error', error: err instanceof Error ? err.message : 'Unknown' },
			{ status: 503 }
		);
	}
};
