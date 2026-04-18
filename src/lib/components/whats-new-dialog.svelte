<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script lang="ts">
	import * as m from '$lib/paraglide/messages.js';
	import { browser } from '$app/environment';
	import { Button } from '$lib/components/ui/button';
	import * as Dialog from '$lib/components/ui/dialog';
	import { getUnseenEntries } from '$lib/whats-new';
	import SparklesIcon from '@lucide/svelte/icons/sparkles';

	interface Props {
		appVersion: string;
		lastSeenVersion: string | null;
	}

	let { appVersion, lastSeenVersion }: Props = $props();

	const unseenEntries = browser ? getUnseenEntries(lastSeenVersion) : [];
	let open = $state(unseenEntries.length > 0);

	async function dismiss() {
		if (!open) return;
		open = false;
		try {
			await fetch('/api/whats-new/dismiss', { method: 'POST' });
		} catch {
			// Silent fail — user will see dialog again next visit
		}
	}
</script>

<Dialog.Root
	{open}
	onOpenChange={(v) => {
		if (!v) dismiss();
	}}
>
	<Dialog.Content showCloseButton={false}>
		<Dialog.Header>
			<div class="flex items-center gap-3">
				<div
					class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#2D4A32] text-white"
				>
					<SparklesIcon class="h-5 w-5" />
				</div>
				<div class="min-w-0 flex-1">
					<Dialog.Title class="text-sm">{m.whats_new_title()}</Dialog.Title>
					<Dialog.Description class="text-xs">
						{m.whats_new_version_label({ version: appVersion })}
					</Dialog.Description>
				</div>
			</div>
		</Dialog.Header>

		<div class="max-h-60 space-y-4 overflow-y-auto">
			{#each unseenEntries as entry (entry.version)}
				<ul class="list-inside list-disc space-y-1 text-sm">
					{#each entry.content().split('\n') as item (item)}
						<li>{item}</li>
					{/each}
				</ul>
			{/each}
		</div>

		<Dialog.Footer>
			<Button onclick={dismiss}>{m.whats_new_dismiss()}</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
