<script lang="ts">
	import InstallBanner from '$lib/components/install-banner.svelte';
	import { onMount } from 'svelte';
	import { sseManager } from '$lib/sse-client';
	import { toast } from 'svelte-sonner';
	import * as m from '$lib/paraglide/messages.js';

	let { children } = $props();

	onMount(() => {
		sseManager.connect();
		const unsub = sseManager.on({
			onQrCompleted: (e) => {
				toast.success(
					m.toast_transaction_accepted({ name: e.otherName, amount: e.formattedAmount })
				);
			},
			onQrDeclined: () => {
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
