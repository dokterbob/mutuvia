/**
 * Validates that all locales declared in project.inlang/settings.json have a corresponding
 * messages/<locale>.json file and that every file has exactly the same keys as the base locale.
 * Also reports any messages/*.json files that are not declared in settings.json.
 * Run via: bun scripts/check-translations.ts
 * Exits with code 1 if any keys are missing or extra, or if the locale lists are out of sync.
 */

import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

const root = join(import.meta.dir, '..');
const settingsPath = join(root, 'project.inlang', 'settings.json');
const settings = JSON.parse(readFileSync(settingsPath, 'utf-8'));
const baseLocale: string = settings.baseLocale;
const settingsLocales: string[] = settings.locales;

if (!baseLocale) {
	console.error('[check-translations] baseLocale not found in project.inlang/settings.json');
	process.exit(1);
}
if (!Array.isArray(settingsLocales) || settingsLocales.length === 0) {
	console.error('[check-translations] locales not found in project.inlang/settings.json');
	process.exit(1);
}

const dir = join(root, 'messages');
let hasError = false;

// Load keys for each locale declared in settings, reporting missing files.
const locales: Record<string, string[]> = {};
for (const locale of settingsLocales) {
	const filePath = join(dir, `${locale}.json`);
	try {
		const data = JSON.parse(readFileSync(filePath, 'utf-8'));
		locales[locale] = Object.keys(data);
	} catch {
		console.error(
			`[check-translations] ${locale}: messages/${locale}.json not found (declared in settings.json)`
		);
		hasError = true;
	}
}

// Report any messages/*.json files not declared in settings.json.
const settingsLocaleSet = new Set(settingsLocales);
for (const file of readdirSync(dir).filter((f) => f.endsWith('.json'))) {
	const locale = file.replace('.json', '');
	if (!settingsLocaleSet.has(locale)) {
		console.error(
			`[check-translations] messages/${file} is not declared in project.inlang/settings.json`
		);
		hasError = true;
	}
}

// Validate the base locale file before comparing other locales against it.
const baseKeys = locales[baseLocale];
if (!baseKeys || baseKeys.length === 0) {
	console.error(
		`[check-translations] Base locale messages/${baseLocale}.json is missing or empty`
	);
	process.exit(1);
}

const baseKeySet = new Set(baseKeys);
const sortedLocales = settingsLocales.filter((l) => l !== baseLocale).sort();

for (const locale of sortedLocales) {
	if (!(locale in locales)) continue; // missing file already reported above

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
	console.log(`[check-translations] All ${settingsLocales.length} locales are in sync.`);
}
