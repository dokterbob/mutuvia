// SPDX-License-Identifier: AGPL-3.0-or-later

// Guards against the QR scanner's self-hosted WASM module (see
// vite.config.ts's ZXING_WASM_SOURCE comment and
// src/lib/components/qr-scanner.svelte) going stale after a dependency bump.
// vite.config.ts copies node_modules/zxing-wasm/dist/reader/zxing_reader.wasm
// to static/wasm/zxing_reader.wasm at config-load time — this file runs under
// vitest's "server" project, which extends vite.config.ts, so that copy has
// already happened by the time these tests run (same as `bun run dev`/`build`).

import { describe, expect, test } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { ZXING_WASM_SHA256, ZXING_WASM_VERSION } from 'barcode-detector/ponyfill';

function sha256(path: string): string {
	return createHash('sha256').update(readFileSync(path)).digest('hex');
}

const NODE_MODULES_WASM = 'node_modules/zxing-wasm/dist/reader/zxing_reader.wasm';
const SERVED_WASM = 'static/wasm/zxing_reader.wasm';

describe('QR scanner WASM self-hosting', () => {
	test('barcode-detector@3.1.1 still expects zxing-wasm@3.0.1', () => {
		// If this ever fails after a dependency bump, re-verify (via
		// node_modules/barcode-detector/dist/es/ponyfill.js) which zxing-wasm
		// build variant ("reader" vs "full") the ponyfill actually loads, and
		// update ZXING_WASM_SOURCE/the served path in vite.config.ts and
		// qr-scanner.svelte to match before touching this assertion.
		expect(ZXING_WASM_VERSION).toBe('3.0.1');
	});

	test('the copy served at /wasm/zxing_reader.wasm matches the one in node_modules', () => {
		expect(existsSync(SERVED_WASM)).toBe(true);
		expect(sha256(SERVED_WASM)).toBe(sha256(NODE_MODULES_WASM));
	});

	test("node_modules/zxing-wasm matches barcode-detector/ponyfill's own expected hash", () => {
		// barcode-detector re-exports zxing-wasm's own build-time-computed
		// sha256 of the exact .wasm it expects to load (see ZXING_WASM_SHA256
		// in node_modules/barcode-detector/dist/es/ponyfill.js) — comparing
		// against it (rather than only against node_modules) catches a
		// corrupted/mismatched install, not just a stale copy.
		expect(sha256(NODE_MODULES_WASM)).toBe(ZXING_WASM_SHA256);
	});
});
