<script lang="ts">
	import { goto } from '$app/navigation';
	import * as m from '$lib/paraglide/messages.js';
	import { authClient } from '$lib/auth-client';
	import { Button } from '$lib/components/ui/button';
	import ArrowRightIcon from '@lucide/svelte/icons/arrow-right';
	import ArrowLeftIcon from '@lucide/svelte/icons/arrow-left';

	let { data } = $props();

	let otpCode = $state('');
	let isLoading = $state(false);
	let authError = $state('');
	let countdown = $state(30);

	$effect(() => {
		const interval = setInterval(() => {
			if (countdown > 0) countdown--;
		}, 1000);
		return () => clearInterval(interval);
	});

	async function verifyOtp() {
		isLoading = true;
		authError = '';
		try {
			if (data.otpMethod === 'phone') {
				await authClient.phoneNumber.verify({ phoneNumber: data.otpDestination, code: otpCode });
			} else {
				await authClient.signIn.emailOtp({ email: data.otpDestination, otp: otpCode });
			}
			goto('/onboarding/verified', { invalidateAll: true });
		} catch (e: unknown) {
			authError = e instanceof Error ? e.message : 'Invalid code';
		} finally {
			isLoading = false;
		}
	}

	async function resendOtp() {
		if (countdown > 0) return;
		if (data.otpMethod === 'phone') {
			await authClient.phoneNumber.sendOtp({ phoneNumber: data.otpDestination });
		} else {
			await authClient.emailOtp.sendVerificationOtp({
				email: data.otpDestination,
				type: 'sign-in'
			});
		}
		otpCode = '';
		countdown = 30;
	}

	function handleOtpInput(e: Event) {
		const input = e.target as HTMLInputElement;
		otpCode = input.value.replace(/\D/g, '').slice(0, 6);
		input.value = otpCode;
		if (otpCode.length === 6) {
			verifyOtp();
		}
	}
</script>

<div class="flex flex-1 flex-col">
	<p class="mb-2.5 text-[10.5px] font-medium tracking-[0.2em] text-[#7A9E7E] uppercase">
		{m.otp_eyebrow()}
	</p>
	<h1 class="mb-3.5 font-serif text-[28px] leading-tight font-semibold text-[#1E2820]">
		<!-- eslint-disable-next-line svelte/no-at-html-tags -->
		{@html m
			.otp_title()
			.replace(
				/6-digit code|6 dígitos|6-cijferige code/i,
				'<span class="text-[#2D4A32]">$&</span>'
			)}
	</h1>

	<div class="mb-5 rounded-xl bg-[#EDE7D9] p-3.5 text-sm leading-relaxed text-[#3A4A3D]">
		{m.otp_sent_to({ destination: data.otpDestination })}
	</div>

	<!-- OTP input -->
	<div class="relative mx-auto mb-6 flex justify-center gap-2.5">
		<input
			type="text"
			inputmode="numeric"
			autocomplete="one-time-code"
			maxlength="6"
			pattern="[0-9]*"
			value={otpCode}
			oninput={handleOtpInput}
			class="absolute inset-0 z-10 w-full cursor-text bg-transparent text-[32px] tracking-[2.4em] caret-transparent opacity-0 outline-none"
		/>
		{#each Array(6) as _, i (i)}
			<div
				class="flex h-[58px] w-[46px] items-center justify-center rounded-xl border-[1.5px] bg-white font-serif text-[26px] font-semibold text-[#1E2820] transition
				{otpCode[i]
					? 'border-[#7A9E7E] bg-[#EDE7D9]'
					: i === otpCode.length
						? 'border-[#2D4A32] shadow-[0_0_0_3px_rgba(45,74,50,0.12)]'
						: 'border-[#DDD8CE]'}"
			>
				{otpCode[i] ?? ''}
			</div>
		{/each}
	</div>

	<div class="mb-4 text-center text-sm text-[#6B7A6E]">
		{m.otp_resend_prompt()}
		{#if countdown > 0}
			<span class="text-[#6B7A6E]">
				{m.otp_resend()} ({m.otp_countdown({ seconds: countdown })})
			</span>
		{:else}
			<button class="font-medium text-[#2D4A32] hover:underline" onclick={resendOtp}>
				{m.otp_resend()}
			</button>
		{/if}
	</div>

	{#if authError}
		<p class="mb-3 text-center text-sm text-red-600">{authError}</p>
	{/if}

	<div class="flex-1"></div>
	<Button
		class="w-full rounded-xl bg-[#2D4A32] py-6 text-base font-medium text-white hover:bg-[#3D6145] disabled:opacity-40"
		disabled={otpCode.length < 6 || isLoading}
		onclick={verifyOtp}
	>
		{m.otp_cta()}
		<ArrowRightIcon class="ml-2 h-4 w-4" />
	</Button>
	<Button
		variant="ghost"
		class="mt-2 w-full text-sm text-[#6B7A6E]"
		onclick={() => goto(`/onboarding/${data.otpMethod}`)}
	>
		<ArrowLeftIcon class="mr-1 h-3 w-3" />
		{m.otp_back()}
	</Button>
</div>
