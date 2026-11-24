<script lang="ts">
	import { Check, Download, FileUp, Paperclip, X } from '@lucide/svelte';
	import { formatBytes, type FileTransferItem } from '@/galene/file-transfer';

	interface Props {
		transfers: FileTransferItem[];
		dragActive: boolean;
		onAccept: (id: string) => void;
		onCancel: (id: string) => void;
		onDownload: (id: string) => void;
		onDismiss: (id: string) => void;
	}

	let { transfers, dragActive, onAccept, onCancel, onDownload, onDismiss }: Props = $props();
</script>

{#if dragActive}
	<div
		class="pointer-events-none fixed inset-0 z-50 flex items-center justify-center bg-canvas/70 backdrop-blur-md"
	>
		<div
			class="glass-panel flex flex-col items-center gap-3 rounded-3xl border-dashed border-accent/60 px-10 py-8"
		>
			<div class="flex size-14 items-center justify-center rounded-2xl bg-accent/20 text-accent">
				<FileUp class="size-7" />
			</div>
			<p class="text-base font-medium text-ink">松手即刻 P2P 直传给对方</p>
			<p class="text-xs text-ink-muted">通过 WebRTC 端到端通道发送，不经服务器存储</p>
		</div>
	</div>
{/if}

{#if transfers.length > 0}
	<div class="safe-inset-top fixed right-4 z-40 flex w-72 flex-col gap-2">
		{#each transfers as item (item.id)}
			<div class="glass-panel flex flex-col gap-2 rounded-2xl px-3.5 py-3">
				<div class="flex items-start justify-between gap-2">
					<div class="flex min-w-0 items-center gap-2">
						<Paperclip class="size-4 shrink-0 text-accent" />
						<div class="min-w-0">
							<p class="truncate text-xs font-medium text-ink">{item.name}</p>
							<p class="text-[11px] text-ink-muted">
								{item.direction === 'up' ? '发给' : '来自'}
								{item.peerName} · {formatBytes(item.size)}
							</p>
						</div>
					</div>
					<button
						type="button"
						onclick={() =>
							item.state === 'done' || item.state === 'closed'
								? onDismiss(item.id)
								: onCancel(item.id)}
						aria-label="关闭文件传输"
						class="flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-full text-ink-muted hover:bg-white/10 hover:text-ink"
					>
						<X class="size-3.5" />
					</button>
				</div>

				{#if item.state === 'inviting' && item.direction === 'down'}
					<div class="flex items-center gap-2">
						<button
							type="button"
							onclick={() => onAccept(item.id)}
							class="flex flex-1 cursor-pointer items-center justify-center gap-1 rounded-full bg-live/90 py-1.5 text-xs font-medium text-canvas hover:bg-live"
						>
							<Check class="size-3.5" />
							<span>接收</span>
						</button>
						<button
							type="button"
							onclick={() => onCancel(item.id)}
							class="flex-1 cursor-pointer rounded-full bg-white/10 py-1.5 text-xs text-ink hover:bg-white/15"
						>
							拒绝
						</button>
					</div>
				{:else if item.state === 'done' || (item.state === 'closed' && item.blob)}
					{#if item.direction === 'down' && item.blob}
						<button
							type="button"
							onclick={() => onDownload(item.id)}
							class="flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-full bg-ink py-1.5 text-xs font-medium text-canvas hover:bg-white"
						>
							<Download class="size-3.5" />
							<span>保存到本地</span>
						</button>
					{:else}
						<p class="text-[11px] text-live">发送完成</p>
					{/if}
				{:else if item.state === 'cancelled'}
					<p class="text-[11px] text-danger">{item.error || '传输已取消'}</p>
				{:else}
					<div class="flex items-center justify-between text-[11px] text-ink-muted">
						<span>
							{item.state === 'inviting'
								? '等待对方接受…'
								: item.state === 'connecting'
									? '正在建立直连…'
									: `传输中 ${Math.round(item.progress * 100)}%`}
						</span>
						<span>{formatBytes(item.transferred)}</span>
					</div>
					<progress
						class="h-1.5 w-full overflow-hidden rounded-full accent-accent"
						max="1"
						value={item.progress}
					></progress>
				{/if}
			</div>
		{/each}
	</div>
{/if}
