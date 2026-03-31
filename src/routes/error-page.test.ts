// SPDX-License-Identifier: AGPL-3.0-or-later

import { describe, expect, test } from 'vitest';
import en from '../../messages/en.json';
import pt from '../../messages/pt.json';
import nl from '../../messages/nl.json';
import de from '../../messages/de.json';

const ERROR_KEYS = [
	'error_not_found_title',
	'error_not_found_body',
	'error_server_title',
	'error_server_body',
	'error_go_home',
	'error_try_again'
] as const;

type Messages = Record<string, string>;

describe('error page i18n', () => {
	test.each([
		['en', en as Messages],
		['pt', pt as Messages],
		['nl', nl as Messages],
		['de', de as Messages]
	])('%s has all error page keys with non-empty values', (locale, messages) => {
		for (const key of ERROR_KEYS) {
			expect(messages[key], `key "${key}" is missing or empty in ${locale}`).toBeTruthy();
		}
	});
});
