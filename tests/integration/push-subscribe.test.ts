// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, it } from 'vitest';

describe('POST /api/push/subscribe', () => {
	it.todo('returns 401 when unauthenticated');
	it.todo('returns 400 when endpoint is missing');
	it.todo('returns 400 when keys are missing');
	it.todo('stores the subscription and returns 201 with an id');
	it.todo('is idempotent — re-subscribing the same endpoint does not create a duplicate');
});

describe('POST /api/push/unsubscribe', () => {
	it.todo('returns 401 when unauthenticated');
	it.todo('removes the subscription and returns 200');
	it.todo('returns 200 when endpoint was not found (idempotent)');
});
