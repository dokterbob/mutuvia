<script lang="ts">
	import * as m from '$lib/paraglide/messages.js';
	import { enhance } from '$app/forms';
	import { Button } from '$lib/components/ui/button';
	import { Card } from '$lib/components/ui/card';
	import { IconCheck, IconX } from '@tabler/icons-svelte';
	import { browser } from '$app/environment';

	let { data, form } = $props();

	// First-time notice (localStorage)
	let showNotice = $state(false);

	$effect(() => {
		if (browser && !data.expired) {
			const dismissed = localStorage.getItem('mutuvia_accept_notice_dismissed');
			if (!dismissed) {
				showNotice = true;
			}
		}
	});

	function dismissNotice() {
		showNotice = false;
		localStorage.setItem('mutuvia_accept_notice_dismissed', 'true');
	}
</script>

<div class="mx-auto flex min-h-dvh w-full max-w-md flex-col px-6 pb-8 pt-14">
	{#if data.expired}
		<div class="flex flex-1 flex-col items-center justify-center text-center">
			<div class="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-muted text-3xl">
				⏱
			</div>
			<p class="mb-2 text-lg font-medium">{m.accept_expired()}</p>
			<p class="text-sm text-muted-foreground">{data.error}</p>
		</div>
	{:else}
		<div class="flex flex-1 flex-col">
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
					<p class="text-sm italic text-foreground">"{data.note}"</p>
				</Card>
			{/if}

			<p class="mb-4 text-sm text-muted-foreground">
				{m.accept_balance_label({
					name: data.initiatorName ?? '',
					balance: data.initiatorBalance ?? ''
				})}
			</p>

			{#if showNotice}
				<Card class="mb-4 rounded-xl border-blue-200 bg-blue-50 p-4">
					<p class="mb-2 text-sm text-blue-900">
						{m.accept_first_time_notice()}
					</p>
					<button
						class="text-xs font-medium text-blue-700 hover:underline"
						onclick={dismissNotice}
					>
						{m.common_dismiss()}
					</button>
				</Card>
			{/if}

			{#if form?.error}
				<p class="mb-3 text-sm text-red-600">{form.error}</p>
			{/if}

			<div class="flex-1"></div>

			<form method="POST" action="?/accept" use:enhance>
				<input type="hidden" name="qrId" value={data.qrId} />
				<Button
					type="submit"
					class="w-full rounded-xl bg-[#2D4A32] py-6 text-base text-white hover:bg-[#3D6145]"
				>
					<IconCheck class="mr-2 h-5 w-5" />
					{m.accept_cta()}
				</Button>
			</form>

			<form method="POST" action="?/decline" use:enhance class="mt-2">
				<input type="hidden" name="qrId" value={data.qrId} />
				<Button type="submit" variant="ghost" class="w-full text-sm text-muted-foreground">
					<IconX class="mr-1 h-4 w-4" />
					{m.accept_decline()}
				</Button>
			</form>
		</div>
	{/if}
</div>
