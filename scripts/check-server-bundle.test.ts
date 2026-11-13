// SPDX-License-Identifier: AGPL-3.0-or-later

import { afterEach, describe, expect, test } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { POLYFILL_MARKER, findPolyfillFiles } from './check-server-bundle';

let dir: string;

function bundle(files: Record<string, string>): string {
	dir = mkdtempSync(join(tmpdir(), 'server-bundle-'));
	for (const [path, content] of Object.entries(files)) {
		mkdirSync(join(dir, path, '..'), { recursive: true });
		writeFileSync(join(dir, path), content);
	}
	return dir;
}

afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe('findPolyfillFiles', () => {
	describe('given a bundle that imports node:async_hooks', () => {
		test('reports nothing', () => {
			const out = bundle({
				'index.js': "import { AsyncLocalStorage } from 'node:async_hooks';",
				'chunks/hooks.server-abc.js': 'export const x = 1;'
			});
			expect(findPolyfillFiles(out)).toEqual([]);
		});
	});

	describe('given a chunk that bundles the browser polyfill', () => {
		test('reports that chunk', () => {
			const out = bundle({
				'index.js': 'export {};',
				'chunks/hooks.server-abc.js': `var ${POLYFILL_MARKER} = class { #current = void 0; };`
			});
			expect(findPolyfillFiles(out)).toEqual([join(out, 'chunks/hooks.server-abc.js')]);
		});
	});

	describe('given the marker only in a source map', () => {
		test('ignores non-.js files', () => {
			const out = bundle({ 'chunks/hooks.server-abc.js.map': POLYFILL_MARKER });
			expect(findPolyfillFiles(out)).toEqual([]);
		});
	});
});
