// SPDX-License-Identifier: AGPL-3.0-or-later
// Settlement → notification fanout regression tests for issue #82.
//
// Before the fix, the `accept` action in +page.server.ts wrapped its entire
// notification block in a broad try/catch. If anything threw before emit() was
// called (e.g. formatAmount, a DB look-up), the SSE event was silently
// swallowed. The decline action had no such guard, which is why decline still
// worked.
//
// Tests marked "[resilience]" guard against this regression long-term.

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Sentinel for redirect — lets tests detect the normal exit path without crashing
// ---------------------------------------------------------------------------

class MockRedirect extends Error {
	constructor(
		public status: number,
		public location: string
	) {
		super(`Redirect: ${status} → ${location}`);
		this.name = 'MockRedirect';
	}
}

// ---------------------------------------------------------------------------
// All mock factories in vi.hoisted() so they are available when vi.mock()
// factory callbacks execute (Vitest hoists vi.mock() calls to the top).
// ---------------------------------------------------------------------------

const {
	emitMock,
	sendPushMock,
	formatAmountMock,
	upsertConnectionMock,
	verifyQrTokenMock,
	redirectMock,
	dbSelectMock,
	dbInsertMock,
	dbUpdateMock,
	selectLimitFn,
	updateWhereFn,
	insertValuesFn
} = vi.hoisted(() => {
	// --- Select chain ---
	const selectLimitFn = vi.fn();
	const selectFromFn = vi.fn();
	const selectWhereFn = vi.fn();
	const selectChain = { from: selectFromFn, where: selectWhereFn, limit: selectLimitFn };
	selectFromFn.mockReturnValue(selectChain);
	selectWhereFn.mockReturnValue(selectChain);

	// --- Insert chain ---
	const insertValuesFn = vi.fn().mockResolvedValue(undefined);
	const insertChain = { values: insertValuesFn };

	// --- Update chain ---
	const updateWhereFn = vi.fn().mockResolvedValue(undefined);
	const updateSetFn = vi.fn();
	const updateChain = { set: updateSetFn };
	updateSetFn.mockReturnValue({ where: updateWhereFn });

	const dbSelectMock = vi.fn().mockReturnValue(selectChain);
	const dbInsertMock = vi.fn().mockReturnValue(insertChain);
	const dbUpdateMock = vi.fn().mockReturnValue(updateChain);

	const redirectMock = vi.fn().mockImplementation((status: number, location: string) => {
		throw new MockRedirect(status, location);
	});

	return {
		emitMock: vi.fn(),
		sendPushMock: vi.fn().mockResolvedValue(undefined),
		formatAmountMock: vi.fn().mockReturnValue('€10.00'),
		upsertConnectionMock: vi.fn().mockResolvedValue(undefined),
		verifyQrTokenMock: vi.fn(),
		redirectMock,
		dbSelectMock,
		dbInsertMock,
		dbUpdateMock,
		selectLimitFn,
		updateWhereFn,
		insertValuesFn
	};
});

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

vi.mock('$lib/server/sse-registry', () => ({ emit: emitMock }));
vi.mock('$lib/server/push-sender', () => ({ sendPushToUser: sendPushMock }));
vi.mock('$lib/server/currency', () => ({
	formatAmount: formatAmountMock,
	currencyFractionDigits: vi.fn(() => 2)
}));
vi.mock('$lib/server/balance', () => ({
	getBalance: vi.fn().mockResolvedValue(0),
	upsertConnection: upsertConnectionMock
}));
vi.mock('$lib/server/qr', () => ({ verifyQrToken: verifyQrTokenMock }));
vi.mock('$lib/config', () => ({
	config: { unitCode: 'EUR', qrTtlSeconds: 300 }
}));
vi.mock('@sveltejs/kit', () => ({
	redirect: redirectMock,
	fail: vi.fn((_status: number, data: unknown) => data),
	error: vi.fn((_status: number, msg: unknown) => {
		throw new Error(typeof msg === 'string' ? msg : JSON.stringify(msg));
	})
}));
vi.mock('crypto', () => ({
	randomUUID: vi.fn(() => 'mock-uuid')
}));
vi.mock('$lib/server/db', () => ({
	db: { select: dbSelectMock, insert: dbInsertMock, update: dbUpdateMock }
}));
vi.mock('$lib/server/schema', () => ({
	pendingQr: 'pendingQr',
	transactions: 'transactions',
	appUsers: 'appUsers'
}));
vi.mock('drizzle-orm', () => ({
	eq: vi.fn((a: unknown, b: unknown) => `${String(a)}=${String(b)}`)
}));

// Import AFTER mocks are registered
import { actions } from './+page.server';

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const INITIATOR_ID = 'user-initiator';
const ACCEPTOR_ID = 'user-acceptor';
const QR_ID = 'qr-test-id';

const pendingQrRecord = {
	id: QR_ID,
	status: 'pending' as const,
	expiresAt: new Date(Date.now() + 300_000),
	initiatingUserId: INITIATOR_ID,
	direction: 'send' as const,
	amount: 1000,
	note: null
};

function makeAcceptEvent(overrides: Record<string, unknown> = {}) {
	const formData = new FormData();
	formData.set('qrId', QR_ID);
	const request = new Request('http://localhost/accept/test-token', {
		method: 'POST',
		body: formData
	});
	return {
		request,
		locals: {
			session: { id: 'session-1' },
			appUser: { id: ACCEPTOR_ID, displayName: 'Bob' }
		},
		params: { token: 'test-token' },
		url: new URL('http://localhost/accept/test-token'),
		cookies: { set: vi.fn(), get: vi.fn(), delete: vi.fn() },
		...overrides
	} as unknown as Parameters<(typeof actions)['accept']>[0];
}

function makeDeclineEvent() {
	const formData = new FormData();
	formData.set('qrId', QR_ID);
	const request = new Request('http://localhost/accept/test-token', {
		method: 'POST',
		body: formData
	});
	return {
		request,
		params: { token: 'test-token' },
		locals: {},
		url: new URL('http://localhost/accept/test-token')
	} as unknown as Parameters<(typeof actions)['decline']>[0];
}

/** Run an action and swallow MockRedirects (the normal exit path for all actions). */
async function runAction(fn: () => unknown): Promise<void> {
	try {
		await fn();
	} catch (e) {
		if (!(e instanceof MockRedirect)) throw e;
	}
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('settlement → notification fanout', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		// Reset selectLimitFn's once-queue (clearAllMocks does not do this)
		selectLimitFn.mockReset();
		// Re-apply defaults that clearAllMocks/mockReset may have cleared
		formatAmountMock.mockReturnValue('€10.00');
		sendPushMock.mockResolvedValue(undefined);
		upsertConnectionMock.mockResolvedValue(undefined);
		updateWhereFn.mockResolvedValue(undefined);
		insertValuesFn.mockResolvedValue(undefined);
		redirectMock.mockImplementation((status: number, location: string) => {
			throw new MockRedirect(status, location);
		});
	});

	describe('accept — happy path', () => {
		beforeEach(() => {
			selectLimitFn
				.mockResolvedValueOnce([pendingQrRecord])
				.mockResolvedValueOnce([{ displayName: 'Alice' }]);
		});

		it('emits qr_completed via SSE registry for the initiating user', async () => {
			await runAction(() => actions.accept(makeAcceptEvent()));

			expect(emitMock).toHaveBeenCalledWith(
				INITIATOR_ID,
				expect.objectContaining({
					type: 'qr_completed',
					qrId: QR_ID,
					otherName: 'Bob',
					formattedAmount: '€10.00'
				})
			);
		});

		it('emits qr_completed via SSE registry for the accepting user', async () => {
			await runAction(() => actions.accept(makeAcceptEvent()));

			expect(emitMock).toHaveBeenCalledWith(
				ACCEPTOR_ID,
				expect.objectContaining({
					type: 'qr_completed',
					qrId: QR_ID,
					otherName: 'Alice',
					formattedAmount: '€10.00'
				})
			);
		});

		it('calls sendPushToUser for the initiating user', async () => {
			await runAction(() => actions.accept(makeAcceptEvent()));

			expect(sendPushMock).toHaveBeenCalledWith(
				INITIATOR_ID,
				expect.objectContaining({ type: 'qr_completed' })
			);
		});

		it('does NOT call sendPushToUser for the accepting user (they are present)', async () => {
			await runAction(() => actions.accept(makeAcceptEvent()));

			const calledWithAcceptor = sendPushMock.mock.calls.some(([userId]) => userId === ACCEPTOR_ID);
			expect(calledWithAcceptor).toBe(false);
		});
	});

	describe('accept — resilience', () => {
		// Note: formatAmount() is now resilient at the source — it catches
		// getLocale() failures and returns a locale-independent fallback instead of
		// throwing. That behaviour is tested directly in currency.test.ts.
		// This test guards against the DB lookup failure case which can still occur.

		it('[resilience] emits SSE event to initiator even if display name lookup fails', async () => {
			selectLimitFn
				.mockResolvedValueOnce([pendingQrRecord])
				.mockRejectedValueOnce(new Error('DB connection lost'));

			await runAction(() => actions.accept(makeAcceptEvent()));

			// Must still emit with a fallback name — DB failure must not silently block notifications.
			expect(emitMock).toHaveBeenCalledWith(
				INITIATOR_ID,
				expect.objectContaining({ type: 'qr_completed', qrId: QR_ID })
			);
		});
	});

	describe('settlement integrity', () => {
		it('settlement remains committed if sendPushToUser throws', async () => {
			selectLimitFn
				.mockResolvedValueOnce([pendingQrRecord])
				.mockResolvedValueOnce([{ displayName: 'Alice' }]);
			sendPushMock.mockRejectedValue(new Error('Push service unavailable'));

			// Must not propagate the push error
			await expect(runAction(() => actions.accept(makeAcceptEvent()))).resolves.toBeUndefined();

			// DB mutations still executed
			expect(dbInsertMock).toHaveBeenCalled();
			expect(dbUpdateMock).toHaveBeenCalled();
			expect(upsertConnectionMock).toHaveBeenCalled();
		});
	});

	describe('decline', () => {
		it('emits qr_declined to initiator when the decline action is called', async () => {
			verifyQrTokenMock.mockResolvedValue({ jti: QR_ID });
			selectLimitFn.mockResolvedValueOnce([{ initiatingUserId: INITIATOR_ID }]);

			await runAction(() => actions.decline(makeDeclineEvent()));

			expect(emitMock).toHaveBeenCalledWith(
				INITIATOR_ID,
				expect.objectContaining({ type: 'qr_declined', qrId: QR_ID })
			);
		});
	});
});
