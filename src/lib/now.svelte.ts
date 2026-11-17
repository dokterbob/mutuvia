// SPDX-License-Identifier: AGPL-3.0-or-later
//
// A shared reactive clock for live countdowns. Reading `now.current` inside
// a template, `$derived` or `$effect` returns `Date.now()` and re-runs that
// reader once a second. A single `setInterval` backs every reader and only
// runs while at least one is subscribed: `createSubscriber` starts it on the
// first tracked read and clears it once the last subscribing effect is torn
// down. Reads outside a tracking context (event handlers, SSR) just return
// the current time without starting the timer — so this holds no per-request
// state and is safe to import on the server.

import { createSubscriber } from 'svelte/reactivity';

class Now {
	#subscribe = createSubscriber((update) => {
		const interval = setInterval(update, 1000);
		return () => clearInterval(interval);
	});

	/** The current time in epoch milliseconds; reactive (ticks every second). */
	get current(): number {
		this.#subscribe();
		return Date.now();
	}
}

export const now = new Now();
