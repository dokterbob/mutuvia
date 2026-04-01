<script lang="ts">
	import * as m from '$lib/paraglide/messages.js';
	import { goto } from '$app/navigation';
	import { enhance } from '$app/forms';
	import { Button } from '$lib/components/ui/button';
	import ArrowLeftIcon from '@lucide/svelte/icons/arrow-left';
	import XIcon from '@lucide/svelte/icons/x';

	let { data } = $props();

	type Filter = 'all' | 'sent' | 'received' | 'pending';
	let filter = $state<Filter>('all');

	let filteredTxs = $derived(
		filter === 'all' ? data.transactions : data.transactions.filter((tx) => tx.type === filter)
	);

	function formatDate(date: Date | string): string {
		return new Date(date).toLocaleDateString(undefined, {
			month: 'short',
			day: 'numeric',
			year: 'numeric'
		});
	}
</script>

<div class="flex min-h-dvh flex-col px-6 pt-14 pb-8">
	<div class="mb-4 flex items-center gap-3">
		<button onclick={() => goto('/home')} class="text-muted-foreground">
			<ArrowLeftIcon class="h-5 w-5" />
		</button>
		<h1 class="font-serif text-xl font-semibold">{m.history_title()}</h1>
	</div>

	<!-- Filter toggle -->
	<div class="mb-4 flex gap-2">
		{#each [['all', m.history_all()], ['sent', m.history_sent()], ['received', m.history_received()], ['pending', m.history_pending()]] as [value, label] (value)}
			<Button
				variant={filter === value ? 'default' : 'outline'}
				class="rounded-full px-4 py-1.5 text-sm {filter === value ? 'bg-[#2D4A32] text-white' : ''}"
				onclick={() => (filter = value as Filter)}
			>
				{label}
			</Button>
		{/each}
	</div>

	{#if filter === 'pending'}
		<!-- Pending QRs list -->
		{#if data.pendingItems.length === 0}
			<p class="mt-8 text-center text-sm text-muted-foreground">{m.history_empty()}</p>
		{:else}
			<div class="space-y-0">
				{#each data.pendingItems as item (item.id)}
					<div class="flex items-center justify-between border-b py-3 last:border-b-0">
						<div>
							<p class="text-sm font-medium">
								{item.direction === 'send'
									? m.home_pending_send({ amount: item.formattedAmount })
									: m.home_pending_receive({ amount: item.formattedAmount })}
							</p>
							{#if item.note}
								<p class="max-w-[200px] truncate text-xs text-muted-foreground">{item.note}</p>
							{/if}
						</div>
						<div class="flex items-center gap-2">
							<div class="text-right">
								{#if item.isExpired}
									<p class="text-xs text-red-600">{m.home_pending_expired()}</p>
								{:else}
									<p class="text-xs text-muted-foreground">{formatDate(item.createdAt)}</p>
								{/if}
							</div>
							<form method="POST" action="?/cancelQr" use:enhance>
								<input type="hidden" name="qrId" value={item.id} />
								<button type="submit" class="text-muted-foreground hover:text-red-600">
									<XIcon class="h-4 w-4" />
								</button>
							</form>
						</div>
					</div>
				{/each}
			</div>
		{/if}
	{:else}
		<!-- Settled transactions list -->
		{#if filteredTxs.length === 0}
			<p class="mt-8 text-center text-sm text-muted-foreground">{m.history_empty()}</p>
		{:else}
			<div class="space-y-0">
				{#each filteredTxs as tx (tx.id)}
					<div class="flex items-center justify-between border-b py-3 last:border-b-0">
						<div>
							<p class="text-sm font-medium">{tx.otherName}</p>
							{#if tx.note}
								<p class="max-w-[200px] truncate text-xs text-muted-foreground">{tx.note}</p>
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
		{/if}
	{/if}
</div>
