<script lang="ts">
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import * as m from '$lib/paraglide/messages.js';
	import { Button } from '$lib/components/ui/button';
	import ArrowRightIcon from '@lucide/svelte/icons/arrow-right';
</script>

<div class="flex flex-1 flex-col">
	<!-- Logo -->
	<div class="mb-5 flex items-center gap-3">
		<div class="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-[#2D4A32]">
			<svg width="22" height="22" viewBox="0 0 52 52" fill="none">
				<path
					d="M26 10C18 10 12 16 12 24c0 8 6 14 14 14s14-6 14-14"
					stroke="white"
					stroke-width="2.5"
					stroke-linecap="round"
					fill="none"
				/>
				<path
					d="M26 13v22M20 19l6-6 6 6"
					stroke="rgba(255,255,255,0.7)"
					stroke-width="2"
					stroke-linecap="round"
					stroke-linejoin="round"
				/>
			</svg>
		</div>
		<span class="font-serif text-lg text-[#1E2820]">{$page.data.appName ?? 'Mutuvia'}</span>
	</div>

	<p class="mb-2.5 text-[10.5px] font-medium uppercase tracking-[0.2em] text-[#7A9E7E]">
		{m.welcome_eyebrow()}
	</p>
	<h1 class="mb-3.5 font-serif text-[28px] font-semibold leading-tight text-[#1E2820]">
		<span class="text-[#2D4A32]">{m.welcome_tagline().split(',')[0]},</span>{m.welcome_tagline()
			.split(',')
			.slice(1)
			.join(',')}
	</h1>
	<p class="mb-5 text-[15px] font-light leading-relaxed text-[#3A4A3D]">
		{m.welcome_pitch()}
	</p>

	<!-- How it works diagram -->
	<div class="mb-4 rounded-2xl border border-[#DDD8CE] bg-[#EDE7D9] p-4">
		<p
			class="mb-3 text-center text-[10.5px] font-medium uppercase tracking-[0.15em] text-[#7A9E7E]"
		>
			{m.welcome_how_it_works()}
		</p>
		<div class="relative mx-auto h-[148px] max-w-[260px]">
			<div class="absolute left-1/2 top-0 -translate-x-1/2 text-center">
				<div
					class="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-[#2D4A32] font-serif text-base font-semibold text-white"
				>
					A
				</div>
				<div class="mt-1 text-xs font-medium text-[#1E2820]">Ana</div>
				<div class="text-[10.5px] text-[#6B7A6E]">massage</div>
			</div>
			<div class="absolute bottom-0 left-0 text-center">
				<div
					class="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-[#2D4A32] font-serif text-base font-semibold text-white"
				>
					B
				</div>
				<div class="mt-1 text-xs font-medium text-[#1E2820]">Bruno</div>
				<div class="text-[10.5px] text-[#6B7A6E]">vegetables</div>
			</div>
			<div class="absolute bottom-0 right-0 text-center">
				<div
					class="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-[#2D4A32] font-serif text-base font-semibold text-white"
				>
					C
				</div>
				<div class="mt-1 text-xs font-medium text-[#1E2820]">Carla</div>
				<div class="text-[10.5px] text-[#6B7A6E]">bread</div>
			</div>
			<svg class="absolute inset-0 h-full w-full overflow-visible" viewBox="0 0 260 148">
				<defs>
					<marker id="arr" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
						<path d="M0,0 L6,3 L0,6 Z" fill="#7A9E7E" />
					</marker>
				</defs>
				<path
					d="M108,50 Q60,90 54,102"
					stroke="#7A9E7E"
					stroke-width="1.5"
					fill="none"
					stroke-dasharray="4,3"
					marker-end="url(#arr)"
				/>
				<text
					x="62"
					y="82"
					font-size="9.5"
					fill="#C4922A"
					font-family="DM Sans,sans-serif"
					font-weight="500"
					text-anchor="middle">credit</text
				>
				<path
					d="M76,126 Q130,140 184,126"
					stroke="#7A9E7E"
					stroke-width="1.5"
					fill="none"
					stroke-dasharray="4,3"
					marker-end="url(#arr)"
				/>
				<text
					x="130"
					y="148"
					font-size="9.5"
					fill="#C4922A"
					font-family="DM Sans,sans-serif"
					font-weight="500"
					text-anchor="middle">credit</text
				>
				<path
					d="M206,102 Q200,60 152,50"
					stroke="#7A9E7E"
					stroke-width="1.5"
					fill="none"
					stroke-dasharray="4,3"
					marker-end="url(#arr)"
				/>
				<text
					x="198"
					y="82"
					font-size="9.5"
					fill="#C4922A"
					font-family="DM Sans,sans-serif"
					font-weight="500"
					text-anchor="middle">credit</text
				>
			</svg>
		</div>
		<p class="mt-3 text-center text-[13px] font-medium text-[#2D4A32]">
			{m.welcome_cycle_result()}
		</p>
	</div>

	<div class="flex-1"></div>
	<Button
		class="w-full rounded-xl bg-[#2D4A32] py-6 text-base font-medium text-white hover:bg-[#3D6145]"
		onclick={() => goto('/onboarding/consent')}
	>
		{m.welcome_cta()}
		<ArrowRightIcon class="ml-2 h-4 w-4" />
	</Button>
	<Button
		variant="ghost"
		class="mt-2 w-full text-sm text-[#6B7A6E]"
		onclick={() => goto('/onboarding/phone')}
	>
		{m.welcome_returning()}
	</Button>
</div>
