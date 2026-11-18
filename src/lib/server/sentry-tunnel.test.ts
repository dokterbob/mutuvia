// SPDX-License-Identifier: AGPL-3.0-or-later

import { describe, expect, test } from 'vitest';
import { dsnProjectId, isAllowedEnvelopeDsn, readBodyWithLimit } from './sentry-tunnel';

const CONFIGURED_DSN = new URL('https://abc123@o123456.ingest.sentry.io/1234567');

describe('isAllowedEnvelopeDsn', () => {
	test('allows an envelope DSN that matches host and project id exactly', () => {
		const envelopeDsn = new URL('https://abc123@o123456.ingest.sentry.io/1234567');
		expect(isAllowedEnvelopeDsn(envelopeDsn, CONFIGURED_DSN)).toBe(true);
	});

	test('rejects a different host', () => {
		const envelopeDsn = new URL('https://xyz@evil.ingest.sentry.io/1234567');
		expect(isAllowedEnvelopeDsn(envelopeDsn, CONFIGURED_DSN)).toBe(false);
	});

	test('rejects a different project id on the SAME host — the open-proxy case', () => {
		const envelopeDsn = new URL('https://abc123@o123456.ingest.sentry.io/9999999');
		expect(isAllowedEnvelopeDsn(envelopeDsn, CONFIGURED_DSN)).toBe(false);
	});
});

describe('dsnProjectId', () => {
	test('strips the leading slash', () => {
		expect(dsnProjectId(new URL('https://host/1234567'))).toBe('1234567');
	});
});

describe('readBodyWithLimit', () => {
	function requestWithBody(body: string) {
		return new Request('https://app.test/x', { method: 'POST', body });
	}

	test('returns the full body when under the limit', async () => {
		const request = requestWithBody('hello world');
		const result = await readBodyWithLimit(request, 1000);
		expect(result).not.toBeNull();
		expect(new TextDecoder().decode(result!)).toBe('hello world');
	});

	test('returns null when the body exceeds the limit, regardless of Content-Length', async () => {
		const body = 'x'.repeat(1000);
		const request = new Request('https://app.test/x', {
			method: 'POST',
			body,
			// A lying Content-Length must not be trusted — the cap is enforced
			// against actual bytes streamed, not this header.
			headers: { 'Content-Length': '1' }
		});

		const result = await readBodyWithLimit(request, 10);
		expect(result).toBeNull();
	});

	test('returns an empty buffer for a bodyless request', async () => {
		const request = new Request('https://app.test/x', { method: 'GET' });
		const result = await readBodyWithLimit(request, 10);
		expect(result).toEqual(new Uint8Array(0));
	});

	test('returns the body exactly at the limit', async () => {
		const body = 'x'.repeat(10);
		const request = requestWithBody(body);
		const result = await readBodyWithLimit(request, 10);
		expect(result).not.toBeNull();
		expect(result!.byteLength).toBe(10);
	});
});
