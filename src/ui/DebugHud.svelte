<script lang="ts">
	import { onMount } from 'svelte';

	interface Props {
		open: boolean;
		fitMode: string;
		phase: string;
		onClose: () => void;
	}

	let { open, fitMode, phase, onClose }: Props = $props();
	let probeEl = $state<HTMLDivElement | null>(null);
	let lines = $state<string[]>([]);
	let copied = $state(false);

	function measure() {
		if (!open) return;
		const nav = navigator as Navigator & { standalone?: boolean };
		const mode = nav.standalone
			? 'ios-standalone'
			: window.matchMedia('(display-mode: window-controls-overlay)').matches
				? 'wco'
				: window.matchMedia('(display-mode: standalone)').matches
					? 'standalone'
					: 'browser';

		const vv = window.visualViewport;
		const vvText = vv
			? `${Math.round(vv.width)}x${Math.round(vv.height)} @${Math.round(vv.offsetTop)}`
			: 'n/a';

		const appRect = document.getElementById('app')?.getBoundingClientRect();
		const dockEl = document.querySelector<HTMLElement>('nav[aria-label="通话控制栏"]');
		const dockRect = dockEl?.getBoundingClientRect();
		const pipEl = document.querySelector<HTMLElement>('.vt-self');
		const pipRect = pipEl?.getBoundingClientRect();
		const mainVideo = document.querySelector<HTMLVideoElement>(
			'.vt-partner video, .vt-screen video'
		);
		const vidRect = mainVideo?.getBoundingClientRect();
		const vidFit = mainVideo ? getComputedStyle(mainVideo).objectFit : 'none';

		let safeText = 'n/a';
		if (probeEl) {
			const cs = getComputedStyle(probeEl);
			safeText = `T:${cs.paddingTop} B:${cs.paddingBottom}`;
		}

		const next: string[] = [
			`mode=${mode} phase=${phase} fit=${fitMode}`,
			`win=${window.innerWidth}x${window.innerHeight} scr=${window.screen.width}x${window.screen.height}`,
			`vv=${vvText} safe=(${safeText})`,
			`app=${appRect ? `${Math.round(appRect.width)}x${Math.round(appRect.height)}` : 'n/a'} dpr=${window.devicePixelRatio}`
		];

		if (vidRect && mainVideo) {
			next.push(
				`vid=${Math.round(vidRect.width)}x${Math.round(vidRect.height)} @(${Math.round(vidRect.left)},${Math.round(vidRect.top)}) intr=${mainVideo.videoWidth}x${mainVideo.videoHeight} css=${vidFit}`
			);
		} else {
			next.push('vid=none');
		}

		if (dockRect) {
			const containerH = appRect ? appRect.height : window.innerHeight;
			const gapBelow = Math.round(containerH - dockRect.bottom);
			next.push(
				`dock=${Math.round(dockRect.width)}x${Math.round(dockRect.height)} bottom=${Math.round(dockRect.bottom)}/${Math.round(containerH)} gap=${gapBelow}`
			);
		}

		if (pipRect) {
			next.push(
				`pip=${Math.round(pipRect.width)}x${Math.round(pipRect.height)} @(${Math.round(pipRect.left)},${Math.round(pipRect.top)})`
			);
		}

		lines = next;
	}

	async function copyMetrics() {
		try {
			await navigator.clipboard.writeText(lines.join('\n'));
			copied = true;
			setTimeout(() => (copied = false), 1500);
		} catch {
			// ignore
		}
	}

	onMount(() => {
		const timer = setInterval(measure, 500);
		window.addEventListener('resize', measure);
		window.visualViewport?.addEventListener('resize', measure);
		measure();
		return () => {
			clearInterval(timer);
			window.removeEventListener('resize', measure);
			window.visualViewport?.removeEventListener('resize', measure);
		};
	});

	$effect(() => {
		if (open) measure();
	});
</script>

<div bind:this={probeEl} class="safe-area-probe" aria-hidden="true"></div>

{#if open}
	<div
		class="glass-panel safe-inset-top absolute left-3 z-50 max-w-[calc(100vw-1.5rem)] rounded-2xl px-3 py-2 font-mono text-[10px] leading-snug text-emerald-300"
	>
		<div class="mb-1 flex items-center justify-between gap-3 border-b border-white/10 pb-1">
			<span class="font-semibold text-ink">Calene Debug</span>
			<div class="flex items-center gap-1.5">
				<button
					type="button"
					onclick={copyMetrics}
					class="cursor-pointer rounded bg-white/10 px-1.5 py-0.5 text-[10px] text-ink hover:bg-white/20"
				>
					{copied ? '已复制' : '复制'}
				</button>
				<button
					type="button"
					onclick={onClose}
					class="cursor-pointer rounded bg-white/10 px-1.5 py-0.5 text-[10px] text-ink hover:bg-white/20"
				>
					×
				</button>
			</div>
		</div>
		{#each lines as line, idx (idx)}
			<div class="break-all">{line}</div>
		{/each}
	</div>
{/if}
