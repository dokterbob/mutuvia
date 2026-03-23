<script lang="ts">
	import { goto } from '$app/navigation';
	import * as m from '$lib/paraglide/messages.js';
	import { Button } from '$lib/components/ui/button';
	import { IconArrowRight, IconCheck } from '@tabler/icons-svelte';
</script>

<div class="flex flex-1 flex-col items-center justify-center text-center">
	<div
		class="mb-5 flex h-20 w-20 items-center justify-center rounded-full bg-[#2D4A32] shadow-lg shadow-[#2D4A32]/25"
	>
		<IconCheck class="h-9 w-9 text-white" stroke={2.5} />
	</div>
	<h1 class="mb-2.5 font-serif text-[26px] font-semibold text-[#1E2820]">
		{m.verified_title()} ✓
	</h1>
	<p class="mb-8 text-[15px] font-light text-[#3A4A3D]">
		{m.verified_body()}
	</p>
	<Button
		class="w-full rounded-xl bg-[#2D4A32] py-6 text-base font-medium text-white hover:bg-[#3D6145]"
		onclick={() => goto('/onboarding/intro1')}
	>
		{m.verified_cta()}
		<IconArrowRight class="ml-2 h-4 w-4" />
	</Button>
</div>
