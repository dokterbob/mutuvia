<script lang="ts">
	let { children } = $props();
</script>

<div class="mx-auto min-h-dvh w-full max-w-md bg-background">
	{@render children()}
</div>
