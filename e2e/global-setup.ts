import { unlink } from 'fs/promises';
import path from 'path';

/**
 * Delete the test database (and WAL files) before each Playwright run so every
 * run starts from a clean slate. The webServer command (db:migrate) recreates
 * it on startup, and db.ts also auto-migrates at startup.
 *
 * We clean both test.db (the intended DB_FILE_NAME) and sqlite.db (the
 * fallback used if DB_FILE_NAME env var is not visible during module init).
 *
 * The test server runs on port 5174 (separate from the dev server on 5173) so
 * there is no risk of Playwright reusing a dev server with the wrong env vars.
 */
export default async function globalSetup() {
	const cwd = process.cwd();
	const candidates = ['test.db', 'sqlite.db'];
	for (const name of candidates) {
		const base = path.resolve(cwd, name);
		for (const file of [base, `${base}-wal`, `${base}-shm`]) {
			try {
				await unlink(file);
			} catch {
				// File doesn't exist — nothing to do.
			}
		}
	}
}
