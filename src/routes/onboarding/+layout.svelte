<script lang="ts">
	import { LanguageSwitcher } from '$lib/components/ui/language-switcher';
	import * as m from '$lib/paraglide/messages.js';
	import { getLocale, setLocale, locales, isLocale } from '$lib/paraglide/runtime.js';

	let { children } = $props();

	const languages = $derived(locales.map((code) => ({
		code,
		label: m.locale_name({}, { locale: code })
	})));

	let currentLang = $derived(getLocale());
</script>

<div class="flex min-h-dvh flex-col bg-[#FAF8F3]">
	<div class="flex justify-end p-4">
		<LanguageSwitcher
			{languages}
			bind:value={currentLang}
			onChange={(code) => {
				if (isLocale(code)) setLocale(code);
			}}
		/>
	</div>

	<div class="mx-auto flex w-full max-w-md flex-1 flex-col px-6 pb-8">
		{@render children()}
	</div>
</div>
