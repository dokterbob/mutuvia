<script lang="ts">
	import { goto } from '$app/navigation';
	import { t } from '$lib/i18n';
	import { Button } from '$lib/components/ui/button';
	import { IconArrowRight, IconArrowLeft } from '@tabler/icons-svelte';
</script>

<div class="flex flex-1 flex-col">
	<button
		class="mb-1.5 self-end text-[13px] text-[#6B7A6E] hover:text-[#1E2820]"
		onclick={() => goto('/onboarding/name')}
	>
		{$t('intro2.skip')} ↗
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

	<p class="mb-2.5 text-[10.5px] font-medium uppercase tracking-[0.2em] text-[#7A9E7E]">
		{$t('intro2.eyebrow')}
	</p>
	<h1 class="mb-3.5 font-serif text-[28px] font-semibold leading-tight text-[#1E2820]">
		{@html $t('intro2.title').replace(
			/normal|normaal/i,
			'<span class="text-[#2D4A32]">$&</span>'
		)}
	</h1>
	<p class="mb-3.5 text-[15px] font-light leading-relaxed text-[#3A4A3D]">
		{$t('intro2.body1')}
	</p>
	<p class="mb-4 text-[15px] font-light leading-relaxed text-[#3A4A3D]">
		{$t('intro2.body2')}
	</p>

	<div class="flex-1"></div>
	<Button
		class="w-full rounded-xl bg-[#2D4A32] py-6 text-base font-medium text-white hover:bg-[#3D6145]"
		onclick={() => goto('/onboarding/name')}
	>
		{$t('intro2.cta')}
		<IconArrowRight class="ml-2 h-4 w-4" />
	</Button>
	<Button
		variant="ghost"
		class="mt-2 w-full text-sm text-[#6B7A6E]"
		onclick={() => goto('/onboarding/intro1')}
	>
		<IconArrowLeft class="mr-1 h-3 w-3" />
		{$t('intro2.back')}
	</Button>
</div>
