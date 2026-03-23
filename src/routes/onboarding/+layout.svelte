<script lang="ts">
	import { locale, type Locale } from '$lib/i18n';
	import { LanguageSwitcher } from '$lib/components/ui/language-switcher';

	let { children } = $props();

	const languages = [
		{ code: 'en', label: 'English' },
		{ code: 'pt', label: 'Português' },
		{ code: 'nl', label: 'Nederlands' }
	];
</script>

<div class="flex min-h-dvh flex-col bg-[#FAF8F3]">
	<div class="flex justify-end p-4">
		<LanguageSwitcher
			{languages}
			value={$locale}
			onChange={(code) => locale.set(code as Locale)}
		/>
	</div>

	<div class="mx-auto flex w-full max-w-md flex-1 flex-col px-6 pb-8">
		{@render children()}
	</div>
</div>
