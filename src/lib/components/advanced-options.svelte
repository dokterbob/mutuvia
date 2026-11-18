<script lang="ts">
	// Collapsible "Advanced options" box shared by the Send and Receive create
	// forms. A native <details> so it works without JS and keeps its fields in
	// the form (a closed <details> still submits its inputs).
	import type { Snippet } from 'svelte';
	import * as m from '$lib/paraglide/messages.js';

	let {
		open = $bindable(false),
		class: className = '',
		children
	}: { open?: boolean; class?: string; children: Snippet } = $props();
</script>

<details class={className} bind:open>
	<summary class="cursor-pointer text-sm text-muted-foreground select-none">
		{m.advanced_options()}
	</summary>
	<div class="mt-3 rounded-lg border bg-muted/40 p-4">
		{@render children()}
	</div>
</details>
