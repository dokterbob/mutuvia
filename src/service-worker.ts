// SPDX-License-Identifier: AGPL-3.0-or-later

/// <reference types="@sveltejs/kit" />
/// <reference no-default-lib="true"/>
/// <reference lib="esnext" />
/// <reference lib="webworker" />

import { cleanupOutdatedCaches, matchPrecache, precacheAndRoute } from 'workbox-precaching';

declare const self: ServiceWorkerGlobalScope;

precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

// Take control immediately so the first page load is handled by this SW.
self.skipWaiting();
self.addEventListener('activate', (event) => {
	event.waitUntil(self.clients.claim());
});

// Navigation requests: try network first, fall back to the precached offline
// page only when the network is actually unreachable. This preserves SSR
// redirects (e.g. /onboarding → /home) which generateSW's navigateFallback
// would incorrectly intercept and serve the cached page for.
self.addEventListener('fetch', (event) => {
	const { request } = event;
	if (request.mode !== 'navigate') return;

	const { pathname } = new URL(request.url);
	if (pathname.startsWith('/api/') || pathname.startsWith('/sentry-tunnel')) return;

	event.respondWith(
		fetch(request).catch(async () => {
			return (
				(await matchPrecache('/offline.html')) ??
				new Response('You are offline', { status: 503, headers: { 'Content-Type': 'text/html' } })
			);
		})
	);
});
