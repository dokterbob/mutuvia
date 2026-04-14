<script lang="ts">
	import './layout.css';
	import '@fontsource-variable/noto-sans';
	import { onMount } from 'svelte';
	import { navigating, page } from '$app/state';
	import { Toaster } from '$lib/components/ui/sonner';

	let { data, children } = $props();

	const ogImage = $derived(`${page.url.origin}/screenshots/desktop.png`);

	onMount(() => {
		document.body.classList.add('hydrated');
	});
</script>

<svelte:head>
	<meta property="og:image" content={ogImage} />
	<meta property="og:type" content="website" />
	<meta property="og:site_name" content={data.appName} />
	<meta name="twitter:card" content="summary_large_image" />
	<meta name="twitter:image" content={ogImage} />
</svelte:head>

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
