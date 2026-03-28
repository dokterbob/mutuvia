<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script lang="ts">
	import * as m from '$lib/paraglide/messages.js';
	import { goto } from '$app/navigation';
	import { Card } from '$lib/components/ui/card';
	import { Label } from '$lib/components/ui/label';
	import ArrowLeftIcon from '@lucide/svelte/icons/arrow-left';
	import GitForkIcon from '@lucide/svelte/icons/git-fork';

	let { data } = $props();
</script>

<div class="flex min-h-dvh flex-col px-6 pt-14 pb-8">
	<div class="mb-6 flex items-center gap-3">
		<button onclick={() => goto('/home')} class="text-muted-foreground">
			<ArrowLeftIcon class="h-5 w-5" />
		</button>
		<h1 class="font-serif text-xl font-semibold">{m.about_title()}</h1>
	</div>

	<!-- Description -->
	<Card class="mb-4 rounded-xl p-4">
		<p class="text-sm leading-relaxed text-muted-foreground">
			{m.about_description({ appName: data.appName })}
		</p>
		{#if data.communityDocUrl}
			<a
				href={data.communityDocUrl}
				target="_blank"
				rel="noopener noreferrer"
				class="mt-2 inline-block text-sm font-medium text-[#2D4A32] hover:underline"
			>
				{m.common_community_docs()} →
			</a>
		{/if}
	</Card>

	<!-- Creator -->
	<Card class="mb-4 rounded-xl p-4">
		<Label class="mb-2 block text-sm text-muted-foreground">{m.about_built_by()}</Label>
		<a
			href="https://github.com/dokterbob"
			target="_blank"
			rel="noopener noreferrer"
			class="text-sm font-medium text-[#2D4A32] hover:underline"
		>
			Mathijs de Bruin
		</a>
		<p class="mt-1 text-xs text-muted-foreground">{m.about_with_ai()}</p>
	</Card>

	<!-- Open source -->
	<Card class="mb-4 rounded-xl p-4">
		<a
			href="https://github.com/dokterbob/mutuvia"
			target="_blank"
			rel="noopener noreferrer"
			class="flex items-center gap-2 text-sm font-medium text-[#2D4A32] hover:underline"
		>
			<GitForkIcon class="h-4 w-4" />
			{m.faq_link_view_on_github()}
		</a>
		<p class="mt-1 text-xs text-muted-foreground">{m.about_open_source()}</p>
	</Card>
</div>
