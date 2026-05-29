<script lang="ts">
	import * as m from '$lib/paraglide/messages.js';
	import { getLocale } from '$lib/paraglide/runtime.js';
	import { flushSync } from 'svelte';
	import { browser } from '$app/environment';
	import { enhance } from '$app/forms';
	import { goto } from '$app/navigation';
	import { Button } from '$lib/components/ui/button';
	import * as Dialog from '$lib/components/ui/dialog';
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
	import { sseManager } from '$lib/sse-client';
	import { subscribeToPush } from '$lib/push-subscribe';

	let { data, form } = $props();

	type ReceiveStep = 'amount' | 'qr' | 'done' | 'declined';
	let step = $state<ReceiveStep>('amount');

	let amount = $state('');
	let note = $state('');
	let reusable = $state(false);
	let showAdvanced = $state(false);
	let qrDataUrl = $state('');
	let qrId = $state('');
	let secondsLeft = $state(0);
	let isExpired = $state(false);
	let expiresAt = $state<string | null>(null);
	let completedName = $state('');
	let completedAmount = $state('');
	let qrUrl = $state('');
	let isReusable = $state(false);
	let paymentCount = $state(0);
	let createQrLoading = $state(false);
	let cancelLoading = $state(false);
	let pauseLoading = $state(false);
	let archiveLoading = $state(false);
	let cancelDialogOpen = $state(false);
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
	let shareDescription = $state('');
	let copyText = $derived(`${shareDescription}\n${qrUrl}`);

	$effect(() => {
		if (form?.qrUrl) {
			shareDescription = form.shareDescription ?? '';
			isReusable = form.isReusable ?? false;
			paymentCount = form.paymentCount ?? 0;
			generateQr(form.qrUrl, form.qrId, form.expiresAt ?? null);
		}
	});

	$effect(() => {
		if (!data.resumeQr) return;
		if (data.resumeQr.isExpired) {
			isExpired = true;
			isReusable = data.resumeQr.isReusable ?? false;
			step = 'qr';
		} else {
			shareDescription = data.resumeQr.shareDescription ?? '';
			isReusable = data.resumeQr.isReusable ?? false;
			paymentCount = data.resumeQr.paymentCount ?? 0;
			generateQr(data.resumeQr.qrUrl, data.resumeQr.qrId, data.resumeQr.expiresAt);
		}
	});

	async function generateQr(url: string, id: string, expires: string | null) {
		qrUrl = url;
		qrDataUrl = await QRCode.toDataURL(url, { width: 280, margin: 2, color: { dark: '#2D4A32' } });
		qrId = id;
		expiresAt = expires;
		step = 'qr';
		// Best-effort: prompt for push notifications so the user is notified
		// when their QR is scanned, even if the app is backgrounded.
		subscribeToPush().catch((err) => console.warn('[push] subscribeToPush failed:', err));
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
	// Only runs for non-reusable QRs with an expiry
	$effect(() => {
		if (step !== 'qr' || !expiresAt || isReusable) return;
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

	// SSE: subscribe when QR is active, auto-cleans on completion, expiry, or unmount
	$effect(() => {
		if (step !== 'qr' || !qrId || isExpired) return;
		const id = qrId;
		return sseManager.on({
			onQrCompleted: (e) => {
				if (e.qrId !== id) return;
				completedName = e.otherName;
				completedAmount = e.formattedAmount;
				step = 'done';
			},
			onQrDeclined: (e) => {
				if (e.qrId !== id) return;
				step = 'declined';
			},
			onReusablePayment: (e) => {
				if (e.paymentRequestId !== id) return;
				paymentCount += 1;
			}
		});
	});
</script>

<div class="flex min-h-dvh flex-col px-6 pt-14 pb-8">
	<!-- Amount step -->
	{#if step === 'amount'}
		<h1 class="mb-4 font-serif text-2xl font-semibold">{m.home_receive()}</h1>
		<p class="mb-4 text-sm text-muted-foreground">{m.receive_helper()}</p>

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
			<Label class="mb-2 text-sm text-muted-foreground">
				{m.send_amount_label()}{reusable ? ` ${m.receive_amount_optional()}` : ''}
			</Label>
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
				placeholder={m.receive_note_placeholder()}
				bind:value={note}
				class="mb-1 w-full rounded-lg border bg-background px-3 py-2.5 text-sm outline-none focus:border-[#2D4A32]"
				rows="2"
			></textarea>
			<p class="mb-4 text-right text-xs text-muted-foreground">{note.length}/120</p>

			<!-- Advanced options -->
			<details class="mb-6" bind:open={showAdvanced}>
				<summary class="cursor-pointer text-sm text-muted-foreground select-none">
					{m.receive_advanced_options()}
				</summary>
				<div class="mt-3 rounded-lg border bg-muted/40 p-4">
					<label class="flex items-start gap-3">
						<input
							type="checkbox"
							name="reusable"
							bind:checked={reusable}
							class="mt-0.5 h-4 w-4 rounded border-gray-300 text-[#2D4A32] accent-[#2D4A32]"
						/>
						<div>
							<p class="text-sm font-medium">{m.receive_reusable_label()}</p>
							<p class="text-xs text-muted-foreground">
								{m.receive_reusable_description()}
							</p>
						</div>
					</label>
				</div>
			</details>

			{#if form?.error}
				<p class="mb-3 text-sm text-red-600">{form.error}</p>
			{/if}

			<div class="flex-1"></div>
			<Button
				type="submit"
				loading={createQrLoading}
				class="w-full rounded-xl bg-[#2D4A32] py-6 text-base text-white hover:bg-[#3D6145] disabled:opacity-40"
				disabled={!reusable && (!amount || parseFloat(amount) <= 0)}
			>
				<QrCodeIcon class="mr-2 h-5 w-5" />
				{m.receive_cta()}
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
					{m.receive_back_home()}
				</Button>
			{:else}
				{#if isReusable}
					<p class="mb-2 text-sm text-muted-foreground">{m.receive_reusable_caption()}</p>
					<span
						class="mb-4 inline-flex items-center rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800"
					>
						{m.receive_reusable_badge()}
					</span>
				{:else}
					<p class="mb-4 text-sm text-muted-foreground">{m.receive_qr_caption()}</p>
				{/if}
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
				{#if isReusable}
					<p class="mb-6 text-sm text-muted-foreground">
						{paymentCount === 1
							? m.receive_reusable_payment_count_singular({ count: String(paymentCount) })
							: m.receive_reusable_payment_count_plural({ count: String(paymentCount) })}
					</p>
					<div class="flex flex-col items-center gap-2">
						<Button variant="outline" class="rounded-xl" onclick={() => goto('/home')}>
							<XIcon class="mr-2 h-4 w-4" />
							{m.qr_close()}
						</Button>
						<form
							method="POST"
							action="?/pause"
							use:enhance={() => {
								flushSync(() => {
									pauseLoading = true;
								});
								return async ({ update }) => {
									try {
										await update();
									} finally {
										flushSync(() => {
											pauseLoading = false;
										});
									}
								};
							}}
						>
							<input type="hidden" name="qrId" value={qrId} />
							<Button
								type="submit"
								loading={pauseLoading}
								variant="ghost"
								class="text-sm text-muted-foreground"
							>
								{m.receive_reusable_pause()}
							</Button>
						</form>
						<form
							method="POST"
							action="?/archive"
							use:enhance={() => {
								flushSync(() => {
									archiveLoading = true;
								});
								return async ({ update }) => {
									try {
										await update();
									} finally {
										flushSync(() => {
											archiveLoading = false;
										});
									}
								};
							}}
						>
							<input type="hidden" name="qrId" value={qrId} />
							<Button
								type="submit"
								loading={archiveLoading}
								variant="ghost"
								class="text-sm text-muted-foreground"
							>
								{m.receive_reusable_archive()}
							</Button>
						</form>
					</div>
				{:else}
					<p class="mb-6 text-sm text-muted-foreground">
						{m.qr_expires({ time: formatTimeRemaining(secondsLeft, getLocale()) })}
					</p>
					<div class="flex flex-col items-center gap-2">
						<Button variant="outline" class="rounded-xl" onclick={() => goto('/home')}>
							<XIcon class="mr-2 h-4 w-4" />
							{m.qr_close()}
						</Button>
						<Button
							type="button"
							variant="ghost"
							class="text-sm text-muted-foreground"
							onclick={() => (cancelDialogOpen = true)}
						>
							{m.send_cancel()}
						</Button>
						<Dialog.Dialog bind:open={cancelDialogOpen}>
							<Dialog.DialogContent showCloseButton={false}>
								<Dialog.DialogHeader>
									<Dialog.DialogTitle>{m.cancel_confirm_title()}</Dialog.DialogTitle>
									<Dialog.DialogDescription>{m.cancel_confirm_body()}</Dialog.DialogDescription>
								</Dialog.DialogHeader>
								<Dialog.DialogFooter>
									<Dialog.DialogClose>
										{#snippet child({ props })}
											<Button variant="outline" {...props}>{m.cancel_confirm_dismiss()}</Button>
										{/snippet}
									</Dialog.DialogClose>
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
										<Button type="submit" loading={cancelLoading} variant="destructive">
											{m.cancel_confirm_yes()}
										</Button>
									</form>
								</Dialog.DialogFooter>
							</Dialog.DialogContent>
						</Dialog.Dialog>
					</div>
				{/if}
			{/if}
		</div>
	{/if}

	<!-- Declined step -->
	{#if step === 'declined'}
		<div class="flex flex-1 flex-col items-center justify-center text-center">
			<div class="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-red-100 text-3xl">
				✕
			</div>
			<p class="mb-6 text-lg font-medium">{m.receive_declined()}</p>
			<Button class="w-full rounded-xl bg-[#2D4A32] py-6 text-white" onclick={() => goto('/home')}>
				{m.receive_back_home()}
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
				{m.receive_done({ amount: completedAmount, name: completedName })}
			</p>
			<Button class="w-full rounded-xl bg-[#2D4A32] py-6 text-white" onclick={() => goto('/home')}>
				{m.receive_back_home()}
			</Button>
		</div>
	{/if}
</div>
