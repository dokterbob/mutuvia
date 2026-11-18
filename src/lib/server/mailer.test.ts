// SPDX-License-Identifier: AGPL-3.0-or-later

import { describe, test, expect, vi, beforeEach } from 'vitest';

const { mockConfig } = vi.hoisted(() => ({
	mockConfig: {
		smtpHost: 'smtp.example.com',
		smtpPort: 587,
		smtpSecure: false,
		smtpUser: 'user',
		smtpPass: 'pass',
		smtpFrom: 'Test App <noreply@example.com>',
		appName: 'Test App',
		devLogOtp: false
	}
}));

vi.mock('$lib/config', () => ({ config: mockConfig }));

vi.mock('nodemailer', () => ({
	default: { createTransport: vi.fn(() => ({ sendMail: vi.fn() })) }
}));

import { buildOtpEmail, sendOtpEmail } from './mailer';

describe('mailer', () => {
	describe('buildOtpEmail', () => {
		test('builds correct email payload', () => {
			expect(buildOtpEmail('user@example.com', '123456')).toEqual({
				from: 'Test App <noreply@example.com>',
				to: 'user@example.com',
				subject: 'Your Test App sign-in code',
				text: 'Your sign-in code is: 123456\n\nThis code expires in 5 minutes.'
			});
		});
	});

	describe('sendOtpEmail', () => {
		const mockSendMail = vi.fn();
		const mockTransport = { sendMail: mockSendMail };

		beforeEach(() => {
			mockSendMail.mockClear();
		});

		describe('given a transport', () => {
			test('calls sendMail with the correct payload', async () => {
				await sendOtpEmail('user@example.com', '123456', mockTransport);
				expect(mockSendMail).toHaveBeenCalledWith(buildOtpEmail('user@example.com', '123456'));
			});
		});

		describe('given no transport', () => {
			test('given DEV_LOG_OTP=true, logs OTP to console', async () => {
				const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
				mockConfig.devLogOtp = true;
				try {
					await sendOtpEmail('user@example.com', '123456', null);
					expect(spy).toHaveBeenCalledWith('[DEV] Email OTP for user@example.com: 123456');
				} finally {
					mockConfig.devLogOtp = false;
					spy.mockRestore();
				}
			});

			test('given DEV_LOG_OTP=false (default), throws rather than silently succeeding', async () => {
				await expect(sendOtpEmail('user@example.com', '123456', null)).rejects.toThrow(
					'SMTP_HOST not configured'
				);
			});
		});
	});
});
