// SPDX-License-Identifier: AGPL-3.0-or-later
// Tests for loading spinner wiring on the onboarding name page.

import { vi, describe, test, expect, beforeEach } from 'vitest';
import { render, fireEvent, waitFor } from '@testing-library/svelte';
import NamePage from './+page.svelte';

vi.mock('$app/forms', () => ({
	enhance: vi.fn().mockReturnValue({ destroy: vi.fn() })
}));
vi.mock('$app/navigation', () => ({ goto: vi.fn() }));
vi.mock('$lib/paraglide/messages.js', () => ({
	intro3_eyebrow: () => 'Step 3',
	intro3_title: () => 'What should we call you?',
	intro3_body: () => 'Pick a display name',
	intro3_label: () => 'Your name',
	intro3_placeholder: () => 'e.g. Alice',
	intro3_hint: () => 'Used in transactions',
	intro3_cta: () => 'Continue',
	intro3_back: () => 'Back',
	error_generic: () => 'Something went wrong'
}));

describe('name page – loading spinner', () => {
	let enhanceMock: ReturnType<typeof vi.fn>;

	beforeEach(async () => {
		const formsModule = await import('$app/forms');
		enhanceMock = vi.mocked(formsModule.enhance);
		enhanceMock.mockClear();
		enhanceMock.mockReturnValue({ destroy: vi.fn() });
	});

	test('submit button is disabled with spinner while form is submitting', async () => {
		const { container } = render(NamePage);

		// Type a valid name so the submit button is enabled
		const nameInput = container.querySelector('input[name="displayName"]');
		await fireEvent.input(nameInput!, { target: { value: 'Alice' } });

		expect(enhanceMock).toHaveBeenCalled();
		const [formElement, submitCallback] = enhanceMock.mock.calls[0] as [
			HTMLFormElement,
			((...args: unknown[]) => unknown) | undefined
		];

		// Invoke the outer enhance callback — this sets createProfileLoading = true
		// and returns the inner async handler
		let innerHandler: ((opts: unknown) => Promise<void>) | undefined;
		if (submitCallback) {
			const result = submitCallback({
				action: new URL('http://localhost/?/createProfile'),
				formData: new FormData(),
				formElement,
				controller: new AbortController(),
				submitter: null,
				cancel: vi.fn()
			});
			if (result && typeof result === 'function') {
				innerHandler = result as (opts: unknown) => Promise<void>;
			}
		}

		// Outer callback fired but inner handler not yet run: spinner should be visible
		await waitFor(() => {
			const submitBtn = container.querySelector('button[type="submit"]');
			expect(submitBtn).toBeDisabled();
			expect(container.querySelector('.animate-spin')).not.toBeNull();
		});

		// Run the inner handler with a redirect (success) result
		const updateMock = vi.fn().mockResolvedValue(undefined);
		if (innerHandler) {
			await innerHandler({
				update: updateMock,
				formData: new FormData(),
				formElement,
				action: new URL('http://localhost/?/createProfile'),
				result: { type: 'redirect', status: 303, location: '/onboarding/verified' },
				applyAction: vi.fn()
			});
		}

		// After inner handler resolves, loading resets: spinner gone
		await waitFor(() => {
			expect(container.querySelector('.animate-spin')).toBeNull();
		});
	});

	test('submit button clears spinner on failure', async () => {
		const { container } = render(NamePage);

		const nameInput = container.querySelector('input[name="displayName"]');
		await fireEvent.input(nameInput!, { target: { value: 'Alice' } });

		expect(enhanceMock).toHaveBeenCalled();
		const [formElement, submitCallback] = enhanceMock.mock.calls[0] as [
			HTMLFormElement,
			((...args: unknown[]) => unknown) | undefined
		];

		let innerHandler: ((opts: unknown) => Promise<void>) | undefined;
		if (submitCallback) {
			const result = submitCallback({
				action: new URL('http://localhost/?/createProfile'),
				formData: new FormData(),
				formElement,
				controller: new AbortController(),
				submitter: null,
				cancel: vi.fn()
			});
			if (result && typeof result === 'function') {
				innerHandler = result as (opts: unknown) => Promise<void>;
			}
		}

		if (innerHandler) {
			await innerHandler({
				update: vi.fn(),
				formData: new FormData(),
				formElement,
				action: new URL('http://localhost/?/createProfile'),
				result: { type: 'failure', status: 422, data: { error: 'Name too short' } },
				applyAction: vi.fn()
			});
		}

		await waitFor(() => {
			expect(container.querySelector('.animate-spin')).toBeNull();
			expect(container.textContent).toContain('Name too short');
		});
	});
});
