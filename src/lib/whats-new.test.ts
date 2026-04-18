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

	describe('when there are multiple changelog entries', () => {
		const v1 = { version: '0.3.0', content: () => 'C' };
		const v2 = { version: '0.2.0', content: () => 'B' };
		const v3 = { version: '0.1.0', content: () => 'A' };
		const entries = [v1, v2, v3];

		test('returns only entries newer than lastSeenVersion', () => {
			expect(getUnseenEntries('0.2.0', entries)).toEqual([v1]);
		});

		test('returns all entries when version predates the changelog', () => {
			expect(getUnseenEntries('0.0.1', entries)).toEqual(entries);
		});

		test('returns no entries when already on the latest version', () => {
			expect(getUnseenEntries('0.3.0', entries)).toHaveLength(0);
		});
	});
});
