<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script lang="ts">
	import * as m from '$lib/paraglide/messages.js';
	import { goto } from '$app/navigation';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import ArrowLeftIcon from '@lucide/svelte/icons/arrow-left';
	import ChevronRightIcon from '@lucide/svelte/icons/chevron-right';
	import ContactAvatar from '$lib/components/contact-avatar.svelte';
	import { filterSortContacts } from './contacts-filter.js';
	import type { Filter, Sort } from './contacts-filter.js';

	let { data } = $props();

	let query = $state('');
	let filter = $state<Filter>('all');
	let sort = $state<Sort>('name');

	const visible = $derived.by(() => filterSortContacts(data.contacts, { query, filter, sort }));
</script>

<div class="flex min-h-dvh flex-col px-6 pt-14 pb-8">
	<div class="mb-4 flex items-center gap-3">
		<button onclick={() => goto('/home')} class="text-muted-foreground" aria-label="Back to home">
			<ArrowLeftIcon class="h-5 w-5" />
		</button>
		<h1 class="font-serif text-xl font-semibold">{m.contacts_title()}</h1>
	</div>

	<!-- Search -->
	<div class="mb-4">
		<Input bind:value={query} placeholder={m.contacts_search_placeholder()} class="rounded-full" />
	</div>

	<!-- Filter pills -->
	<div class="mb-2 flex flex-wrap gap-2">
		{#each [['all', m.contacts_filter_all()], ['positive', m.contacts_filter_positive()], ['negative', m.contacts_filter_negative()]] as [value, label] (value)}
			<Button
				variant={filter === value ? 'default' : 'outline'}
				class="rounded-full px-4 py-1.5 text-sm {filter === value ? 'bg-[#2D4A32] text-white' : ''}"
				onclick={() => (filter = value as Filter)}
			>
				{label}
			</Button>
		{/each}
	</div>

	<!-- Sort pills -->
	<div class="mb-4 flex gap-2">
		{#each [['name', m.contacts_sort_name()], ['amount', m.contacts_sort_amount()]] as [value, label] (value)}
			<Button
				variant={sort === value ? 'default' : 'outline'}
				class="rounded-full px-4 py-1.5 text-sm {sort === value ? 'bg-[#2D4A32] text-white' : ''}"
				onclick={() => (sort = value as Sort)}
			>
				{label}
			</Button>
		{/each}
	</div>

	{#if data.contacts.length === 0}
		<p class="mt-8 text-center text-sm text-muted-foreground">{m.contacts_empty()}</p>
	{:else if visible.length === 0}
		<p class="mt-8 text-center text-sm text-muted-foreground">{m.contacts_no_results()}</p>
	{:else}
		<div class="space-y-0">
			{#each visible as c (c.id)}
				<a
					href="/contacts/{c.id}"
					class="flex items-center justify-between border-b py-3 last:border-b-0"
				>
					<div class="flex items-center gap-3">
						<ContactAvatar name={c.name} />
						<p class="text-sm font-medium">{c.name}</p>
					</div>
					<div class="flex items-center gap-2">
						<p
							class="text-sm font-medium {c.balance > 0
								? 'text-green-700'
								: c.balance < 0
									? 'text-red-600'
									: 'text-muted-foreground'}"
						>
							{c.formattedBalance}
						</p>
						<ChevronRightIcon class="h-4 w-4 text-muted-foreground" />
					</div>
				</a>
			{/each}
		</div>
	{/if}
</div>
