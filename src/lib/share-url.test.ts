// SPDX-License-Identifier: AGPL-3.0-or-later

import { test, expect } from 'vitest';
import { extractAcceptUrl } from './share-url';

const BASE = 'https://app.mutuvia.com';

test('extracts from url param — direct URL', () => {
	const p = new URLSearchParams({ url: `${BASE}/accept/eyJtoken123` });
	expect(extractAcceptUrl(p)).toBe('/accept/eyJtoken123');
});

test('extracts JWT token with dots from url param', () => {
	const p = new URLSearchParams({
		url: `${BASE}/accept/eyJhbGciOiJIUzI1NiJ9.eyJhbXQiOjUwMH0.sig`
	});
	expect(extractAcceptUrl(p)).toBe('/accept/eyJhbGciOiJIUzI1NiJ9.eyJhbXQiOjUwMH0.sig');
});

test('extracts from text param containing embedded URL', () => {
	const p = new URLSearchParams({
		text: `Check this out: ${BASE}/accept/eyJtoken123 - a payment`
	});
	expect(extractAcceptUrl(p)).toBe('/accept/eyJtoken123');
});

test('extracts from multiline text (WhatsApp-style)', () => {
	const p = new URLSearchParams({
		text: `5.00 EUR of credit through Mutuvia.\n${BASE}/accept/eyJtoken`
	});
	expect(extractAcceptUrl(p)).toBe('/accept/eyJtoken');
});

test('url param takes precedence over text', () => {
	const p = new URLSearchParams({
		url: `${BASE}/accept/token1`,
		text: `${BASE}/accept/token2`
	});
	expect(extractAcceptUrl(p)).toBe('/accept/token1');
});

test('falls through to title param if url and text miss', () => {
	const p = new URLSearchParams({
		title: `${BASE}/accept/titletoken`
	});
	expect(extractAcceptUrl(p)).toBe('/accept/titletoken');
});

test('returns null when no accept URL found', () => {
	const p = new URLSearchParams({ text: 'Just some random text' });
	expect(extractAcceptUrl(p)).toBeNull();
});

test('returns null for non-accept URL in url param', () => {
	const p = new URLSearchParams({ url: `${BASE}/home` });
	expect(extractAcceptUrl(p)).toBeNull();
});

test('returns null for empty params', () => {
	const p = new URLSearchParams();
	expect(extractAcceptUrl(p)).toBeNull();
});

test('strips origin — path only (prevents open redirect)', () => {
	// Even if shared from a different domain, we return a bare path
	const p = new URLSearchParams({ url: 'https://evil.com/accept/token' });
	expect(extractAcceptUrl(p)).toBe('/accept/token');
});

test('rejects path traversal in url param', () => {
	const p = new URLSearchParams({ url: `${BASE}/accept/../home` });
	expect(extractAcceptUrl(p)).toBeNull();
});

test('rejects multi-segment token (slash in token)', () => {
	const p = new URLSearchParams({ url: `${BASE}/accept/a/b` });
	expect(extractAcceptUrl(p)).toBeNull();
});

test('strips trailing punctuation from bare path in text', () => {
	const p = new URLSearchParams({ text: `Pay me: ${BASE}/accept/eyJtoken.` });
	expect(extractAcceptUrl(p)).toBe('/accept/eyJtoken');
});

test('strips query string from bare path in text', () => {
	const p = new URLSearchParams({ text: `/accept/eyJtoken?x=1` });
	expect(extractAcceptUrl(p)).toBe('/accept/eyJtoken');
});
