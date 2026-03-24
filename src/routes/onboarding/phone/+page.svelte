<script lang="ts">
	import { goto } from '$app/navigation';
	import * as m from '$lib/paraglide/messages.js';
	import { authClient } from '$lib/auth-client';
	import { Button } from '$lib/components/ui/button';
	import { Label } from '$lib/components/ui/label';
	import { PhoneInput } from '$lib/components/ui/phone-input';
	import type { E164Number } from 'svelte-tel-input/types';
	import ArrowRightIcon from '@lucide/svelte/icons/arrow-right';
	import ArrowLeftIcon from '@lucide/svelte/icons/arrow-left';

	let phoneValue = $state<E164Number | null>(null);
	let valid = $state(false);
	let isLoading = $state(false);
	let authError = $state('');

	async function sendPhoneOtp() {
		if (!phoneValue) return;
		isLoading = true;
		authError = '';
		try {
			await authClient.phoneNumber.sendOtp({ phoneNumber: phoneValue });
			goto(`/onboarding/otp?dest=${encodeURIComponent(phoneValue)}&method=phone`);
		} catch (e: unknown) {
			authError = e instanceof Error ? e.message : m.error_send_code();
		} finally {
			isLoading = false;
		}
	}
</script>

<div class="flex flex-1 flex-col">
	<p class="mb-2.5 text-[10.5px] font-medium uppercase tracking-[0.2em] text-[#7A9E7E]">
		{m.phone_eyebrow()}
	</p>
	<h1 class="mb-3.5 font-serif text-[28px] font-semibold leading-tight text-[#1E2820]">
		{@html m.phone_title().replace(
			/phone number|número de telefone|telefoonnummer/i,
			'<span class="text-[#2D4A32]">$&</span>'
		)}
	</h1>
	<p class="mb-4 text-[15px] font-light leading-relaxed text-[#3A4A3D]">
		{m.phone_body()}
	</p>

	<Label class="mb-2 block text-xs font-medium uppercase tracking-wider text-[#6B7A6E]">
		{m.phone_label()}
	</Label>
	<PhoneInput bind:value={phoneValue} bind:valid defaultCountry="PT" class="mb-2" />
	<p class="mb-4 text-xs text-[#6B7A6E]">{m.phone_hint()}</p>

	{#if authError}
		<p class="mb-3 text-sm text-red-600">{authError}</p>
	{/if}

	{#if !phoneValue}
		<div class="mb-3 flex items-center gap-3 text-xs text-[#6B7A6E]">
			<span class="h-px flex-1 bg-[#DDD8CE]"></span>
			{m.phone_or()}
			<span class="h-px flex-1 bg-[#DDD8CE]"></span>
		</div>

		<Button
			variant="outline"
			class="mb-4 w-full rounded-xl border-[1.5px] border-[#DDD8CE] py-5 text-sm text-[#2D4A32]"
			onclick={() => goto('/onboarding/email')}
		>
			{m.phone_email_fallback()}
			<ArrowRightIcon class="ml-2 h-3 w-3" />
		</Button>
	{/if}

	<form onsubmit={(e) => { e.preventDefault(); sendPhoneOtp(); }}>
		<div class="flex-1"></div>
		<Button
			type="submit"
			class="w-full rounded-xl bg-[#2D4A32] py-6 text-base font-medium text-white hover:bg-[#3D6145] disabled:opacity-40"
			disabled={!valid || isLoading}
		>
			{m.phone_cta()}
			<ArrowRightIcon class="ml-2 h-4 w-4" />
		</Button>
	</form>
	<Button
		variant="ghost"
		class="mt-2 w-full text-sm text-[#6B7A6E]"
		onclick={() => goto('/onboarding/consent')}
	>
		<ArrowLeftIcon class="mr-1 h-3 w-3" />
		{m.phone_back()}
	</Button>
</div>
