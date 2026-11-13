// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
	register,
	unregister,
	emit,
	closeSession,
	MAX_CONNECTIONS_PER_USER
} from '$lib/server/sse-registry';
import type { QrCompletedEvent, QrDeclinedEvent } from '$lib/notifications';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type Controller = ReadableStreamDefaultController<Uint8Array>;

function makeController(): {
	enqueue: ReturnType<typeof vi.fn>;
	close: ReturnType<typeof vi.fn>;
} & Controller {
	return {
		enqueue: vi.fn(),
		close: vi.fn(),
		error: vi.fn(),
		desiredSize: null,
		byobRequest: null
	} as unknown as {
		enqueue: ReturnType<typeof vi.fn>;
		close: ReturnType<typeof vi.fn>;
	} & Controller;
}

const qrCompleted: QrCompletedEvent = {
	type: 'qr_completed',
	id: 'evt-1',
	qrId: 'qr-abc',
	otherName: 'Alice',
	formattedAmount: '€10.00'
};

const qrDeclined: QrDeclinedEvent = {
	type: 'qr_declined',
	id: 'evt-2',
	qrId: 'qr-abc'
};

// Use a unique userId/sessionId per test to avoid cross-test state leakage in
// the module-level registry maps.
let userId: string;
let sessionId: string;
let seq = 0;

beforeEach(() => {
	seq++;
	userId = `user-${seq}`;
	sessionId = `session-${seq}`;
});

function decode(chunk: Uint8Array): string {
	return new TextDecoder().decode(chunk);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('register + emit', () => {
	describe('given a registered controller', () => {
		it('enqueues the encoded SSE payload when an event is emitted', () => {
			// Given
			const ctrl = makeController();
			register(userId, sessionId, ctrl);

			// When
			emit(userId, qrCompleted);

			// Then
			expect(ctrl.enqueue).toHaveBeenCalledOnce();
			const [chunk] = ctrl.enqueue.mock.calls[0] as [Uint8Array];
			expect(chunk).toBeInstanceOf(Uint8Array);
			const text = decode(chunk);
			expect(text).toContain(`id: ${qrCompleted.id}`);
			expect(text).toContain(JSON.stringify(qrCompleted));

			// Cleanup
			unregister(userId, sessionId, ctrl);
		});

		it('SSE payload ends with a double newline (\\n\\n) as per the spec', () => {
			// Given
			const ctrl = makeController();
			register(userId, sessionId, ctrl);

			// When
			emit(userId, qrCompleted);

			// Then
			const [chunk] = ctrl.enqueue.mock.calls[0] as [Uint8Array];
			const text = decode(chunk);
			expect(text.endsWith('\n\n')).toBe(true);

			unregister(userId, sessionId, ctrl);
		});

		it('does not emit to a different user', () => {
			// Given
			const ctrl = makeController();
			register(userId, sessionId, ctrl);

			// When
			emit('some-other-user', qrCompleted);

			// Then
			expect(ctrl.enqueue).not.toHaveBeenCalled();

			unregister(userId, sessionId, ctrl);
		});
	});
});

describe('unregister', () => {
	describe('given a controller that was registered and then unregistered', () => {
		it('does not call enqueue after unregister', () => {
			// Given
			const ctrl = makeController();
			register(userId, sessionId, ctrl);
			unregister(userId, sessionId, ctrl);

			// When
			emit(userId, qrCompleted);

			// Then
			expect(ctrl.enqueue).not.toHaveBeenCalled();
		});
	});

	describe('given the last controller for a user is unregistered', () => {
		it('cleans up the registry entry so a subsequent emit is a no-op', () => {
			// Given
			const ctrl = makeController();
			register(userId, sessionId, ctrl);
			unregister(userId, sessionId, ctrl);

			// When / Then — should not throw
			expect(() => emit(userId, qrDeclined)).not.toThrow();
			expect(ctrl.enqueue).not.toHaveBeenCalled();
		});
	});
});

describe('emit to unknown user', () => {
	it('is a no-op and does not throw', () => {
		// Given — nobody registered for this user
		// When / Then
		expect(() => emit('no-such-user', qrCompleted)).not.toThrow();
	});
});

describe('multiple controllers for the same user', () => {
	it('all registered controllers receive the same event', () => {
		// Given
		const ctrl1 = makeController();
		const ctrl2 = makeController();
		const ctrl3 = makeController();
		register(userId, `${sessionId}-a`, ctrl1);
		register(userId, `${sessionId}-b`, ctrl2);
		register(userId, `${sessionId}-c`, ctrl3);

		// When
		emit(userId, qrCompleted);

		// Then
		expect(ctrl1.enqueue).toHaveBeenCalledOnce();
		expect(ctrl2.enqueue).toHaveBeenCalledOnce();
		expect(ctrl3.enqueue).toHaveBeenCalledOnce();

		// All receive identical bytes
		const text1 = decode(ctrl1.enqueue.mock.calls[0][0] as Uint8Array);
		const text2 = decode(ctrl2.enqueue.mock.calls[0][0] as Uint8Array);
		const text3 = decode(ctrl3.enqueue.mock.calls[0][0] as Uint8Array);
		expect(text1).toBe(text2);
		expect(text2).toBe(text3);

		unregister(userId, `${sessionId}-a`, ctrl1);
		unregister(userId, `${sessionId}-b`, ctrl2);
		unregister(userId, `${sessionId}-c`, ctrl3);
	});

	it('unregistering one controller does not affect the others', () => {
		// Given
		const ctrl1 = makeController();
		const ctrl2 = makeController();
		register(userId, `${sessionId}-a`, ctrl1);
		register(userId, `${sessionId}-b`, ctrl2);

		// When — remove ctrl1, then emit
		unregister(userId, `${sessionId}-a`, ctrl1);
		emit(userId, qrCompleted);

		// Then
		expect(ctrl1.enqueue).not.toHaveBeenCalled();
		expect(ctrl2.enqueue).toHaveBeenCalledOnce();

		unregister(userId, `${sessionId}-b`, ctrl2);
	});
});

describe('emit resilience', () => {
	it('continues fan-out to remaining controllers when one throws during enqueue', () => {
		// Given
		const faultyCtrl = makeController();
		faultyCtrl.enqueue.mockImplementation(() => {
			throw new Error('stream closed');
		});
		const healthyCtrl = makeController();
		register(userId, `${sessionId}-a`, faultyCtrl);
		register(userId, `${sessionId}-b`, healthyCtrl);

		// When — should not throw even though faultyCtrl.enqueue throws
		expect(() => emit(userId, qrCompleted)).not.toThrow();

		// Then — the healthy controller still received the event
		expect(healthyCtrl.enqueue).toHaveBeenCalledOnce();

		unregister(userId, `${sessionId}-a`, faultyCtrl);
		unregister(userId, `${sessionId}-b`, healthyCtrl);
	});
});

describe('connection cap', () => {
	describe(`given a user already at the cap of ${MAX_CONNECTIONS_PER_USER} connections`, () => {
		it('evicts the oldest connection when a new one registers', () => {
			// Given — fill up to the cap
			const ctrls = Array.from({ length: MAX_CONNECTIONS_PER_USER }, () => makeController());
			ctrls.forEach((ctrl, i) => register(userId, `${sessionId}-${i}`, ctrl));

			// When — one more connection registers
			const newCtrl = makeController();
			register(userId, `${sessionId}-new`, newCtrl);

			// Then — the oldest (ctrls[0]) got a terminal evicted frame and was closed
			expect(ctrls[0].enqueue).toHaveBeenCalledWith(
				new TextEncoder().encode('event: evicted\ndata: {}\n\n')
			);
			expect(ctrls[0].close).toHaveBeenCalledOnce();

			// And — the rest, plus the new connection, still receive emits
			emit(userId, qrCompleted);
			expect(ctrls[0].enqueue).toHaveBeenCalledTimes(1); // only the evicted frame, no event after
			for (const ctrl of ctrls.slice(1)) {
				expect(ctrl.enqueue).toHaveBeenCalledOnce();
			}
			expect(newCtrl.enqueue).toHaveBeenCalledOnce();

			// Cleanup
			ctrls.slice(1).forEach((ctrl, i) => unregister(userId, `${sessionId}-${i + 1}`, ctrl));
			unregister(userId, `${sessionId}-new`, newCtrl);
		});

		it('never holds more than the cap at once, even with repeated registrations', () => {
			const ctrls: ReturnType<typeof makeController>[] = [];
			for (let i = 0; i < MAX_CONNECTIONS_PER_USER + 3; i++) {
				const ctrl = makeController();
				ctrls.push(ctrl);
				register(userId, `${sessionId}-${i}`, ctrl);
			}

			// Only the most recent MAX_CONNECTIONS_PER_USER controllers should
			// still receive emits.
			emit(userId, qrCompleted);
			const survivors = ctrls.slice(-MAX_CONNECTIONS_PER_USER);
			const evicted = ctrls.slice(0, -MAX_CONNECTIONS_PER_USER);

			for (const ctrl of survivors) {
				expect(ctrl.enqueue).toHaveBeenCalledWith(expect.anything());
			}
			for (const ctrl of evicted) {
				expect(ctrl.close).toHaveBeenCalledOnce();
			}

			// Cleanup
			survivors.forEach((ctrl, i) =>
				unregister(userId, `${sessionId}-${i + evicted.length}`, ctrl)
			);
		});
	});
});

describe('closeSession', () => {
	describe('given a session with one active connection', () => {
		it('closes it without sending an evicted frame', () => {
			const ctrl = makeController();
			register(userId, sessionId, ctrl);

			closeSession(sessionId);

			expect(ctrl.close).toHaveBeenCalledOnce();
			expect(ctrl.enqueue).not.toHaveBeenCalled();
		});

		it('removes the connection from the registry so a subsequent emit is a no-op', () => {
			const ctrl = makeController();
			register(userId, sessionId, ctrl);

			closeSession(sessionId);
			emit(userId, qrCompleted);

			expect(ctrl.enqueue).not.toHaveBeenCalled();
		});
	});

	describe('given a session open in multiple tabs', () => {
		it('closes every connection for that session', () => {
			const ctrl1 = makeController();
			const ctrl2 = makeController();
			register(userId, sessionId, ctrl1);
			register(userId, sessionId, ctrl2);

			closeSession(sessionId);

			expect(ctrl1.close).toHaveBeenCalledOnce();
			expect(ctrl2.close).toHaveBeenCalledOnce();
		});
	});

	describe('given a user with multiple sessions (e.g. two devices)', () => {
		it('closing one session does not affect the other', () => {
			const ctrlA = makeController();
			const ctrlB = makeController();
			const otherSessionId = `${sessionId}-other-device`;
			register(userId, sessionId, ctrlA);
			register(userId, otherSessionId, ctrlB);

			closeSession(sessionId);
			emit(userId, qrCompleted);

			expect(ctrlA.enqueue).not.toHaveBeenCalled();
			expect(ctrlB.enqueue).toHaveBeenCalledOnce();

			unregister(userId, otherSessionId, ctrlB);
		});
	});

	describe('given an unknown session', () => {
		it('is a no-op and does not throw', () => {
			expect(() => closeSession('no-such-session')).not.toThrow();
		});
	});
});

describe('dispose callback (caller-owned teardown)', () => {
	// Regression coverage for the keepalive-timer leak: `controller.close()`
	// does not run the owning ReadableStream's cancel() callback, so a route
	// that only cleared its own interval timer from cancel() would leak that
	// timer forever whenever the registry closed the connection from the
	// outside. The registry always removes the entry and closes the
	// controller itself (never depending on `dispose` to do that — see the
	// "falls back" test below for why), and ALSO calls `dispose` so the
	// route can clear its own keepalive timer.

	describe('given a connection registered with a custom dispose callback', () => {
		it('closes the controller AND calls dispose when evicted by the cap', () => {
			const dispose = vi.fn();
			const ctrl = makeController();
			register(userId, sessionId, ctrl, dispose);

			// Fill up to the cap with other connections so this one gets evicted.
			const fillers = Array.from({ length: MAX_CONNECTIONS_PER_USER - 1 }, () => makeController());
			fillers.forEach((f, i) => register(userId, `${sessionId}-filler-${i}`, f));

			// One more registration pushes the user over the cap, evicting the oldest.
			const newCtrl = makeController();
			register(userId, `${sessionId}-new`, newCtrl);

			expect(ctrl.close).toHaveBeenCalledOnce();
			expect(dispose).toHaveBeenCalledOnce();

			// Cleanup
			fillers.forEach((f, i) => unregister(userId, `${sessionId}-filler-${i}`, f));
			unregister(userId, `${sessionId}-new`, newCtrl);
		});

		it('closes the controller AND calls dispose when the session is closed (sign-out)', () => {
			const dispose = vi.fn();
			const ctrl = makeController();
			register(userId, sessionId, ctrl, dispose);

			closeSession(sessionId);

			expect(ctrl.close).toHaveBeenCalledOnce();
			expect(dispose).toHaveBeenCalledOnce();
		});

		it('never calls dispose while the connection is neither evicted nor closed', () => {
			const dispose = vi.fn();
			const ctrl = makeController();
			register(userId, sessionId, ctrl, dispose);

			emit(userId, qrCompleted);

			expect(dispose).not.toHaveBeenCalled();

			unregister(userId, sessionId, ctrl);
		});
	});

	describe('given a dispose callback that does not unregister itself (e.g. a no-op test double)', () => {
		it('still removes the entry and closes it exactly once — no infinite eviction loop', () => {
			const ctrl = makeController();
			// A dispose that does nothing at all — notably, does NOT call
			// unregister(). The registry must not depend on that to make
			// progress, or this would spin forever once this entry became
			// the oldest at the cap.
			register(userId, sessionId, ctrl, () => {});

			closeSession(sessionId);

			expect(ctrl.close).toHaveBeenCalledOnce();
			expect(() => emit(userId, qrCompleted)).not.toThrow();
			expect(ctrl.enqueue).not.toHaveBeenCalled(); // already unregistered
		});

		it('terminates eviction even when every connection at the cap has a no-op dispose', () => {
			const ctrls = Array.from({ length: MAX_CONNECTIONS_PER_USER }, () => makeController());
			ctrls.forEach((ctrl, i) => register(userId, `${sessionId}-${i}`, ctrl, () => {}));

			// Registering one more must evict exactly the oldest and return —
			// if the eviction loop depended on dispose() to shrink the
			// registry, this would hang forever instead of returning.
			const newCtrl = makeController();
			register(userId, `${sessionId}-new`, newCtrl, () => {});

			expect(ctrls[0].close).toHaveBeenCalledOnce();
			for (const ctrl of ctrls.slice(1)) {
				expect(ctrl.close).not.toHaveBeenCalled();
			}

			// Cleanup
			ctrls.slice(1).forEach((ctrl, i) => unregister(userId, `${sessionId}-${i + 1}`, ctrl));
			unregister(userId, `${sessionId}-new`, newCtrl);
		});
	});
});
