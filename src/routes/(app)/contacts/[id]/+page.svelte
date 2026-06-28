<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script lang="ts">
	import * as m from '$lib/paraglide/messages.js';
	import { goto } from '$app/navigation';
	import ArrowLeftIcon from '@lucide/svelte/icons/arrow-left';
	import ContactAvatar from '$lib/components/contact-avatar.svelte';

	let { data } = $props();

	const { contact, transactions } = $derived(data);

	function formatDate(date: Date | string): string {
		return new Date(date).toLocaleDateString(undefined, {
			month: 'short',
			day: 'numeric',
			year: 'numeric'
		});
	}

	const balanceLabel = $derived(
		contact.balance > 0
			? m.contacts_detail_owed_to_you()
			: contact.balance < 0
				? m.contacts_detail_you_owe()
				: m.contacts_detail_settled()
	);
</script>

<div class="flex min-h-dvh flex-col px-6 pt-14 pb-8">
	<div class="mb-6 flex items-center gap-3">
		<button
			onclick={() => goto('/contacts')}
			class="text-muted-foreground"
			aria-label={m.contacts_back_to_contacts()}
		>
			<ArrowLeftIcon class="h-5 w-5" />
		</button>
		<h1 class="font-serif text-xl font-semibold">{contact.name}</h1>
	</div>

	<!-- Hero -->
	<div class="mb-8 flex flex-col items-center gap-3">
		<ContactAvatar name={contact.name} class="h-16 w-16 text-lg" />
		<p class="font-serif text-2xl font-semibold">{contact.name}</p>
		<p
			class="text-2xl font-bold {contact.balance > 0
				? 'text-green-700'
				: contact.balance < 0
					? 'text-red-600'
					: 'text-muted-foreground'}"
		>
			{contact.formattedBalance}
		</p>
		<p class="text-sm text-muted-foreground">{balanceLabel}</p>
	</div>

	<!-- Extension point: future send / request-payment buttons and personal contact info -->

	<!-- Shared transactions -->
	<h2 class="mb-2 text-sm font-semibold text-muted-foreground">
		{m.contacts_detail_transactions()}
	</h2>

	<div class="space-y-0">
		{#each transactions as tx (tx.id)}
			<div class="flex items-center justify-between border-b py-3 last:border-b-0">
				<div>
					{#if tx.note}
						<p class="max-w-[200px] truncate text-sm text-muted-foreground">{tx.note}</p>
					{:else}
						<p class="text-sm text-muted-foreground">—</p>
					{/if}
				</div>
				<div class="text-right">
					<p class="text-sm font-medium {tx.amount > 0 ? 'text-green-700' : ''}">
						{tx.formattedAmount}
					</p>
					<p class="text-xs text-muted-foreground">{formatDate(tx.createdAt)}</p>
				</div>
			</div>
		{/each}
	</div>
</div>
