<script lang="ts">
	import { onDestroy } from 'svelte';
	import { applySinkId } from '@/media/devices';
	import { createAudioLevelMonitor, type LevelMonitor } from '@/media/audio-mix';

	interface Props {
		stream: MediaStream | null;
		muted?: boolean;
		volume?: number;
		sinkId?: string;
		mirror?: boolean;
		fit?: 'cover' | 'contain';
		zoomable?: boolean;
		monitorAudio?: boolean;
		class?: string;
		onVideoReady?: (el: HTMLVideoElement | null) => void;
		onSpeakingChange?: (speaking: boolean) => void;
		onDoubleActivate?: () => void;
	}

	let {
		stream,
		muted = false,
		volume = 1,
		sinkId = '',
		mirror = false,
		fit = 'cover',
		zoomable = false,
		monitorAudio = false,
		class: className = '',
		onVideoReady,
		onSpeakingChange,
		onDoubleActivate
	}: Props = $props();

	let videoEl = $state<HTMLVideoElement | null>(null);
	let speaking = $state(false);
	let monitor: LevelMonitor | null = null;

	// Interactive zoom/pan state (CSP-safe via Web Animations API, zero inline style)
	let scale = $state(1);
	let panX = $state(0);
	let panY = $state(0);
	let zoomAnim: Animation | null = null;
	let activePointers: Record<number, { x: number; y: number }> = {};
	let pinchStartDist = 0;
	let pinchStartScale = 1;
	let dragLast: { x: number; y: number } | null = null;

	function applyZoomTransform() {
		if (!videoEl) return;
		if (scale <= 1.01) {
			scale = 1;
			panX = 0;
			panY = 0;
			zoomAnim?.cancel();
			zoomAnim = null;
			return;
		}
		const mirrorPart = mirror ? 'scaleX(-1) ' : '';
		const transform = `${mirrorPart}translate3d(${panX}px, ${panY}px, 0) scale(${scale})`;
		zoomAnim?.cancel();
		zoomAnim = videoEl.animate([{ transform }], {
			duration: 0,
			fill: 'forwards'
		});
	}

	export function resetZoom(): void {
		scale = 1;
		panX = 0;
		panY = 0;
		applyZoomTransform();
	}

	$effect(() => {
		const el = videoEl;
		onVideoReady?.(el);
		return () => onVideoReady?.(null);
	});

	$effect(() => {
		const el = videoEl;
		if (!el) return;
		if (el.srcObject !== stream) {
			el.srcObject = stream;
		}
		if (stream) {
			void el.play().catch(() => {});
		}
	});

	$effect(() => {
		const el = videoEl;
		if (!el) return;
		el.muted = muted || volume <= 0.001;
		el.volume = Math.max(0, Math.min(1, volume));
	});

	$effect(() => {
		const el = videoEl;
		if (!el || !sinkId) return;
		void applySinkId(el, sinkId);
	});

	$effect(() => {
		monitor?.stop();
		monitor = null;
		if (!monitorAudio || !stream) {
			speaking = false;
			onSpeakingChange?.(false);
			return;
		}
		monitor = createAudioLevelMonitor(stream, (_level, isSpeaking) => {
			if (speaking !== isSpeaking) {
				speaking = isSpeaking;
				onSpeakingChange?.(isSpeaking);
			}
		});
		return () => {
			monitor?.stop();
			monitor = null;
		};
	});

	function handleWheel(e: WheelEvent) {
		if (!zoomable) return;
		if (!e.ctrlKey && !e.metaKey && scale <= 1.01) return;
		e.preventDefault();
		const delta = -e.deltaY * 0.003;
		scale = Math.max(1, Math.min(4, scale + delta));
		applyZoomTransform();
	}

	function handlePointerDown(e: PointerEvent) {
		if (!zoomable) return;
		activePointers[e.pointerId] = { x: e.clientX, y: e.clientY };
		const pts = Object.values(activePointers);
		if (pts.length === 2) {
			pinchStartDist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
			pinchStartScale = scale;
		} else if (pts.length === 1 && scale > 1.01) {
			dragLast = { x: e.clientX, y: e.clientY };
		}
	}

	function handlePointerMove(e: PointerEvent) {
		if (!zoomable || !(e.pointerId in activePointers)) return;
		activePointers[e.pointerId] = { x: e.clientX, y: e.clientY };
		const pts = Object.values(activePointers);
		if (pts.length === 2 && pinchStartDist > 0) {
			const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
			scale = Math.max(1, Math.min(4, pinchStartScale * (dist / pinchStartDist)));
			applyZoomTransform();
		} else if (pts.length === 1 && scale > 1.01 && dragLast) {
			panX += e.clientX - dragLast.x;
			panY += e.clientY - dragLast.y;
			dragLast = { x: e.clientX, y: e.clientY };
			applyZoomTransform();
		}
	}

	function handlePointerUp(e: PointerEvent) {
		delete activePointers[e.pointerId];
		const count = Object.keys(activePointers).length;
		if (count < 2) pinchStartDist = 0;
		if (count === 0) dragLast = null;
	}

	function handleDblClick() {
		if (zoomable && scale > 1.01) {
			resetZoom();
			return;
		}
		onDoubleActivate?.();
	}

	onDestroy(() => {
		monitor?.stop();
		zoomAnim?.cancel();
	});
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
	class={`relative h-full w-full overflow-hidden bg-canvas select-none ${zoomable ? 'touch-none' : ''} ${className}`}
	onwheel={handleWheel}
	onpointerdown={handlePointerDown}
	onpointermove={handlePointerMove}
	onpointerup={handlePointerUp}
	onpointercancel={handlePointerUp}
	ondblclick={handleDblClick}
>
	<video
		bind:this={videoEl}
		autoplay
		playsinline
		class={`h-full w-full transition-opacity duration-300 ${
			fit === 'cover' ? 'object-cover' : 'object-contain'
		} ${mirror ? '-scale-x-100' : ''}`}
	>
		<track kind="captions" />
	</video>

	{#if zoomable && scale > 1.05}
		<button
			type="button"
			onclick={resetZoom}
			class="glass-pill absolute top-3 left-1/2 z-20 -translate-x-1/2 cursor-pointer rounded-full px-3 py-1 text-xs text-ink/90 transition hover:bg-white/15"
		>
			{Math.round(scale * 100)}% · 点击重置
		</button>
	{/if}
</div>
