// SPDX-License-Identifier: AGPL-3.0-or-later

import { betterAuth } from 'better-auth';
import { phoneNumber, emailOTP } from 'better-auth/plugins';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import Prelude from '@prelude.so/sdk';
import { db } from './db';
import { config } from '$lib/config';
import { sendOtpEmail } from './mailer';
import { makePlaceholderEmail } from '$lib/placeholder-email';
import { closeSession } from './sse-registry';
import { maskPhone } from './phone-mask';

// Singleton client — created once at module load, reused across requests.
// null when PRELUDE_API_TOKEN is not set (dev/test fallback).
const prelude = config.preludeApiToken ? new Prelude({ apiToken: config.preludeApiToken }) : null;

export const auth = betterAuth({
	// Deliberately NOT setting `baseURL`. Better Auth's own route matcher
	// (isAuthPath, in better-auth/dist/integrations/svelte-kit.mjs) compares
	// the incoming request's origin against `baseURL`'s origin and 404s on
	// any mismatch — direct port access, a LAN IP, or a proxy that doesn't
	// preserve Host would all then break every /api/auth/* route with no
	// diagnostic. Leaving it unset makes Better Auth derive the origin from
	// each request instead (see getBaseURL in better-auth/dist/utils/url.mjs),
	// which is what correctly happened before `trustedOrigins` below existed.
	// Cookie security is driven explicitly instead (next line) rather than
	// through baseURL or Better Auth's own `isProduction`, which is baked at
	// build time and unreliable — see patches/svelte-adapter-bun@*.patch.
	advanced: {
		useSecureCookies: config.appUrl.startsWith('https://')
	},
	database: drizzleAdapter(db, {
		provider: config.dbProvider
	}),
	emailAndPassword: {
		enabled: false
	},
	plugins: [
		emailOTP({
			sendVerificationOTP: async ({ email, otp }) => {
				await sendOtpEmail(email, otp);
			},
			otpLength: 6,
			changeEmail: {
				enabled: true
			}
		}),
		phoneNumber({
			signUpOnVerification: {
				getTempEmail: (phoneNumber) => makePlaceholderEmail(phoneNumber)
			},
			sendOTP: async ({ phoneNumber: phone, code }) => {
				if (!prelude) {
					if (config.devLogOtp) {
						console.log(`[DEV] OTP for ${phone}: ${code}`);
						return;
					}
					// Throw rather than silently return — Better Auth logs this via
					// its background-task error handler. Note this does NOT make
					// the failure visible in the HTTP response: Better Auth's
					// phone-number route always returns `{ message: "code sent" }`
					// regardless of what sendOTP does (likely to avoid leaking
					// phone-number enumeration signals), so "visible" here means
					// visible in server logs, not to the calling client.
					throw new Error('PRELUDE_API_TOKEN not configured — cannot send SMS OTP');
				}
				const result = await prelude.verification.create({
					target: { type: 'phone_number', value: phone },
					options: { code_size: 6 }
				});
				if (result.status === 'blocked') {
					console.error(`Prelude blocked verification for ${maskPhone(phone)}: ${result.reason}`);
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
	trustedOrigins: [config.appUrl],
	databaseHooks: {
		session: {
			delete: {
				// Fires on every session deletion (sign-out, revoke-session, etc.),
				// in-process and synchronously with the request that caused it —
				// so a signed-out session's SSE stream(s) close immediately rather
				// than waiting for the next keepalive re-validation tick (see
				// src/routes/api/events/+server.ts).
				after: async (session) => {
					closeSession(session.id);
				}
			}
		}
	}
});
