<script lang="ts">
	import { t } from '$lib/i18n';
	import { goto } from '$app/navigation';
	import { Button } from '$lib/components/ui/button';
	import { IconArrowLeft } from '@tabler/icons-svelte';

	let { data } = $props();

	type Filter = 'all' | 'sent' | 'received';
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

<div class="flex min-h-dvh flex-col px-6 pb-8 pt-14">
	<div class="mb-4 flex items-center gap-3">
		<button onclick={() => goto('/home')} class="text-muted-foreground">
			<IconArrowLeft class="h-5 w-5" />
		</button>
		<h1 class="font-serif text-xl font-semibold">{$t('history.title')}</h1>
	</div>

	<!-- Filter toggle -->
	<div class="mb-4 flex gap-2">
		{#each [
			['all', $t('history.all')],
			['sent', $t('history.sent')],
			['received', $t('history.received')]
		] as [value, label]}
			<Button
				variant={filter === value ? 'default' : 'outline'}
				class="rounded-full px-4 py-1.5 text-sm {filter === value ? 'bg-[#2D4A32] text-white' : ''}"
				onclick={() => (filter = value as Filter)}
			>
				{label}
			</Button>
		{/each}
	</div>

	<!-- Transaction list -->
	{#if filteredTxs.length === 0}
		<p class="mt-8 text-center text-sm text-muted-foreground">No transactions found.</p>
	{:else}
		<div class="space-y-0">
			{#each filteredTxs as tx}
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
</div>
