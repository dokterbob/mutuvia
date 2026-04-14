<script lang="ts">
	import * as m from '$lib/paraglide/messages.js';
	import { Button } from '$lib/components/ui/button';
	import ArrowRightIcon from '@lucide/svelte/icons/arrow-right';

	interface Props {
		onSubmit: (code: string) => Promise<void>;
		onResend: () => Promise<void>;
		error?: string;
		loading?: boolean;
		/** When provided, renders a full-width submit button below the resend row. */
		submitLabel?: string;
	}

	let { onSubmit, onResend, error = '', loading = false, submitLabel }: Props = $props();

	let otpCode = $state('');
	let resendLoading = $state(false);
	let countdown = $state(30);
	let otpInput = $state<HTMLInputElement | undefined>(undefined);

	$effect(() => {
		otpInput?.focus();
	});

	$effect(() => {
		const interval = setInterval(() => {
			if (countdown > 0) countdown--;
		}, 1000);
		return () => clearInterval(interval);
	});

	async function verify() {
		if (loading || otpCode.length < 6) return;
		await onSubmit(otpCode);
	}

	async function resend() {
		if (countdown > 0) return;
		resendLoading = true;
		try {
			await onResend();
			otpCode = '';
			countdown = 30;
			otpInput?.focus();
		} finally {
			resendLoading = false;
		}
	}

	function handleInput(e: Event) {
		const input = e.target as HTMLInputElement;
		otpCode = input.value.replace(/\D/g, '').slice(0, 6);
		input.value = otpCode;
		if (otpCode.length === 6) {
			verify();
		}
	}
</script>

<!-- 6-digit OTP boxes -->
<div class="relative mx-auto mb-6 flex justify-center gap-2.5">
	<input
		bind:this={otpInput}
		type="text"
		inputmode="numeric"
		autocomplete="one-time-code"
		maxlength="6"
		pattern="[0-9]*"
		value={otpCode}
		oninput={handleInput}
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

<!-- Resend -->
<div class="mb-4 text-center text-sm text-[#6B7A6E]">
	{m.otp_resend_prompt()}
	{#if countdown > 0}
		<span class="text-[#6B7A6E]">
			{m.otp_resend()} ({m.otp_countdown({ seconds: countdown })})
		</span>
	{:else}
		<button
			class="font-medium text-[#2D4A32] hover:underline disabled:opacity-50"
			onclick={resend}
			disabled={resendLoading}
		>
			{m.otp_resend()}
		</button>
	{/if}
</div>

{#if error}
	<p class="mb-3 text-center text-sm text-red-600">{error}</p>
{/if}

{#if submitLabel}
	<Button
		class="w-full rounded-xl bg-[#2D4A32] py-6 text-base font-medium text-white hover:bg-[#3D6145] disabled:opacity-40"
		disabled={otpCode.length < 6 || loading}
		{loading}
		onclick={verify}
	>
		{submitLabel}
		<ArrowRightIcon class="ml-2 h-4 w-4" />
	</Button>
{/if}
