/**
 * Validates that all locales in messages/ have exactly the same keys as the base locale (en).
 * Run via: bun scripts/check-translations.ts
 * Exits with code 1 if any keys are missing or extra.
 */

import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

const dir = join(import.meta.dir, '..', 'messages');
const files = readdirSync(dir).filter((f) => f.endsWith('.json'));

const locales: Record<string, string[]> = {};
for (const file of files) {
	const locale = file.replace('.json', '');
	const data = JSON.parse(readFileSync(join(dir, file), 'utf-8'));
	locales[locale] = Object.keys(data);
}

const baseLocale = 'en';
const baseKeys = locales[baseLocale];
let hasError = false;

for (const [locale, keys] of Object.entries(locales)) {
	if (locale === baseLocale) continue;

	const missing = baseKeys.filter((k) => !keys.includes(k));
	const extra = keys.filter((k) => !baseKeys.includes(k));

	if (missing.length > 0) {
		console.error(`[check-translations] ${locale}: missing keys: ${missing.join(', ')}`);
		hasError = true;
	}
	if (extra.length > 0) {
		console.error(`[check-translations] ${locale}: extra keys not in base: ${extra.join(', ')}`);
		hasError = true;
	}
}

if (hasError) {
	process.exit(1);
} else {
	console.log(`[check-translations] All ${Object.keys(locales).length} locales are in sync.`);
}
