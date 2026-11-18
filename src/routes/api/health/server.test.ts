// SPDX-License-Identifier: AGPL-3.0-or-later
// Security regression: /api/health used to return the raw DB error message
// and the active dbProvider straight to an unauthenticated caller. This pins
// that the response body never carries either, while the 200/503 status
// split — relied on by docker-compose.yml's healthcheck and the Dockerfile's
// HEALTHCHECK — is preserved.

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { selectLimitFn, dbSelectMock, consoleErrorSpy } = vi.hoisted(() => {
	const selectLimitFn = vi.fn();
	const selectFromFn = vi.fn();
	const selectChain = { from: selectFromFn, limit: selectLimitFn };
	selectFromFn.mockReturnValue(selectChain);

	return {
		selectLimitFn,
		dbSelectMock: vi.fn().mockReturnValue(selectChain),
		consoleErrorSpy: vi.fn()
	};
});

vi.mock('$lib/server/db', () => ({
	db: { select: dbSelectMock }
}));

vi.mock('$lib/server/schema', () => ({
	user: 'user'
}));

vi.mock('@sveltejs/kit', () => ({
	json: vi.fn(
		(data: unknown, init?: { status?: number }) =>
			new Response(JSON.stringify(data), {
				status: init?.status ?? 200,
				headers: { 'Content-Type': 'application/json' }
			})
	)
}));

import { GET } from './+server';

describe('GET /api/health', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		console.error = consoleErrorSpy;
	});

	describe('Given the DB query succeeds', () => {
		beforeEach(() => {
			selectLimitFn.mockResolvedValueOnce([{ id: 'user-1' }]);
		});

		it('returns 200', async () => {
			const res = await GET({} as unknown as Parameters<typeof GET>[0]);

			expect(res.status).toBe(200);
		});

		it('returns only { status: "ok" } — no db/dbProvider fields', async () => {
			const res = await GET({} as unknown as Parameters<typeof GET>[0]);
			const body = await res.json();

			expect(body).toEqual({ status: 'ok' });
		});
	});

	describe('Given the DB query throws', () => {
		const dbError = new Error('password authentication failed for user "mutuvia"');

		beforeEach(() => {
			selectLimitFn.mockRejectedValueOnce(dbError);
		});

		it('preserves the 503 status the healthcheck relies on', async () => {
			const res = await GET({} as unknown as Parameters<typeof GET>[0]);

			expect(res.status).toBe(503);
		});

		it('[security] does not leak the raw error message in the response body', async () => {
			const res = await GET({} as unknown as Parameters<typeof GET>[0]);
			const body = await res.json();

			expect(body).toEqual({ status: 'error' });
			expect(JSON.stringify(body)).not.toContain('mutuvia');
			expect(JSON.stringify(body)).not.toContain('password');
		});

		it('[security] does not leak dbProvider in the response body', async () => {
			const res = await GET({} as unknown as Parameters<typeof GET>[0]);
			const body = await res.json();

			expect(body).not.toHaveProperty('dbProvider');
			expect(body).not.toHaveProperty('db');
		});

		it('logs the error server-side instead', async () => {
			await GET({} as unknown as Parameters<typeof GET>[0]);

			expect(consoleErrorSpy).toHaveBeenCalledWith(
				expect.stringContaining('[api/health]'),
				dbError
			);
		});
	});
});
