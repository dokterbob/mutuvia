<script lang="ts">
	import { goto } from '$app/navigation';
	import { t } from '$lib/i18n';
	import { authClient } from '$lib/auth-client';
	import { Button } from '$lib/components/ui/button';
	import { Label } from '$lib/components/ui/label';
	import { IconArrowRight, IconArrowLeft } from '@tabler/icons-svelte';

	let emailAddress = $state('');
	let isLoading = $state(false);
	let authError = $state('');

	async function sendEmailOtp() {
		isLoading = true;
		authError = '';
		try {
			await authClient.emailOtp.sendVerificationOtp({ email: emailAddress, type: 'sign-in' });
			goto(`/onboarding/otp?dest=${encodeURIComponent(emailAddress)}&method=email`);
		} catch (e: unknown) {
			authError = e instanceof Error ? e.message : 'Failed to send code';
		} finally {
			isLoading = false;
		}
	}
</script>

<div class="flex flex-1 flex-col">
	<p class="mb-2.5 text-[10.5px] font-medium uppercase tracking-[0.2em] text-[#7A9E7E]">
		{$t('email.eyebrow')}
	</p>
	<h1 class="mb-3.5 font-serif text-[28px] font-semibold leading-tight text-[#1E2820]">
		<span class="text-[#2D4A32]">{$t('email.title')}</span>
	</h1>
	<p class="mb-4 text-[15px] font-light leading-relaxed text-[#3A4A3D]">
		{$t('email.body')}
	</p>

	<Label class="mb-2 block text-xs font-medium uppercase tracking-wider text-[#6B7A6E]">
		{$t('email.label')}
	</Label>
	<div
		class="mb-2 overflow-hidden rounded-xl border-[1.5px] border-[#DDD8CE] bg-white transition focus-within:border-[#2D4A32]"
	>
		<input
			type="email"
			inputmode="email"
			placeholder="you@example.com"
			bind:value={emailAddress}
			class="w-full border-none bg-transparent px-4 py-3.5 text-[17px] text-[#1E2820] outline-none placeholder:text-[#BDB8AE]"
		/>
	</div>
	<p class="mb-4 text-xs text-[#6B7A6E]">{$t('email.hint')}</p>

	{#if authError}
		<p class="mb-3 text-sm text-red-600">{authError}</p>
	{/if}

	<div class="flex-1"></div>
	<Button
		class="w-full rounded-xl bg-[#2D4A32] py-6 text-base font-medium text-white hover:bg-[#3D6145] disabled:opacity-40"
		disabled={!emailAddress.includes('@') || isLoading}
		onclick={sendEmailOtp}
	>
		{$t('email.cta')}
		<IconArrowRight class="ml-2 h-4 w-4" />
	</Button>
	<Button
		variant="ghost"
		class="mt-2 w-full text-sm text-[#6B7A6E]"
		onclick={() => goto('/onboarding/phone')}
	>
		<IconArrowLeft class="mr-1 h-3 w-3" />
		{$t('email.back')}
	</Button>
</div>
