// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Guards against package.json's patchedDependencies and
// .github/dependabot.yml's bun-ecosystem `ignore` list drifting apart.
// patches/*.patch files are pinned to one exact dependency version (they
// patch a bug in that version's own source) — a Dependabot PR bumping a
// patched dependency would either apply a now-stale patch to a different
// version (bun-git-hooks: silently stops applying, exits 0 — see the
// dependabot.yml comment) or fail the install outright, without anyone
// reviewing whether the patch is still needed/correct. Every patched
// dependency must therefore be excluded from automatic bumps.
//
// This is deliberately a small, dependency-free line parser (no `yaml`/
// `js-yaml` — neither is a direct dependency of this project) rather than a
// real YAML parse: it only needs to find `dependency-name: '...'` entries
// inside the `package-ecosystem: 'bun'` block of a file this repo authors
// and controls, not parse arbitrary YAML.

import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

function patchedDependencyNames(): string[] {
	const pkg = JSON.parse(
		readFileSync(join(import.meta.dirname, '..', 'package.json'), 'utf-8')
	) as {
		patchedDependencies?: Record<string, string>;
	};
	// Keys look like "bun-git-hooks@0.3.1" — strip the trailing @version.
	return Object.keys(pkg.patchedDependencies ?? {}).map((key) => key.replace(/@[^@]+$/, ''));
}

function dependabotBunIgnoreNames(): string[] {
	const yaml = readFileSync(join(import.meta.dirname, '..', '.github', 'dependabot.yml'), 'utf-8');
	// Split into per-ecosystem blocks on each top-level "  - package-ecosystem:" line.
	const blocks = yaml.split(/\n(?= {2}- package-ecosystem:)/);
	const bunBlock = blocks.find((block) => /package-ecosystem:\s*'bun'/.test(block));
	if (!bunBlock) throw new Error("No package-ecosystem: 'bun' block found in dependabot.yml");

	const names: string[] = [];
	for (const match of bunBlock.matchAll(/dependency-name:\s*'([^']+)'/g)) {
		names.push(match[1]);
	}
	return names;
}

describe('dependabot bun ignore list vs. package.json patchedDependencies', () => {
	test('Given a patched dependency, When checking dependabot.yml, then it is in the bun ecosystem ignore list', () => {
		const patched = patchedDependencyNames();
		// Sanity check the parser/fixture itself hasn't silently gone empty.
		expect(patched.length).toBeGreaterThan(0);

		const ignored = dependabotBunIgnoreNames();
		for (const name of patched) {
			expect(ignored).toContain(name);
		}
	});

	test('Given the dependabot bun ignore list, When checking package.json, then every ignored name is an actual patched dependency', () => {
		// Catches the opposite drift too: an ignore entry left behind after a
		// patch is removed, which would silently block that dependency's
		// updates forever for no reason.
		const patched = patchedDependencyNames();
		const ignored = dependabotBunIgnoreNames();
		for (const name of ignored) {
			expect(patched).toContain(name);
		}
	});
});
