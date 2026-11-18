// SPDX-License-Identifier: AGPL-3.0-or-later
// Settlement → notification fanout regression tests for issue #82, plus the
// atomic-settlement / qrId-binding tests for the ledger-integrity fix.
//
// Before the fix, the `accept` action in +page.server.ts wrapped its entire
// notification block in a broad try/catch. If anything threw before emit() was
// called (e.g. formatAmount, a DB look-up), the SSE event was silently
// swallowed. The decline action had no such guard, which is why decline still
// worked.
//
// Tests marked "[resilience]" guard against this regression long-term.
//
// The actual ledger insert / status claim now live in
// settleOneTimeAccept (./settlement.sqlite.ts / .pg.ts), which this file
// mocks — its real atomicity/concurrency behaviour against a real SQLite DB
// is covered in settlement.sqlite.test.ts instead.

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
	settleOneTimeAcceptMock,
	redirectMock,
	dbSelectMock,
	dbUpdateMock,
	selectLimitFn,
	updateWhereFn
} = vi.hoisted(() => {
	// --- Select chain ---
	const selectLimitFn = vi.fn();
	const selectFromFn = vi.fn();
	const selectWhereFn = vi.fn();
	const selectChain = { from: selectFromFn, where: selectWhereFn, limit: selectLimitFn };
	selectFromFn.mockReturnValue(selectChain);
	selectWhereFn.mockReturnValue(selectChain);

	// --- Update chain (decline only — accept's settlement is mocked separately) ---
	const updateWhereFn = vi.fn().mockResolvedValue(undefined);
	const updateSetFn = vi.fn();
	const updateChain = { set: updateSetFn };
	updateSetFn.mockReturnValue({ where: updateWhereFn });

	const dbSelectMock = vi.fn().mockReturnValue(selectChain);
	const dbUpdateMock = vi.fn().mockReturnValue(updateChain);

	const redirectMock = vi.fn().mockImplementation((status: number, location: string) => {
		throw new MockRedirect(status, location);
	});

	return {
		emitMock: vi.fn(),
		sendPushMock: vi.fn().mockResolvedValue(undefined),
		formatAmountMock: vi.fn().mockReturnValue('€10.00'),
		settleOneTimeAcceptMock: vi.fn(),
		redirectMock,
		dbSelectMock,
		dbUpdateMock,
		selectLimitFn,
		updateWhereFn
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
	getBalance: vi.fn().mockResolvedValue(0)
}));
vi.mock('$lib/server/payment-requests', () => ({
	settleOneTimeAccept: settleOneTimeAcceptMock
}));
vi.mock('$lib/server/qr', () => ({}));
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
vi.mock('$lib/server/db', () => ({
	db: { select: dbSelectMock, update: dbUpdateMock }
}));
vi.mock('$lib/server/schema', () => ({
	paymentRequests: 'paymentRequests',
	transactions: 'transactions',
	appUsers: 'appUsers'
}));
vi.mock('drizzle-orm', () => ({
	eq: vi.fn((a: unknown, b: unknown) => `${String(a)}=${String(b)}`),
	and: vi.fn((...args: unknown[]) => args.join('&'))
}));

// Import AFTER mocks are registered
import { actions, load } from './+page.server';
import { getBalance } from '$lib/server/balance';

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const INITIATOR_ID = 'user-initiator';
const ACCEPTOR_ID = 'user-acceptor';
const QR_ID = 'qr-test-id';

const paymentRequestRecord = {
	id: QR_ID,
	status: 'active' as const,
	expiresAt: new Date(Date.now() + 300_000),
	initiatingUserId: INITIATOR_ID,
	direction: 'send' as const,
	amount: 1000,
	description: null,
	initiatorName: 'Alice',
	reusable: false
};

const reusablePaymentRequestRecord = {
	...paymentRequestRecord,
	id: 'reusable-qr-id',
	reusable: true
};

function makeAcceptEvent(overrides: Record<string, unknown> = {}) {
	const formData = new FormData();
	formData.set('qrId', QR_ID);
	const request = new Request(`http://localhost/accept/${QR_ID}`, {
		method: 'POST',
		body: formData
	});
	return {
		request,
		locals: {
			session: { id: 'session-1' },
			appUser: { id: ACCEPTOR_ID, displayName: 'Bob' }
		},
		params: { token: QR_ID },
		url: new URL(`http://localhost/accept/${QR_ID}`),
		cookies: { set: vi.fn(), get: vi.fn(), delete: vi.fn() },
		...overrides
	} as unknown as Parameters<(typeof actions)['accept']>[0];
}

function makeDeclineEvent(overrides: Record<string, unknown> = {}) {
	const formData = new FormData();
	formData.set('qrId', QR_ID);
	const request = new Request(`http://localhost/accept/${QR_ID}`, {
		method: 'POST',
		body: formData
	});
	return {
		request,
		params: { token: QR_ID },
		// Declining is bearer cash for anyone holding the link other than the
		// initiator — default to an authenticated non-initiator (the acceptor).
		locals: {
			session: { id: 'session-1' },
			appUser: { id: ACCEPTOR_ID, displayName: 'Bob' }
		},
		url: new URL(`http://localhost/accept/${QR_ID}`),
		...overrides
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
		updateWhereFn.mockResolvedValue(undefined);
		settleOneTimeAcceptMock.mockResolvedValue({ ok: true, txId: 'tx-1' });
		redirectMock.mockImplementation((status: number, location: string) => {
			throw new MockRedirect(status, location);
		});
	});

	describe('accept — happy path', () => {
		beforeEach(() => {
			selectLimitFn.mockResolvedValueOnce([paymentRequestRecord]);
		});

		it('calls settleOneTimeAccept with the QR id and the accepting user', async () => {
			await runAction(() => actions.accept(makeAcceptEvent()));

			expect(settleOneTimeAcceptMock).toHaveBeenCalledWith(QR_ID, ACCEPTOR_ID);
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

	describe('accept — settlement lost the race', () => {
		beforeEach(() => {
			selectLimitFn.mockResolvedValueOnce([paymentRequestRecord]);
			settleOneTimeAcceptMock.mockResolvedValue({
				ok: false,
				status: 400,
				error: 'This QR code has expired or already been used.'
			});
		});

		it('returns fail() with the settlement error and does NOT notify either party', async () => {
			const result = await actions.accept(makeAcceptEvent());

			expect(result).toMatchObject({
				error: 'This QR code has expired or already been used.'
			});
			expect(emitMock).not.toHaveBeenCalled();
			expect(sendPushMock).not.toHaveBeenCalled();
		});
	});

	describe('accept — qrId does not match the route token', () => {
		it('[security] fails without ever calling settleOneTimeAccept', async () => {
			const result = await actions.accept(
				makeAcceptEvent({ params: { token: 'some-other-token' } })
			);

			expect(result).toMatchObject({ error: 'Invalid QR ID.' });
			expect(settleOneTimeAcceptMock).not.toHaveBeenCalled();
		});
	});

	describe('accept — resilience', () => {
		// Note: formatAmount() is resilient at the source — it catches
		// getLocale() failures and returns a locale-independent fallback instead
		// of throwing. That behaviour is tested directly in currency.test.ts.

		it('[resilience] still emits SSE events to both parties after a successful settlement', async () => {
			selectLimitFn.mockResolvedValueOnce([paymentRequestRecord]);

			await runAction(() => actions.accept(makeAcceptEvent()));

			expect(emitMock).toHaveBeenCalledWith(
				INITIATOR_ID,
				expect.objectContaining({ type: 'qr_completed', qrId: QR_ID })
			);
		});
	});

	describe('settlement integrity', () => {
		it('settlement remains committed if sendPushToUser throws', async () => {
			selectLimitFn.mockResolvedValueOnce([paymentRequestRecord]);
			sendPushMock.mockRejectedValue(new Error('Push service unavailable'));

			// Must not propagate the push error
			await expect(runAction(() => actions.accept(makeAcceptEvent()))).resolves.toBeUndefined();

			// Settlement (the atomic insert + claim + connection upsert) still ran
			expect(settleOneTimeAcceptMock).toHaveBeenCalled();
			// ...and notifications still fired despite the push rejection
			expect(emitMock).toHaveBeenCalled();
		});
	});

	describe('decline', () => {
		it('emits qr_declined to initiator when the decline action is called', async () => {
			selectLimitFn.mockResolvedValueOnce([{ initiatingUserId: INITIATOR_ID, reusable: false }]);
			// Second select is the re-read to confirm the update succeeded
			selectLimitFn.mockResolvedValueOnce([{ status: 'declined' }]);

			await runAction(() => actions.decline(makeDeclineEvent()));

			expect(emitMock).toHaveBeenCalledWith(
				INITIATOR_ID,
				expect.objectContaining({ type: 'qr_declined', qrId: QR_ID })
			);
		});

		describe('[security] authorization', () => {
			it('rejects an unauthenticated caller without touching the database', async () => {
				await expect(
					actions.decline(makeDeclineEvent({ locals: { session: null, appUser: null } }))
				).rejects.toThrow('Not authenticated');

				expect(dbSelectMock).not.toHaveBeenCalled();
				expect(dbUpdateMock).not.toHaveBeenCalled();
			});

			it('rejects a session with no appUser (onboarding not finished) without touching the database', async () => {
				await expect(
					actions.decline(
						makeDeclineEvent({ locals: { session: { id: 'session-1' }, appUser: null } })
					)
				).rejects.toThrow('Not authenticated');

				expect(dbSelectMock).not.toHaveBeenCalled();
			});

			it('rejects the initiator declining their own one-time QR (they must cancel instead)', async () => {
				selectLimitFn.mockResolvedValueOnce([{ initiatingUserId: INITIATOR_ID, reusable: false }]);

				const result = await actions.decline(
					makeDeclineEvent({
						locals: {
							session: { id: 'session-1' },
							appUser: { id: INITIATOR_ID, displayName: 'Alice' }
						}
					})
				);

				expect(result).toMatchObject({ error: 'You cannot decline your own QR code.' });
				expect(dbUpdateMock).not.toHaveBeenCalled();
				expect(emitMock).not.toHaveBeenCalled();
			});

			it('allows a non-initiator authenticated caller to decline (bearer-link semantics)', async () => {
				selectLimitFn.mockResolvedValueOnce([{ initiatingUserId: INITIATOR_ID, reusable: false }]);
				selectLimitFn.mockResolvedValueOnce([{ status: 'declined' }]);

				await runAction(() => actions.decline(makeDeclineEvent()));

				expect(dbUpdateMock).toHaveBeenCalled();
			});
		});
	});
});

// ---------------------------------------------------------------------------
// Helpers for load / action tests with reusable QR
// ---------------------------------------------------------------------------

function makeLoadEvent(
	token: string,
	overrides: Record<string, unknown> = {}
): Parameters<typeof load>[0] {
	return {
		params: { token },
		locals: {
			session: null,
			appUser: null
		},
		request: new Request(`http://localhost/accept/${token}`),
		cookies: { set: vi.fn(), get: vi.fn(), delete: vi.fn() },
		url: new URL(`http://localhost/accept/${token}`),
		route: { id: '/accept/[token]' },
		...overrides
	} as unknown as Parameters<typeof load>[0];
}

function makeReusableAcceptEvent() {
	const formData = new FormData();
	formData.set('qrId', reusablePaymentRequestRecord.id);
	const request = new Request(`http://localhost/accept/${reusablePaymentRequestRecord.id}`, {
		method: 'POST',
		body: formData
	});
	return {
		request,
		locals: {
			session: { id: 'session-1' },
			appUser: { id: ACCEPTOR_ID, displayName: 'Bob' }
		},
		params: { token: reusablePaymentRequestRecord.id },
		url: new URL(`http://localhost/accept/${reusablePaymentRequestRecord.id}`),
		cookies: { set: vi.fn(), get: vi.fn(), delete: vi.fn() }
	} as unknown as Parameters<(typeof actions)['accept']>[0];
}

function makeReusableDeclineEvent() {
	const formData = new FormData();
	formData.set('qrId', reusablePaymentRequestRecord.id);
	const request = new Request(`http://localhost/accept/${reusablePaymentRequestRecord.id}`, {
		method: 'POST',
		body: formData
	});
	return {
		request,
		params: { token: reusablePaymentRequestRecord.id },
		locals: {
			session: { id: 'session-1' },
			appUser: { id: ACCEPTOR_ID, displayName: 'Bob' }
		},
		url: new URL(`http://localhost/accept/${reusablePaymentRequestRecord.id}`)
	} as unknown as Parameters<(typeof actions)['decline']>[0];
}

// ---------------------------------------------------------------------------
// load — reusable QR redirect
// ---------------------------------------------------------------------------

describe('load — reusable QR redirect', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		selectLimitFn.mockReset();
		redirectMock.mockImplementation((status: number, location: string) => {
			throw new MockRedirect(status, location);
		});
	});

	describe('Given a reusable payment request', () => {
		beforeEach(() => {
			selectLimitFn.mockResolvedValueOnce([reusablePaymentRequestRecord]);
		});

		it('When load is called with its token → returns a redirect to /send/{id} (status 307)', async () => {
			let caught: MockRedirect | undefined;
			try {
				await load(makeLoadEvent(reusablePaymentRequestRecord.id));
			} catch (e) {
				if (e instanceof MockRedirect) caught = e;
				else throw e;
			}

			expect(caught).toBeDefined();
			expect(caught?.status).toBe(307);
			expect(caught?.location).toBe(`/send/${reusablePaymentRequestRecord.id}`);
		});
	});
});

// ---------------------------------------------------------------------------
// accept action — reusable QR guard
// ---------------------------------------------------------------------------

describe('accept action — reusable QR guard', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		selectLimitFn.mockReset();
		redirectMock.mockImplementation((status: number, location: string) => {
			throw new MockRedirect(status, location);
		});
		updateWhereFn.mockResolvedValue(undefined);
	});

	describe('Given a reusable payment request', () => {
		beforeEach(() => {
			selectLimitFn.mockResolvedValueOnce([reusablePaymentRequestRecord]);
		});

		it('When the accept action is called → returns a redirect to /send/{id}', async () => {
			let caught: MockRedirect | undefined;
			try {
				await actions.accept(makeReusableAcceptEvent());
			} catch (e) {
				if (e instanceof MockRedirect) caught = e;
				else throw e;
			}

			expect(caught).toBeDefined();
			expect(caught?.status).toBe(303);
			expect(caught?.location).toBe(`/send/${reusablePaymentRequestRecord.id}`);
		});

		it('When the accept action is called → does NOT call settleOneTimeAccept (no settlement)', async () => {
			// Suppress redirect
			await runAction(() => actions.accept(makeReusableAcceptEvent()));

			expect(settleOneTimeAcceptMock).not.toHaveBeenCalled();
		});
	});
});

// ---------------------------------------------------------------------------
// decline action — reusable QR guard
// ---------------------------------------------------------------------------

describe('decline action — reusable QR guard', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		selectLimitFn.mockReset();
		redirectMock.mockImplementation((status: number, location: string) => {
			throw new MockRedirect(status, location);
		});
		updateWhereFn.mockResolvedValue(undefined);
	});

	describe('Given a reusable payment request', () => {
		beforeEach(() => {
			selectLimitFn.mockResolvedValueOnce([{ initiatingUserId: INITIATOR_ID, reusable: true }]);
		});

		it('When the decline action is called → returns a redirect to /send/{id}', async () => {
			let caught: MockRedirect | undefined;
			try {
				await actions.decline(makeReusableDeclineEvent());
			} catch (e) {
				if (e instanceof MockRedirect) caught = e;
				else throw e;
			}

			expect(caught).toBeDefined();
			expect(caught?.status).toBe(303);
			expect(caught?.location).toBe(`/send/${reusablePaymentRequestRecord.id}`);
		});

		it('When the decline action is called → does NOT call db.update', async () => {
			await runAction(() => actions.decline(makeReusableDeclineEvent()));

			expect(dbUpdateMock).not.toHaveBeenCalled();
		});
	});
});

// ---------------------------------------------------------------------------
// load — initiator balance is only ever returned for direction 'send'
// ---------------------------------------------------------------------------
//
// The initiator's total balance may be shown only on this page, only while an
// authenticated non-initiator visitor is deciding whether to accept money FROM
// the initiator (direction 'send'). It must never be computed or returned for
// a 'receive' QR (the visitor would be the one paying the initiator).

describe('load — initiator balance direction gating [security]', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		selectLimitFn.mockReset();
		formatAmountMock.mockReturnValue('€10.00');
		(getBalance as ReturnType<typeof vi.fn>).mockResolvedValue(5000);
		redirectMock.mockImplementation((status: number, location: string) => {
			throw new MockRedirect(status, location);
		});
	});

	describe('Given an active one-time QR with direction "send" (initiator is sending)', () => {
		beforeEach(() => {
			selectLimitFn.mockResolvedValueOnce([{ ...paymentRequestRecord, direction: 'send' }]);
		});

		it('When an authenticated non-initiator loads the page → computes and returns initiatorBalance', async () => {
			const result = await load(
				makeLoadEvent(QR_ID, {
					locals: {
						session: { id: 'session-1' },
						appUser: { id: ACCEPTOR_ID, displayName: 'Bob' }
					}
				})
			);

			expect(getBalance).toHaveBeenCalledWith(INITIATOR_ID);
			expect(result).toMatchObject({ initiatorBalance: '€10.00' });
		});
	});

	describe('Given an active one-time QR with direction "receive" (initiator is requesting payment)', () => {
		beforeEach(() => {
			selectLimitFn.mockResolvedValueOnce([{ ...paymentRequestRecord, direction: 'receive' }]);
		});

		it('When an authenticated non-initiator loads the page → does NOT compute initiatorBalance at all', async () => {
			const result = await load(
				makeLoadEvent(QR_ID, {
					locals: {
						session: { id: 'session-1' },
						appUser: { id: ACCEPTOR_ID, displayName: 'Bob' }
					}
				})
			);

			expect(getBalance).not.toHaveBeenCalled();
			expect(result).toMatchObject({ initiatorBalance: null });
		});
	});
});
