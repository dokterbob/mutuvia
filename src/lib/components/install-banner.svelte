<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script lang="ts">
	import * as m from '$lib/paraglide/messages.js';
	import { env } from '$env/dynamic/public';
	import { browser } from '$app/environment';
	import { UseInstallPrompt } from '$lib/hooks/use-install-prompt.svelte';
	import { Button } from '$lib/components/ui/button';
	import XIcon from '@lucide/svelte/icons/x';
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

{#if prompt.showBanner}
	<div data-testid="install-banner" class="fixed right-4 bottom-4 left-4 z-50 mx-auto max-w-md">
		<div class="flex items-center gap-3 rounded-2xl border bg-card p-4 shadow-lg">
			<div
				class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#2D4A32] text-white"
			>
				<DownloadIcon class="h-5 w-5" />
			</div>
			<div class="min-w-0 flex-1">
				<p class="text-sm font-medium">
					{m.install_banner_title({ appName: env.PUBLIC_APP_NAME || 'Mutuvia' })}
				</p>
				<p class="text-xs text-muted-foreground">
					{#if prompt.isIOS}
						{m.install_banner_ios_hint()}
					{:else}
						{m.install_banner_body()}
					{/if}
				</p>
			</div>
			{#if !prompt.isIOS}
				<Button size="sm" onclick={() => prompt.install()}>
					{m.install_banner_cta()}
				</Button>
			{/if}
			<button
				onclick={() => prompt.dismiss()}
				class="shrink-0 rounded-full p-1 text-muted-foreground hover:text-foreground"
				aria-label={m.common_dismiss()}
			>
				<XIcon class="h-4 w-4" />
			</button>
		</div>
	</div>
{/if}
