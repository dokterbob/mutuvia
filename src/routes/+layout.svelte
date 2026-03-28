<script lang="ts">
	import './layout.css';
	import '@fontsource-variable/noto-sans';
	import { onMount } from 'svelte';

	let { children } = $props();

	onMount(() => {
		document.body.classList.add('hydrated');
	});
</script>

<div class="min-h-dvh bg-background font-sans antialiased">
	{@render children()}
</div>
