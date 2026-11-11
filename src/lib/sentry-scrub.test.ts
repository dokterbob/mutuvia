// SPDX-License-Identifier: AGPL-3.0-or-later

import { describe, expect, test } from 'vitest';
import {
	redactContactInfo,
	redactDynamicIds,
	scrubSentryEvent,
	scrubString,
	stripOtpDestParam
} from './sentry-scrub';

describe('redactDynamicIds', () => {
	test.each([
		['/accept/abc123XYZ-_9', '/accept/[id]'],
		['/send/payment-req-42', '/send/[id]'],
		['/api/qr-status/qr_9f8e7', '/api/qr-status/[id]']
	])('replaces the dynamic id segment of %s -> %s', (input, expected) => {
		expect(redactDynamicIds(input)).toBe(expected);
	});

	test('replaces every occurrence, anywhere in a larger string', () => {
		expect(redactDynamicIds('GET /accept/abc123 referred from /send/xyz')).toBe(
			'GET /accept/[id] referred from /send/[id]'
		);
	});

	test('leaves unrelated paths untouched', () => {
		expect(redactDynamicIds('/home')).toBe('/home');
		expect(redactDynamicIds('/(app)/settings')).toBe('/(app)/settings');
	});
});

describe('redactContactInfo', () => {
	test('redacts an email address', () => {
		expect(redactContactInfo('contact me at jane.doe+test@example.com please')).toBe(
			'contact me at [redacted-email] please'
		);
	});

	test('redacts an E.164-shaped phone number', () => {
		expect(redactContactInfo('called +31 6 12345678 twice')).toBe('called [redacted-phone] twice');
	});

	test('redacts a hyphenated phone number', () => {
		expect(redactContactInfo('dest=555-123-4567')).toBe('dest=[redacted-phone]');
	});

	test('leaves ordinary text and short numbers untouched', () => {
		expect(redactContactInfo('order #42 shipped')).toBe('order #42 shipped');
	});
});

describe('stripOtpDestParam', () => {
	test('strips dest from a relative /onboarding/otp URL', () => {
		expect(stripOtpDestParam('/onboarding/otp?dest=%2B31612345678&foo=bar')).toBe(
			'/onboarding/otp?foo=bar'
		);
	});

	test('strips dest from an absolute /onboarding/otp URL, preserving origin', () => {
		expect(stripOtpDestParam('https://app.test/onboarding/otp?dest=jane%40example.com')).toBe(
			'https://app.test/onboarding/otp'
		);
	});

	test('leaves a /onboarding/otp URL without a dest param untouched', () => {
		expect(stripOtpDestParam('/onboarding/otp?step=verify')).toBe('/onboarding/otp?step=verify');
	});

	test('leaves an unrelated URL untouched even if it has a dest param', () => {
		expect(stripOtpDestParam('/send/abc?dest=something')).toBe('/send/abc?dest=something');
	});

	test('leaves an unparseable string untouched', () => {
		expect(stripOtpDestParam('not a url /onboarding/otp but no query')).toBe(
			'not a url /onboarding/otp but no query'
		);
	});
});

describe('scrubString', () => {
	test('applies dest-stripping, id-redaction and contact-info redaction together', () => {
		const input = 'Referer: https://app.test/accept/abc123?note=call+me@+31612345678';
		const result = scrubString(input);
		expect(result).toContain('/accept/[id]');
		expect(result).not.toContain('abc123');
	});
});

describe('scrubSentryEvent', () => {
	test('scrubs request.url', () => {
		const event = scrubSentryEvent({ request: { url: 'https://app.test/send/xyz123' } });
		expect(event.request?.url).toBe('https://app.test/send/[id]');
	});

	test('scrubs the Referer request header (case-insensitively)', () => {
		const event = scrubSentryEvent({
			request: { headers: { Referer: 'https://app.test/accept/abc123' } }
		});
		expect(event.request?.headers?.Referer).toBe('https://app.test/accept/[id]');
	});

	test('scrubs the transaction name', () => {
		const event = scrubSentryEvent({ transaction: 'GET /accept/abc123' });
		expect(event.transaction).toBe('GET /accept/[id]');
	});

	test('scrubs breadcrumbs data.url/to/from and message', () => {
		const event = scrubSentryEvent({
			breadcrumbs: [
				{
					category: 'navigation',
					message: 'navigated to /send/xyz',
					data: { url: '/accept/abc123', to: '/send/xyz', from: '/home' }
				}
			]
		});
		const crumb = event.breadcrumbs?.[0];
		expect(crumb?.data?.url).toBe('/accept/[id]');
		expect(crumb?.data?.to).toBe('/send/[id]');
		expect(crumb?.data?.from).toBe('/home');
		expect(crumb?.message).toBe('navigated to /send/[id]');
	});

	test('scrubs span descriptions', () => {
		const event = scrubSentryEvent({
			spans: [{ description: 'GET /api/qr-status/qr_42' }]
		});
		expect(event.spans?.[0]?.description).toBe('GET /api/qr-status/[id]');
	});

	test('scrubs string values nested inside extra', () => {
		const event = scrubSentryEvent({
			extra: { context: { lastUrl: '/accept/abc123', note: 'emailed jane@example.com' } }
		});
		expect(event.extra).toEqual({
			context: { lastUrl: '/accept/[id]', note: 'emailed [redacted-email]' }
		});
	});

	test('scrubs string tag values but leaves non-string tags untouched', () => {
		const event = scrubSentryEvent({
			tags: { path: '/send/xyz123', retryCount: 3 }
		});
		expect(event.tags).toEqual({ path: '/send/[id]', retryCount: 3 });
	});

	test('strips dest from a query string anywhere it appears', () => {
		const event = scrubSentryEvent({
			request: { url: 'https://app.test/onboarding/otp?dest=%2B31612345678' }
		});
		expect(event.request?.url).toBe('https://app.test/onboarding/otp');
	});

	test('is a no-op on an event with none of these fields', () => {
		const event = scrubSentryEvent({ level: 'error' });
		expect(event).toEqual({ level: 'error' });
	});
});
