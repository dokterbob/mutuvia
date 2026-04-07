// SPDX-License-Identifier: AGPL-3.0-or-later

import nodemailer from 'nodemailer';
import { config } from '$lib/config';

// Singleton transporter — created once at module load.
// null when SMTP_HOST is not set (dev/test fallback).
export const mailer = config.smtpHost
	? nodemailer.createTransport({
			host: config.smtpHost,
			port: config.smtpPort,
			secure: config.smtpSecure,
			...(config.smtpUser ? { auth: { user: config.smtpUser, pass: config.smtpPass } } : {})
		})
	: null;

export async function sendOtpEmail(email: string, otp: string): Promise<void> {
	if (!mailer) {
		if (process.env.NODE_ENV !== 'production') {
			console.log(`[DEV] Email OTP for ${email}: ${otp}`);
		} else {
			console.error('SMTP_HOST not configured — cannot send email OTP');
		}
		return;
	}

	await mailer.sendMail({
		from: config.smtpFrom,
		to: email,
		subject: `Your ${config.appName} sign-in code`,
		text: `Your sign-in code is: ${otp}\n\nThis code expires in 10 minutes.`
	});
}
