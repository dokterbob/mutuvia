// SPDX-License-Identifier: AGPL-3.0-or-later

import { describe, test, expect, vi, beforeEach } from 'vitest';

const { mockConfig } = vi.hoisted(() => ({
	mockConfig: {
		qrTtlSeconds: 259_200, // 3 days — matches the "3d" preset exactly by default
		reusableQrTtlSeconds: null as number | null, // "never" — matches the "never" preset by default
		qrMaxTtlSeconds: null as number | null
	}
}));

vi.mock('$lib/config', () => ({ config: mockConfig }));

import { isExpired, getExpiryOptions, resolveExpiryPreset } from './qr-expiry';

function resetConfig() {
	mockConfig.qrTtlSeconds = 259_200;
	mockConfig.reusableQrTtlSeconds = null;
	mockConfig.qrMaxTtlSeconds = null;
}

describe('isExpired', () => {
	beforeEach(resetConfig);

	test('given expiresAt is null (never expires), when checked, then is not expired', () => {
		expect(isExpired(null)).toBe(false);
	});

	test('given expiresAt is in the future, when checked, then is not expired', () => {
		expect(isExpired(new Date(Date.now() + 1000))).toBe(false);
	});

	test('given expiresAt is in the past, when checked, then is expired', () => {
		expect(isExpired(new Date(Date.now() - 1000))).toBe(true);
	});

	// The boundary the task description calls out explicitly: `expiresAt <=
	// now` is expired. Passing `now` in explicitly makes the boundary exact
	// rather than racing the real clock.
	test('given expiresAt exactly equals now, when checked, then is expired (<=, not <)', () => {
		const now = new Date();
		expect(isExpired(now, now)).toBe(true);
	});

	test('given expiresAt is one millisecond after now, when checked, then is not expired', () => {
		const now = new Date();
		expect(isExpired(new Date(now.getTime() + 1), now)).toBe(false);
	});
});

describe('getExpiryOptions', () => {
	beforeEach(resetConfig);

	test('given reusable=false, when listed, then never offers "never"', () => {
		const options = getExpiryOptions(false);
		expect(options.map((o) => o.key)).not.toContain('never');
	});

	test('given reusable=true and no QR_MAX_TTL_SECONDS, when listed, then offers "never"', () => {
		const options = getExpiryOptions(true);
		expect(options.map((o) => o.key)).toContain('never');
	});

	test('given QR_MAX_TTL_SECONDS is set, when listed (even reusable), then "never" is removed', () => {
		mockConfig.qrMaxTtlSeconds = 2_592_000; // 30d
		mockConfig.reusableQrTtlSeconds = 86_400; // keep the default consistent with the max
		const options = getExpiryOptions(true);
		expect(options.map((o) => o.key)).not.toContain('never');
	});

	test('given QR_MAX_TTL_SECONDS is set, when listed, then presets above it are removed', () => {
		mockConfig.qrMaxTtlSeconds = 86_400; // 1d
		mockConfig.reusableQrTtlSeconds = 3_600;
		const options = getExpiryOptions(true);
		expect(options.map((o) => o.key)).toEqual(expect.arrayContaining(['1h', '1d']));
		expect(options.map((o) => o.key)).not.toEqual(
			expect.arrayContaining(['3d', '1w', '30d', 'never'])
		);
	});

	test('given the operator default matches a preset exactly, when listed, then that preset is marked isDefault and no synthetic "default" option is added', () => {
		mockConfig.qrTtlSeconds = 259_200; // exactly "3d"
		const options = getExpiryOptions(false);
		expect(options.find((o) => o.key === 'default')).toBeUndefined();
		expect(options.find((o) => o.key === '3d')?.isDefault).toBe(true);
	});

	test('given the operator default does not match any preset, when listed, then a synthetic "default" option is appended and marked isDefault', () => {
		mockConfig.qrTtlSeconds = 12_345; // matches nothing
		const options = getExpiryOptions(false);
		const defaultOption = options.find((o) => o.key === 'default');
		expect(defaultOption).toMatchObject({ seconds: 12_345, isDefault: true });
		expect(options.filter((o) => o.isDefault)).toHaveLength(1);
	});

	test('given reusable=true and REUSABLE_QR_TTL_SECONDS is unset (never), when listed, then "never" is marked isDefault with no synthetic option', () => {
		const options = getExpiryOptions(true);
		expect(options.find((o) => o.key === 'never')?.isDefault).toBe(true);
		expect(options.find((o) => o.key === 'default')).toBeUndefined();
	});
});

describe('resolveExpiryPreset', () => {
	beforeEach(resetConfig);

	test('given no preset key (missing field), when resolved, then falls back to the operator default', () => {
		const result = resolveExpiryPreset(null, false);
		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.expiresAt?.getTime()).toBeCloseTo(Date.now() + 259_200_000, -2);
		}
	});

	test('given an unknown preset key, when resolved, then rejects with an error (not a silent fallback)', () => {
		const result = resolveExpiryPreset('bogus', false);
		expect(result).toMatchObject({ ok: false });
	});

	test('given "never" on a one-time (non-reusable) QR, when resolved, then rejects', () => {
		const result = resolveExpiryPreset('never', false);
		expect(result).toMatchObject({ ok: false });
	});

	test('given "never" on a reusable QR, when resolved, then succeeds with a null expiresAt', () => {
		const result = resolveExpiryPreset('never', true);
		expect(result).toEqual({ ok: true, expiresAt: null });
	});

	test('given a preset above QR_MAX_TTL_SECONDS, when resolved, then rejects', () => {
		mockConfig.qrMaxTtlSeconds = 86_400; // 1d
		mockConfig.reusableQrTtlSeconds = 3_600;
		const result = resolveExpiryPreset('1w', true);
		expect(result).toMatchObject({ ok: false });
	});

	test('given a valid preset within bounds, when resolved, then succeeds with the matching expiresAt', () => {
		const result = resolveExpiryPreset('1h', true);
		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.expiresAt?.getTime()).toBeCloseTo(Date.now() + 3_600_000, -2);
		}
	});

	test('given the synthetic "default" key, when resolved, then succeeds with the operator default', () => {
		mockConfig.qrTtlSeconds = 12_345; // matches nothing, so "default" exists as its own option
		const result = resolveExpiryPreset('default', false);
		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.expiresAt?.getTime()).toBeCloseTo(Date.now() + 12_345_000, -2);
		}
	});
});
