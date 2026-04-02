<script lang="ts">
	import { goto } from '$app/navigation';
	import * as m from '$lib/paraglide/messages.js';
	import { authClient } from '$lib/auth-client';
	import { Button } from '$lib/components/ui/button';
	import { Label } from '$lib/components/ui/label';
	import ArrowRightIcon from '@lucide/svelte/icons/arrow-right';
	import ArrowLeftIcon from '@lucide/svelte/icons/arrow-left';

	let emailAddress = $state('');
	let isLoading = $state(false);
	let authError = $state('');

	async function sendEmailOtp() {
		isLoading = true;
		authError = '';
		try {
			const { error } = await authClient.emailOtp.sendVerificationOtp({
				email: emailAddress,
				type: 'sign-in'
			});
			if (error) {
				authError = error.message || m.error_send_code();
			} else {
				goto(`/onboarding/otp?dest=${encodeURIComponent(emailAddress)}&method=email`);
			}
		} finally {
			isLoading = false;
		}
	}
</script>

<div class="flex flex-1 flex-col">
	<p class="mb-2.5 text-[10.5px] font-medium tracking-[0.2em] text-[#7A9E7E] uppercase">
		{m.email_eyebrow()}
	</p>
	<h1 class="mb-3.5 font-serif text-[28px] leading-tight font-semibold text-[#1E2820]">
		<span class="text-[#2D4A32]">{m.email_title()}</span>
	</h1>
	<p class="mb-4 text-[15px] leading-relaxed font-light text-[#3A4A3D]">
		{m.email_body()}
	</p>

	<Label class="mb-2 block text-xs font-medium tracking-wider text-[#6B7A6E] uppercase">
		{m.email_label()}
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
	<p class="mb-4 text-xs text-[#6B7A6E]">{m.email_hint()}</p>

	{#if authError}
		<p class="mb-3 text-sm text-red-600">{authError}</p>
	{/if}

	<form
		onsubmit={(e) => {
			e.preventDefault();
			sendEmailOtp();
		}}
	>
		<div class="flex-1"></div>
		<Button
			type="submit"
			class="w-full rounded-xl bg-[#2D4A32] py-6 text-base font-medium text-white hover:bg-[#3D6145] disabled:opacity-40"
			disabled={!emailAddress.includes('@') || isLoading}
			loading={isLoading}
		>
			{m.email_cta()}
			<ArrowRightIcon class="ml-2 h-4 w-4" />
		</Button>
	</form>
	<Button
		variant="ghost"
		class="mt-2 w-full text-sm text-[#6B7A6E]"
		onclick={() => goto('/onboarding/phone')}
	>
		<ArrowLeftIcon class="mr-1 h-3 w-3" />
		{m.email_back()}
	</Button>
</div>
