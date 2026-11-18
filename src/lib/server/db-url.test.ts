// SPDX-License-Identifier: AGPL-3.0-or-later

import { describe, test, expect } from 'vitest';
import { scrubDatabaseUrl } from './db-url';

describe('scrubDatabaseUrl', () => {
	test('given a URL with credentials, when scrubbed, then only host/port/db remain', () => {
		expect(scrubDatabaseUrl('postgres://mutuvia:s3cret@db.example.com:5432/mutuvia')).toBe(
			'db.example.com:5432/mutuvia'
		);
	});

	test('given a URL without an explicit port, when scrubbed, then the port is omitted', () => {
		expect(scrubDatabaseUrl('postgres://user:pass@localhost/mutuvia')).toBe('localhost/mutuvia');
	});

	test('given a URL with credentials, when scrubbed, then the password never appears in the result', () => {
		expect(scrubDatabaseUrl('postgres://mutuvia:s3cret@db.example.com:5432/mutuvia')).not.toContain(
			's3cret'
		);
	});

	test('given an unparsable value, when scrubbed, then a generic message is returned without the raw value', () => {
		const result = scrubDatabaseUrl('not a url with a s3cret inside');
		expect(result).toBe('(unable to parse DATABASE_URL for logging)');
		expect(result).not.toContain('s3cret');
	});
});
