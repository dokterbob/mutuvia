// SPDX-License-Identifier: AGPL-3.0-or-later

import * as jose from 'jose';
import { config } from '$lib/config';

const getSecret = () => {
	const secret = process.env.QR_JWT_SECRET;
	if (!secret || secret.length < 32) {
		throw new Error('QR_JWT_SECRET must be at least 32 characters');
	}
	return new TextEncoder().encode(secret);
};

interface QrPayload {
	jti: string;
	amt: number;
	dir: 'send' | 'receive';
	dn: string;
}

export async function signQrToken(payload: QrPayload, ttlSeconds: number): Promise<string> {
	return new jose.SignJWT({ amt: payload.amt, dir: payload.dir, dn: payload.dn })
		.setProtectedHeader({ alg: 'HS256' })
		.setJti(payload.jti)
		.setIssuer(config.appUrl)
		.setIssuedAt()
		.setExpirationTime(`${ttlSeconds}s`)
		.sign(getSecret());
}

export async function verifyQrToken(token: string): Promise<QrPayload & { exp: number }> {
	const { payload } = await jose.jwtVerify(token, getSecret(), {
		issuer: config.appUrl
	});

	return {
		jti: payload.jti!,
		amt: payload.amt as number,
		dir: payload.dir as 'send' | 'receive',
		dn: payload.dn as string,
		exp: payload.exp!
	};
}

export function buildQrUrl(token: string): string {
	return `${config.appUrl}/accept/${token}`;
}
