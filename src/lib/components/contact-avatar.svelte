<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script lang="ts">
	import * as Avatar from '$lib/components/ui/avatar';
	let { name, class: className = '' }: { name: string; class?: string } = $props();
	const initials = $derived(
		name
			.trim()
			.split(/\s+/)
			.slice(0, 2)
			.map((w) => w[0] ?? '')
			.join('')
			.toUpperCase() || '?'
	);
</script>

<Avatar.Root class="h-9 w-9 {className}">
	<Avatar.Fallback class="bg-[#2D4A32] text-xs font-medium text-white">{initials}</Avatar.Fallback>
</Avatar.Root>
