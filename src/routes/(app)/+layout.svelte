<script lang="ts">
	import InstallBanner from '$lib/components/install-banner.svelte';
	import { onMount } from 'svelte';
	import { sseManager } from '$lib/sse-client';

	let { children } = $props();

	onMount(() => {
		sseManager.connect();
		return () => sseManager.disconnect();
	});
</script>

<div class="mx-auto min-h-dvh w-full max-w-md bg-background">
	{@render children()}
</div>

<InstallBanner />
