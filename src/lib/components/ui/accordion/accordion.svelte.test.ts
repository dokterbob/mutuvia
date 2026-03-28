// SPDX-License-Identifier: AGPL-3.0-or-later

import { describe, expect, test } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import AccordionFixture from './AccordionFixture.svelte';

describe('Accordion', () => {
	test('renders all trigger buttons', () => {
		const { getByRole } = render(AccordionFixture);
		expect(getByRole('button', { name: 'First question' })).toBeInTheDocument();
		expect(getByRole('button', { name: 'Second question' })).toBeInTheDocument();
	});

	test('content is not visible before interaction', () => {
		const { queryByText } = render(AccordionFixture);
		// Content is in the DOM but hidden (accordion collapsed state)
		expect(queryByText('First answer')).not.toBeVisible();
		expect(queryByText('Second answer')).not.toBeVisible();
	});

	test('clicking a trigger reveals its content', async () => {
		const { getByRole, getByText } = render(AccordionFixture);
		await fireEvent.click(getByRole('button', { name: 'First question' }));
		expect(getByText('First answer')).toBeVisible();
	});

	test('single mode: opening second item closes the first', async () => {
		const { getByRole, getByText } = render(AccordionFixture, { props: { type: 'single' } });
		await fireEvent.click(getByRole('button', { name: 'First question' }));
		expect(getByText('First answer')).toBeVisible();

		await fireEvent.click(getByRole('button', { name: 'Second question' }));
		expect(getByText('Second answer')).toBeVisible();
		expect(getByText('First answer')).not.toBeVisible();
	});

	test('clicking an open trigger collapses it', async () => {
		const { getByRole, getByText } = render(AccordionFixture);
		await fireEvent.click(getByRole('button', { name: 'First question' }));
		expect(getByText('First answer')).toBeVisible();

		await fireEvent.click(getByRole('button', { name: 'First question' }));
		expect(getByText('First answer')).not.toBeVisible();
	});
});
