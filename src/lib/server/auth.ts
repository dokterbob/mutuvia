// SPDX-License-Identifier: AGPL-3.0-or-later

import { betterAuth } from 'better-auth';
import { phoneNumber, emailOTP } from 'better-auth/plugins';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import Prelude from '@prelude.so/sdk';
import { db } from './db';
import { config } from '$lib/config';

// Singleton client — created once at module load, reused across requests.
// null when PRELUDE_API_TOKEN is not set (dev/test fallback).
const prelude = config.preludeApiToken ? new Prelude({ apiToken: config.preludeApiToken }) : null;

export const auth = betterAuth({
	database: drizzleAdapter(db, {
		provider: config.dbProvider
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
				if (!prelude) {
					if (process.env.NODE_ENV !== 'production') {
						console.log(`[DEV] OTP for ${phone}: ${code}`);
					} else {
						console.error('PRELUDE_API_TOKEN not configured');
					}
					return;
				}
				const result = await prelude.verification.create({
					target: { type: 'phone_number', value: phone },
					options: { code_size: 6 }
				});
				if (result.status === 'blocked') {
					console.error(`Prelude blocked verification for ${phone}: ${result.reason}`);
				}
			},
			// Only override verification when Prelude is configured —
			// without it, Better Auth's internal verification handles dev/test
			...(prelude
				? {
						verifyOTP: async ({ phoneNumber: phone, code }) => {
							try {
								const result = await prelude.verification.check({
									target: { type: 'phone_number', value: phone },
									code
								});
								return result.status === 'success';
							} catch (err) {
								console.error('Prelude verification check failed:', err);
								return false;
							}
						}
					}
				: {}),
			otpLength: 6
		})
	],
	session: {
		expiresIn: 60 * 60 * 24 * 30, // 30 days
		updateAge: 60 * 60 * 24 // 1 day
	},
	trustedOrigins: [process.env.APP_URL || 'http://localhost:5173']
});
