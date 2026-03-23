<script lang="ts">
	import { goto } from '$app/navigation';
	import { t } from '$lib/i18n';
	import { Button } from '$lib/components/ui/button';
	import { IconArrowRight, IconArrowLeft } from '@tabler/icons-svelte';
</script>

<div class="flex flex-1 flex-col">
	<p class="mb-2.5 text-[10.5px] font-medium uppercase tracking-[0.2em] text-[#7A9E7E]">
		{$t('consent.eyebrow')}
	</p>
	<h1 class="mb-4 font-serif text-[28px] font-semibold leading-tight text-[#1E2820]">
		{@html $t('consent.title').replace(
			/agreeing to|a aceitar|akkoord gaat/,
			'<span class="text-[#2D4A32]">$&</span>'
		)}
	</h1>

	<ul class="mb-4 space-y-0">
		{#each [
			{ icon: '📒', title: $t('consent.item1_title'), body: $t('consent.item1_body') },
			{ icon: '🔒', title: $t('consent.item2_title'), body: $t('consent.item2_body') },
			{ icon: '👥', title: $t('consent.item3_title'), body: $t('consent.item3_body') },
			{ icon: '🌱', title: $t('consent.item4_title'), body: $t('consent.item4_body') }
		] as item}
			<li
				class="flex items-start gap-3 border-b border-[#DDD8CE] py-3 text-sm text-[#3A4A3D] last:border-b-0"
			>
				<span class="mt-0.5 flex-shrink-0 text-lg">{item.icon}</span>
				<div>
					<span class="block font-medium text-[#1E2820]">{item.title}</span>
					{item.body}
				</div>
			</li>
		{/each}
	</ul>

	<div class="flex-1"></div>
	<Button
		class="w-full rounded-xl bg-[#2D4A32] py-6 text-base font-medium text-white hover:bg-[#3D6145]"
		onclick={() => goto('/onboarding/phone')}
	>
		{$t('consent.cta')}
		<IconArrowRight class="ml-2 h-4 w-4" />
	</Button>
	<Button
		variant="ghost"
		class="mt-2 w-full text-sm text-[#6B7A6E]"
		onclick={() => goto('/onboarding')}
	>
		<IconArrowLeft class="mr-1 h-3 w-3" />
		{$t('consent.back')}
	</Button>
</div>
