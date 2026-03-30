<script lang="ts">
	import { page } from '$app/state';
	import * as m from '$lib/paraglide/messages.js';
	import { Button } from '$lib/components/ui/button';
	import SearchIcon from '@lucide/svelte/icons/search';
	import TriangleAlertIcon from '@lucide/svelte/icons/triangle-alert';
	import HomeIcon from '@lucide/svelte/icons/home';
	import RefreshCwIcon from '@lucide/svelte/icons/refresh-cw';

	const is404 = $derived(page.status === 404);
</script>

<div class="flex min-h-dvh flex-col items-center justify-center bg-[#FAF8F3] px-6 pb-8">
	<div class="mx-auto w-full max-w-md text-center">
		<div
			class="mx-auto mb-5 flex h-20 w-20 items-center justify-center rounded-full bg-[#2D4A32] shadow-lg shadow-[#2D4A32]/25"
		>
			{#if is404}
				<SearchIcon class="h-9 w-9 text-white" stroke-width={2} />
			{:else}
				<TriangleAlertIcon class="h-9 w-9 text-white" stroke-width={2} />
			{/if}
		</div>
		<h1 class="mb-2.5 font-serif text-[26px] font-semibold text-[#1E2820]">
			{#if is404}
				{m.error_not_found_title()}
			{:else}
				{m.error_server_title()}
			{/if}
		</h1>
		<p class="mb-8 text-[15px] font-light text-[#3A4A3D]">
			{#if is404}
				{m.error_not_found_body()}
			{:else}
				{m.error_server_body()}
			{/if}
		</p>
		<Button
			href="/home"
			class="w-full rounded-xl bg-[#2D4A32] py-6 text-base font-medium text-white hover:bg-[#3D6145]"
		>
			<HomeIcon class="mr-2 h-4 w-4" />
			{m.error_go_home()}
		</Button>
		{#if !is404}
			<Button variant="ghost" class="mt-3 w-full" onclick={() => location.reload()}>
				<RefreshCwIcon class="mr-2 h-4 w-4" />
				{m.error_try_again()}
			</Button>
		{/if}
	</div>
</div>
