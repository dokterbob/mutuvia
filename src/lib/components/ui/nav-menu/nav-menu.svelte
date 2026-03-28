<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script lang="ts">
	import * as m from '$lib/paraglide/messages.js';
	import { goto } from '$app/navigation';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import { authClient } from '$lib/auth-client';
	import MenuIcon from '@lucide/svelte/icons/menu';
	import SettingsIcon from '@lucide/svelte/icons/settings';
	import CircleHelpIcon from '@lucide/svelte/icons/circle-help';
	import BookOpenIcon from '@lucide/svelte/icons/book-open';
	import InfoIcon from '@lucide/svelte/icons/info';
	import GitForkIcon from '@lucide/svelte/icons/git-fork';
	import LogOutIcon from '@lucide/svelte/icons/log-out';

	async function signOut() {
		await authClient.signOut();
		goto('/onboarding');
	}
</script>

<DropdownMenu.Root>
	<DropdownMenu.Trigger
		aria-label="Menu"
		class="flex h-9 w-9 items-center justify-center rounded-full border bg-muted"
	>
		<MenuIcon class="h-4 w-4 text-muted-foreground" />
	</DropdownMenu.Trigger>
	<DropdownMenu.Content align="end">
		<DropdownMenu.Item onclick={() => goto('/settings')}>
			<SettingsIcon class="h-4 w-4" />
			{m.menu_settings()}
		</DropdownMenu.Item>
		<DropdownMenu.Item onclick={() => goto('/faq')}>
			<CircleHelpIcon class="h-4 w-4" />
			{m.menu_faq()}
		</DropdownMenu.Item>
		<DropdownMenu.Item onclick={() => goto('/onboarding/intro1?review')}>
			<BookOpenIcon class="h-4 w-4" />
			{m.menu_how_it_works()}
		</DropdownMenu.Item>
		<DropdownMenu.Item onclick={() => goto('/about')}>
			<InfoIcon class="h-4 w-4" />
			{m.menu_about()}
		</DropdownMenu.Item>
		<DropdownMenu.Item>
			<a
				href="https://github.com/dokterbob/mutuvia"
				target="_blank"
				rel="noopener noreferrer"
				class="flex items-center gap-2"
			>
				<GitForkIcon class="h-4 w-4" />
				{m.menu_open_source()}
			</a>
		</DropdownMenu.Item>
		<DropdownMenu.Separator />
		<DropdownMenu.Item onclick={signOut} class="text-red-700 focus:text-red-700">
			<LogOutIcon class="h-4 w-4" />
			{m.menu_sign_out()}
		</DropdownMenu.Item>
	</DropdownMenu.Content>
</DropdownMenu.Root>
