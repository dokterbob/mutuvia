<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script lang="ts">
	import * as m from '$lib/paraglide/messages.js';
	import { goto } from '$app/navigation';
	import * as Accordion from '$lib/components/ui/accordion';
	import ArrowLeftIcon from '@lucide/svelte/icons/arrow-left';
</script>

<div class="flex min-h-dvh flex-col px-6 pt-14 pb-8">
	<div class="mb-6 flex items-center gap-3">
		<button onclick={() => goto('/home')} class="text-muted-foreground">
			<ArrowLeftIcon class="h-5 w-5" />
		</button>
		<h1 class="font-serif text-xl font-semibold">{m.faq_title()}</h1>
	</div>

	<Accordion.Root type="single" class="w-full">
		<Accordion.Item value="what-is-mutual-credit">
			<Accordion.Trigger>{m.faq_q_what_is_mutual_credit()}</Accordion.Trigger>
			<Accordion.Content>
				<p>{m.faq_a_what_is_mutual_credit()}</p>
			</Accordion.Content>
		</Accordion.Item>

		<Accordion.Item value="is-this-real-money">
			<Accordion.Trigger>{m.faq_q_is_this_real_money()}</Accordion.Trigger>
			<Accordion.Content>
				<p>{m.faq_a_is_this_real_money()}</p>
			</Accordion.Content>
		</Accordion.Item>

		<Accordion.Item value="negative-balance">
			<Accordion.Trigger>{m.faq_q_negative_balance()}</Accordion.Trigger>
			<Accordion.Content>
				<p>{m.faq_a_negative_balance()}</p>
			</Accordion.Content>
		</Accordion.Item>

		<Accordion.Item value="someone-doesnt-give-back">
			<Accordion.Trigger>{m.faq_q_someone_doesnt_give_back()}</Accordion.Trigger>
			<Accordion.Content>
				<p>{m.faq_a_someone_doesnt_give_back()}</p>
			</Accordion.Content>
		</Accordion.Item>

		<Accordion.Item value="who-sees-my-data">
			<Accordion.Trigger>{m.faq_q_who_sees_my_data()}</Accordion.Trigger>
			<Accordion.Content>
				<p>{m.faq_a_who_sees_my_data()}</p>
			</Accordion.Content>
		</Accordion.Item>

		<Accordion.Item value="how-to-send-receive">
			<Accordion.Trigger>{m.faq_q_how_to_send_receive()}</Accordion.Trigger>
			<Accordion.Content>
				<p>{m.faq_a_how_to_send_receive()}</p>
			</Accordion.Content>
		</Accordion.Item>

		<Accordion.Item value="what-is-the-note">
			<Accordion.Trigger>{m.faq_q_what_is_the_note()}</Accordion.Trigger>
			<Accordion.Content>
				<p>{m.faq_a_what_is_the_note()}</p>
			</Accordion.Content>
		</Accordion.Item>

		<Accordion.Item value="can-i-trust-this">
			<Accordion.Trigger>{m.faq_q_can_i_trust_this()}</Accordion.Trigger>
			<Accordion.Content>
				<p>{m.faq_a_can_i_trust_this()}</p>
				<a href="https://github.com/dokterbob/mutuvia/" target="_blank" rel="noopener noreferrer"
					>{m.faq_link_source_code()}</a
				>
			</Accordion.Content>
		</Accordion.Item>

		<Accordion.Item value="is-open-source">
			<Accordion.Trigger>{m.faq_q_is_open_source()}</Accordion.Trigger>
			<Accordion.Content>
				<p>{m.faq_a_is_open_source()}</p>
				<a href="https://github.com/dokterbob/mutuvia/" target="_blank" rel="noopener noreferrer"
					>{m.faq_link_view_on_github()}</a
				>
			</Accordion.Content>
		</Accordion.Item>

		<Accordion.Item value="who-made-this">
			<Accordion.Trigger>{m.faq_q_who_made_this()}</Accordion.Trigger>
			<Accordion.Content>
				<p>{m.faq_a_who_made_this()}</p>
				<div class="mt-1 flex flex-col gap-1">
					<a href="https://github.com/dokterbob" target="_blank" rel="noopener noreferrer"
						>{m.faq_link_mathijs()}</a
					>
					<a href="https://claude.ai" target="_blank" rel="noopener noreferrer"
						>{m.faq_link_claude()}</a
					>
				</div>
			</Accordion.Content>
		</Accordion.Item>

		<Accordion.Item value="question-not-answered">
			<Accordion.Trigger>{m.faq_q_question_not_answered()}</Accordion.Trigger>
			<Accordion.Content>
				<p>{m.faq_a_question_not_answered()}</p>
				<a
					href="https://github.com/dokterbob/mutuvia/issues"
					target="_blank"
					rel="noopener noreferrer">{m.faq_link_report_issue()}</a
				>
			</Accordion.Content>
		</Accordion.Item>
	</Accordion.Root>
</div>
