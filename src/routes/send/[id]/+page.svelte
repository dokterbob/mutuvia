<script lang="ts">
	import { enhance } from '$app/forms';
	import { getLocale } from '$lib/paraglide/runtime.js';
	import * as m from '$lib/paraglide/messages.js';
	import { Button } from '$lib/components/ui/button';
	import { Card } from '$lib/components/ui/card';
	import CheckIcon from '@lucide/svelte/icons/check';
	import ArrowRightIcon from '@lucide/svelte/icons/arrow-right';
	import ArrowLeftIcon from '@lucide/svelte/icons/arrow-left';
	import HomeIcon from '@lucide/svelte/icons/house';

	let { data, form } = $props();

	type Step = 'amount' | 'confirm' | 'done';

	let sendLoading = $state(false);
	let fastTrackLoading = $state(false);
	let fullOnboardingLoading = $state(false);

	let currencyFormatter = $derived(
		new Intl.NumberFormat(getLocale(), {
			style: 'currency',
			currency: (data.unitCode as string) ?? 'EUR'
		})
	);
	let fractionDigits = $derived(currencyFormatter.resolvedOptions().maximumFractionDigits ?? 2);

	// enteredAmount is empty by default; prefilledAmount from cookie (set before onboarding redirect)
	// is applied reactively when fractionDigits is available
	let enteredAmount = $state('');
	$effect(() => {
		if (data.prefilledAmount && !enteredAmount) {
			enteredAmount = String(data.prefilledAmount / Math.pow(10, fractionDigits));
		}
	});

	// If fixed amount and authenticated, start at confirm; otherwise start at amount entry
	// step is user-mutable state; the initial value is derived from data only once
	let _initialStep = $derived<Step>(
		data.amount != null && !data.needsAuth && !data.expired && !data.paused && !data.selfSend
			? 'confirm'
			: 'amount'
	);
	let step = $state<Step>('amount');
	let _stepInitialized = $state(false);
	$effect(() => {
		if (!_stepInitialized) {
			step = _initialStep;
			_stepInitialized = true;
		}
	});
	let currencySymbol = $derived(
		currencyFormatter.formatToParts(0).find((p) => p.type === 'currency')?.value ?? '€'
	);
	let amountStep = $derived(Math.pow(10, -fractionDigits));
	let amountPlaceholder = $derived((0).toFixed(fractionDigits));

	function fmt(cents: number): string {
		return currencyFormatter.format(cents / Math.pow(10, fractionDigits));
	}

	let parsedEnteredCents = $derived(
		Math.round((parseFloat(enteredAmount) || 0) * Math.pow(10, fractionDigits))
	);

	let displayAmountCents = $derived(data.amount != null ? data.amount : parsedEnteredCents);

	let balanceAfterCents = $derived(
		data.scannerBalance != null ? data.scannerBalance - displayAmountCents : null
	);

	// Hidden form value (in display units, server re-parses)
	let hiddenAmountValue = $derived(
		data.amount != null
			? (data.amount / Math.pow(10, fractionDigits)).toFixed(fractionDigits)
			: enteredAmount
	);

	$effect(() => {
		if (form?.success) {
			step = 'done';
		}
	});
</script>

<div class="mx-auto flex min-h-dvh w-full max-w-md flex-col px-6 pt-14 pb-8">
	{#if data.expired}
		<div class="flex flex-1 flex-col items-center justify-center text-center">
			<div class="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-muted text-3xl">
				⏱
			</div>
			<p class="mb-2 text-lg font-medium">{m.send_qr_inactive()}</p>
			<p class="text-sm text-muted-foreground">{data.error}</p>
		</div>
	{:else if data.paused}
		<div class="flex flex-1 flex-col items-center justify-center text-center">
			<div class="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-muted text-3xl">
				⏸
			</div>
			<p class="mb-2 text-lg font-medium">{m.send_qr_paused()}</p>
			<p class="text-sm text-muted-foreground">
				{m.send_qr_paused_body({ name: data.initiatorName ?? '' })}
			</p>
		</div>
	{:else if data.selfSend}
		<div class="flex flex-1 flex-col items-center justify-center text-center">
			<div class="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-muted text-3xl">
				🔄
			</div>
			<p class="mb-2 text-lg font-medium">{m.send_qr_self_send()}</p>
			<p class="text-sm text-muted-foreground">
				{m.send_qr_self_send_body()}
			</p>
		</div>
	{:else if data.needsAuth}
		<div class="flex flex-1 flex-col">
			<h1 class="mb-2 font-serif text-2xl font-semibold">
				{m.send_qr_pay_heading({ name: data.initiatorName ?? '' })}
			</h1>

			{#if data.description}
				<Card class="mb-4 rounded-xl bg-muted p-4">
					<p class="text-sm text-foreground italic">"{data.description}"</p>
				</Card>
			{/if}

			{#if data.amount != null}
				<div class="mb-6">
					<p class="text-3xl font-bold">{data.formattedAmount}</p>
				</div>
			{:else}
				<div class="mb-6">
					<label for="amount-unauth" class="mb-1 block text-sm font-medium text-muted-foreground">
						{m.send_qr_how_much()}
					</label>
					<div class="flex items-center gap-2">
						<span class="text-lg text-muted-foreground">{currencySymbol}</span>
						<input
							id="amount-unauth"
							type="number"
							min={amountStep}
							step={amountStep}
							placeholder={amountPlaceholder}
							bind:value={enteredAmount}
							class="w-full rounded-xl border border-input bg-background px-4 py-3 text-lg focus:ring-2 focus:ring-ring focus:outline-none"
						/>
					</div>
				</div>
			{/if}

			<p class="mb-6 text-sm text-muted-foreground">{m.send_qr_sign_in_required()}</p>

			<div class="flex-1"></div>

			<form
				method="POST"
				action="?/startFastTrack"
				use:enhance={() => {
					fastTrackLoading = true;
					return async ({ update }) => {
						try {
							await update();
						} finally {
							fastTrackLoading = false;
						}
					};
				}}
			>
				{#if data.amount == null}
					<input type="hidden" name="amount" value={enteredAmount} />
				{/if}
				<Button
					type="submit"
					loading={fastTrackLoading}
					class="w-full rounded-xl bg-[#2D4A32] py-6 text-base text-white hover:bg-[#3D6145]"
				>
					<CheckIcon class="mr-2 h-5 w-5" />
					{m.send_qr_fast_track()}
				</Button>
			</form>

			<form
				method="POST"
				action="?/startFullOnboarding"
				use:enhance={() => {
					fullOnboardingLoading = true;
					return async ({ update }) => {
						try {
							await update();
						} finally {
							fullOnboardingLoading = false;
						}
					};
				}}
				class="mt-2"
			>
				{#if data.amount == null}
					<input type="hidden" name="amount" value={enteredAmount} />
				{/if}
				<Button
					type="submit"
					variant="outline"
					loading={fullOnboardingLoading}
					class="w-full rounded-xl py-6 text-base"
				>
					{m.send_qr_full_onboarding()}
					<ArrowRightIcon class="ml-2 h-4 w-4" />
				</Button>
			</form>
		</div>
	{:else if step === 'done'}
		<div class="flex flex-1 flex-col items-center justify-center text-center">
			<div
				class="mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-[#2D4A32] text-white"
			>
				<CheckIcon class="h-10 w-10" />
			</div>
			<h1 class="mb-2 font-serif text-2xl font-semibold">{m.send_qr_done_heading()}</h1>
			<p class="mb-8 text-muted-foreground">
				{m.send_qr_done_body({
					amount: form?.formattedAmount ?? '',
					name: form?.initiatorName ?? ''
				})}
			</p>
			<Button
				href="/home"
				class="w-full rounded-xl bg-[#2D4A32] py-6 text-base text-white hover:bg-[#3D6145]"
			>
				<HomeIcon class="mr-2 h-5 w-5" />
				{m.send_qr_back_home()}
			</Button>
		</div>
	{:else if step === 'amount'}
		<!-- Open amount: scanner enters how much to pay -->
		<div class="flex flex-1 flex-col">
			<h1 class="mb-2 font-serif text-2xl font-semibold">
				{m.send_qr_pay_heading({ name: data.initiatorName ?? '' })}
			</h1>

			{#if data.description}
				<Card class="mb-4 rounded-xl bg-muted p-4">
					<p class="text-sm text-foreground italic">"{data.description}"</p>
				</Card>
			{/if}

			<div class="mb-6">
				<label for="amount-input" class="mb-1 block text-sm font-medium text-muted-foreground">
					{m.send_qr_how_much()}
				</label>
				<div class="flex items-center gap-2">
					<span class="text-lg text-muted-foreground">{currencySymbol}</span>
					<input
						id="amount-input"
						type="number"
						min={amountStep}
						step={amountStep}
						placeholder={amountPlaceholder}
						bind:value={enteredAmount}
						class="w-full rounded-xl border border-input bg-background px-4 py-3 text-lg focus:ring-2 focus:ring-ring focus:outline-none"
					/>
				</div>
			</div>

			{#if form?.error}
				<p class="mb-3 text-sm text-red-600">{form.error}</p>
			{/if}

			<div class="flex-1"></div>

			<Button
				onclick={() => {
					const v = parseFloat(enteredAmount);
					if (v > 0) step = 'confirm';
				}}
				disabled={!enteredAmount || parseFloat(enteredAmount) <= 0}
				class="w-full rounded-xl bg-[#2D4A32] py-6 text-base text-white hover:bg-[#3D6145]"
			>
				{m.send_qr_continue()}
				<ArrowRightIcon class="ml-2 h-4 w-4" />
			</Button>
		</div>
	{:else if step === 'confirm'}
		<!-- Confirm step -->
		<div class="flex flex-1 flex-col">
			<h1 class="mb-6 font-serif text-2xl font-semibold">{m.send_qr_confirm_heading()}</h1>

			<Card class="mb-6 rounded-xl p-5">
				<dl class="space-y-3 text-sm">
					<div class="flex justify-between">
						<dt class="text-muted-foreground">{m.send_qr_confirm_to()}</dt>
						<dd class="font-medium">{data.initiatorName}</dd>
					</div>
					{#if data.description}
						<div class="flex justify-between">
							<dt class="text-muted-foreground">{m.send_qr_confirm_for()}</dt>
							<dd class="font-medium italic">{data.description}</dd>
						</div>
					{/if}
					<div class="flex justify-between border-t pt-3">
						<dt class="text-muted-foreground">{m.send_qr_confirm_amount()}</dt>
						<dd class="text-lg font-bold">{fmt(displayAmountCents)}</dd>
					</div>
					{#if data.scannerBalance != null && balanceAfterCents != null}
						<div class="flex justify-between text-xs text-muted-foreground">
							<dt>{m.send_qr_confirm_balance_after()}</dt>
							<dd>{fmt(balanceAfterCents)}</dd>
						</div>
					{/if}
				</dl>
			</Card>

			{#if form?.error}
				<p class="mb-3 text-sm text-red-600">{form.error}</p>
			{/if}

			<div class="flex-1"></div>

			<form
				method="POST"
				action="?/send"
				use:enhance={() => {
					sendLoading = true;
					return async ({ update }) => {
						try {
							await update();
						} finally {
							sendLoading = false;
						}
					};
				}}
			>
				<input type="hidden" name="amount" value={hiddenAmountValue} />
				<Button
					type="submit"
					loading={sendLoading}
					class="w-full rounded-xl bg-[#2D4A32] py-6 text-base text-white hover:bg-[#3D6145]"
				>
					<CheckIcon class="mr-2 h-5 w-5" />
					{m.send_qr_send_button()}
				</Button>
			</form>

			{#if data.amount == null}
				<Button
					variant="ghost"
					onclick={() => {
						step = 'amount';
					}}
					class="mt-2 w-full text-sm text-muted-foreground"
				>
					<ArrowLeftIcon class="mr-1 h-4 w-4" />
					{m.send_qr_change_amount()}
				</Button>
			{/if}
		</div>
	{/if}
</div>
