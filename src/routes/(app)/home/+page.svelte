<script lang="ts">
	import * as m from '$lib/paraglide/messages.js';
	import { goto } from '$app/navigation';
	import { Card } from '$lib/components/ui/card';
	import ArrowUpIcon from '@lucide/svelte/icons/arrow-up';
	import ArrowDownIcon from '@lucide/svelte/icons/arrow-down';
	import ScanLineIcon from '@lucide/svelte/icons/scan-line';
	import { NavMenu } from '$lib/components/ui/nav-menu';

	import { browser } from '$app/environment';

	let { data } = $props();

	let hasCamera = $state(false);

	$effect(() => {
		if (!browser) return;
		navigator.mediaDevices?.enumerateDevices().then((devices) => {
			hasCamera = devices.some((d) => d.kind === 'videoinput');
		});
	});

	type TimeOfDay = 'morning' | 'afternoon' | 'evening' | 'night';

	function getTimeOfDay(): TimeOfDay {
		const hour = new Date().getHours();
		if (hour >= 5 && hour < 12) return 'morning';
		if (hour >= 12 && hour < 17) return 'afternoon';
		if (hour >= 17 && hour < 21) return 'evening';
		return 'night';
	}

	const timeOfDay: TimeOfDay = $derived(getTimeOfDay());

	const greetingFns = {
		morning: m.home_greeting_morning,
		afternoon: m.home_greeting_afternoon,
		evening: m.home_greeting_evening,
		night: m.home_greeting_night
	} as const;

	function timeAgo(date: Date | string): string {
		const now = Date.now();
		const then = new Date(date).getTime();
		const diff = Math.floor((now - then) / 1000);
		if (diff < 60) return m.time_just_now();
		if (diff < 3600) return m.time_minutes_ago({ count: String(Math.floor(diff / 60)) });
		if (diff < 86400) return m.time_hours_ago({ count: String(Math.floor(diff / 3600)) });
		return m.time_days_ago({ count: String(Math.floor(diff / 86400)) });
	}
</script>

<div class="flex min-h-dvh flex-col px-6 pt-14 pb-8">
	<!-- Header -->
	<div class="mb-1.5 flex items-center justify-between">
		<span class="font-serif text-base text-foreground">
			{data.appUser?.displayName ? `Mutuvia` : 'Mutuvia'}
		</span>
		<NavMenu />
	</div>
	<p class="mb-5 text-sm text-muted-foreground">
		{greetingFns[timeOfDay]({ name: data.appUser?.displayName ?? '' })}
	</p>

	<!-- Balance card -->
	<Card class="relative mb-4 overflow-hidden rounded-3xl bg-[#2D4A32] p-7 text-white shadow-lg">
		<div class="absolute -top-10 -right-10 h-44 w-44 rounded-full bg-white/[0.04]"></div>
		<p class="mb-2 text-[11.5px] font-medium tracking-[0.15em] text-white/65 uppercase">
			{m.home_balance_label()}
		</p>
		<p class="mb-2.5 font-serif text-5xl font-semibold tracking-tight">
			{data.formattedBalance}
		</p>
		<p class="text-sm font-light text-white/70">
			{#if data.balance > 0}
				{m.home_balance_positive()}
			{:else if data.balance < 0}
				{m.home_balance_negative()}
			{:else if data.recentTransactions.length === 0}
				{m.home_balance_first_use()}
			{:else}
				{m.home_balance_zero()}
			{/if}
		</p>
	</Card>

	<!-- Action buttons -->
	<div class="mb-5 grid {hasCamera ? 'grid-cols-3' : 'grid-cols-2'} gap-3">
		<button
			class="flex flex-col items-center gap-2 rounded-2xl border bg-muted p-4"
			onclick={() => goto('/send')}
		>
			<div class="flex h-11 w-11 items-center justify-center rounded-xl bg-[#2D4A32] text-white">
				<ArrowUpIcon class="h-5 w-5" />
			</div>
			<span class="text-sm font-medium">{m.home_send()}</span>
		</button>
		{#if hasCamera}
			<button
				class="flex flex-col items-center gap-2 rounded-2xl border bg-muted p-4"
				onclick={() => goto('/scan')}
			>
				<div class="flex h-11 w-11 items-center justify-center rounded-xl bg-[#2D4A32] text-white">
					<ScanLineIcon class="h-5 w-5" />
				</div>
				<span class="text-sm font-medium">{m.home_scan()}</span>
			</button>
		{/if}
		<button
			class="flex flex-col items-center gap-2 rounded-2xl border bg-muted p-4"
			onclick={() => goto('/receive')}
		>
			<div class="flex h-11 w-11 items-center justify-center rounded-xl bg-[#2D4A32] text-white">
				<ArrowDownIcon class="h-5 w-5" />
			</div>
			<span class="text-sm font-medium">{m.home_receive()}</span>
		</button>
	</div>

	<!-- Recent transactions -->
	<div class="mb-2.5 flex items-center justify-between">
		<span class="font-serif text-base">{m.home_recent()}</span>
		{#if data.recentTransactions.length > 0}
			<button class="text-sm font-medium text-[#2D4A32]" onclick={() => goto('/history')}>
				{m.home_see_all()}
			</button>
		{/if}
	</div>

	{#if data.recentTransactions.length === 0}
		<Card class="rounded-2xl bg-muted p-5 text-center text-sm text-muted-foreground">
			{m.home_empty_state()}
		</Card>
	{:else}
		<div class="space-y-0">
			{#each data.recentTransactions as tx (tx.id)}
				<div class="flex items-center justify-between border-b py-3 last:border-b-0">
					<div>
						<p class="text-sm font-medium">{tx.otherName}</p>
						{#if tx.note}
							<p class="text-xs text-muted-foreground">{tx.note}</p>
						{/if}
					</div>
					<div class="text-right">
						<p class="text-sm font-medium {tx.amount > 0 ? 'text-green-700' : 'text-foreground'}">
							{tx.formattedAmount}
						</p>
						<p class="text-xs text-muted-foreground">{timeAgo(tx.createdAt)}</p>
					</div>
				</div>
			{/each}
		</div>
	{/if}
</div>
