<script lang="ts">
	import * as m from '$lib/paraglide/messages.js';
	import { goto } from '$app/navigation';
	import QrScanner from '$lib/components/qr-scanner.svelte';
	import ArrowLeftIcon from '@lucide/svelte/icons/arrow-left';

	let invalidMessage: string | undefined = $state();
	let invalidTimeout: ReturnType<typeof setTimeout> | undefined;

	function handleScan(data: string) {
		try {
			const url = new URL(data);
			const match = url.pathname.match(/^\/accept\/(.+)$/);
			if (match) {
				goto(`/accept/${match[1]}`);
				return;
			}
		} catch {
			// Not a URL
		}

		invalidMessage = m.scan_invalid_qr();
		clearTimeout(invalidTimeout);
		invalidTimeout = setTimeout(() => {
			invalidMessage = undefined;
		}, 3000);
	}
</script>

<div class="flex min-h-dvh flex-col px-6 pt-14 pb-8">
	<div class="mb-5 flex items-center gap-3">
		<button
			class="flex h-9 w-9 items-center justify-center rounded-full border bg-muted"
			onclick={() => goto('/home')}
			aria-label="Back"
		>
			<ArrowLeftIcon class="h-4 w-4 text-muted-foreground" />
		</button>
		<h1 class="font-serif text-base">{m.scan_title()}</h1>
	</div>

	<QrScanner onScan={handleScan} />

	{#if invalidMessage}
		<div class="mt-4 rounded-xl bg-destructive/10 px-4 py-3 text-center text-sm text-destructive">
			{invalidMessage}
		</div>
	{/if}
</div>
