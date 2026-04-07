// SPDX-License-Identifier: AGPL-3.0-or-later

import { describe, test, expect, vi, beforeEach } from 'vitest';

vi.mock('$lib/config', () => ({
	config: {
		smtpHost: 'smtp.example.com',
		smtpPort: 587,
		smtpSecure: false,
		smtpUser: 'user',
		smtpPass: 'pass',
		smtpFrom: 'Test App <noreply@example.com>',
		appName: 'Test App'
	}
}));

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
				text: 'Your sign-in code is: 123456\n\nThis code expires in 10 minutes.'
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
			test('logs OTP to console in dev', async () => {
				const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
				const saved = process.env.NODE_ENV;
				process.env.NODE_ENV = 'development';
				try {
					await sendOtpEmail('user@example.com', '123456', null);
					expect(spy).toHaveBeenCalledWith('[DEV] Email OTP for user@example.com: 123456');
				} finally {
					process.env.NODE_ENV = saved;
					spy.mockRestore();
				}
			});

			test('throws in production', async () => {
				const saved = process.env.NODE_ENV;
				process.env.NODE_ENV = 'production';
				try {
					await expect(sendOtpEmail('user@example.com', '123456', null)).rejects.toThrow(
						'SMTP_HOST not configured'
					);
				} finally {
					process.env.NODE_ENV = saved;
				}
			});
		});
	});
});
