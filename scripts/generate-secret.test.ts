// SPDX-License-Identifier: AGPL-3.0-or-later

import { describe, test, expect } from 'vitest';
import { generateSecret } from './generate-secret';
import { BETTER_AUTH_SECRET_PLACEHOLDER } from '../src/lib/config';

describe('generateSecret', () => {
	test('Given no arguments, When called → returns a string at least 32 characters long', () => {
		// validateConfig() in src/lib/config.ts requires BETTER_AUTH_SECRET to
		// be at least 32 characters in production.
		expect(generateSecret().length).toBeGreaterThanOrEqual(32);
	});

	test('Given no arguments, When called → returns base64url-alphabet characters only', () => {
		// base64url: A-Z, a-z, 0-9, '-', '_' — no padding, no '+' or '/' (which
		// would need escaping/quoting if pasted into a shell or .env file).
		expect(generateSecret()).toMatch(/^[A-Za-z0-9_-]+$/);
	});

	test('Given no arguments, When called twice → returns two different secrets', () => {
		expect(generateSecret()).not.toBe(generateSecret());
	});

	test('Given no arguments, When called → never returns the .env.example placeholder', () => {
		expect(generateSecret()).not.toBe(BETTER_AUTH_SECRET_PLACEHOLDER);
	});
});
