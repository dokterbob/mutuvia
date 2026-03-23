<script lang="ts">
	import { goto } from '$app/navigation';
	import { t } from '$lib/i18n';
	import { authClient } from '$lib/auth-client';
	import { Button } from '$lib/components/ui/button';
	import { Label } from '$lib/components/ui/label';
	import { IconArrowRight, IconArrowLeft } from '@tabler/icons-svelte';

	let phoneNumber = $state('');
	let countryCode = $state('+351');
	let isLoading = $state(false);
	let authError = $state('');

	async function sendPhoneOtp() {
		isLoading = true;
		authError = '';
		const fullPhone = `${countryCode}${phoneNumber.replace(/\s/g, '')}`;
		try {
			await authClient.phoneNumber.sendOtp({ phoneNumber: fullPhone });
			goto(`/onboarding/otp?dest=${encodeURIComponent(fullPhone)}&method=phone`);
		} catch (e: unknown) {
			authError = e instanceof Error ? e.message : 'Failed to send code';
		} finally {
			isLoading = false;
		}
	}
</script>

<div class="flex flex-1 flex-col">
	<p class="mb-2.5 text-[10.5px] font-medium uppercase tracking-[0.2em] text-[#7A9E7E]">
		{$t('phone.eyebrow')}
	</p>
	<h1 class="mb-3.5 font-serif text-[28px] font-semibold leading-tight text-[#1E2820]">
		{@html $t('phone.title').replace(
			/phone number|número de telefone|telefoonnummer/i,
			'<span class="text-[#2D4A32]">$&</span>'
		)}
	</h1>
	<p class="mb-4 text-[15px] font-light leading-relaxed text-[#3A4A3D]">
		{$t('phone.body')}
	</p>

	<Label class="mb-2 block text-xs font-medium uppercase tracking-wider text-[#6B7A6E]">
		{$t('phone.label')}
	</Label>
	<div
		class="mb-2 flex overflow-hidden rounded-xl border-[1.5px] border-[#DDD8CE] bg-white transition focus-within:border-[#2D4A32]"
	>
		<div
			class="flex items-center gap-1.5 border-r-[1.5px] border-[#DDD8CE] bg-[#EDE7D9] px-3 py-3.5 text-sm text-[#6B7A6E]"
		>
			<span>🇵🇹</span>
			<select bind:value={countryCode} class="border-none bg-transparent text-sm outline-none">
				<option value="+351">+351</option>
				<option value="+31">+31</option>
				<option value="+44">+44</option>
				<option value="+1">+1</option>
			</select>
		</div>
		<input
			type="tel"
			inputmode="tel"
			placeholder="912 345 678"
			bind:value={phoneNumber}
			class="flex-1 border-none bg-transparent px-4 py-3.5 text-[17px] text-[#1E2820] outline-none placeholder:text-[#BDB8AE]"
		/>
	</div>
	<p class="mb-4 text-xs text-[#6B7A6E]">{$t('phone.hint')}</p>

	{#if authError}
		<p class="mb-3 text-sm text-red-600">{authError}</p>
	{/if}

	<div class="mb-3 flex items-center gap-3 text-xs text-[#6B7A6E]">
		<span class="h-px flex-1 bg-[#DDD8CE]"></span>
		{$t('phone.or')}
		<span class="h-px flex-1 bg-[#DDD8CE]"></span>
	</div>

	<Button
		variant="outline"
		class="mb-4 w-full rounded-xl border-[1.5px] border-[#DDD8CE] py-5 text-sm text-[#2D4A32]"
		onclick={() => goto('/onboarding/email')}
	>
		{$t('phone.email_fallback')}
		<IconArrowRight class="ml-2 h-3 w-3" />
	</Button>

	<div class="flex-1"></div>
	<Button
		class="w-full rounded-xl bg-[#2D4A32] py-6 text-base font-medium text-white hover:bg-[#3D6145] disabled:opacity-40"
		disabled={phoneNumber.replace(/\D/g, '').length < 9 || isLoading}
		onclick={sendPhoneOtp}
	>
		{$t('phone.cta')}
		<IconArrowRight class="ml-2 h-4 w-4" />
	</Button>
	<Button
		variant="ghost"
		class="mt-2 w-full text-sm text-[#6B7A6E]"
		onclick={() => goto('/onboarding/consent')}
	>
		<IconArrowLeft class="mr-1 h-3 w-3" />
		{$t('phone.back')}
	</Button>
</div>
