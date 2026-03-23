<script lang="ts">
	import { t, locale, type Locale } from '$lib/i18n';
import { LanguageSwitcher } from '$lib/components/ui/language-switcher';
	import { goto } from '$app/navigation';
	import { enhance } from '$app/forms';
	import { authClient } from '$lib/auth-client';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { Card } from '$lib/components/ui/card';
	import { Separator } from '$lib/components/ui/separator';
	import ArrowLeftIcon from '@lucide/svelte/icons/arrow-left';
import CheckIcon from '@lucide/svelte/icons/check';
import LogOutIcon from '@lucide/svelte/icons/log-out';

	let { data, form } = $props();

	let displayName = $state(data.appUser.displayName);

	async function signOut() {
		await authClient.signOut();
		goto('/onboarding');
	}
</script>

<div class="flex min-h-dvh flex-col px-6 pb-8 pt-14">
	<div class="mb-6 flex items-center gap-3">
		<button onclick={() => goto('/home')} class="text-muted-foreground">
			<ArrowLeftIcon class="h-5 w-5" />
		</button>
		<h1 class="font-serif text-xl font-semibold">{$t('settings.title')}</h1>
	</div>

	<!-- Display name -->
	<Card class="mb-4 rounded-xl p-4">
		<form method="POST" action="?/updateName" use:enhance>
			<Label class="mb-2 text-sm text-muted-foreground">{$t('settings.display_name')}</Label>
			<div class="flex gap-2">
				<Input
					name="displayName"
					bind:value={displayName}
					maxlength={40}
					class="flex-1"
				/>
				<Button
					type="submit"
					class="bg-[#2D4A32] text-white hover:bg-[#3D6145]"
					disabled={displayName.trim().length < 2}
				>
					{#if form?.saved}
						<CheckIcon class="h-4 w-4" />
					{:else}
						{$t('settings.save')}
					{/if}
				</Button>
			</div>
			{#if form?.error}
				<p class="mt-2 text-sm text-red-600">{form.error}</p>
			{/if}
			{#if form?.saved}
				<p class="mt-2 text-sm text-green-700">{$t('settings.saved')}</p>
			{/if}
		</form>
	</Card>

	<!-- Language -->
	<Card class="mb-4 rounded-xl p-4">
		<Label class="mb-2 block text-sm text-muted-foreground">{$t('settings.language')}</Label>
		<LanguageSwitcher
			languages={[
				{ code: 'en', label: 'English' },
				{ code: 'pt', label: 'Português' },
				{ code: 'nl', label: 'Nederlands' }
			]}
			value={$locale}
			onChange={(code) => locale.set(code as Locale)}
		/>
	</Card>

	<!-- About -->
	<Card class="mb-4 rounded-xl p-4">
		<Label class="mb-2 text-sm text-muted-foreground">{$t('settings.about')}</Label>
		<p class="text-sm leading-relaxed text-muted-foreground">
			{$t('settings.about_text', { appName: data.appName })}
		</p>
		{#if data.communityDocUrl}
			<a
				href={data.communityDocUrl}
				target="_blank"
				rel="noopener noreferrer"
				class="mt-2 inline-block text-sm font-medium text-[#2D4A32] hover:underline"
			>
				Community docs →
			</a>
		{/if}
	</Card>

	<Separator class="my-4" />

	<!-- Sign out -->
	<Button
		variant="outline"
		class="w-full rounded-xl border-red-200 text-red-700 hover:bg-red-50"
		onclick={signOut}
	>
		<LogOutIcon class="mr-2 h-4 w-4" />
		{$t('settings.sign_out')}
	</Button>
</div>
