<script lang="ts">
	import { t } from '$lib/i18n';
	import { goto } from '$app/navigation';
	import { Button } from '$lib/components/ui/button';
	import { Card } from '$lib/components/ui/card';
	import { Separator } from '$lib/components/ui/separator';
	import ArrowUpIcon from '@lucide/svelte/icons/arrow-up';
import ArrowDownIcon from '@lucide/svelte/icons/arrow-down';
import SettingsIcon from '@lucide/svelte/icons/settings';

	let { data } = $props();

	function timeAgo(date: Date | string): string {
		const now = Date.now();
		const then = new Date(date).getTime();
		const diff = Math.floor((now - then) / 1000);
		if (diff < 60) return 'just now';
		if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
		if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
		return `${Math.floor(diff / 86400)}d ago`;
	}
</script>

<div class="flex min-h-dvh flex-col px-6 pb-8 pt-14">
	<!-- Header -->
	<div class="mb-1.5 flex items-center justify-between">
		<span class="font-serif text-base text-foreground">
			{data.appUser?.displayName ? `Mutuvia` : 'Mutuvia'}
		</span>
		<button
			class="flex h-9 w-9 items-center justify-center rounded-full border bg-muted"
			onclick={() => goto('/settings')}
		>
			<SettingsIcon class="h-4 w-4 text-muted-foreground" />
		</button>
	</div>
	<p class="mb-5 text-sm text-muted-foreground">
		{$t('home.greeting', { name: data.appUser?.displayName ?? '' })}
	</p>

	<!-- Balance card -->
	<Card
		class="relative mb-4 overflow-hidden rounded-3xl bg-[#2D4A32] p-7 text-white shadow-lg"
	>
		<div class="absolute -right-10 -top-10 h-44 w-44 rounded-full bg-white/[0.04]"></div>
		<p class="mb-2 text-[11.5px] font-medium uppercase tracking-[0.15em] text-white/65">
			{$t('home.balance_label')}
		</p>
		<p class="mb-2.5 font-serif text-5xl font-semibold tracking-tight">
			{data.formattedBalance}
		</p>
		<p class="text-sm font-light text-white/70">
			{#if data.balance > 0}
				{$t('home.balance_positive')}
			{:else if data.balance < 0}
				{$t('home.balance_negative')}
			{:else if data.recentTransactions.length === 0}
				{$t('home.balance_first_use')}
			{:else}
				{$t('home.balance_zero')}
			{/if}
		</p>
	</Card>

	<!-- Action buttons -->
	<div class="mb-5 grid grid-cols-2 gap-3">
		<button
			class="flex flex-col items-center gap-2 rounded-2xl border bg-muted p-4"
			onclick={() => goto('/send')}
		>
			<div
				class="flex h-11 w-11 items-center justify-center rounded-xl bg-[#2D4A32] text-white"
			>
				<ArrowUpIcon class="h-5 w-5" />
			</div>
			<span class="text-sm font-medium">{$t('home.send')}</span>
		</button>
		<button
			class="flex flex-col items-center gap-2 rounded-2xl border bg-muted p-4"
			onclick={() => goto('/receive')}
		>
			<div
				class="flex h-11 w-11 items-center justify-center rounded-xl bg-[#2D4A32] text-white"
			>
				<ArrowDownIcon class="h-5 w-5" />
			</div>
			<span class="text-sm font-medium">{$t('home.receive')}</span>
		</button>
	</div>

	<!-- Recent transactions -->
	<div class="mb-2.5 flex items-center justify-between">
		<span class="font-serif text-base">{$t('home.recent')}</span>
		{#if data.recentTransactions.length > 0}
			<button
				class="text-sm font-medium text-[#2D4A32]"
				onclick={() => goto('/history')}
			>
				{$t('home.see_all')}
			</button>
		{/if}
	</div>

	{#if data.recentTransactions.length === 0}
		<Card class="rounded-2xl bg-muted p-5 text-center text-sm text-muted-foreground">
			{$t('home.empty_state')}
		</Card>
	{:else}
		<div class="space-y-0">
			{#each data.recentTransactions as tx}
				<div class="flex items-center justify-between border-b py-3 last:border-b-0">
					<div>
						<p class="text-sm font-medium">{tx.otherName}</p>
						{#if tx.note}
							<p class="text-xs text-muted-foreground">{tx.note}</p>
						{/if}
					</div>
					<div class="text-right">
						<p
							class="text-sm font-medium {tx.amount > 0
								? 'text-green-700'
								: 'text-foreground'}"
						>
							{tx.formattedAmount}
						</p>
						<p class="text-xs text-muted-foreground">{timeAgo(tx.createdAt)}</p>
					</div>
				</div>
			{/each}
		</div>
	{/if}
</div>
