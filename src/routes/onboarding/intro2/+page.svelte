<script lang="ts">
	import { goto } from '$app/navigation';
	import * as m from '$lib/paraglide/messages.js';
	import { Button } from '$lib/components/ui/button';
	import ArrowRightIcon from '@lucide/svelte/icons/arrow-right';
	import ArrowLeftIcon from '@lucide/svelte/icons/arrow-left';
</script>

<div class="flex flex-1 flex-col">
	<button
		class="mb-1.5 self-end text-[13px] text-[#6B7A6E] hover:text-[#1E2820]"
		onclick={() => goto('/onboarding/name')}
	>
		{m.intro2_skip()} ↗
	</button>

	<div class="mb-3 flex justify-center gap-1.5">
		<div class="h-2 w-2 rounded-full bg-[#7A9E7E]"></div>
		<div class="h-2 w-6 rounded bg-[#2D4A32]"></div>
		<div class="h-2 w-2 rounded-full bg-[#DDD8CE]"></div>
	</div>

	<div class="mb-5 flex justify-center">
		<div
			class="flex h-[150px] w-full max-w-[280px] items-center justify-center rounded-2xl border-[1.5px] border-dashed border-[#DDD8CE] bg-[#EDE7D9] text-[52px]"
		>
			⚖️
		</div>
	</div>

	<p class="mb-2.5 text-[10.5px] font-medium tracking-[0.2em] text-[#7A9E7E] uppercase">
		{m.intro2_eyebrow()}
	</p>
	<h1 class="mb-3.5 font-serif text-[28px] leading-tight font-semibold text-[#1E2820]">
		<!-- eslint-disable-next-line svelte/no-at-html-tags -->
		{@html m.intro2_title().replace(/normal|normaal/i, '<span class="text-[#2D4A32]">$&</span>')}
	</h1>
	<p class="mb-3.5 text-[15px] leading-relaxed font-light text-[#3A4A3D]">
		{m.intro2_body1()}
	</p>
	<p class="mb-4 text-[15px] leading-relaxed font-light text-[#3A4A3D]">
		{m.intro2_body2()}
	</p>

	<div class="flex-1"></div>
	<Button
		class="w-full rounded-xl bg-[#2D4A32] py-6 text-base font-medium text-white hover:bg-[#3D6145]"
		onclick={() => goto('/onboarding/name')}
	>
		{m.intro2_cta()}
		<ArrowRightIcon class="ml-2 h-4 w-4" />
	</Button>
	<Button
		variant="ghost"
		class="mt-2 w-full text-sm text-[#6B7A6E]"
		onclick={() => goto('/onboarding/intro1')}
	>
		<ArrowLeftIcon class="mr-1 h-3 w-3" />
		{m.intro2_back()}
	</Button>
</div>
