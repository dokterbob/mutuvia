/**
 * Validates that all locales in messages/ have exactly the same keys as the base locale.
 * The base locale is read from project.inlang/settings.json.
 * Run via: bun scripts/check-translations.ts
 * Exits with code 1 if any keys are missing or extra.
 */

import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

const root = join(import.meta.dir, '..');
const settingsPath = join(root, 'project.inlang', 'settings.json');
const settings = JSON.parse(readFileSync(settingsPath, 'utf-8'));
const baseLocale: string = settings.baseLocale;

if (!baseLocale) {
	console.error('[check-translations] baseLocale not found in project.inlang/settings.json');
	process.exit(1);
}

const dir = join(root, 'messages');
const files = readdirSync(dir).filter((f) => f.endsWith('.json'));

const locales: Record<string, string[]> = {};
for (const file of files) {
	const locale = file.replace('.json', '');
	const data = JSON.parse(readFileSync(join(dir, file), 'utf-8'));
	locales[locale] = Object.keys(data);
}

const baseKeys = locales[baseLocale];

if (!baseKeys) {
	console.error(
		`[check-translations] Base locale file messages/${baseLocale}.json not found or empty`
	);
	process.exit(1);
}

const baseKeySet = new Set(baseKeys);
const sortedLocales = Object.keys(locales).sort();
let hasError = false;

for (const locale of sortedLocales) {
	if (locale === baseLocale) continue;

	const keys = locales[locale];
	const keySet = new Set(keys);
	const missing = baseKeys.filter((k) => !keySet.has(k));
	const extra = keys.filter((k) => !baseKeySet.has(k));

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
