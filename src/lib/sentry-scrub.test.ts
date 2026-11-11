// SPDX-License-Identifier: AGPL-3.0-or-later

import { describe, expect, test } from 'vitest';
import {
	redactContactInfo,
	redactDynamicIds,
	redactQueryParams,
	scrubSentryEvent,
	scrubString
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

	test('redacts a solid E.164 phone number with no separators', () => {
		expect(redactContactInfo('otp sent to +31612345678')).toBe('otp sent to [redacted-phone]');
	});

	test('redacts a hyphenated grouped phone number', () => {
		expect(redactContactInfo('dest=555-123-4567')).toBe('dest=[redacted-phone]');
	});

	test('redacts a parenthesised grouped phone number', () => {
		expect(redactContactInfo('call (555) 123-4567 now')).toBe('call [redacted-phone] now');
	});

	test('leaves ordinary text and short numbers untouched', () => {
		expect(redactContactInfo('order #42 shipped')).toBe('order #42 shipped');
	});

	// Review round 2, finding 4: the old open-ended phone pattern matched
	// ISO-8601 date/time fragments and version-looking strings as "phone
	// numbers" because it had no real shape requirement beyond "7+ digits
	// with some separators". Tightened to require either a leading '+' or
	// the exact 3-3-4 grouping of a human-typed local number.
	test.each([
		'2026-11-11T03:19:13.964Z',
		'2026-11-11',
		'10.46.0', // a package version, e.g. @sentry/sveltekit's
		'1.58.2'
	])('does not redact the non-phone, digit-and-separator string %s', (text) => {
		expect(redactContactInfo(text)).toBe(text);
	});

	test('does not mangle a UUID', () => {
		const uuid = '550e8400-e29b-41d4-a716-446655440000';
		expect(redactContactInfo(uuid)).toBe(uuid);
	});

	test('does not redact an isolated timestamp embedded in a larger string', () => {
		const text = 'event recorded at 2026-11-11T03:19:13.964Z on release 10.46.0';
		expect(redactContactInfo(text)).toBe(text);
	});
});

describe('redactQueryParams', () => {
	test('redacts the value of a known-sensitive key regardless of path', () => {
		// Review round 2, finding 3: the old dest-handling only applied on
		// /onboarding/otp — a dest param on any OTHER path leaked through.
		expect(redactQueryParams('/send/abc?dest=something')).toBe('/send/abc?dest=[redacted]');
	});

	test.each(['dest', 'email', 'phone', 'phoneNumber', 'to', 'otp', 'DEST'])(
		'redacts the %s query param value, case-insensitively',
		(key) => {
			expect(redactQueryParams(`/x?${key}=secret-value`)).toBe(`/x?${key}=[redacted]`);
		}
	);

	test('percent-decodes a non-sensitive key before pattern-matching its value', () => {
		expect(redactQueryParams('/x?note=jane%40example.com')).toBe('/x?note=[redacted-email]');
	});

	test('leaves a non-sensitive key with a non-PII value untouched', () => {
		expect(redactQueryParams('/x?step=verify&count=3')).toBe('/x?step=verify&count=3');
	});

	test('leaves a string with no query params untouched', () => {
		expect(redactQueryParams('/home')).toBe('/home');
	});

	test('handles multiple params, redacting only the sensitive one', () => {
		expect(redactQueryParams('/onboarding/otp?dest=%2B31612345678&foo=bar')).toBe(
			'/onboarding/otp?dest=[redacted]&foo=bar'
		);
	});
});

describe('scrubString', () => {
	test('applies id-redaction, query-param redaction and contact-info redaction together', () => {
		const input = 'Referer: https://app.test/accept/abc123?note=call+me@+31612345678';
		const result = scrubString(input);
		expect(result).toContain('/accept/[id]');
		expect(result).not.toContain('abc123');
		expect(result).not.toContain('31612345678');
	});

	// Review round 2, finding 3: PII hidden behind percent-encoding, outside
	// of a key=value shape entirely, must still be caught.
	test('redacts an email hidden by percent-encoding in a path-shaped string with no query', () => {
		const result = scrubString('/webhook/jane%40example.com/confirm');
		expect(result).toBe('/webhook/[redacted-email]/confirm');
	});

	test('leaves a string with legitimate percent-encoding and no PII unchanged', () => {
		expect(scrubString('/search?q=caf%C3%A9')).toBe('/search?q=caf%C3%A9');
	});

	test('does not mangle an ISO timestamp', () => {
		const ts = '2026-11-11T03:19:13.964Z';
		expect(scrubString(ts)).toBe(ts);
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

	test('redacts dest from a query string on ANY path, not just /onboarding/otp', () => {
		const event = scrubSentryEvent({
			request: { url: 'https://app.test/onboarding/otp?dest=%2B31612345678' }
		});
		expect(event.request?.url).toBe('https://app.test/onboarding/otp?dest=[redacted]');
	});

	test('is a no-op on an event with none of these fields', () => {
		const event = scrubSentryEvent({ level: 'error' });
		expect(event).toEqual({ level: 'error' });
	});

	describe('exception.values', () => {
		test('scrubs .value and .type', () => {
			const event = scrubSentryEvent({
				exception: {
					values: [
						{
							type: 'Error contacting +31612345678',
							value: 'Failed for jane@example.com at /accept/abc123'
						}
					]
				}
			});
			const value = event.exception?.values?.[0];
			expect(value?.type).toBe('Error contacting [redacted-phone]');
			expect(value?.value).toBe('Failed for [redacted-email] at /accept/[id]');
		});

		test('scrubs stacktrace.frames[].vars but leaves filename/lineno/function untouched', () => {
			const event = scrubSentryEvent({
				exception: {
					values: [
						{
							stacktrace: {
								frames: [
									{
										filename: 'app.js',
										function: 'sendOtp',
										lineno: 42,
										vars: { email: 'jane@example.com', count: 3 }
									}
								]
							}
						}
					]
				}
			});
			const frame = event.exception?.values?.[0]?.stacktrace?.frames?.[0];
			expect(frame?.vars).toEqual({ email: '[redacted-email]', count: 3 });
			expect(frame?.filename).toBe('app.js');
			expect(frame?.function).toBe('sendOtp');
			expect(frame?.lineno).toBe(42);
		});
	});

	test('scrubs the top-level message', () => {
		const event = scrubSentryEvent({ message: 'OTP send failed for +31612345678' });
		expect(event.message).toBe('OTP send failed for [redacted-phone]');
	});

	describe('logentry', () => {
		test('scrubs message and string params', () => {
			const event = scrubSentryEvent({
				logentry: { message: 'send failed for %s', params: ['jane@example.com', 3] }
			});
			expect(event.logentry?.message).toBe('send failed for %s');
			expect(event.logentry?.params).toEqual(['[redacted-email]', 3]);
		});
	});

	test('scrubs string values nested inside contexts', () => {
		const event = scrubSentryEvent({
			contexts: { custom: { lastDest: 'jane@example.com', retry: 2 } }
		});
		expect(event.contexts).toEqual({ custom: { lastDest: '[redacted-email]', retry: 2 } });
	});

	// ── Review round 2, finding 1: span.data / contexts.trace.data /
	// transaction_info, and the class of "yet another field" they
	// represent — proven via the inverted (blanket-walk) design rather than
	// enumerating these fields specifically too. Shaped like a real Sentry
	// transaction event (span/trace/transaction_info field names per
	// Sentry's documented event schema), not asserted against a live SDK
	// transport stub.
	describe('blanket coverage (review round 2, finding 1)', () => {
		test('scrubs span.data values, not just span.description', () => {
			const event = scrubSentryEvent({
				spans: [
					{
						span_id: 'abcd1234',
						op: 'http.client',
						description: 'GET /api/qr-status/qr_42',
						data: { 'http.url': '/api/qr-status/qr_42?dest=jane@example.com' }
					}
				]
			});
			expect((event.spans?.[0] as { data: Record<string, unknown> }).data['http.url']).toBe(
				'/api/qr-status/[id]?dest=[redacted]'
			);
		});

		test('scrubs contexts.trace.data', () => {
			const event = scrubSentryEvent({
				contexts: {
					trace: {
						trace_id: 'deadbeefdeadbeefdeadbeefdeadbeef',
						span_id: 'deadbeefdeadbeef',
						data: { 'http.url': 'https://app.test/send/xyz?to=jane@example.com' }
					}
				}
			});
			const traceData = (event.contexts as { trace: { data: Record<string, unknown> } }).trace.data;
			expect(traceData['http.url']).toBe('https://app.test/send/[id]?to=[redacted]');
		});

		test('scrubs transaction_info.source-adjacent free text', () => {
			const event = scrubSentryEvent({
				transaction_info: { source: 'route', note: 'matched for jane@example.com' }
			});
			expect((event.transaction_info as Record<string, unknown>).note).toBe(
				'matched for [redacted-email]'
			);
		});

		test('an arbitrary, never-explicitly-named field anywhere in the event is still scrubbed', () => {
			// Demonstrates the actual property being tested: this module does
			// NOT need to know this field's name in advance.
			const event = scrubSentryEvent({
				some_future_sdk_field: { nested: { deeper: 'contact jane@example.com' } }
			});
			expect((event.some_future_sdk_field as { nested: { deeper: string } }).nested.deeper).toBe(
				'contact [redacted-email]'
			);
		});
	});

	// ── Review round 2, finding 2: fail closed beyond the depth limit ──
	describe('depth limit', () => {
		test('replaces a subtree beyond the depth limit with a marker instead of leaking it unscrubbed', () => {
			// 12 levels deep — beyond the (raised) limit of 10.
			let deep: Record<string, unknown> = { email: 'jane@example.com' };
			for (let i = 0; i < 12; i++) {
				deep = { nested: deep };
			}
			const event = scrubSentryEvent({ extra: deep });
			const serialized = JSON.stringify(event);
			expect(serialized).not.toContain('jane@example.com');
			expect(serialized).toContain('[scrubbed: too deep]');
		});

		test('a realistically nested (6-level) extra payload is still fully scrubbed, not just capped', () => {
			const event = scrubSentryEvent({
				extra: { a: { b: { c: { d: { e: { f: 'jane@example.com' } } } } } }
			});
			expect(
				(
					event.extra as {
						a: { b: { c: { d: { e: { f: string } } } } };
					}
				).a.b.c.d.e.f
			).toBe('[redacted-email]');
		});
	});

	// ── Review round 2, finding 5: Date objects and other non-plain objects ──
	describe('non-plain-object values', () => {
		test('preserves a Date as an ISO string rather than collapsing it to {}', () => {
			const when = new Date('2026-11-11T03:19:13.964Z');
			const event = scrubSentryEvent({ extra: { when } });
			expect((event.extra as { when: unknown }).when).toBe('2026-11-11T03:19:13.964Z');
		});

		test('passes a RegExp through unchanged rather than destructuring it', () => {
			const pattern = /abc/gi;
			const event = scrubSentryEvent({ extra: { pattern } });
			expect((event.extra as { pattern: unknown }).pattern).toBe(pattern);
		});
	});

	// ── EXEMPT_KEYS: structural fields that must survive byte-for-byte ──
	describe('exempt structural fields', () => {
		test('leaves event_id, trace_id, span_id, timestamps, release, environment, sdk and platform untouched', () => {
			const event = scrubSentryEvent({
				event_id: 'abc123def456',
				timestamp: 1_700_000_000,
				start_timestamp: 1_700_000_000,
				release: 'mutuvia@0.4.0',
				environment: 'production',
				platform: 'javascript',
				sdk: { name: 'sentry.javascript.sveltekit', version: '10.46.0' },
				contexts: {
					trace: {
						trace_id: 'deadbeefdeadbeefdeadbeefdeadbeef',
						span_id: 'deadbeefdeadbeef'
					}
				}
			});
			expect(event.event_id).toBe('abc123def456');
			expect(event.timestamp).toBe(1_700_000_000);
			expect(event.release).toBe('mutuvia@0.4.0');
			expect(event.environment).toBe('production');
			expect(event.platform).toBe('javascript');
			expect(event.sdk).toEqual({ name: 'sentry.javascript.sveltekit', version: '10.46.0' });
			expect((event.contexts as { trace: { trace_id: string } }).trace.trace_id).toBe(
				'deadbeefdeadbeefdeadbeefdeadbeef'
			);
		});

		test('exception.type is NOT exempt (it can carry a custom, PII-bearing message)', () => {
			const event = scrubSentryEvent({
				exception: { values: [{ type: 'ContactError for jane@example.com' }] }
			});
			expect(event.exception?.values?.[0]?.type).toBe('ContactError for [redacted-email]');
		});
	});

	describe('user', () => {
		test('keeps only an opaque id when one is set, dropping email/username/ip_address', () => {
			const event = scrubSentryEvent({
				user: { id: 'user-123', email: 'jane@example.com', username: 'jane', ip_address: '1.2.3.4' }
			});
			expect(event.user).toEqual({ id: 'user-123' });
		});

		test('drops user entirely when there is no id', () => {
			const event = scrubSentryEvent({ user: { email: 'jane@example.com' } });
			expect(event.user).toBeUndefined();
			expect('user' in event).toBe(false);
		});
	});

	describe('request.cookies / request.data / sensitive headers', () => {
		test('strips cookies and data entirely, not just redacts them', () => {
			const event = scrubSentryEvent({
				request: {
					url: 'https://app.test/api/auth/sign-in/email-otp',
					cookies: { 'better-auth.session_token': 'abc.def.ghi' },
					data: { email: 'jane@example.com', otp: '123456' }
				}
			});
			expect(event.request?.cookies).toBeUndefined();
			expect(event.request?.data).toBeUndefined();
			expect('cookies' in (event.request ?? {})).toBe(false);
			expect('data' in (event.request ?? {})).toBe(false);
		});

		test('drops the Cookie and Authorization headers entirely (case-insensitive)', () => {
			const event = scrubSentryEvent({
				request: {
					headers: {
						Cookie: 'better-auth.session_token=abc.def.ghi',
						authorization: 'Bearer secret-token',
						'User-Agent': 'TestAgent/1.0'
					}
				}
			});
			expect(event.request?.headers).toEqual({ 'User-Agent': 'TestAgent/1.0' });
		});
	});

	test('reviewer regression: a synthetic event with PII in every covered field comes back fully scrubbed', () => {
		const event = scrubSentryEvent({
			// Deliberately does NOT contain the substring "abc123" used below
			// as the PII-bearing dynamic id — event_id is expected to survive
			// untouched, so it must not collide with what we assert is gone.
			event_id: 'eid-999888777',
			timestamp: 1_700_000_000,
			release: 'mutuvia@0.4.0',
			message: 'top-level jane@example.com',
			logentry: { message: 'logentry +31612345678', params: ['jane@example.com'] },
			exception: {
				values: [
					{
						type: 'ContactError jane@example.com',
						value: 'value +31612345678',
						stacktrace: {
							frames: [{ filename: 'app.js', lineno: 10, vars: { phone: '+31612345678' } }]
						}
					}
				]
			},
			contexts: {
				custom: { email: 'jane@example.com' },
				trace: { trace_id: 'deadbeefdeadbeefdeadbeefdeadbeef', data: { note: 'jane@example.com' } }
			},
			spans: [
				{
					description: 'GET /send/abc123',
					data: { 'http.url': '/send/abc123?to=jane@example.com' }
				}
			],
			transaction_info: { note: 'jane@example.com' },
			user: { id: 'u1', email: 'jane@example.com', username: 'jane', ip_address: '1.2.3.4' },
			request: {
				url: 'https://app.test/send/abc123',
				cookies: { session: 'secret' },
				data: { email: 'jane@example.com' },
				headers: { Cookie: 'secret', Authorization: 'Bearer x' }
			}
		});

		const serialized = JSON.stringify(event);
		expect(serialized).not.toContain('jane@example.com');
		expect(serialized).not.toContain('31612345678');
		expect(serialized).not.toContain('abc123');
		expect(serialized).not.toContain('"secret"');
		expect(event.user).toEqual({ id: 'u1' });
		expect(event.request?.cookies).toBeUndefined();
		expect(event.request?.data).toBeUndefined();
		expect(event.request?.headers).toEqual({});
		// Structural fields survive exactly.
		expect(event.event_id).toBe('eid-999888777');
		expect(event.timestamp).toBe(1_700_000_000);
		expect(event.release).toBe('mutuvia@0.4.0');
		expect((event.contexts as { trace: { trace_id: string } }).trace.trace_id).toBe(
			'deadbeefdeadbeefdeadbeefdeadbeef'
		);
	});
});
