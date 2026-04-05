// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { register, unregister, emit } from '$lib/server/sse-registry';
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

// Use a unique userId per test to avoid cross-test state leakage in the
// module-level registry Map.
let userId: string;
let seq = 0;

beforeEach(() => {
	userId = `user-${++seq}`;
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('register + emit', () => {
	describe('given a registered controller', () => {
		it('enqueues the encoded SSE payload when an event is emitted', () => {
			// Given
			const ctrl = makeController();
			register(userId, ctrl);

			// When
			emit(userId, qrCompleted);

			// Then
			expect(ctrl.enqueue).toHaveBeenCalledOnce();
			const [chunk] = ctrl.enqueue.mock.calls[0] as [Uint8Array];
			expect(chunk).toBeInstanceOf(Uint8Array);
			const text = new TextDecoder().decode(chunk);
			expect(text).toContain(`id: ${qrCompleted.id}`);
			expect(text).toContain(JSON.stringify(qrCompleted));

			// Cleanup
			unregister(userId, ctrl);
		});

		it('SSE payload ends with a double newline (\\n\\n) as per the spec', () => {
			// Given
			const ctrl = makeController();
			register(userId, ctrl);

			// When
			emit(userId, qrCompleted);

			// Then
			const [chunk] = ctrl.enqueue.mock.calls[0] as [Uint8Array];
			const text = new TextDecoder().decode(chunk);
			expect(text.endsWith('\n\n')).toBe(true);

			unregister(userId, ctrl);
		});

		it('does not emit to a different user', () => {
			// Given
			const ctrl = makeController();
			register(userId, ctrl);

			// When
			emit('some-other-user', qrCompleted);

			// Then
			expect(ctrl.enqueue).not.toHaveBeenCalled();

			unregister(userId, ctrl);
		});
	});
});

describe('unregister', () => {
	describe('given a controller that was registered and then unregistered', () => {
		it('does not call enqueue after unregister', () => {
			// Given
			const ctrl = makeController();
			register(userId, ctrl);
			unregister(userId, ctrl);

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
			register(userId, ctrl);
			unregister(userId, ctrl);

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
		register(userId, ctrl1);
		register(userId, ctrl2);
		register(userId, ctrl3);

		// When
		emit(userId, qrCompleted);

		// Then
		expect(ctrl1.enqueue).toHaveBeenCalledOnce();
		expect(ctrl2.enqueue).toHaveBeenCalledOnce();
		expect(ctrl3.enqueue).toHaveBeenCalledOnce();

		// All receive identical bytes
		const text1 = new TextDecoder().decode(ctrl1.enqueue.mock.calls[0][0] as Uint8Array);
		const text2 = new TextDecoder().decode(ctrl2.enqueue.mock.calls[0][0] as Uint8Array);
		const text3 = new TextDecoder().decode(ctrl3.enqueue.mock.calls[0][0] as Uint8Array);
		expect(text1).toBe(text2);
		expect(text2).toBe(text3);

		unregister(userId, ctrl1);
		unregister(userId, ctrl2);
		unregister(userId, ctrl3);
	});

	it('unregistering one controller does not affect the others', () => {
		// Given
		const ctrl1 = makeController();
		const ctrl2 = makeController();
		register(userId, ctrl1);
		register(userId, ctrl2);

		// When — remove ctrl1, then emit
		unregister(userId, ctrl1);
		emit(userId, qrCompleted);

		// Then
		expect(ctrl1.enqueue).not.toHaveBeenCalled();
		expect(ctrl2.enqueue).toHaveBeenCalledOnce();

		unregister(userId, ctrl2);
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
		register(userId, faultyCtrl);
		register(userId, healthyCtrl);

		// When — should not throw even though faultyCtrl.enqueue throws
		expect(() => emit(userId, qrCompleted)).not.toThrow();

		// Then — the healthy controller still received the event
		expect(healthyCtrl.enqueue).toHaveBeenCalledOnce();

		unregister(userId, faultyCtrl);
		unregister(userId, healthyCtrl);
	});
});
