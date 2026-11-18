// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SseManager } from './sse-client';

// ---------------------------------------------------------------------------
// Minimal EventSource mock — just enough surface for SseManager.
// ---------------------------------------------------------------------------

type Listener = (e: MessageEvent) => void;

class MockEventSource {
	static instances: MockEventSource[] = [];
	url: string;
	onmessage: Listener | null = null;
	onerror: (() => void) | null = null;
	closed = false;
	private listeners = new Map<string, Listener[]>();

	constructor(url: string) {
		this.url = url;
		MockEventSource.instances.push(this);
	}

	addEventListener(type: string, cb: Listener): void {
		const list = this.listeners.get(type) ?? [];
		list.push(cb);
		this.listeners.set(type, list);
	}

	close(): void {
		this.closed = true;
	}

	/** Test helper: simulate the server sending a named SSE event. */
	emitNamed(type: string, data = '{}'): void {
		for (const cb of this.listeners.get(type) ?? []) {
			cb({ data } as MessageEvent);
		}
	}
}

function latestInstance(): MockEventSource {
	return MockEventSource.instances[MockEventSource.instances.length - 1];
}

describe('SseManager', () => {
	let manager: SseManager;

	beforeEach(() => {
		vi.useFakeTimers();
		MockEventSource.instances = [];
		vi.stubGlobal('EventSource', MockEventSource);
		manager = new SseManager();
	});

	afterEach(() => {
		manager.disconnect();
		vi.unstubAllGlobals();
		vi.useRealTimers();
	});

	describe('connect()', () => {
		it('opens a single EventSource to /api/events', () => {
			manager.connect();
			expect(MockEventSource.instances).toHaveLength(1);
			expect(latestInstance().url).toBe('/api/events');
		});

		it('is idempotent — calling it again while connected does not open a second stream', () => {
			manager.connect();
			manager.connect();
			expect(MockEventSource.instances).toHaveLength(1);
		});
	});

	describe('given a network error (not an eviction)', () => {
		it('reconnects automatically after a short delay', async () => {
			manager.connect();
			const first = latestInstance();

			first.onerror?.();
			expect(first.closed).toBe(true);
			expect(MockEventSource.instances).toHaveLength(1); // not yet reconnected

			await vi.advanceTimersByTimeAsync(3000);
			expect(MockEventSource.instances).toHaveLength(2); // reconnected
		});
	});

	describe('given the server evicts this connection (connection cap)', () => {
		it('closes the stream and does not schedule a reconnect', async () => {
			manager.connect();
			const first = latestInstance();

			first.emitNamed('evicted');
			expect(first.closed).toBe(true);

			// Even if the browser's EventSource also fires its own error after the
			// server closed the stream, the manager must not treat it as a normal
			// network error and reconnect.
			first.onerror?.();

			await vi.advanceTimersByTimeAsync(60_000);
			expect(MockEventSource.instances).toHaveLength(1); // still just the one, evicted stream
		});

		it('does not evict a reconnect storm into existence on repeated server errors', async () => {
			manager.connect();
			const first = latestInstance();
			first.emitNamed('evicted');
			first.onerror?.();

			await vi.advanceTimersByTimeAsync(300_000); // five minutes of real time
			expect(MockEventSource.instances).toHaveLength(1);
		});

		it('allows reconnecting on a later explicit connect() call (e.g. page remount)', async () => {
			manager.connect();
			const first = latestInstance();
			first.emitNamed('evicted');

			manager.connect();
			expect(MockEventSource.instances).toHaveLength(2);

			// And normal reconnect-on-error behaviour resumes for the new stream.
			const second = latestInstance();
			second.onerror?.();
			await vi.advanceTimersByTimeAsync(3000);
			expect(MockEventSource.instances).toHaveLength(3);
		});
	});

	describe('disconnect()', () => {
		it('closes the stream and clears any pending reconnect timer', async () => {
			manager.connect();
			const first = latestInstance();
			first.onerror?.(); // schedules a reconnect in 3s

			manager.disconnect();
			await vi.advanceTimersByTimeAsync(5000);

			expect(MockEventSource.instances).toHaveLength(1); // no reconnect happened
		});
	});
});
