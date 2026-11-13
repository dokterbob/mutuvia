// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock factories — must be in vi.hoisted() so vi.mock() factories can use them
// ---------------------------------------------------------------------------

const {
	selectLimitFn,
	selectOrderByFn,
	selectWhereFn,
	insertOnConflictFn,
	returningFn,
	deleteWhereFn,
	dbSelectMock,
	dbInsertMock,
	dbDeleteMock,
	randomUUIDMock
} = vi.hoisted(() => {
	// --- Select chain for the cap-trim subquery: .from().where().orderBy().limit() ---
	// `limit()` returns a plain marker (not a resolved promise): in the real
	// code this chain is a subquery object passed directly into
	// notInArray(), never awaited on its own.
	const selectLimitFn = vi.fn().mockReturnValue('SUBQUERY');
	const selectOrderByFn = vi.fn().mockReturnValue({ limit: selectLimitFn });
	const selectWhereFn = vi.fn().mockReturnValue({ orderBy: selectOrderByFn });
	const selectFromFn = vi.fn().mockReturnValue({ where: selectWhereFn });
	const dbSelectMock = vi.fn().mockReturnValue({ from: selectFromFn });

	// --- Insert chain: .values().onConflictDoUpdate().returning() ---
	const returningFn = vi.fn();
	const insertOnConflictFn = vi.fn().mockReturnValue({ returning: returningFn });
	const insertValuesFn = vi.fn().mockReturnValue({ onConflictDoUpdate: insertOnConflictFn });
	const insertChain = { values: insertValuesFn };

	// --- Delete chain ---
	const deleteWhereFn = vi.fn().mockResolvedValue(undefined);
	const deleteChain = { where: deleteWhereFn };

	const dbInsertMock = vi.fn().mockReturnValue(insertChain);
	const dbDeleteMock = vi.fn().mockReturnValue(deleteChain);

	const randomUUIDMock = vi.fn(() => 'test-uuid-1234');

	return {
		selectLimitFn,
		selectWhereFn,
		selectOrderByFn,
		insertOnConflictFn,
		returningFn,
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
		endpoint: 'pushSubscriptions.endpoint',
		createdAt: 'pushSubscriptions.createdAt'
	}
}));

vi.mock('$lib/config', () => ({
	config: { pushEndpointExtraHosts: [] }
}));

vi.mock('drizzle-orm', () => ({
	eq: vi.fn((a: unknown, b: unknown) => `${String(a)}=${String(b)}`),
	and: vi.fn((...args: unknown[]) => args.join(' AND ')),
	desc: vi.fn((a: unknown) => `${String(a)} DESC`),
	notInArray: vi.fn((a: unknown, b: unknown) => `${String(a)} NOT IN (${String(b)})`)
}));

vi.mock('node:crypto', () => ({ randomUUID: randomUUIDMock }));

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
import { MAX_SUBSCRIPTIONS_PER_USER } from '$lib/server/push-endpoint';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// A valid 65-byte uncompressed P-256 point (0x04 prefix + 64 bytes) and a
// valid 16-byte auth secret, both base64url-encoded — see push-endpoint.test.ts.
const VALID_P256DH =
	'BAEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQE';
const VALID_AUTH = 'AgICAgICAgICAgICAgICAg';

function makeSubscribeRequest(bodyOverrides: Record<string, unknown> = {}) {
	const body = {
		endpoint: 'https://fcm.googleapis.com/test-endpoint',
		keys: { p256dh: VALID_P256DH, auth: VALID_AUTH },
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

/** Like makeSubscribeEvent(), but the overrides apply to the request body. */
function makeSubscribeEventWithBody(bodyOverrides: Record<string, unknown> = {}) {
	return {
		locals: { appUser: { id: 'user-123', displayName: 'Alice' } },
		request: makeSubscribeRequest(bodyOverrides)
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
		deleteWhereFn.mockResolvedValue(undefined);
		randomUUIDMock.mockReturnValue('test-uuid-1234');
		// Default: the upsert's RETURNING clause reports the freshly inserted row.
		returningFn.mockResolvedValue([{ id: 'test-uuid-1234' }]);
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
		it('returns 400 when the body is not JSON', async () => {
			const request = new Request('http://localhost/api/push/subscribe', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: 'not json'
			});
			const event = { locals: { appUser: { id: 'user-123' } }, request };
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const res = await subscribePOST(event as any);
			expect(res.status).toBe(400);
		});

		it('returns 400 when endpoint is missing', async () => {
			const request = new Request('http://localhost/api/push/subscribe', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ keys: { p256dh: VALID_P256DH, auth: VALID_AUTH } })
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
				body: JSON.stringify({ endpoint: 'https://fcm.googleapis.com/test' })
			});
			const event = { locals: { appUser: { id: 'user-123' } }, request };
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const res = await subscribePOST(event as any);
			expect(res.status).toBe(400);
		});

		it('returns 400 when keys.p256dh is malformed', async () => {
			const event = makeSubscribeEventWithBody({ keys: { p256dh: 'bad', auth: VALID_AUTH } });
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const res = await subscribePOST(event as any);
			expect(res.status).toBe(400);
		});

		describe('given a disallowed endpoint host or scheme', () => {
			it('returns 400 for a private IP literal', async () => {
				const event = makeSubscribeEventWithBody({
					endpoint: 'https://169.254.169.254/latest/meta-data'
				});
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				const res = await subscribePOST(event as any);
				expect(res.status).toBe(400);
				const body = await res.json();
				expect(body.error).toMatch(/IP address/i);
			});

			it('returns 400 for http:', async () => {
				const event = makeSubscribeEventWithBody({ endpoint: 'http://fcm.googleapis.com/test' });
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				const res = await subscribePOST(event as any);
				expect(res.status).toBe(400);
				const body = await res.json();
				expect(body.error).toMatch(/https/i);
			});

			it('returns 400 for an unknown host', async () => {
				const event = makeSubscribeEventWithBody({ endpoint: 'https://evil.example.com/test' });
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				const res = await subscribePOST(event as any);
				expect(res.status).toBe(400);
				const body = await res.json();
				expect(body.error).toMatch(/not an allowed push service/i);
			});
		});

		describe('given an allowed host', () => {
			it('returns 201 for fcm.googleapis.com', async () => {
				const event = makeSubscribeEventWithBody({ endpoint: 'https://fcm.googleapis.com/test' });
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				const res = await subscribePOST(event as any);
				expect(res.status).toBe(201);
			});
		});
	});

	describe('given an authenticated request with a valid body', () => {
		it('stores the subscription and returns 201 when new', async () => {
			const res = await subscribePOST(
				makeSubscribeEvent() as unknown as Parameters<typeof subscribePOST>[0]
			);
			expect(res.status).toBe(201);
			const body = await res.json();
			expect(body.id).toBe('test-uuid-1234');
			expect(dbInsertMock).toHaveBeenCalled();
			expect(insertOnConflictFn).toHaveBeenCalledWith(
				expect.objectContaining({ target: 'pushSubscriptions.endpoint' })
			);
		});

		it('is idempotent — returns 200 with pre-existing id on re-subscribe', async () => {
			// RETURNING reports the pre-existing row (id differs from randomUUID → existing)
			returningFn.mockResolvedValue([{ id: 'existing-uuid' }]);

			const res = await subscribePOST(
				makeSubscribeEvent() as unknown as Parameters<typeof subscribePOST>[0]
			);
			expect(res.status).toBe(200);
			const body = await res.json();
			expect(body.id).toBe('existing-uuid');
		});

		it('transfers ownership when the endpoint already belongs to a different user', async () => {
			// The row that comes back after the upsert belongs to the current user
			// (userId was overwritten by onConflictDoUpdate) but keeps its original id.
			returningFn.mockResolvedValue([{ id: 'previous-owners-row-id' }]);

			const res = await subscribePOST(
				makeSubscribeEvent() as unknown as Parameters<typeof subscribePOST>[0]
			);
			expect(res.status).toBe(200);
			expect(insertOnConflictFn).toHaveBeenCalledWith(
				expect.objectContaining({
					set: expect.objectContaining({ userId: 'user-123' })
				})
			);
		});

		it('upsert + RETURNING is a single statement — no separate ownership-check SELECT', async () => {
			await subscribePOST(makeSubscribeEvent() as unknown as Parameters<typeof subscribePOST>[0]);

			expect(returningFn).toHaveBeenCalledWith({ id: 'pushSubscriptions.id' });
			// The only db.select() calls are for the cap-trim subquery below, scoped
			// to this user — there is no separate "fetch the row we just wrote" select.
			expect(dbSelectMock).toHaveBeenCalledTimes(1);
		});

		it('trims subscriptions per user with a single atomic DELETE, scoped to this user, keeping the most recent MAX_SUBSCRIPTIONS_PER_USER', async () => {
			await subscribePOST(makeSubscribeEvent() as unknown as Parameters<typeof subscribePOST>[0]);

			// The cap-trim subquery: scoped to this user, newest first, capped.
			expect(selectWhereFn).toHaveBeenCalledWith('pushSubscriptions.userId=user-123');
			expect(selectOrderByFn).toHaveBeenCalledWith('pushSubscriptions.createdAt DESC');
			expect(selectLimitFn).toHaveBeenCalledWith(MAX_SUBSCRIPTIONS_PER_USER);

			// A single DELETE, scoped to this user, excluding that subquery's rows —
			// always run (it's a no-op at the DB level when under the cap), not
			// conditioned on a prior count check in application code.
			expect(dbDeleteMock).toHaveBeenCalledOnce();
			expect(deleteWhereFn).toHaveBeenCalledWith(
				'pushSubscriptions.userId=user-123 AND pushSubscriptions.id NOT IN (SUBQUERY)'
			);
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

		it('scopes deletion to the caller — only rows owned by locals.appUser.id', async () => {
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			await unsubscribePOST(makeUnsubscribeEvent() as any);
			expect(deleteWhereFn).toHaveBeenCalledWith(
				expect.stringContaining('pushSubscriptions.userId=user-123')
			);
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
