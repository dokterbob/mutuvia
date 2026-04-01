// SPDX-License-Identifier: AGPL-3.0-or-later

import { describe, expect, test, vi, beforeEach, afterEach } from 'vitest';

const { fetchMock, DSN } = vi.hoisted(() => ({
	fetchMock: vi.fn(),
	DSN: 'https://abc123@o123456.ingest.sentry.io/1234567'
}));

vi.mock('$env/dynamic/public', () => ({
	env: { PUBLIC_SENTRY_DSN: DSN }
}));

import { POST } from './+server';

// PNG magic bytes — these are invalid UTF-8 and will be mangled by request.text()
const PNG_MAGIC = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function buildEnvelopeWithScreenshot(): Uint8Array {
	const enc = new TextEncoder();
	const envelopeHeader = enc.encode(
		JSON.stringify({ sdk: { name: 'sentry.javascript.sveltekit' }, dsn: DSN }) + '\n'
	);
	const itemHeader = enc.encode(
		JSON.stringify({
			type: 'attachment',
			length: PNG_MAGIC.length,
			filename: 'screenshot.png',
			content_type: 'image/png'
		}) + '\n'
	);

	const result = new Uint8Array(envelopeHeader.length + itemHeader.length + PNG_MAGIC.length);
	result.set(envelopeHeader, 0);
	result.set(itemHeader, envelopeHeader.length);
	result.set(PNG_MAGIC, envelopeHeader.length + itemHeader.length);
	return result;
}

describe('POST /sentry-tunnel', () => {
	beforeEach(() => {
		vi.stubGlobal('fetch', fetchMock);
	});

	afterEach(() => {
		vi.unstubAllGlobals();
		vi.resetAllMocks();
	});

	test('regression: forwards binary screenshot attachment byte-for-byte', async () => {
		const binaryBody = buildEnvelopeWithScreenshot();
		fetchMock.mockResolvedValueOnce(new Response(null, { status: 200 }));

		const request = new Request('https://app.test/sentry-tunnel', {
			method: 'POST',
			headers: { 'Content-Type': 'application/x-sentry-envelope' },
			body: binaryBody.buffer as ArrayBuffer
		});

		const response = await POST({ request } as unknown as Parameters<typeof POST>[0]);
		expect(response.status).toBe(200);
		expect(fetchMock).toHaveBeenCalledOnce();

		// Re-read whatever the handler forwarded upstream; corruption shows up as mismatched bytes
		const [, init] = fetchMock.mock.calls[0];
		const forwarded = await new Response(init.body).arrayBuffer();
		expect(new Uint8Array(forwarded)).toEqual(binaryBody);
	});

	test('regression: returns 400 when envelope header has no trailing newline', async () => {
		// When no newline is found, the handler must reject immediately rather than
		// falling back to decoding the entire body as UTF-8. Without this guard, a
		// lone JSON object (valid DSN, no newline) would pass DSN validation and be
		// forwarded as a malformed envelope.
		const body = JSON.stringify({ dsn: DSN }); // valid JSON but missing the required '\n'
		const request = new Request('https://app.test/sentry-tunnel', {
			method: 'POST',
			body
		});

		const response = await POST({ request } as unknown as Parameters<typeof POST>[0]);
		expect(response.status).toBe(400);
		expect(fetchMock).not.toHaveBeenCalled();
	});

	test('returns 400 for an invalid (non-JSON) envelope header', async () => {
		const request = new Request('https://app.test/sentry-tunnel', {
			method: 'POST',
			body: 'not-valid-json\n{}'
		});

		const response = await POST({ request } as unknown as Parameters<typeof POST>[0]);
		expect(response.status).toBe(400);
	});

	test('returns 403 when envelope DSN host does not match configured DSN', async () => {
		const envelope = JSON.stringify({ dsn: 'https://xyz@evil.ingest.sentry.io/999' }) + '\n{}\n';
		const request = new Request('https://app.test/sentry-tunnel', {
			method: 'POST',
			body: envelope
		});

		const response = await POST({ request } as unknown as Parameters<typeof POST>[0]);
		expect(response.status).toBe(403);
	});

	test('forwards text-only feedback and returns upstream status', async () => {
		fetchMock.mockResolvedValueOnce(new Response(null, { status: 200 }));

		const envelopeText =
			JSON.stringify({ dsn: DSN }) +
			'\n' +
			JSON.stringify({ type: 'feedback', length: 2 }) +
			'\n{}\n';
		const request = new Request('https://app.test/sentry-tunnel', {
			method: 'POST',
			body: envelopeText
		});

		const response = await POST({ request } as unknown as Parameters<typeof POST>[0]);
		expect(response.status).toBe(200);
	});
});
