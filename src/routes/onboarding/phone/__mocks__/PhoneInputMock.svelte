<script lang="ts">
	// Mock PhoneInput that immediately provides a valid phone number.
	// Uses Svelte 5 $bindable() so that assigning to `value` and `valid`
	// propagates back to the parent via the setter in the compiled output.
	import { onMount } from 'svelte';

	let { value = $bindable<string | null>(null), valid = $bindable(false) } = $props();

	onMount(() => {
		value = '+351912345678';
		valid = true;
	});
</script>

<input data-testid="mock-phone-input" type="tel" value="+351912345678" readonly />
