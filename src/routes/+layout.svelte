<script lang="ts">
	import './layout.css';
	import '@fontsource-variable/noto-sans';
	import { onMount } from 'svelte';
	import { navigating } from '$app/state';
	import { Toaster } from '$lib/components/ui/sonner';

	let { children } = $props();

	onMount(() => {
		document.body.classList.add('hydrated');
	});
</script>

{#if navigating}
	<div
		class="pointer-events-none fixed inset-x-0 top-0 z-50 h-1 animate-pulse bg-[#2D4A32]"
		aria-hidden="true"
	></div>
{/if}

<div class="min-h-dvh bg-background font-sans antialiased">
	{@render children()}
</div>

<Toaster />
