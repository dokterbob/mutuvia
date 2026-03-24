<script lang="ts">
	import { goto } from '$app/navigation';
	import * as m from '$lib/paraglide/messages.js';
	import { Button } from '$lib/components/ui/button';
	import ArrowRightIcon from '@lucide/svelte/icons/arrow-right';
import ArrowLeftIcon from '@lucide/svelte/icons/arrow-left';
</script>

<div class="flex flex-1 flex-col">
	<p class="mb-2.5 text-[10.5px] font-medium uppercase tracking-[0.2em] text-[#7A9E7E]">
		{m.consent_eyebrow()}
	</p>
	<h1 class="mb-4 font-serif text-[28px] font-semibold leading-tight text-[#1E2820]">
		{@html m.consent_title().replace(
			/agreeing to|a aceitar|akkoord gaat/,
			'<span class="text-[#2D4A32]">$&</span>'
		)}
	</h1>

	<ul class="mb-4 space-y-0">
		{#each [
			{ icon: '📒', title: m.consent_item1_title(), body: m.consent_item1_body() },
			{ icon: '🔒', title: m.consent_item2_title(), body: m.consent_item2_body() },
			{ icon: '👥', title: m.consent_item3_title(), body: m.consent_item3_body() },
			{ icon: '🌱', title: m.consent_item4_title(), body: m.consent_item4_body() }
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
		{m.consent_cta()}
		<ArrowRightIcon class="ml-2 h-4 w-4" />
	</Button>
	<Button
		variant="ghost"
		class="mt-2 w-full text-sm text-[#6B7A6E]"
		onclick={() => goto('/onboarding')}
	>
		<ArrowLeftIcon class="mr-1 h-3 w-3" />
		{m.consent_back()}
	</Button>
</div>
