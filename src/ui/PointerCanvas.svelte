<script lang="ts">
	import { onMount } from 'svelte';
	import type { PointerRipple } from '@/state/call.svelte';

	interface Props {
		ripples: PointerRipple[];
		streamId: string;
		interactive?: boolean;
		onPing?: (x: number, y: number) => void;
	}

	let { ripples, streamId, interactive = true, onPing }: Props = $props();

	let canvasEl = $state<HTMLCanvasElement | null>(null);
	let lastEmitAt = 0;
	let pointerDown = false;

	function emitNormalized(e: PointerEvent) {
		if (!interactive || !canvasEl || !onPing) return;
		const rect = canvasEl.getBoundingClientRect();
		if (!rect.width || !rect.height) return;
		const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
		const y = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
		onPing(x, y);
	}

	function handlePointerDown(e: PointerEvent) {
		if (!interactive || e.button !== 0) return;
		pointerDown = true;
		lastEmitAt = performance.now();
		emitNormalized(e);
	}

	function handlePointerMove(e: PointerEvent) {
		if (!interactive || !pointerDown) return;
		const now = performance.now();
		if (now - lastEmitAt < 90) return;
		lastEmitAt = now;
		emitNormalized(e);
	}

	function handlePointerUp() {
		pointerDown = false;
	}

	onMount(() => {
		let rafId = 0;

		const render = () => {
			rafId = requestAnimationFrame(render);
			const canvas = canvasEl;
			if (!canvas) return;
			const rect = canvas.getBoundingClientRect();
			const dpr = window.devicePixelRatio || 1;
			const targetW = Math.round(rect.width * dpr);
			const targetH = Math.round(rect.height * dpr);
			if (canvas.width !== targetW || canvas.height !== targetH) {
				canvas.width = targetW;
				canvas.height = targetH;
			}

			const ctx = canvas.getContext('2d');
			if (!ctx) return;
			ctx.clearRect(0, 0, canvas.width, canvas.height);

			const active = ripples.filter(
				(r) => !streamId || r.streamId === streamId || r.streamId === 'any'
			);
			if (active.length === 0) return;

			const now = performance.now();
			ctx.save();
			ctx.scale(dpr, dpr);

			for (const r of active) {
				const age = now - r.createdAt;
				const progress = Math.min(1, Math.max(0, age / 1200));
				if (progress >= 1) continue;

				const px = r.x * rect.width;
				const py = r.y * rect.height;
				const alpha = 1 - progress;
				const color = r.isSelf ? '96, 165, 250' : '52, 211, 153';

				// Expanding outer ripple
				const radius = 10 + progress * 44;
				ctx.beginPath();
				ctx.arc(px, py, radius, 0, Math.PI * 2);
				ctx.strokeStyle = `rgba(${color}, ${alpha * 0.85})`;
				ctx.lineWidth = 2.5 * (1 - progress * 0.5);
				ctx.stroke();

				// Inner glowing core
				const coreRadius = 6 * (1 - progress * 0.45);
				ctx.beginPath();
				ctx.arc(px, py, coreRadius, 0, Math.PI * 2);
				ctx.fillStyle = `rgba(${color}, ${alpha})`;
				ctx.shadowColor = `rgba(${color}, 0.9)`;
				ctx.shadowBlur = 14;
				ctx.fill();
				ctx.shadowBlur = 0;

				// Subtle sender badge on initial half-second
				if (progress < 0.75 && r.senderName) {
					ctx.font = '500 11px -apple-system, BlinkMacSystemFont, sans-serif';
					ctx.fillStyle = `rgba(244, 244, 245, ${alpha * 0.95})`;
					ctx.fillText(r.senderName, px + 14, py - 10);
				}
			}
			ctx.restore();
		};

		rafId = requestAnimationFrame(render);
		return () => cancelAnimationFrame(rafId);
	});
</script>

<canvas
	bind:this={canvasEl}
	class={`absolute inset-0 z-10 h-full w-full ${
		interactive ? 'cursor-crosshair' : 'pointer-events-none'
	}`}
	onpointerdown={handlePointerDown}
	onpointermove={handlePointerMove}
	onpointerup={handlePointerUp}
	onpointercancel={handlePointerUp}
></canvas>
