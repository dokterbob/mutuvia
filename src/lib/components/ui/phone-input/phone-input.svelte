<script lang="ts">
	import CountrySelector from '$lib/components/ui/phone-input/country-selector.svelte';
	import { defaultOptions, type PhoneInputProps } from '$lib/components/ui/phone-input';
	import { cn } from '$lib/utils.js';
	import { TelInput, normalizedCountries } from 'svelte-tel-input';
	import 'svelte-tel-input/styles/flags.css';

	const countries = normalizedCountries;

	let {
		class: className = undefined,
		defaultCountry = null,
		country = $bindable(defaultCountry),
		options = defaultOptions,
		placeholder = $bindable(undefined),
		readonly = $bindable(false),
		disabled = $bindable(false),
		value = $bindable(null),
		valid = $bindable(false),
		detailedValue = $bindable(),
		order = undefined,
		name = undefined,
		...rest
	}: PhoneInputProps = $props();

	let el: HTMLInputElement | undefined = $state();

	export const focus = () => {
		// sort of an after update kinda thing
		setTimeout(() => {
			el?.focus();
		}, 0);
	};
</script>

<div class={cn('flex place-items-center', className)}>
	<CountrySelector {order} {countries} bind:selected={country} onselect={focus} />
	<TelInput
		{name}
		{country}
		{detailedValue}
		value={value ?? ''}
		{valid}
		{readonly}
		{disabled}
		{placeholder}
		bind:el
		{options}
		on:updateValue={(e) => {
			value = e.detail ?? null;
		}}
		on:updateValid={(e) => {
			valid = e.detail;
		}}
		on:updateDetailedValue={(e) => {
			detailedValue = e.detail ?? null;
		}}
		on:updateCountry={(e) => {
			country = e.detail;
		}}
		class={cn(
			'border-l-none mb-0 flex h-9 w-full min-w-0 rounded-l-none rounded-r-md border-y border-r border-input bg-background px-3 py-1 text-base shadow-xs ring-offset-background transition-[color,box-shadow] outline-none selection:bg-primary selection:text-primary-foreground placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50 md:text-sm dark:bg-input/30',
			'focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50',
			'aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40'
		)}
		{...rest}
	/>
</div>
