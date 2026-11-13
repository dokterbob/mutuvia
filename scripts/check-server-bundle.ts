// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Post-build guard, run as part of `bun run build`: fails the build if the
// server bundle contains Better Auth's single-slot AsyncLocalStorage polyfill.
//
// Why: svelte-adapter-bun@1.0.1 re-bundles the server with rolldown, and
// without `platform: "node"` rolldown defaults to the browser platform. That
// resolves @better-auth/core's `./async_hooks` export through its `browser`
// condition to `async_hooks/pure.index.mjs` — a polyfill holding ONE global
// "current request" slot. Concurrent requests then overwrite each other's
// request state and fail with HTTP 500 ("No request state found … within a
// runWithRequestState callback"). `patches/svelte-adapter-bun@1.0.1.patch`
// adds `platform: "node"`; Bun only applies a patch to that exact version, so
// a version bump would silently drop it. This check catches that. See
// README → "Deployment" → "Bun adapter patch".

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/** Distinctive class name in @better-auth/core/dist/async_hooks/pure.index.mjs. */
export const POLYFILL_MARKER = 'AsyncLocalStoragePolyfill';

/** Returns the `.js` files under `dir` (recursively) that contain the polyfill. */
export function findPolyfillFiles(dir: string): string[] {
	const hits: string[] = [];
	for (const entry of readdirSync(dir)) {
		const path = join(dir, entry);
		if (statSync(path).isDirectory()) {
			hits.push(...findPolyfillFiles(path));
		} else if (entry.endsWith('.js') && readFileSync(path, 'utf-8').includes(POLYFILL_MARKER)) {
			hits.push(path);
		}
	}
	return hits;
}

if (import.meta.main) {
	const dir = process.argv[2] ?? 'build/server';
	const hits = findPolyfillFiles(dir);
	if (hits.length > 0) {
		console.error(
			[
				`✗ ${dir} bundles Better Auth's browser AsyncLocalStorage polyfill (${POLYFILL_MARKER}) in:`,
				...hits.map((h) => `    ${h}`),
				'  Concurrent requests would share one request-state slot and fail with HTTP 500.',
				'  Is patches/svelte-adapter-bun@<version>.patch (platform: "node") still applied to the',
				'  installed svelte-adapter-bun version? See README → "Deployment" → "Bun adapter patch".'
			].join('\n')
		);
		process.exit(1);
	}
	console.log(`✓ ${dir}: no browser AsyncLocalStorage polyfill bundled`);
}
