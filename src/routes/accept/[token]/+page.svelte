<script lang="ts">
	import * as m from '$lib/paraglide/messages.js';
	import { enhance } from '$app/forms';
	import { page } from '$app/state';
	import { env } from '$env/dynamic/public';
	import { Button } from '$lib/components/ui/button';
	import { Card } from '$lib/components/ui/card';
	import CheckIcon from '@lucide/svelte/icons/check';
	import XIcon from '@lucide/svelte/icons/x';
	import ArrowRightIcon from '@lucide/svelte/icons/arrow-right';

	let { data, form } = $props();

	let fastTrackLoading = $state(false);
	let fullOnboardingLoading = $state(false);
	let unauthDeclineLoading = $state(false);
	let acceptLoading = $state(false);
	let declineLoading = $state(false);

	const appName = env.PUBLIC_APP_NAME || 'Mutuvia';

	const ogTitle = $derived(
		data.expired
			? m.og_expired_title()
			: data.direction === 'send'
				? m.og_send_title({ amount: data.formattedAmount ?? '' })
				: m.og_receive_title({ amount: data.formattedAmount ?? '' })
	);
	const ogDescription = $derived(m.og_description());
</script>

<svelte:head>
	<title>{ogTitle} — {appName}</title>
	<meta property="og:title" content={ogTitle} />
	<meta property="og:description" content={ogDescription} />
	<meta property="og:url" content={page.url.href} />
	<meta name="twitter:title" content={ogTitle} />
	<meta name="twitter:description" content={ogDescription} />
</svelte:head>

{#snippet transactionSummary()}
	<h1 class="mb-4 font-serif text-2xl font-semibold">
		{#if data.direction === 'send'}
			{m.accept_send_prompt({
				name: data.initiatorName ?? '',
				amount: data.formattedAmount ?? ''
			})}
		{:else}
			{m.accept_receive_prompt({
				name: data.initiatorName ?? '',
				amount: data.formattedAmount ?? ''
			})}
		{/if}
	</h1>

	{#if data.note}
		<Card class="mb-4 rounded-xl bg-muted p-4">
			<p class="text-sm text-foreground italic">"{data.note}"</p>
		</Card>
	{/if}
{/snippet}

<div class="mx-auto flex min-h-dvh w-full max-w-md flex-col px-6 pt-14 pb-8">
	{#if data.expired}
		<div class="flex flex-1 flex-col items-center justify-center text-center">
			<div class="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-muted text-3xl">
				⏱
			</div>
			<p class="mb-2 text-lg font-medium">{m.accept_expired()}</p>
			<p class="text-sm text-muted-foreground">{data.error}</p>
		</div>
	{:else if data.needsAuth}
		<!-- Unauthenticated view: show transaction details + sign-in CTAs -->
		<div class="flex flex-1 flex-col">
			{@render transactionSummary()}

			<p class="mb-6 text-sm text-muted-foreground">{m.accept_sign_in_required()}</p>

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
				<Button
					type="submit"
					loading={fastTrackLoading}
					class="w-full rounded-xl bg-[#2D4A32] py-6 text-base text-white hover:bg-[#3D6145]"
				>
					<CheckIcon class="mr-2 h-5 w-5" />
					{m.accept_fast_cta()}
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
				<Button
					type="submit"
					variant="outline"
					loading={fullOnboardingLoading}
					class="w-full rounded-xl py-6 text-base"
				>
					{m.accept_full_onboarding_cta()}
					<ArrowRightIcon class="ml-2 h-4 w-4" />
				</Button>
			</form>

			<!-- Decline is intentionally available to unauthenticated users — they should
			     be able to dismiss a QR without signing in. -->
			<form
				method="POST"
				action="?/decline"
				use:enhance={() => {
					unauthDeclineLoading = true;
					return async ({ update }) => {
						try {
							await update();
						} finally {
							unauthDeclineLoading = false;
						}
					};
				}}
				class="mt-2"
			>
				<input type="hidden" name="qrId" value={data.qrId} />
				<Button
					type="submit"
					variant="ghost"
					loading={unauthDeclineLoading}
					class="w-full text-sm text-muted-foreground"
				>
					<XIcon class="mr-1 h-4 w-4" />
					{m.accept_decline()}
				</Button>
			</form>
		</div>
	{:else}
		<!-- Authenticated view: accept/decline -->
		<div class="flex flex-1 flex-col">
			{@render transactionSummary()}

			<p class="mb-2 text-sm text-muted-foreground">
				{m.accept_balance_label({
					name: data.initiatorName ?? '',
					balance: data.initiatorBalance ?? ''
				})}
			</p>

			<p class="mb-4 text-sm text-muted-foreground">
				{#if data.direction === 'send'}
					{m.accept_send_balance_impact({
						name: data.initiatorName ?? '',
						amount: data.formattedAmount ?? ''
					})}
				{:else}
					{m.accept_receive_balance_impact({
						name: data.initiatorName ?? '',
						amount: data.formattedAmount ?? ''
					})}
				{/if}
			</p>

			<Card class="mb-4 rounded-xl border-blue-200 bg-blue-50 p-4">
				<p class="text-sm text-blue-900">
					{m.accept_first_time_notice()}
				</p>
			</Card>

			{#if form?.error}
				<p class="mb-3 text-sm text-red-600">{form.error}</p>
			{/if}

			<div class="flex-1"></div>

			<form
				method="POST"
				action="?/accept"
				use:enhance={() => {
					acceptLoading = true;
					return async ({ update }) => {
						try {
							await update();
						} finally {
							acceptLoading = false;
						}
					};
				}}
			>
				<input type="hidden" name="qrId" value={data.qrId} />
				<Button
					type="submit"
					loading={acceptLoading}
					class="w-full rounded-xl bg-[#2D4A32] py-6 text-base text-white hover:bg-[#3D6145]"
				>
					<CheckIcon class="mr-2 h-5 w-5" />
					{m.accept_cta()}
				</Button>
			</form>

			<form
				method="POST"
				action="?/decline"
				use:enhance={() => {
					declineLoading = true;
					return async ({ update }) => {
						try {
							await update();
						} finally {
							declineLoading = false;
						}
					};
				}}
				class="mt-2"
			>
				<input type="hidden" name="qrId" value={data.qrId} />
				<Button
					type="submit"
					variant="ghost"
					loading={declineLoading}
					class="w-full text-sm text-muted-foreground"
				>
					<XIcon class="mr-1 h-4 w-4" />
					{m.accept_decline()}
				</Button>
			</form>
		</div>
	{/if}
</div>
