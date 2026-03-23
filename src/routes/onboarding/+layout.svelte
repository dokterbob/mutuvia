<script lang="ts">
	import { locale, localeNames, type Locale } from '$lib/i18n';

	let { children } = $props();

	function cycleLocale() {
		const locales: Locale[] = ['en', 'pt', 'nl'];
		const idx = locales.indexOf($locale);
		locale.set(locales[(idx + 1) % locales.length]);
	}
</script>

<div class="flex min-h-dvh flex-col bg-[#FAF8F3]">
	<div class="flex justify-end p-4">
		<button
			onclick={cycleLocale}
			class="rounded-lg border border-[#DDD8CE] bg-white px-3 py-1.5 text-xs font-medium text-[#6B7A6E] transition hover:bg-[#EDE7D9]"
		>
			{localeNames[$locale]}
		</button>
	</div>

	<div class="mx-auto flex w-full max-w-md flex-1 flex-col px-6 pb-8">
		{@render children()}
	</div>
</div>
