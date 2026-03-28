<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Test fixture: two-item accordion for unit tests -->
<script lang="ts">
	import * as Accordion from './index.js';

	let { type = 'single' }: { type?: 'single' | 'multiple' } = $props();
</script>

<Accordion.Root {type}>
	<Accordion.Item value="item-1">
		<Accordion.Trigger>First question</Accordion.Trigger>
		<Accordion.Content>First answer</Accordion.Content>
	</Accordion.Item>
	<Accordion.Item value="item-2">
		<Accordion.Trigger>Second question</Accordion.Trigger>
		<Accordion.Content>Second answer</Accordion.Content>
	</Accordion.Item>
</Accordion.Root>
