// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, it } from 'vitest';

describe('POST /api/push/subscribe', () => {
	it('returns 401 when unauthenticated');
	it('returns 400 when endpoint is missing');
	it('returns 400 when keys are missing');
	it('stores the subscription and returns 201 with an id');
	it('is idempotent — re-subscribing the same endpoint does not create a duplicate');
});

describe('POST /api/push/unsubscribe', () => {
	it('returns 401 when unauthenticated');
	it('removes the subscription and returns 200');
	it('returns 200 when endpoint was not found (idempotent)');
});
