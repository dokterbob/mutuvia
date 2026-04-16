// SPDX-License-Identifier: AGPL-3.0-or-later

import { describe, test, expect, vi } from 'vitest';

vi.mock('$lib/paraglide/messages.js', () => ({
	whats_new_v0_2_0: () => 'Feature A\nFeature B'
}));

const { getUnseenEntries, changelog } = await import('./whats-new.js');

describe('getUnseenEntries', () => {
	describe('when lastSeenVersion is null', () => {
		test('returns all changelog entries', () => {
			const result = getUnseenEntries(null);
			expect(result).toEqual(changelog);
		});
	});

	describe('when lastSeenVersion matches the current version', () => {
		test('returns no entries', () => {
			const result = getUnseenEntries('0.2.0');
			expect(result).toHaveLength(0);
		});
	});

	describe('when lastSeenVersion is not found in the changelog', () => {
		test('returns all entries for an old version', () => {
			const result = getUnseenEntries('0.1.0');
			expect(result).toEqual(changelog);
		});

		test('returns all entries for an unrecognised version string', () => {
			const result = getUnseenEntries('0.0.1');
			expect(result).toEqual(changelog);
		});
	});
});
