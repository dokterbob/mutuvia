<script module lang="ts">
	import { setZXingModuleOverrides } from 'barcode-detector/ponyfill';

	// By default the ponyfill's locateFile points at fastly.jsdelivr.net at
	// runtime, which would force connect-src/script-src to allow a third-party
	// CDN. We self-host the exact zxing_reader.wasm matching the installed
	// zxing-wasm version instead — see vite.config.ts (copies it from
	// node_modules at config-load time) and src/lib/wasm-integrity.test.ts
	// (asserts the served copy never goes stale against node_modules or a
	// dependency bump).
	// `path` here is always "zxing_reader.wasm" for this ponyfill (it only
	// ever loads the reader build); the prefix argument is ignored.
	//
	// Deliberately in `<script module>` (runs once when this module is first
	// imported) rather than the per-instance `<script>` below: the ponyfill
	// caches the instantiated WASM module keyed by reference-equality of the
	// overrides object (see setZXingModuleOverrides -> prepareZXingModule in
	// node_modules/barcode-detector/dist/es/ponyfill.js), so calling this
	// again with a *new* object literal on every component mount would drop
	// that cache and force a full WASM re-instantiation each time the user
	// re-opens the scanner.
	setZXingModuleOverrides({ locateFile: (path) => `/wasm/${path}` });
</script>

<script lang="ts">
	import * as m from '$lib/paraglide/messages.js';
	import { BarcodeDetector } from 'barcode-detector/ponyfill';

	interface Props {
		/** Return true to accept the scan and stop, false to reject and keep scanning. */
		onScan: (data: string) => boolean;
		onError?: (error: Error) => void;
	}

	let { onScan, onError }: Props = $props();

	let videoEl: HTMLVideoElement | undefined = $state();
	let stream: MediaStream | undefined = $state();
	let errorMessage: string | undefined = $state();
	let scanning = $state(false);

	$effect(() => {
		if (!videoEl) return;

		let cancelled = false;
		let frameId: number;
		const detector = new BarcodeDetector({ formats: ['qr_code'] });

		async function startCamera() {
			try {
				const mediaStream = await navigator.mediaDevices.getUserMedia({
					video: { facingMode: 'environment' }
				});
				if (cancelled) {
					mediaStream.getTracks().forEach((t) => t.stop());
					return;
				}
				stream = mediaStream;
				videoEl!.srcObject = mediaStream;
				await videoEl!.play();
				scanning = true;
				scanLoop();
			} catch (err) {
				if (cancelled) return;
				const error = err as Error;
				if (error.name === 'NotAllowedError') {
					errorMessage = m.scan_permission_denied();
				} else if (error.name === 'NotFoundError') {
					errorMessage = m.scan_no_camera();
				} else {
					errorMessage = m.scan_error();
				}
				onError?.(error);
			}
		}

		let lastScanTime = 0;
		async function scanLoop() {
			if (cancelled || !videoEl || videoEl.readyState < 2) {
				if (!cancelled) frameId = requestAnimationFrame(scanLoop);
				return;
			}

			const now = performance.now();
			if (now - lastScanTime >= 100) {
				lastScanTime = now;
				try {
					const results = await detector.detect(videoEl);
					if (results.length > 0 && !cancelled) {
						const accepted = onScan(results[0].rawValue);
						if (accepted) {
							scanning = false;
							return;
						}
					}
				} catch {
					// Detection failed on this frame, continue
				}
			}

			if (!cancelled) frameId = requestAnimationFrame(scanLoop);
		}

		startCamera();

		return () => {
			cancelled = true;
			scanning = false;
			cancelAnimationFrame(frameId);
			stream?.getTracks().forEach((t) => t.stop());
		};
	});
</script>

<div class="relative aspect-square w-full overflow-hidden rounded-2xl bg-black">
	{#if errorMessage}
		<div class="flex h-full items-center justify-center p-6 text-center text-sm text-white/70">
			{errorMessage}
		</div>
	{:else}
		<!-- svelte-ignore element_invalid_self_closing_tag -->
		<video bind:this={videoEl} class="h-full w-full object-cover" muted playsinline />
		{#if scanning}
			<div class="pointer-events-none absolute inset-0 flex items-center justify-center">
				<div class="h-48 w-48 rounded-2xl border-2 border-white/50"></div>
			</div>
		{/if}
	{/if}
</div>
