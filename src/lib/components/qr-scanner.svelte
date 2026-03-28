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
