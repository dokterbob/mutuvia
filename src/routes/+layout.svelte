<script lang="ts">
	import './layout.css';
	import '@fontsource-variable/noto-sans';
	import favicon from '$lib/assets/favicon.svg';

	let { children } = $props();
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<meta name="theme-color" content="#2D4A32" />
</svelte:head>

<div class="min-h-dvh bg-background font-sans antialiased">
	{@render children()}
</div>
