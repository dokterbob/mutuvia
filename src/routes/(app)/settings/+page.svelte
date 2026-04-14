<script lang="ts">
	import * as m from '$lib/paraglide/messages.js';
	import { getLocale, setLocale, locales, isLocale } from '$lib/paraglide/runtime.js';
	import { invalidateAll } from '$app/navigation';
	import { enhance } from '$app/forms';
	import { authClient } from '$lib/auth-client';
	import { isPlaceholderEmail } from '$lib/placeholder-email';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { Card } from '$lib/components/ui/card';
	import { PhoneInput } from '$lib/components/ui/phone-input';
	import { OtpInput } from '$lib/components/ui/otp-input';
	import type { E164Number } from 'svelte-tel-input/types';
	import ArrowLeftIcon from '@lucide/svelte/icons/arrow-left';
	import CheckIcon from '@lucide/svelte/icons/check';
	import { goto } from '$app/navigation';

	let { data, form } = $props();

	// ── Display name ──────────────────────────────────────────────────────────
	// eslint-disable-next-line svelte/prefer-writable-derived
	let displayName = $state(data.appUser.displayName);
	$effect(() => {
		displayName = data.appUser.displayName;
	});
	let saveLoading = $state(false);

	// ── Language ──────────────────────────────────────────────────────────────
	const languages = $derived(
		locales.map((code) => ({
			code,
			label: m.locale_name({}, { locale: code })
		}))
	);
	let currentLang = $derived(getLocale());

	// ── Credential state machine ───────────────────────────────────────────────
	type CredState = 'idle' | 'input' | 'verifying' | 'success';

	// Email
	let emailState = $state<CredState>('idle');
	let newEmail = $state('');
	let pendingEmail = $state(''); // email OTP was sent to
	let emailError = $state('');
	let emailSendLoading = $state(false);
	let emailVerifyLoading = $state(false);

	const displayEmail = $derived(
		isPlaceholderEmail(data.credentials.email) ? null : data.credentials.email
	);

	async function sendEmailCode() {
		if (!newEmail.trim()) return;
		emailSendLoading = true;
		emailError = '';
		try {
			const { error } = await authClient.emailOtp.requestEmailChange({ newEmail: newEmail.trim() });
			if (error) {
				emailError = error.message || m.error_send_code();
			} else {
				pendingEmail = newEmail.trim();
				emailState = 'verifying';
			}
		} finally {
			emailSendLoading = false;
		}
	}

	async function verifyEmailOtp(code: string) {
		emailVerifyLoading = true;
		emailError = '';
		try {
			const { error } = await authClient.emailOtp.changeEmail({
				newEmail: pendingEmail,
				otp: code
			});
			if (error) {
				emailError = error.message || m.otp_invalid_code();
			} else {
				emailState = 'success';
				await invalidateAll();
				setTimeout(() => {
					emailState = 'idle';
					newEmail = '';
				}, 2000);
			}
		} finally {
			emailVerifyLoading = false;
		}
	}

	async function resendEmailCode() {
		const { error } = await authClient.emailOtp.requestEmailChange({ newEmail: pendingEmail });
		if (error) {
			emailError = error.message || m.error_send_code();
			throw new Error(emailError);
		}
	}

	// Phone
	let phoneState = $state<CredState>('idle');
	let newPhone = $state<E164Number | null>(null);
	let newPhoneValid = $state(false);
	let pendingPhone = $state('');
	let phoneError = $state('');
	let phoneSendLoading = $state(false);
	let phoneVerifyLoading = $state(false);

	async function sendPhoneCode() {
		if (!newPhone) return;
		phoneSendLoading = true;
		phoneError = '';
		try {
			const { error } = await authClient.phoneNumber.sendOtp({ phoneNumber: newPhone });
			if (error) {
				phoneError = error.message || m.error_send_code();
			} else {
				pendingPhone = newPhone;
				phoneState = 'verifying';
			}
		} finally {
			phoneSendLoading = false;
		}
	}

	async function verifyPhoneOtp(code: string) {
		phoneVerifyLoading = true;
		phoneError = '';
		try {
			const { error } = await authClient.phoneNumber.verify({
				phoneNumber: pendingPhone,
				code,
				updatePhoneNumber: true
			});
			if (error) {
				phoneError = error.message || m.otp_invalid_code();
			} else {
				phoneState = 'success';
				await invalidateAll();
				setTimeout(() => {
					phoneState = 'idle';
					newPhone = null;
				}, 2000);
			}
		} finally {
			phoneVerifyLoading = false;
		}
	}

	async function resendPhoneCode() {
		const { error } = await authClient.phoneNumber.sendOtp({ phoneNumber: pendingPhone });
		if (error) {
			phoneError = error.message || m.error_send_code();
			throw new Error(phoneError);
		}
	}
</script>

<div class="flex min-h-dvh flex-col px-6 pt-14 pb-8">
	<div class="mb-6 flex items-center gap-3">
		<button onclick={() => goto('/home')} class="text-muted-foreground">
			<ArrowLeftIcon class="h-5 w-5" />
		</button>
		<h1 class="font-serif text-xl font-semibold">{m.settings_title()}</h1>
	</div>

	<!-- Display name -->
	<Card class="mb-4 rounded-xl p-4">
		<form
			method="POST"
			action="?/updateName"
			use:enhance={() => {
				saveLoading = true;
				return async ({ update }) => {
					try {
						await update();
					} finally {
						saveLoading = false;
					}
				};
			}}
		>
			<Label class="mb-2 text-sm text-muted-foreground">{m.settings_display_name()}</Label>
			<div class="flex gap-2">
				<Input name="displayName" bind:value={displayName} maxlength={40} class="flex-1" />
				<Button
					type="submit"
					class="bg-[#2D4A32] text-white hover:bg-[#3D6145]"
					disabled={displayName.trim().length < 2}
					loading={saveLoading}
				>
					{#if form?.saved}
						<CheckIcon class="h-4 w-4" />
					{:else}
						{m.settings_save()}
					{/if}
				</Button>
			</div>
			{#if form?.error}
				<p class="mt-2 text-sm text-red-600">{form.error}</p>
			{/if}
			{#if form?.saved}
				<p class="mt-2 text-sm text-green-700">{m.settings_saved()}</p>
			{/if}
		</form>
	</Card>

	<!-- Sign-in methods -->
	<Card class="mb-4 rounded-xl p-4">
		<p class="mb-3 text-sm text-muted-foreground">{m.settings_sign_in_methods()}</p>

		<!-- Email row -->
		<div class="mb-3">
			<div class="flex items-center justify-between">
				<div>
					<p class="text-sm font-medium">{m.settings_email()}</p>
					{#if displayEmail}
						<p class="text-xs text-muted-foreground">
							{displayEmail}
							{#if data.credentials.emailVerified}
								· {m.settings_verified()}
							{/if}
						</p>
					{:else}
						<p class="text-xs text-muted-foreground">{m.settings_not_set()}</p>
					{/if}
				</div>
				{#if emailState === 'idle'}
					<Button
						variant="outline"
						size="sm"
						onclick={() => {
							emailState = 'input';
							emailError = '';
						}}
					>
						{displayEmail ? m.settings_change() : m.settings_add_email()}
					</Button>
				{:else if emailState === 'success'}
					<span class="text-sm font-medium text-green-700">{m.settings_email_updated()}</span>
				{/if}
			</div>

			{#if emailState === 'input'}
				<div class="mt-3">
					<Input
						type="email"
						bind:value={newEmail}
						placeholder={m.settings_new_email()}
						class="mb-2"
					/>
					{#if emailError}
						<p class="mb-2 text-xs text-red-600">{emailError}</p>
					{/if}
					<div class="flex gap-2">
						<Button
							size="sm"
							class="bg-[#2D4A32] text-white hover:bg-[#3D6145]"
							disabled={!newEmail.trim() || emailSendLoading}
							loading={emailSendLoading}
							onclick={sendEmailCode}
						>
							{m.settings_send_code()}
						</Button>
						<Button
							variant="ghost"
							size="sm"
							onclick={() => {
								emailState = 'idle';
								newEmail = '';
								emailError = '';
							}}
						>
							{m.otp_back()}
						</Button>
					</div>
				</div>
			{:else if emailState === 'verifying'}
				<div class="mt-3">
					<p class="mb-3 text-xs text-muted-foreground">
						{m.settings_code_sent_to({ destination: pendingEmail })}
					</p>
					<OtpInput
						onSubmit={verifyEmailOtp}
						onResend={resendEmailCode}
						error={emailError}
						loading={emailVerifyLoading}
					/>
				</div>
			{/if}
		</div>

		<div class="my-2 h-px bg-border"></div>

		<!-- Phone row -->
		<div class="mt-3">
			<div class="flex items-center justify-between">
				<div>
					<p class="text-sm font-medium">{m.settings_phone()}</p>
					{#if data.credentials.phoneNumber}
						<p class="text-xs text-muted-foreground">
							{data.credentials.phoneNumber}
							{#if data.credentials.phoneNumberVerified}
								· {m.settings_verified()}
							{/if}
						</p>
					{:else}
						<p class="text-xs text-muted-foreground">{m.settings_not_set()}</p>
					{/if}
				</div>
				{#if phoneState === 'idle'}
					<Button
						variant="outline"
						size="sm"
						onclick={() => {
							phoneState = 'input';
							phoneError = '';
						}}
					>
						{data.credentials.phoneNumber ? m.settings_change() : m.settings_add_phone()}
					</Button>
				{:else if phoneState === 'success'}
					<span class="text-sm font-medium text-green-700">{m.settings_phone_updated()}</span>
				{/if}
			</div>

			{#if phoneState === 'input'}
				<div class="mt-3">
					<PhoneInput
						bind:value={newPhone}
						bind:valid={newPhoneValid}
						defaultCountry="PT"
						class="mb-2"
					/>
					{#if phoneError}
						<p class="mb-2 text-xs text-red-600">{phoneError}</p>
					{/if}
					<div class="flex gap-2">
						<Button
							size="sm"
							class="bg-[#2D4A32] text-white hover:bg-[#3D6145]"
							disabled={!newPhoneValid || phoneSendLoading}
							loading={phoneSendLoading}
							onclick={sendPhoneCode}
						>
							{m.settings_send_code()}
						</Button>
						<Button
							variant="ghost"
							size="sm"
							onclick={() => {
								phoneState = 'idle';
								newPhone = null;
								phoneError = '';
							}}
						>
							{m.otp_back()}
						</Button>
					</div>
				</div>
			{:else if phoneState === 'verifying'}
				<div class="mt-3">
					<p class="mb-3 text-xs text-muted-foreground">
						{m.settings_code_sent_to({ destination: pendingPhone })}
					</p>
					<OtpInput
						onSubmit={verifyPhoneOtp}
						onResend={resendPhoneCode}
						error={phoneError}
						loading={phoneVerifyLoading}
					/>
				</div>
			{/if}
		</div>
	</Card>

	<!-- Language -->
	<Card class="mb-4 rounded-xl p-4">
		<Label class="mb-2 block text-sm text-muted-foreground">{m.settings_language()}</Label>
		<select
			class="w-full rounded-lg border bg-background px-3 py-2 text-sm"
			value={currentLang}
			onchange={(e) => {
				const code = e.currentTarget.value;
				if (isLocale(code)) setLocale(code);
			}}
		>
			{#each languages as language (language.code)}
				<option value={language.code}>{language.label}</option>
			{/each}
		</select>
	</Card>
</div>
