// SPDX-License-Identifier: AGPL-3.0-or-later

import { describe, expect, test } from 'vitest';
import { DEFAULT_SENTRY_TRACES_SAMPLE_RATE, parseSentryTracesSampleRate } from './sentry-config';

describe('parseSentryTracesSampleRate', () => {
	test.each([undefined, ''])('defaults to %s -> 0.1 when unset/empty', (raw) => {
		expect(parseSentryTracesSampleRate(raw)).toBe(DEFAULT_SENTRY_TRACES_SAMPLE_RATE);
	});

	test.each(['0', '0.1', '0.5', '1'])('accepts in-range value %s', (raw) => {
		expect(parseSentryTracesSampleRate(raw)).toBe(Number(raw));
	});

	test.each(['-0.1', '1.1', '2', 'not-a-number', 'NaN'])(
		'rejects out-of-range/invalid value %s',
		(raw) => {
			expect(() => parseSentryTracesSampleRate(raw)).toThrow(/PUBLIC_SENTRY_TRACES_SAMPLE_RATE/);
		}
	);
});
