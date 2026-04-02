// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, it } from 'vitest';

describe('GET /api/events', () => {
	it('returns 401 when no session cookie is present');
	it('returns 200 text/event-stream for an authenticated user');
	it('emits a qr_completed event after settlement is written to DB');
	it('emits a qr_declined event after decline is written to DB');
	it('does not re-emit an event whose ID matches Last-Event-ID on reconnect');
	it('removes the connection from the registry after the client disconnects');
	it('supports two concurrent connections for the same user');
});
