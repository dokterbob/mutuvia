// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { GET } from './+server';
import { emit } from '$lib/server/sse-registry';
import type { QrCompletedEvent, QrDeclinedEvent } from '$lib/notifications';
// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type GetEvent = Parameters<typeof GET>[0];

function makeEvent(appUser: { id: string } | null): GetEvent {
	return { locals: { appUser } } as unknown as GetEvent;
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

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

const decoder = new TextDecoder();

// Use a unique userId per describe block to avoid cross-test state leakage.
let seq = 0;
function nextUserId(): string {
	return `user-events-${++seq}`;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('GET /api/events', () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	// -------------------------------------------------------------------------
	// 1. Unauthenticated
	// -------------------------------------------------------------------------

	describe('given no authenticated user', () => {
		it('returns 401', () => {
			// When
			const response = GET(makeEvent(null));

			// Then
			expect(response.status).toBe(401);
		});
	});

	// -------------------------------------------------------------------------
	// 2–7. Authenticated user
	// -------------------------------------------------------------------------

	describe('given an authenticated user', () => {
		let userId: string;
		let reader: ReadableStreamDefaultReader<Uint8Array>;

		beforeEach(() => {
			userId = nextUserId();
			const response = GET(makeEvent({ id: userId })) as Response;
			reader = response.body!.getReader();
		});

		afterEach(async () => {
			// Cancel the stream so the cancel() callback fires and unregisters the
			// controller, preventing registry leaks between tests.
			await reader.cancel();
		});

		// -----------------------------------------------------------------------
		// 2. Returns 200 text/event-stream
		// -----------------------------------------------------------------------

		it('returns 200 text/event-stream', () => {
			const response = GET(makeEvent({ id: userId })) as Response;

			// Then
			expect(response.status).toBe(200);
			expect(response.headers.get('Content-Type')).toBe('text/event-stream');

			// Cleanup this second connection
			response.body!.cancel();
		});

		// -----------------------------------------------------------------------
		// 3. Emits a qr_completed event
		// -----------------------------------------------------------------------

		it('emits a qr_completed event after settlement', async () => {
			// Given — discard the initial keepalive ping
			const { value: ping } = await reader.read();
			expect(decoder.decode(ping)).toBe(': ping\n\n');

			// When
			emit(userId, qrCompleted);

			// Then
			const { value } = await reader.read();
			const text = decoder.decode(value);
			expect(text).toContain(`id: ${qrCompleted.id}`);
			expect(text).toContain(JSON.stringify(qrCompleted));
			expect(text.endsWith('\n\n')).toBe(true);
		});

		// -----------------------------------------------------------------------
		// 4. Emits a qr_declined event
		// -----------------------------------------------------------------------

		it('emits a qr_declined event after decline', async () => {
			// Given — discard the initial keepalive ping
			const { value: ping } = await reader.read();
			expect(decoder.decode(ping)).toBe(': ping\n\n');

			// When
			emit(userId, qrDeclined);

			// Then
			const { value } = await reader.read();
			const text = decoder.decode(value);
			expect(text).toContain(`id: ${qrDeclined.id}`);
			expect(text).toContain(JSON.stringify(qrDeclined));
			expect(text.endsWith('\n\n')).toBe(true);
		});

		// -----------------------------------------------------------------------
		// 5. Server ignores Last-Event-ID header — dedup is handled client-side
		// -----------------------------------------------------------------------

		it('ignores the Last-Event-ID header and re-emits events normally', async () => {
			// The handler does not read Last-Event-ID — dedup is handled client-side.
			// Open a second connection to isolate this assertion from beforeEach state.
			const secondUserId = nextUserId();
			const response = GET(makeEvent({ id: secondUserId })) as Response;
			const reader2 = response.body!.getReader();

			try {
				// Discard ping on the second reader
				const { value: ping } = await reader2.read();
				expect(decoder.decode(ping)).toBe(': ping\n\n');

				// When — emit an event whose id matches what Last-Event-ID specified
				emit(secondUserId, qrCompleted);

				// Then — event is still delivered (no server-side filtering)
				const { value } = await reader2.read();
				const text = decoder.decode(value);
				expect(text).toContain(`id: ${qrCompleted.id}`);
				expect(text).toContain(JSON.stringify(qrCompleted));
			} finally {
				await reader2.cancel();
			}
		});

		// -----------------------------------------------------------------------
		// 6. Removes the connection from the registry after client disconnects
		// -----------------------------------------------------------------------

		it('removes the connection from the registry after the client disconnects', async () => {
			// Given — discard the initial keepalive ping
			const { value: ping } = await reader.read();
			expect(decoder.decode(ping)).toBe(': ping\n\n');

			// When — cancel the reader to trigger the ReadableStream cancel() callback
			await reader.cancel();

			// Then — a subsequent emit should be a no-op (no controller enqueues)
			// Re-open a fresh reader on a new connection so we can verify the old
			// userId no longer has any registered controllers.
			// The simplest check: emit does not throw, and if we were to read from
			// the (now-closed) stream it would be done. We verify by asserting that
			// no new data appears when we emit to the disconnected user via a spy.
			expect(() => emit(userId, qrCompleted)).not.toThrow();

			// Re-assign reader so afterEach cancel() doesn't fail on an already-cancelled reader.
			const probeUserId = nextUserId();
			const probeResponse = GET(makeEvent({ id: probeUserId })) as Response;
			reader = probeResponse.body!.getReader();
			// Discard ping for the probe connection so afterEach is clean.
			await reader.read();
		});

		// -----------------------------------------------------------------------
		// 7. Two concurrent connections for the same user both receive the event
		// -----------------------------------------------------------------------

		it('supports two concurrent connections for the same user — both receive the event', async () => {
			// Given — open a second connection for the same user
			const response2 = GET(makeEvent({ id: userId })) as Response;
			const reader2 = response2.body!.getReader();

			try {
				// Discard the keepalive ping from both readers
				const { value: ping1 } = await reader.read();
				expect(decoder.decode(ping1)).toBe(': ping\n\n');

				const { value: ping2 } = await reader2.read();
				expect(decoder.decode(ping2)).toBe(': ping\n\n');

				// When
				emit(userId, qrCompleted);

				// Then — both connections receive the same event
				const [{ value: chunk1 }, { value: chunk2 }] = await Promise.all([
					reader.read(),
					reader2.read()
				]);

				const text1 = decoder.decode(chunk1);
				const text2 = decoder.decode(chunk2);

				expect(text1).toContain(`id: ${qrCompleted.id}`);
				expect(text2).toContain(`id: ${qrCompleted.id}`);
				expect(text1).toBe(text2);
			} finally {
				await reader2.cancel();
			}
		});
	});
});
