<script lang="ts">
	import { goto } from '$app/navigation';
	import { enhance } from '$app/forms';
	import * as m from '$lib/paraglide/messages.js';
	import { Button } from '$lib/components/ui/button';
	import { Label } from '$lib/components/ui/label';
	import ArrowRightIcon from '@lucide/svelte/icons/arrow-right';
	import ArrowLeftIcon from '@lucide/svelte/icons/arrow-left';

	let displayName = $state('');
	let authError = $state('');
	let createProfileLoading = $state(false);
</script>

<div class="flex flex-1 flex-col">
	<div class="mb-3 flex justify-center gap-1.5">
		<div class="h-2 w-2 rounded-full bg-[#7A9E7E]"></div>
		<div class="h-2 w-2 rounded-full bg-[#7A9E7E]"></div>
		<div class="h-2 w-6 rounded bg-[#2D4A32]"></div>
	</div>

	<div class="mb-5 flex justify-center">
		<div
			class="flex h-[110px] w-full max-w-[280px] items-center justify-center rounded-2xl border-[1.5px] border-dashed border-[#DDD8CE] bg-[#EDE7D9] text-[44px]"
		>
			🌿
		</div>
	</div>

	<p class="mb-2.5 text-[10.5px] font-medium tracking-[0.2em] text-[#7A9E7E] uppercase">
		{m.intro3_eyebrow()}
	</p>
	<h1 class="mb-3.5 font-serif text-[28px] leading-tight font-semibold text-[#1E2820]">
		<!-- eslint-disable-next-line svelte/no-at-html-tags -->
		{@html m
			.intro3_title()
			.replace(/call you|chamar|noemen/i, '<span class="text-[#2D4A32]">$&</span>')}
	</h1>
	<p class="mb-4 text-[15px] leading-relaxed font-light text-[#3A4A3D]">
		{m.intro3_body()}
	</p>

	<Label class="mb-2 block text-xs font-medium tracking-wider text-[#6B7A6E] uppercase">
		{m.intro3_label()}
	</Label>
	<form
		method="POST"
		action="?/createProfile"
		use:enhance={() => {
			createProfileLoading = true;
			return async ({ result, update }) => {
				try {
					if (result.type === 'failure' || result.type === 'error') {
						authError =
							result.type === 'failure'
								? ((result.data as Record<string, unknown>)?.error as string) || m.error_generic()
								: m.error_generic();
					} else {
						await update();
					}
				} finally {
					createProfileLoading = false;
				}
			};
		}}
	>
		<div
			class="mb-1.5 overflow-hidden rounded-xl border-[1.5px] border-[#DDD8CE] bg-white transition focus-within:border-[#2D4A32]"
		>
			<input
				name="displayName"
				type="text"
				maxlength="40"
				placeholder={m.intro3_placeholder()}
				bind:value={displayName}
				class="w-full border-none bg-transparent px-4 py-3.5 text-[17px] text-[#1E2820] outline-none placeholder:text-[#BDB8AE]"
			/>
		</div>
		<p class="mb-4 text-xs text-[#6B7A6E]">{m.intro3_hint()}</p>
		{#if authError}
			<p class="mb-2 text-sm text-red-600">{authError}</p>
		{/if}

		<div class="flex-1"></div>
		<Button
			type="submit"
			class="w-full rounded-xl bg-[#2D4A32] py-6 text-base font-medium text-white hover:bg-[#3D6145] disabled:opacity-40"
			disabled={displayName.trim().length < 2}
			loading={createProfileLoading}
		>
			{m.intro3_cta()}
			<ArrowRightIcon class="ml-2 h-4 w-4" />
		</Button>
	</form>
	<Button
		variant="ghost"
		class="mt-2 w-full text-sm text-[#6B7A6E]"
		onclick={() => goto('/onboarding/intro2')}
	>
		<ArrowLeftIcon class="mr-1 h-3 w-3" />
		{m.intro3_back()}
	</Button>
</div>
