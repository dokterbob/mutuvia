<script lang="ts">
	import * as m from '$lib/paraglide/messages.js';
	import { getLocale } from '$lib/paraglide/runtime.js';
	import { flushSync } from 'svelte';
	import { browser } from '$app/environment';
	import { enhance } from '$app/forms';
	import { goto } from '$app/navigation';
	import { Button } from '$lib/components/ui/button';
	import { CopyButton } from '$lib/components/ui/copy-button';
	import { Card } from '$lib/components/ui/card';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import ArrowLeftIcon from '@lucide/svelte/icons/arrow-left';
	import QrCodeIcon from '@lucide/svelte/icons/qr-code';
	import ShareIcon from '@lucide/svelte/icons/share';
	import XIcon from '@lucide/svelte/icons/x';
	import QRCode from 'qrcode';
	import { formatTimeRemaining } from '$lib/format-time';

	let { data, form } = $props();

	type SendStep = 'consent' | 'amount' | 'qr' | 'done' | 'declined';
	let step = $state<SendStep>(data.needsConsent ? 'consent' : 'amount');

	let amount = $state('');
	let note = $state('');
	let qrDataUrl = $state('');
	let qrId = $state('');
	let secondsLeft = $state(0);
	let expiresAt = $state('');
	let isExpired = $state(false);
	let completedName = $state('');
	let completedAmount = $state('');
	let qrUrl = $state('');
	let consentLoading = $state(false);
	let createQrLoading = $state(false);
	let cancelLoading = $state(false);
	let canShare = $derived(browser && typeof navigator.share === 'function');
	let currencyFormatter = $derived(
		new Intl.NumberFormat(getLocale(), { style: 'currency', currency: data.unitCode })
	);
	let currencySymbol = $derived(
		currencyFormatter.formatToParts(0).find((p) => p.type === 'currency')?.value ?? data.unitCode
	);
	let fractionDigits = $derived(currencyFormatter.resolvedOptions().maximumFractionDigits ?? 2);
	let amountStep = $derived(Math.pow(10, -fractionDigits));
	let amountPlaceholder = $derived((0).toFixed(fractionDigits));
	let formattedAmount = $derived(currencyFormatter.format(parseFloat(amount || '0')));
	let shareDescription = $derived(
		note.trim()
			? m.qr_share_text_with_note({
					amount: formattedAmount,
					appName: data.appName,
					note: note.trim()
				})
			: m.qr_share_text({ amount: formattedAmount, appName: data.appName })
	);
	let copyText = $derived(`${shareDescription}\n${qrUrl}`);

	$effect(() => {
		if (form?.consented) {
			step = 'amount';
		}
		if (form?.qrUrl) {
			generateQr(form.qrUrl, form.qrId, form.expiresAt);
		}
	});

	async function generateQr(url: string, id: string, expires: string) {
		qrUrl = url;
		qrDataUrl = await QRCode.toDataURL(url, { width: 280, margin: 2, color: { dark: '#2D4A32' } });
		qrId = id;
		expiresAt = expires;
		step = 'qr';
	}

	async function shareLink() {
		try {
			await navigator.share({ text: shareDescription, url: qrUrl });
			goto('/home');
		} catch {
			// user cancelled or share failed — stay on QR screen
		}
	}

	// Countdown: auto-cleans when step leaves 'qr' or component unmounts
	$effect(() => {
		if (step !== 'qr' || !expiresAt) return;
		const expTime = new Date(expiresAt).getTime();
		const update = () => {
			const left = Math.max(0, Math.floor((expTime - Date.now()) / 1000));
			secondsLeft = left;
			if (left <= 0) {
				isExpired = true;
				clearInterval(interval);
			}
		};
		update();
		const interval = setInterval(update, 1000);
		return () => clearInterval(interval);
	});

	// Polling: stops on expiry, completion, decline, or unmount
	$effect(() => {
		if (step !== 'qr' || !qrId || isExpired) return;
		const id = qrId;
		const interval = setInterval(async () => {
			try {
				const res = await fetch(`/api/qr-status/${id}`);
				const json = await res.json();
				if (json.status === 'completed') {
					completedName = json.otherName || '';
					completedAmount = json.formattedAmount || '';
					step = 'done';
				} else if (json.status === 'declined') {
					step = 'declined';
				}
			} catch {
				// ignore polling errors
			}
		}, 2000);
		return () => clearInterval(interval);
	});
</script>

<div class="flex min-h-dvh flex-col px-6 pt-14 pb-8">
	<!-- Consent step -->
	{#if step === 'consent'}
		<h1 class="mb-4 font-serif text-2xl font-semibold">{m.send_consent_title()}</h1>
		<p class="mb-3 text-sm leading-relaxed text-muted-foreground">{m.send_consent_body1()}</p>
		<p class="mb-3 text-sm leading-relaxed text-muted-foreground">{m.send_consent_body2()}</p>
		<p class="mb-6 text-sm leading-relaxed text-muted-foreground">{m.send_consent_body3()}</p>
		<div class="flex-1"></div>
		<form
			method="POST"
			action="?/consent"
			use:enhance={() => {
				flushSync(() => {
					consentLoading = true;
				});
				return async ({ update }) => {
					try {
						await update();
					} finally {
						flushSync(() => {
							consentLoading = false;
						});
					}
				};
			}}
		>
			<Button
				type="submit"
				loading={consentLoading}
				class="w-full rounded-xl bg-[#2D4A32] py-6 text-base text-white hover:bg-[#3D6145]"
			>
				{m.send_consent_cta()}
			</Button>
		</form>
		<Button
			variant="ghost"
			class="mt-2 w-full text-sm text-muted-foreground"
			onclick={() => goto('/home')}
		>
			{m.send_consent_cancel()}
		</Button>
	{/if}

	<!-- Amount step -->
	{#if step === 'amount'}
		<h1 class="mb-4 font-serif text-2xl font-semibold">{m.home_send()}</h1>

		<form
			method="POST"
			action="?/createQr"
			use:enhance={() => {
				flushSync(() => {
					createQrLoading = true;
				});
				return async ({ update }) => {
					try {
						await update({ reset: false });
					} finally {
						flushSync(() => {
							createQrLoading = false;
						});
					}
				};
			}}
		>
			<Label class="mb-2 text-sm text-muted-foreground">{m.send_amount_label()}</Label>
			<div class="mb-4 flex items-center gap-2">
				<span class="text-2xl font-medium text-muted-foreground">{currencySymbol}</span>
				<Input
					name="amount"
					type="number"
					step={amountStep}
					min={amountStep}
					placeholder={amountPlaceholder}
					bind:value={amount}
					class="h-14 font-serif text-3xl font-semibold"
				/>
			</div>

			<Label class="mb-2 text-sm text-muted-foreground">Note</Label>
			<textarea
				name="note"
				maxlength="120"
				placeholder={m.send_note_placeholder()}
				bind:value={note}
				class="mb-1 w-full rounded-lg border bg-background px-3 py-2.5 text-sm outline-none focus:border-[#2D4A32]"
				rows="2"
			></textarea>
			<p class="mb-6 text-right text-xs text-muted-foreground">{note.length}/120</p>

			{#if form?.error}
				<p class="mb-3 text-sm text-red-600">{form.error}</p>
			{/if}

			<div class="flex-1"></div>
			<Button
				type="submit"
				loading={createQrLoading}
				class="w-full rounded-xl bg-[#2D4A32] py-6 text-base text-white hover:bg-[#3D6145] disabled:opacity-40"
				disabled={!amount || parseFloat(amount) <= 0}
			>
				<QrCodeIcon class="mr-2 h-5 w-5" />
				{m.send_cta()}
			</Button>
			<Button
				variant="ghost"
				class="mt-2 w-full text-sm text-muted-foreground"
				onclick={() => goto('/home')}
			>
				<ArrowLeftIcon class="mr-1 h-3 w-3" />
				{m.consent_back()}
			</Button>
		</form>
	{/if}

	<!-- QR step -->
	{#if step === 'qr'}
		<div class="flex flex-1 flex-col items-center justify-center text-center">
			{#if isExpired}
				<Card class="rounded-2xl bg-muted p-8">
					<p class="text-muted-foreground">{m.send_qr_expired()}</p>
				</Card>
				<Button
					class="mt-4 w-full rounded-xl bg-[#2D4A32] py-6 text-white"
					onclick={() => goto('/home')}
				>
					<ArrowLeftIcon class="mr-2 h-4 w-4" />
					{m.send_back_home()}
				</Button>
			{:else}
				<p class="mb-4 text-sm text-muted-foreground">{m.send_qr_caption()}</p>
				{#if qrDataUrl}
					<img src={qrDataUrl} alt="QR Code" class="mb-4 rounded-2xl" width="280" height="280" />
				{/if}
				{#if qrUrl}
					<p class="mb-2 max-w-[280px] truncate text-xs text-muted-foreground">{qrUrl}</p>
					<div class="mb-4 flex gap-2">
						<CopyButton text={copyText} variant="outline" class="flex-1 rounded-xl text-sm">
							{m.qr_copy_link()}
						</CopyButton>
						{#if canShare}
							<Button variant="outline" class="flex-1 rounded-xl text-sm" onclick={shareLink}>
								<ShareIcon class="mr-2 h-4 w-4" />
								{m.qr_share()}
							</Button>
						{/if}
					</div>
				{/if}
				<p class="mb-6 text-sm text-muted-foreground">
					{m.qr_expires({ time: formatTimeRemaining(secondsLeft, getLocale()) })}
				</p>
				<div class="flex flex-col items-center gap-2">
					<Button variant="outline" class="rounded-xl" onclick={() => goto('/home')}>
						<XIcon class="mr-2 h-4 w-4" />
						{m.qr_close()}
					</Button>
					<form
						method="POST"
						action="?/cancel"
						use:enhance={() => {
							flushSync(() => {
								cancelLoading = true;
							});
							return async ({ update }) => {
								try {
									await update();
								} finally {
									flushSync(() => {
										cancelLoading = false;
									});
								}
							};
						}}
					>
						<input type="hidden" name="qrId" value={qrId} />
						<Button
							type="submit"
							loading={cancelLoading}
							variant="ghost"
							class="text-sm text-muted-foreground"
						>
							{m.send_cancel()}
						</Button>
					</form>
				</div>
			{/if}
		</div>
	{/if}

	<!-- Declined step -->
	{#if step === 'declined'}
		<div class="flex flex-1 flex-col items-center justify-center text-center">
			<div class="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-red-100 text-3xl">
				✕
			</div>
			<p class="mb-6 text-lg font-medium">{m.send_declined()}</p>
			<Button class="w-full rounded-xl bg-[#2D4A32] py-6 text-white" onclick={() => goto('/home')}>
				{m.send_back_home()}
			</Button>
		</div>
	{/if}

	<!-- Done step -->
	{#if step === 'done'}
		<div class="flex flex-1 flex-col items-center justify-center text-center">
			<div
				class="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-100 text-3xl"
			>
				✓
			</div>
			<p class="mb-6 text-lg font-medium">
				{m.send_done({ amount: completedAmount, name: completedName })}
			</p>
			<Button class="w-full rounded-xl bg-[#2D4A32] py-6 text-white" onclick={() => goto('/home')}>
				{m.send_back_home()}
			</Button>
		</div>
	{/if}
</div>
