// SPDX-License-Identifier: AGPL-3.0-or-later

import { betterAuth } from 'better-auth';
import { phoneNumber, emailOTP } from 'better-auth/plugins';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { db } from './db';

export const auth = betterAuth({
	database: drizzleAdapter(db, {
		provider: 'sqlite'
	}),
	emailAndPassword: {
		enabled: false
	},
	plugins: [
		emailOTP({
			sendVerificationOTP: async ({ email, otp }) => {
				if (process.env.NODE_ENV !== 'production') {
					console.log(`[DEV] Email OTP for ${email}: ${otp}`);
				}
			}
		}),
		phoneNumber({
			signUpOnVerification: {
				getTempEmail: () => null as unknown as string
			},
			sendOTP: async ({ phoneNumber: phone, code }) => {
				const accountSid = process.env.TWILIO_ACCOUNT_SID;
				const authToken = process.env.TWILIO_AUTH_TOKEN;
				const fromNumber = process.env.TWILIO_PHONE_NUMBER;

				if (!accountSid || !authToken || !fromNumber) {
					console.error('Twilio credentials not configured');
					// In dev, log the code for testing
					if (process.env.NODE_ENV !== 'production') {
						console.log(`[DEV] OTP for ${phone}: ${code}`);
					}
					return;
				}

				const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
				const appName = process.env.PUBLIC_APP_NAME || 'Mutuvia';

				await fetch(url, {
					method: 'POST',
					headers: {
						Authorization: 'Basic ' + btoa(`${accountSid}:${authToken}`),
						'Content-Type': 'application/x-www-form-urlencoded'
					},
					body: new URLSearchParams({
						To: phone,
						From: fromNumber,
						Body: `Your ${appName} verification code is: ${code}`
					})
				});
			},
			otpLength: 6
		})
	],
	session: {
		expiresIn: 60 * 60 * 24 * 30, // 30 days
		updateAge: 60 * 60 * 24 // 1 day
	},
	trustedOrigins: [process.env.APP_URL || 'http://localhost:5173']
});
