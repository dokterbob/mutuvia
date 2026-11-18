// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Wiring test for src/hooks.client.ts's Sentry setup. Session Replay is
// deliberately NOT enabled: rrweb's DOM recording captures page URLs and link
// hrefs (`/accept/<id>`, `/onboarding/otp?dest=…`) with no scrubbing hook, so
// it would leak payment ids and contact details regardless of masking. This
// guards against it being re-added, and checks that the events Sentry does
// send still go through the shared fail-closed scrubber.

import { describe, expect, test, vi } from 'vitest';

const { initMock, replayIntegrationMock } = vi.hoisted(() => ({
	initMock: vi.fn(),
	replayIntegrationMock: vi.fn(() => ({ name: 'Replay' }))
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

type InitOptions = {
	integrations?: Array<{ name: string }>;
	replaysSessionSampleRate?: number;
	replaysOnErrorSampleRate?: number;
	beforeSend?: (event: unknown) => unknown;
	beforeSendTransaction?: (event: unknown) => unknown;
};

function initOptions(): InitOptions {
	expect(initMock).toHaveBeenCalledTimes(1);
	return initMock.mock.calls[0][0] as InitOptions;
}

describe('hooks.client Sentry setup', () => {
	describe('given a Sentry DSN is configured', () => {
		test('does not enable Session Replay', () => {
			const options = initOptions();

			expect(replayIntegrationMock).not.toHaveBeenCalled();
			expect(options.integrations ?? []).not.toContainEqual(
				expect.objectContaining({ name: 'Replay' })
			);
			expect(options.replaysSessionSampleRate).toBeUndefined();
			expect(options.replaysOnErrorSampleRate).toBeUndefined();
		});

		test('scrubs error events before sending them', () => {
			const result = initOptions().beforeSend!({
				message: 'failed on /accept/tok123 for jane@example.com'
			});

			const serialized = JSON.stringify(result);
			expect(serialized).not.toContain('tok123');
			expect(serialized).not.toContain('jane@example.com');
		});

		test('scrubs transactions before sending them', () => {
			const result = initOptions().beforeSendTransaction!({
				transaction: '/onboarding/otp',
				request: { url: 'https://app.example/onboarding/otp?dest=%2B31612345678' }
			});

			expect(JSON.stringify(result)).not.toContain('31612345678');
		});
	});
});
