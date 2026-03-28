// SPDX-License-Identifier: AGPL-3.0-or-later

import { describe, expect, test } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { page } from '@vitest/browser/context';
import AccordionFixture from './AccordionFixture.svelte';

describe('Accordion', () => {
	test('renders all trigger buttons', async () => {
		render(AccordionFixture);
		await expect.element(page.getByRole('button', { name: 'First question' })).toBeVisible();
		await expect.element(page.getByRole('button', { name: 'Second question' })).toBeVisible();
	});

	test('content is hidden before interaction', async () => {
		render(AccordionFixture);
		await expect.element(page.getByText('First answer')).not.toBeVisible();
		await expect.element(page.getByText('Second answer')).not.toBeVisible();
	});

	test('clicking a trigger reveals its content', async () => {
		render(AccordionFixture);
		await page.getByRole('button', { name: 'First question' }).click();
		await expect.element(page.getByText('First answer')).toBeVisible();
	});

	test('single mode: opening second item closes the first', async () => {
		render(AccordionFixture, { props: { type: 'single' } });
		await page.getByRole('button', { name: 'First question' }).click();
		await expect.element(page.getByText('First answer')).toBeVisible();

		await page.getByRole('button', { name: 'Second question' }).click();
		await expect.element(page.getByText('Second answer')).toBeVisible();
		await expect.element(page.getByText('First answer')).not.toBeVisible();
	});

	test('clicking an open trigger collapses it', async () => {
		render(AccordionFixture);
		await page.getByRole('button', { name: 'First question' }).click();
		await expect.element(page.getByText('First answer')).toBeVisible();

		await page.getByRole('button', { name: 'First question' }).click();
		await expect.element(page.getByText('First answer')).not.toBeVisible();
	});
});
