<script lang="ts">
	import { Check, Link2, Share2 } from '@lucide/svelte';

	interface Props {
		group: string;
		isMobile: boolean;
		onShare: () => Promise<void>;
	}

	let { group, isMobile, onShare }: Props = $props();
	let copied = $state(false);

	async function handleShare() {
		await onShare();
		copied = true;
		setTimeout(() => {
			copied = false;
		}, 2000);
	}
</script>

<div class="pointer-events-none fixed inset-0 z-20 flex flex-col items-center justify-center px-6">
	<div
		class="glass-panel pointer-events-auto flex max-w-xs flex-col items-center gap-4 rounded-3xl px-7 py-6 text-center"
	>
		<div class="relative flex size-12 items-center justify-center">
			<span class="soft-pulse absolute inset-0 rounded-full bg-accent/20"></span>
			<span class="size-3 rounded-full bg-accent shadow-lg"></span>
		</div>

		<div class="space-y-1">
			<p class="text-base font-medium tracking-tight text-ink">正在等待对方加入…</p>
			<p class="text-xs text-ink-muted">房间 · {group}</p>
		</div>

		<button
			type="button"
			onclick={handleShare}
			class="flex cursor-pointer items-center gap-2 rounded-full bg-ink px-4 py-2 text-xs font-medium text-canvas transition hover:bg-white active:scale-95"
		>
			{#if copied}
				<Check class="size-3.5 text-emerald-700" />
				<span>已准备好邀请链接</span>
			{:else if isMobile}
				<Share2 class="size-3.5" />
				<span>邀请对方加入</span>
			{:else}
				<Link2 class="size-3.5" />
				<span>复制房间链接</span>
			{/if}
		</button>
	</div>
</div>
