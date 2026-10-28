// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, test, expect, vi, beforeEach } from 'vitest';

const { cfg } = vi.hoisted(() => ({
	cfg: { androidPackageName: 'org.mutuvia.app', androidSha256Fingerprints: [] as string[] }
}));

vi.mock('$lib/config', () => ({ config: cfg }));

import { GET } from './+server';

type GetEvent = Parameters<typeof GET>[0];

const event = {
	request: new Request('http://localhost/.well-known/assetlinks.json')
} as unknown as GetEvent;

const FP_A = Array.from({ length: 32 }, () => 'AA').join(':');
const FP_B = Array.from({ length: 32 }, () => 'BB').join(':');

async function catchHttpError(fn: () => unknown): Promise<{ status: number; body: unknown }> {
	try {
		await fn();
	} catch (e) {
		return e as { status: number; body: unknown };
	}
	throw new Error('expected handler to throw an HttpError');
}

describe('GET /.well-known/assetlinks.json', () => {
	beforeEach(() => {
		cfg.androidPackageName = 'org.mutuvia.app';
		cfg.androidSha256Fingerprints = [];
	});

	describe('given no fingerprints are configured', () => {
		test('when requested, then responds 404', async () => {
			const err = await catchHttpError(() => GET(event));
			expect(err.status).toBe(404);
			expect(err.body).toEqual({ message: 'Digital Asset Links not configured' });
		});
	});

	describe('given one fingerprint is configured', () => {
		beforeEach(() => {
			cfg.androidSha256Fingerprints = [FP_A];
		});

		test('when requested, then returns the Digital Asset Links statement list', async () => {
			const res = await GET(event);
			expect(res.status).toBe(200);
			expect(await res.json()).toEqual([
				{
					relation: ['delegate_permission/common.handle_all_urls'],
					target: {
						namespace: 'android_app',
						package_name: 'org.mutuvia.app',
						sha256_cert_fingerprints: [FP_A]
					}
				}
			]);
		});

		test('when requested, then content-type is application/json', async () => {
			const res = await GET(event);
			expect(res.headers.get('content-type')).toContain('application/json');
		});

		test('when requested, then is cacheable publicly for one hour', async () => {
			const res = await GET(event);
			expect(res.headers.get('cache-control')).toBe('public, max-age=3600');
		});
	});

	describe('given multiple fingerprints are configured', () => {
		test('when requested, then preserves their order', async () => {
			cfg.androidSha256Fingerprints = [FP_B, FP_A];
			const res = await GET(event);
			const body = await res.json();
			expect(body[0].target.sha256_cert_fingerprints).toEqual([FP_B, FP_A]);
		});
	});

	describe('given a custom package name is configured', () => {
		test('when requested, then uses it as package_name', async () => {
			cfg.androidPackageName = 'com.example.fork';
			cfg.androidSha256Fingerprints = [FP_A];
			const res = await GET(event);
			const body = await res.json();
			expect(body[0].target.package_name).toBe('com.example.fork');
		});
	});
});
