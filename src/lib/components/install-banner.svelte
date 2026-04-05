<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script lang="ts">
	import * as m from '$lib/paraglide/messages.js';
	import { env } from '$env/dynamic/public';
	import { browser } from '$app/environment';
	import { UseInstallPrompt } from '$lib/hooks/use-install-prompt.svelte';
	import { Button } from '$lib/components/ui/button';
	import * as Dialog from '$lib/components/ui/dialog';
	import DownloadIcon from '@lucide/svelte/icons/download';

	// Allow tests to override the delay by setting window.__installBannerDelay.
	// UseInstallPrompt accesses browser APIs (localStorage, window) so it must
	// only be instantiated on the client — never during SSR.
	const delay = browser
		? ((window as { __installBannerDelay?: number }).__installBannerDelay ?? 5000)
		: 5000;
	const prompt = browser
		? new UseInstallPrompt({ delay })
		: { showBanner: false, isIOS: false, install: async () => {}, dismiss: () => {} };
</script>

<Dialog.Root
	open={prompt.showBanner}
	onOpenChange={(open) => {
		if (!open) prompt.dismiss();
	}}
>
	<Dialog.Content data-testid="install-banner">
		<Dialog.Header>
			<div class="flex items-center gap-3">
				<div
					class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#2D4A32] text-white"
				>
					<DownloadIcon class="h-5 w-5" />
				</div>
				<div class="min-w-0 flex-1">
					<Dialog.Title class="text-sm">
						{m.install_banner_title({ appName: env.PUBLIC_APP_NAME || 'Mutuvia' })}
					</Dialog.Title>
					<Dialog.Description class="text-xs">
						{#if prompt.isIOS}
							{m.install_banner_ios_hint()}
						{:else}
							{m.install_banner_body()}
						{/if}
					</Dialog.Description>
				</div>
			</div>
		</Dialog.Header>
		<Dialog.Footer>
			{#if !prompt.isIOS}
				<Button onclick={() => prompt.install()}>
					{m.install_banner_cta()}
				</Button>
			{/if}
			<Dialog.Close>
				{#snippet child({ props })}
					<Button variant="outline" {...props}>
						{m.install_banner_not_now()}
					</Button>
				{/snippet}
			</Dialog.Close>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
