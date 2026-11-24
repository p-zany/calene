<script lang="ts">
	import { Download, X } from '@lucide/svelte';
	import type { SnapshotResult } from '@/media/snapshot';

	interface Props {
		snapshot: SnapshotResult | null;
		onSave: () => void;
		onDismiss: () => void;
	}

	let { snapshot, onSave, onDismiss }: Props = $props();
	let previewCanvas = $state<HTMLCanvasElement | null>(null);

	$effect(() => {
		const snap = snapshot;
		const dst = previewCanvas;
		if (!snap || !dst) return;
		dst.width = 160;
		dst.height = Math.max(90, Math.round((160 * snap.height) / snap.width));
		const ctx = dst.getContext('2d');
		if (ctx) {
			ctx.drawImage(snap.canvas, 0, 0, dst.width, dst.height);
		}
	});
</script>

{#if snapshot}
	<div
		class="glass-panel safe-inset-top fixed left-4 z-50 flex items-center gap-3 rounded-2xl p-2.5 pr-3"
	>
		<canvas bind:this={previewCanvas} class="h-14 w-24 rounded-xl bg-black/50 object-cover"
		></canvas>
		<div class="flex flex-col gap-1.5">
			<span class="text-xs font-medium text-ink">已抓拍画面</span>
			<div class="flex items-center gap-1.5">
				<button
					type="button"
					onclick={onSave}
					class="flex cursor-pointer items-center gap-1 rounded-full bg-ink px-2.5 py-1 text-[11px] font-medium text-canvas transition hover:bg-white"
				>
					<Download class="size-3" />
					<span>保存</span>
				</button>
				<button
					type="button"
					onclick={onDismiss}
					aria-label="关闭抓拍预览"
					class="flex size-6 cursor-pointer items-center justify-center rounded-full bg-white/10 text-ink-muted transition hover:bg-white/20 hover:text-ink"
				>
					<X class="size-3.5" />
				</button>
			</div>
		</div>
	</div>
{/if}
