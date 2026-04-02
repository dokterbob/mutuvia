// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, it } from 'vitest';

describe('settlement → notification fanout', () => {
	it('emits qr_completed via SSE registry for the initiating user after accept');
	it('emits qr_completed via SSE registry for the accepting user after accept');
	it('calls sendPushToUser for the initiating user');
	it('does NOT call sendPushToUser for the accepting user (they are present)');
	it('settlement still completes atomically if sendPushToUser throws');
	it('emits qr_declined to initiator when the decline action is called');
});
