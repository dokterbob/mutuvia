<script lang="ts">
	import InstallBanner from '$lib/components/install-banner.svelte';
	let { children } = $props();
</script>

<div class="mx-auto min-h-dvh w-full max-w-md bg-background">
	{@render children()}
</div>

<InstallBanner />
