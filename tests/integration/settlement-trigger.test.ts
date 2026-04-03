// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, it } from 'vitest';

describe('settlement → notification fanout', () => {
	it.todo('emits qr_completed via SSE registry for the initiating user after accept');
	it.todo('emits qr_completed via SSE registry for the accepting user after accept');
	it.todo('calls sendPushToUser for the initiating user');
	it.todo('does NOT call sendPushToUser for the accepting user (they are present)');
	it.todo('settlement still completes atomically if sendPushToUser throws');
	it.todo('emits qr_declined to initiator when the decline action is called');
});
