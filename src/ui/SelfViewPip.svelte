<script lang="ts">
	import { ChevronLeft, ChevronRight, MicOff, VideoOff } from '@lucide/svelte';
	import type { PipCorner } from '@/state/prefs';
	import VideoSurface from './VideoSurface.svelte';

	interface Props {
		stream: MediaStream | null;
		label: string;
		mirror?: boolean;
		camOff?: boolean;
		micOff?: boolean;
		speaking?: boolean;
		corner: PipCorner;
		collapsed: boolean;
		onCornerChange: (corner: PipCorner) => void;
		onCollapsedChange: (collapsed: boolean) => void;
		onSwap?: () => void;
	}

	let {
		stream,
		label,
		mirror = true,
		camOff = false,
		micOff = false,
		speaking = false,
		corner,
		collapsed,
		onCornerChange,
		onCollapsedChange,
		onSwap
	}: Props = $props();

	let cardEl = $state<HTMLDivElement | null>(null);
	let dragAnim: Animation | null = null;
	let dragging = $state(false);
	let startX = 0;
	let startY = 0;
	let moved = false;

	const cornerClass = $derived.by(() => {
		switch (corner) {
			case 'tl':
				return 'pip-corner-tl';
			case 'bl':
				return 'pip-corner-bl';
			case 'br':
				return 'pip-corner-br';
			case 'tr':
			default:
				return 'pip-corner-tr';
		}
	});

	const isRightEdge = $derived(corner === 'tr' || corner === 'br');

	function handlePointerDown(e: PointerEvent) {
		if (collapsed || (e.target as HTMLElement)?.closest('button')) return;
		if (!cardEl) return;
		dragging = true;
		moved = false;
		startX = e.clientX;
		startY = e.clientY;
		cardEl.setPointerCapture(e.pointerId);
	}

	function handlePointerMove(e: PointerEvent) {
		if (!dragging || !cardEl) return;
		const dx = e.clientX - startX;
		const dy = e.clientY - startY;
		if (Math.hypot(dx, dy) > 6) moved = true;
		if (!moved) return;

		dragAnim?.cancel();
		dragAnim = cardEl.animate([{ transform: `translate3d(${dx}px, ${dy}px, 0) scale(1.03)` }], {
			duration: 0,
			fill: 'forwards'
		});
	}

	function handlePointerUp(e: PointerEvent) {
		if (!dragging || !cardEl) return;
		dragging = false;
		try {
			cardEl.releasePointerCapture(e.pointerId);
		} catch {
			// ignore
		}

		if (moved) {
			const rect = cardEl.getBoundingClientRect();
			const cx = rect.left + rect.width / 2;
			const cy = rect.top + rect.height / 2;
			const horiz = cx < window.innerWidth / 2 ? 'l' : 'r';
			const vert = cy < window.innerHeight / 2 ? 't' : 'b';
			dragAnim?.cancel();
			dragAnim = null;
			onCornerChange(`${vert}${horiz}` as PipCorner);
		} else {
			dragAnim?.cancel();
			dragAnim = null;
			onSwap?.();
		}
	}
</script>

{#if collapsed}
	<button
		type="button"
		onclick={() => onCollapsedChange(false)}
		aria-label="展开本地画面"
		class={`glass-pill fixed z-30 flex cursor-pointer items-center gap-1.5 rounded-full px-3 py-2 text-xs text-ink/90 transition hover:bg-white/15 ${cornerClass} ${
			speaking ? 'speaking-ring' : ''
		}`}
	>
		{#if isRightEdge}
			<ChevronLeft class="size-3.5 text-ink-muted" />
		{/if}
		<span class={`size-2 rounded-full ${camOff ? 'bg-ink-muted/60' : 'bg-live'}`}></span>
		<span>{label}</span>
		{#if !isRightEdge}
			<ChevronRight class="size-3.5 text-ink-muted" />
		{/if}
	</button>
{:else}
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		bind:this={cardEl}
		onpointerdown={handlePointerDown}
		onpointermove={handlePointerMove}
		onpointerup={handlePointerUp}
		onpointercancel={handlePointerUp}
		class={`vt-self glass-panel group fixed z-30 aspect-[3/4] w-28 touch-none overflow-hidden rounded-2xl transition-[top,right,bottom,left,box-shadow] duration-300 sm:aspect-[16/10] sm:w-48 ${cornerClass} ${
			dragging ? 'cursor-grabbing' : 'cursor-grab'
		} ${speaking ? 'speaking-ring' : ''}`}
	>
		{#if stream && !camOff}
			<VideoSurface {stream} muted={true} {mirror} fit="cover" />
		{:else}
			<div
				class="flex h-full w-full flex-col items-center justify-center gap-1.5 bg-surface/90 text-ink-muted"
			>
				<VideoOff class="size-5 opacity-70" />
				<span class="text-[11px]">{label}</span>
			</div>
		{/if}

		<!-- Bottom status tag -->
		<div
			class="pointer-events-none absolute inset-x-0 bottom-0 flex items-center justify-between bg-gradient-to-t from-black/70 to-transparent px-2 py-1.5"
		>
			<span class="truncate text-[11px] font-medium text-ink/95">{label}</span>
			{#if micOff}
				<span class="flex size-5 items-center justify-center rounded-full bg-danger/85 text-white">
					<MicOff class="size-3" />
				</span>
			{/if}
		</div>

		<!-- Collapse to edge button -->
		<button
			type="button"
			onclick={() => onCollapsedChange(true)}
			aria-label="收起小窗"
			title="收起小窗"
			class="absolute top-1.5 right-1.5 flex size-6 cursor-pointer items-center justify-center rounded-full bg-black/55 text-ink/85 opacity-90 transition hover:bg-black/80 sm:opacity-0 sm:group-hover:opacity-100"
		>
			{#if isRightEdge}
				<ChevronRight class="size-3.5" />
			{:else}
				<ChevronLeft class="size-3.5" />
			{/if}
		</button>
	</div>
{/if}
