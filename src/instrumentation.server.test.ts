// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Regression (review round 1, finding 1): @sentry/bun's DEFAULT
// requestDataIntegration() attaches request cookies and body to every
// server-side event unless explicitly told not to (see
// node_modules/@sentry/core/build/esm/integrations/requestdata.js's
// DEFAULT_INCLUDE). This guards that instrumentation.server.ts keeps
// overriding it with a restrictive `include`, rather than relying solely on
// src/lib/sentry-scrub.ts's after-the-fact stripping.

import { describe, expect, test, vi, beforeEach } from 'vitest';

const { initMock, requestDataIntegrationMock } = vi.hoisted(() => ({
	initMock: vi.fn(),
	requestDataIntegrationMock: vi.fn((options: unknown) => ({ name: 'RequestData', options }))
}));

vi.mock('@sentry/bun', () => ({
	init: initMock,
	requestDataIntegration: requestDataIntegrationMock
}));

describe('instrumentation.server.ts', () => {
	beforeEach(() => {
		vi.resetModules();
		initMock.mockClear();
		requestDataIntegrationMock.mockClear();
		delete process.env.PUBLIC_SENTRY_DSN;
	});

	test('given no PUBLIC_SENTRY_DSN, does not initialize Sentry', async () => {
		await import('./instrumentation.server');
		expect(initMock).not.toHaveBeenCalled();
	});

	test('given a PUBLIC_SENTRY_DSN, configures requestDataIntegration with cookies/data/ip disabled', async () => {
		process.env.PUBLIC_SENTRY_DSN = 'https://abc@o123.ingest.sentry.io/123';
		await import('./instrumentation.server');

		expect(requestDataIntegrationMock).toHaveBeenCalledWith({
			include: { cookies: false, data: false, ip: false }
		});
		expect(initMock).toHaveBeenCalledOnce();
		const initOptions = initMock.mock.calls[0][0];
		expect(initOptions.integrations).toEqual([
			{ name: 'RequestData', options: { include: { cookies: false, data: false, ip: false } } }
		]);
		expect(typeof initOptions.beforeSend).toBe('function');
		expect(typeof initOptions.beforeSendTransaction).toBe('function');
	});

	test('scrubs an event through the wired beforeSend hook', async () => {
		process.env.PUBLIC_SENTRY_DSN = 'https://abc@o123.ingest.sentry.io/123';
		await import('./instrumentation.server');

		const initOptions = initMock.mock.calls[0][0];
		const scrubbed = initOptions.beforeSend({ message: 'failed for jane@example.com' });
		expect(scrubbed.message).toBe('failed for [redacted-email]');
	});
});
