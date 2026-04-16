<script lang="ts">
	import InstallBanner from '$lib/components/install-banner.svelte';
	import WhatsNewDialog from '$lib/components/whats-new-dialog.svelte';
	import { onMount } from 'svelte';
	import { sseManager } from '$lib/sse-client';
	import { toast } from 'svelte-sonner';
	import { page } from '$app/state';
	import * as m from '$lib/paraglide/messages.js';

	let { children, data } = $props();

	onMount(() => {
		sseManager.connect();
		const unsub = sseManager.on({
			onQrCompleted: (e) => {
				// Send/receive pages handle completion with their own step transitions — no toast needed
				const path = page.url.pathname;
				if (path.includes('/send') || path.includes('/receive')) return;
				toast.success(
					m.toast_transaction_accepted({ name: e.otherName, amount: e.formattedAmount })
				);
			},
			onQrDeclined: () => {
				const path = page.url.pathname;
				if (path.includes('/send') || path.includes('/receive')) return;
				toast.error(m.toast_transaction_declined());
			}
		});
		return () => {
			unsub();
			sseManager.disconnect();
		};
	});
</script>

<div class="mx-auto min-h-dvh w-full max-w-md bg-background">
	{@render children()}
</div>

<InstallBanner />
<WhatsNewDialog
	appVersion={data.appVersion}
	lastSeenVersion={data.appUser?.lastSeenVersion ?? null}
/>
