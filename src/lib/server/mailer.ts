// SPDX-License-Identifier: AGPL-3.0-or-later

import nodemailer from 'nodemailer';
import { config } from '$lib/config';

type Transporter = { sendMail(msg: object): Promise<unknown> };

// Singleton transporter — created once at module load.
// null when SMTP_HOST is not set (dev/test fallback).
export const mailer: Transporter | null = config.smtpHost
	? nodemailer.createTransport({
			host: config.smtpHost,
			port: config.smtpPort,
			secure: config.smtpSecure,
			...(config.smtpUser && config.smtpPass
				? { auth: { user: config.smtpUser, pass: config.smtpPass } }
				: {})
		})
	: null;

export function buildOtpEmail(email: string, otp: string) {
	return {
		from: config.smtpFrom,
		to: email,
		subject: `Your ${config.appName} sign-in code`,
		text: `Your sign-in code is: ${otp}\n\nThis code expires in 10 minutes.`
	};
}

export async function sendOtpEmail(
	email: string,
	otp: string,
	transport: Transporter | null = mailer
): Promise<void> {
	if (!transport) {
		if (process.env.NODE_ENV !== 'production') {
			console.log(`[DEV] Email OTP for ${email}: ${otp}`);
			return;
		}
		throw new Error('SMTP_HOST not configured — cannot send email OTP');
	}
	await transport.sendMail(buildOtpEmail(email, otp));
}
