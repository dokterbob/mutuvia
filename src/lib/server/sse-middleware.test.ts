// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, it, expect } from 'vitest';
import { isStreamingEndpoint } from './sse-middleware';

describe('isStreamingEndpoint', () => {
	describe('given the SSE events path', () => {
		it('returns true for /api/events', () => {
			expect(isStreamingEndpoint('/api/events')).toBe(true);
		});
	});

	describe('given non-streaming paths', () => {
		it('returns false for /api/push/subscribe', () => {
			expect(isStreamingEndpoint('/api/push/subscribe')).toBe(false);
		});

		it('returns false for /api/push/unsubscribe', () => {
			expect(isStreamingEndpoint('/api/push/unsubscribe')).toBe(false);
		});

		it('returns false for /api/auth/session', () => {
			expect(isStreamingEndpoint('/api/auth/session')).toBe(false);
		});

		it('returns false for /home', () => {
			expect(isStreamingEndpoint('/home')).toBe(false);
		});

		it('returns false for /api/events/extra (prefix match should not apply)', () => {
			expect(isStreamingEndpoint('/api/events/extra')).toBe(false);
		});
	});
});
