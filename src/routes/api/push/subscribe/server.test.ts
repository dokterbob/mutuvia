// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock factories — must be in vi.hoisted() so vi.mock() factories can use them
// ---------------------------------------------------------------------------

const {
	selectLimitFn,
	insertOnConflictFn,
	deleteWhereFn,
	dbSelectMock,
	dbInsertMock,
	dbDeleteMock,
	randomUUIDMock
} = vi.hoisted(() => {
	// --- Select chain ---
	const selectLimitFn = vi.fn();
	const selectWhereFn = vi.fn();
	const selectFromFn = vi.fn();
	const selectChain = { from: selectFromFn, where: selectWhereFn, limit: selectLimitFn };
	selectFromFn.mockReturnValue(selectChain);
	selectWhereFn.mockReturnValue(selectChain);

	// --- Insert chain ---
	const insertOnConflictFn = vi.fn().mockResolvedValue(undefined);
	const insertValuesFn = vi.fn().mockReturnValue({ onConflictDoNothing: insertOnConflictFn });
	const insertChain = { values: insertValuesFn };

	// --- Delete chain ---
	const deleteWhereFn = vi.fn().mockResolvedValue(undefined);
	const deleteChain = { where: deleteWhereFn };

	const dbSelectMock = vi.fn().mockReturnValue(selectChain);
	const dbInsertMock = vi.fn().mockReturnValue(insertChain);
	const dbDeleteMock = vi.fn().mockReturnValue(deleteChain);

	const randomUUIDMock = vi.fn(() => 'test-uuid-1234');

	return {
		selectLimitFn,
		insertOnConflictFn,
		deleteWhereFn,
		dbSelectMock,
		dbInsertMock,
		dbDeleteMock,
		randomUUIDMock
	};
});

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

vi.mock('$lib/server/db', () => ({
	db: { select: dbSelectMock, insert: dbInsertMock, delete: dbDeleteMock }
}));

vi.mock('$lib/server/schema', () => ({
	pushSubscriptions: {
		id: 'pushSubscriptions.id',
		userId: 'pushSubscriptions.userId',
		endpoint: 'pushSubscriptions.endpoint'
	}
}));

vi.mock('drizzle-orm', () => ({
	eq: vi.fn((a: unknown, b: unknown) => `${String(a)}=${String(b)}`),
	and: vi.fn((...args: unknown[]) => args.join(' AND '))
}));

vi.mock('crypto', () => ({ randomUUID: randomUUIDMock }));

vi.mock('@sveltejs/kit', () => ({
	json: vi.fn(
		(data: unknown, init?: { status?: number }) =>
			new Response(JSON.stringify(data), {
				status: init?.status ?? 200,
				headers: { 'Content-Type': 'application/json' }
			})
	)
}));

// Import AFTER mocks
import { POST as subscribePOST } from './+server';
import { POST as unsubscribePOST } from '../unsubscribe/+server';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSubscribeRequest(bodyOverrides: Record<string, unknown> = {}) {
	const body = {
		endpoint: 'https://fcm.googleapis.com/test-endpoint',
		keys: { p256dh: 'test-p256dh', auth: 'test-auth' },
		userAgent: 'test-agent',
		...bodyOverrides
	};
	return new Request('http://localhost/api/push/subscribe', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(body)
	});
}

function makeSubscribeEvent(overrides: Record<string, unknown> = {}) {
	return {
		locals: { appUser: { id: 'user-123', displayName: 'Alice' } },
		request: makeSubscribeRequest(),
		...overrides
	};
}

function makeUnsubscribeEvent(overrides: Record<string, unknown> = {}) {
	const body = {
		endpoint: 'https://fcm.googleapis.com/test-endpoint',
		...((overrides.body as object | undefined) ?? {})
	};
	const request = new Request('http://localhost/api/push/unsubscribe', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(body)
	});
	return {
		locals: { appUser: { id: 'user-123', displayName: 'Alice' } },
		request,
		...overrides
	};
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('POST /api/push/subscribe', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		selectLimitFn.mockReset();
		insertOnConflictFn.mockResolvedValue(undefined);
		deleteWhereFn.mockResolvedValue(undefined);
		randomUUIDMock.mockReturnValue('test-uuid-1234');
	});

	describe('given an unauthenticated request', () => {
		it('returns 401', async () => {
			const event = makeSubscribeEvent({ locals: {} });
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const res = await subscribePOST(event as any);
			expect(res.status).toBe(401);
		});
	});

	describe('given an authenticated request with an invalid body', () => {
		it('returns 400 when endpoint is missing', async () => {
			const request = new Request('http://localhost/api/push/subscribe', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ keys: { p256dh: 'x', auth: 'y' } })
			});
			const event = { locals: { appUser: { id: 'user-123' } }, request };
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const res = await subscribePOST(event as any);
			expect(res.status).toBe(400);
		});

		it('returns 400 when keys are missing', async () => {
			const request = new Request('http://localhost/api/push/subscribe', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ endpoint: 'https://fcm.test' })
			});
			const event = { locals: { appUser: { id: 'user-123' } }, request };
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const res = await subscribePOST(event as any);
			expect(res.status).toBe(400);
		});
	});

	describe('given an authenticated request with a valid body', () => {
		it('stores the subscription and returns 201 when new', async () => {
			// select returns the newly inserted row (id matches randomUUID → new)
			selectLimitFn.mockResolvedValueOnce([{ id: 'test-uuid-1234' }]);

			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const res = await subscribePOST(makeSubscribeEvent() as any);
			expect(res.status).toBe(201);
			const body = await res.json();
			expect(body.id).toBe('test-uuid-1234');
			expect(dbInsertMock).toHaveBeenCalled();
		});

		it('is idempotent — returns 200 with pre-existing id on re-subscribe', async () => {
			// select returns a pre-existing row (id differs from randomUUID → existing)
			selectLimitFn.mockResolvedValueOnce([{ id: 'existing-uuid' }]);

			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const res = await subscribePOST(makeSubscribeEvent() as any);
			expect(res.status).toBe(200);
			const body = await res.json();
			expect(body.id).toBe('existing-uuid');
		});
	});
});

describe('POST /api/push/unsubscribe', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		deleteWhereFn.mockResolvedValue(undefined);
	});

	describe('given an unauthenticated request', () => {
		it('returns 401', async () => {
			const event = makeUnsubscribeEvent({ locals: {} });
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const res = await unsubscribePOST(event as any);
			expect(res.status).toBe(401);
		});
	});

	describe('given an authenticated request', () => {
		it('removes the subscription and returns 200', async () => {
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const res = await unsubscribePOST(makeUnsubscribeEvent() as any);
			expect(res.status).toBe(200);
			expect(dbDeleteMock).toHaveBeenCalled();
		});

		it('returns 200 even when endpoint was not found (idempotent)', async () => {
			// delete is always called; success regardless of whether row existed
			deleteWhereFn.mockResolvedValue(undefined);
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const res = await unsubscribePOST(makeUnsubscribeEvent() as any);
			expect(res.status).toBe(200);
		});
	});
});
