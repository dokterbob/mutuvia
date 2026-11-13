// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Wiring test for src/hooks.client.ts's Sentry setup: Session Replay's
// recording events and per-segment `replay_event` never pass through
// beforeSend/beforeSendTransaction, so hooks.client.ts must hand them to the
// shared scrubber through replayIntegration's `beforeAddRecordingEvent` and
// an integration `processEvent`. This captures the options hooks.client.ts
// passes to the (mocked) SDK and drives those callbacks with realistic
// replay payloads.

import { describe, expect, test, vi } from 'vitest';

const { initMock, replayIntegrationMock } = vi.hoisted(() => ({
	initMock: vi.fn(),
	replayIntegrationMock: vi.fn((options: Record<string, unknown>) => ({
		name: 'Replay',
		options
	}))
}));

vi.mock('virtual:pwa-register', () => ({ registerSW: vi.fn() }));

vi.mock('$env/dynamic/public', () => ({
	env: { PUBLIC_SENTRY_DSN: 'https://examplePublicKey@o0.ingest.sentry.io/0' }
}));

vi.mock('@sentry/sveltekit', () => ({
	init: initMock,
	replayIntegration: replayIntegrationMock,
	handleErrorWithSentry: vi.fn()
}));

await import('./hooks.client');

type Integration = { name: string; options?: Record<string, unknown>; processEvent?: unknown };

function initOptions() {
	expect(initMock).toHaveBeenCalledTimes(1);
	return initMock.mock.calls[0][0] as { integrations: Integration[] };
}

describe('hooks.client Sentry Replay scrubbing', () => {
	describe('beforeAddRecordingEvent', () => {
		test('scrubs a navigation breadcrumb before it enters the recording', () => {
			const replayOptions = replayIntegrationMock.mock.calls[0][0] as {
				beforeAddRecordingEvent?: (event: unknown) => unknown;
			};
			expect(typeof replayOptions.beforeAddRecordingEvent).toBe('function');

			const result = replayOptions.beforeAddRecordingEvent!({
				type: 5,
				timestamp: 1794500000000,
				data: {
					tag: 'breadcrumb',
					payload: {
						category: 'navigation',
						data: { from: '/onboarding/otp?dest=jane%40example.com', to: '/accept/tok123' }
					}
				}
			});

			const serialized = JSON.stringify(result);
			expect(serialized).not.toContain('jane');
			expect(serialized).not.toContain('tok123');
		});
	});

	describe('ReplayEventScrubber integration', () => {
		function processEvent() {
			const scrubber = initOptions().integrations.find((i) => i.name === 'ReplayEventScrubber');
			expect(scrubber).toBeDefined();
			return scrubber!.processEvent as (event: Record<string, unknown>) => unknown;
		}

		test('scrubs the visited urls and request url of a replay_event', () => {
			const result = processEvent()({
				type: 'replay_event',
				replay_id: 'deadbeefdeadbeefdeadbeefdeadbeef',
				urls: [
					'https://app.example/accept/tok123',
					'https://app.example/onboarding/otp?dest=%2B31612345678'
				],
				request: { url: 'https://app.example/accept/tok123' }
			});

			const serialized = JSON.stringify(result);
			expect(serialized).not.toContain('tok123');
			expect(serialized).not.toContain('31612345678');
			expect((result as { replay_id: string }).replay_id).toBe('deadbeefdeadbeefdeadbeefdeadbeef');
		});

		test('leaves error events to beforeSend (returned unchanged)', () => {
			const errorEvent = { message: 'see /accept/tok123' };
			expect(processEvent()(errorEvent)).toBe(errorEvent);
		});
	});
});
