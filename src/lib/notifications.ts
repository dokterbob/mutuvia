// SPDX-License-Identifier: AGPL-3.0-or-later

// Discriminated union of all notification event types.
// Extend here as new types are added.

export type QrCompletedEvent = {
	type: 'qr_completed';
	id: string; // stable server-assigned UUID, used for dedup
	qrId: string;
	otherName: string;
	formattedAmount: string;
};

export type QrDeclinedEvent = {
	type: 'qr_declined';
	id: string;
	qrId: string;
};

export type BalanceChangedEvent = {
	type: 'balance_changed';
	id: string;
	newBalance: number; // integer cents
	formattedBalance: string;
};

export type NotificationEvent = QrCompletedEvent | QrDeclinedEvent | BalanceChangedEvent;

// Type guards
export function isQrEvent(e: NotificationEvent): e is QrCompletedEvent | QrDeclinedEvent {
	return e.type === 'qr_completed' || e.type === 'qr_declined';
}

// Handlers — callers register one per event type.
export type NotificationHandlers = {
	onQrCompleted?: (e: QrCompletedEvent) => void;
	onQrDeclined?: (e: QrDeclinedEvent) => void;
	onBalanceChanged?: (e: BalanceChangedEvent) => void;
};

// Bounded FIFO set for dedup — evicts oldest entries beyond cap.
export class SeenEventIds {
	private readonly cap: number;
	private readonly ids = new Set<string>();
	private readonly order: string[] = [];

	constructor(cap = 200) {
		this.cap = cap;
	}

	has(id: string): boolean {
		return this.ids.has(id);
	}

	add(id: string): void {
		if (this.ids.has(id)) return;
		if (this.ids.size >= this.cap) {
			const oldest = this.order.shift()!;
			this.ids.delete(oldest);
		}
		this.ids.add(id);
		this.order.push(id);
	}
}

// Dispatch a NotificationEvent to the appropriate handler.
// Returns false if the event was a duplicate (already in seenIds).
export function handleNotificationEvent(
	event: NotificationEvent,
	handlers: NotificationHandlers,
	seenIds: SeenEventIds
): boolean {
	if (seenIds.has(event.id)) return false;
	seenIds.add(event.id);

	switch (event.type) {
		case 'qr_completed':
			handlers.onQrCompleted?.(event);
			break;
		case 'qr_declined':
			handlers.onQrDeclined?.(event);
			break;
		case 'balance_changed':
			handlers.onBalanceChanged?.(event);
			break;
	}
	return true;
}
