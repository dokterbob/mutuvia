<script lang="ts">
	import { goto } from '$app/navigation';
	import * as m from '$lib/paraglide/messages.js';
	import { authClient } from '$lib/auth-client';
	import { Button } from '$lib/components/ui/button';
	import { OtpInput } from '$lib/components/ui/otp-input';
	import ArrowLeftIcon from '@lucide/svelte/icons/arrow-left';

	let { data } = $props();

	let isLoading = $state(false);
	let authError = $state('');

	async function verifyOtp(code: string) {
		if (isLoading) return;
		isLoading = true;
		authError = '';
		try {
			const result =
				data.otpMethod === 'phone'
					? await authClient.phoneNumber.verify({
							phoneNumber: data.otpDestination,
							code
						})
					: await authClient.signIn.emailOtp({ email: data.otpDestination, otp: code });
			if (result.error) {
				authError = result.error.message || m.otp_invalid_code();
			} else {
				goto('/onboarding/verified', { invalidateAll: true });
			}
		} finally {
			isLoading = false;
		}
	}

	async function resendOtp() {
		authError = '';
		const result =
			data.otpMethod === 'phone'
				? await authClient.phoneNumber.sendOtp({ phoneNumber: data.otpDestination })
				: await authClient.emailOtp.sendVerificationOtp({
						email: data.otpDestination,
						type: 'sign-in'
					});
		if (result.error) {
			authError = result.error.message || m.error_send_code();
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

	<OtpInput
		onSubmit={verifyOtp}
		onResend={resendOtp}
		error={authError}
		loading={isLoading}
		submitLabel={m.otp_cta()}
	/>

	<div class="flex-1"></div>
	<Button
		variant="ghost"
		class="mt-2 w-full text-sm text-[#6B7A6E]"
		onclick={() => goto(`/onboarding/${data.otpMethod}`)}
	>
		<ArrowLeftIcon class="mr-1 h-3 w-3" />
		{m.otp_back()}
	</Button>
</div>
