// SPDX-License-Identifier: AGPL-3.0-or-later

import { writable, derived, get } from 'svelte/store';
import en from './en';
import pt from './pt';
import nl from './nl';

export type Locale = 'en' | 'pt' | 'nl';

const translations: Record<Locale, Record<string, string>> = { en, pt, nl };

export const locale = writable<Locale>('en');

export const t = derived(locale, ($locale) => {
	return (key: string, params?: Record<string, string | number>): string => {
		let str = translations[$locale]?.[key] ?? translations.en[key] ?? key;
		if (params) {
			for (const [k, v] of Object.entries(params)) {
				str = str.replaceAll(`{${k}}`, String(v));
			}
		}
		return str;
	};
});

export function getTranslation(key: string, params?: Record<string, string | number>): string {
	return get(t)(key, params);
}

export const localeNames: Record<Locale, string> = {
	en: 'English',
	pt: 'Português',
	nl: 'Nederlands'
};
