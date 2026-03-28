<script lang="ts">
	import * as m from '$lib/paraglide/messages.js';
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

	let { data, form } = $props();

	type SendStep = 'consent' | 'amount' | 'qr' | 'done' | 'declined';
	let step = $state<SendStep>(data.needsConsent ? 'consent' : 'amount');

	let amount = $state('');
	let note = $state('');
	let qrDataUrl = $state('');
	let qrId = $state('');
	let pollInterval: ReturnType<typeof setInterval> | null = null;
	let secondsLeft = $state(0);
	let isExpired = $state(false);
	let completedName = $state('');
	let completedAmount = $state('');
	let qrUrl = $state('');
	let canShare = $derived(browser && typeof navigator.share === 'function');

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
		step = 'qr';
		startCountdown(expires);
		startPolling(id);
	}

	function shareLink() {
		navigator.share({ url: qrUrl });
	}

	function startCountdown(expires: string) {
		const expTime = new Date(expires).getTime();
		const update = () => {
			const left = Math.max(0, Math.floor((expTime - Date.now()) / 1000));
			secondsLeft = left;
			if (left <= 0) {
				isExpired = true;
				if (pollInterval) clearInterval(pollInterval);
			}
		};
		update();
		const interval = setInterval(update, 1000);
		return () => clearInterval(interval);
	}

	function startPolling(id: string) {
		pollInterval = setInterval(async () => {
			try {
				const res = await fetch(`/api/qr-status/${id}`);
				const data = await res.json();
				if (data.status === 'completed') {
					clearInterval(pollInterval!);
					completedName = data.otherName || '';
					completedAmount = data.formattedAmount || '';
					step = 'done';
				} else if (data.status === 'declined') {
					clearInterval(pollInterval!);
					step = 'declined';
				}
			} catch {
				// ignore polling errors
			}
		}, 2000);
	}

	function formatMinSec(seconds: number): string {
		const m = Math.floor(seconds / 60);
		const s = seconds % 60;
		return `${m}:${s.toString().padStart(2, '0')}`;
	}
</script>

<div class="flex min-h-dvh flex-col px-6 pt-14 pb-8">
	<!-- Consent step -->
	{#if step === 'consent'}
		<h1 class="mb-4 font-serif text-2xl font-semibold">{m.send_consent_title()}</h1>
		<p class="mb-3 text-sm leading-relaxed text-muted-foreground">{m.send_consent_body1()}</p>
		<p class="mb-3 text-sm leading-relaxed text-muted-foreground">{m.send_consent_body2()}</p>
		<p class="mb-6 text-sm leading-relaxed text-muted-foreground">{m.send_consent_body3()}</p>
		<div class="flex-1"></div>
		<form method="POST" action="?/consent" use:enhance>
			<Button
				type="submit"
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

		<form method="POST" action="?/createQr" use:enhance>
			<Label class="mb-2 text-sm text-muted-foreground">{m.send_amount_label()}</Label>
			<div class="mb-4 flex items-center gap-2">
				<span class="text-2xl font-medium text-muted-foreground">{data.unitSymbol}</span>
				<Input
					name="amount"
					type="number"
					step="0.01"
					min="0.01"
					placeholder="0.00"
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
						<CopyButton text={qrUrl} variant="outline" class="flex-1 rounded-xl text-sm">
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
				<p class="mb-6 font-mono text-lg text-muted-foreground tabular-nums">
					{formatMinSec(secondsLeft)}
				</p>
				<form method="POST" action="?/cancel" use:enhance>
					<input type="hidden" name="qrId" value={qrId} />
					<Button type="submit" variant="outline" class="rounded-xl">
						<XIcon class="mr-2 h-4 w-4" />
						{m.send_cancel()}
					</Button>
				</form>
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
