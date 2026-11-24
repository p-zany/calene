<script lang="ts">
	import { Send, X } from '@lucide/svelte';
	import type { ChatEntry } from '@/galene/client';
	import type { FloatingReaction } from '@/state/call.svelte';

	interface Props {
		messages: ChatEntry[];
		bubbles: ChatEntry[];
		reactions: FloatingReaction[];
		open: boolean;
		onClose: () => void;
		onSend: (text: string) => void;
	}

	let { messages, bubbles, reactions, open, onClose, onSend }: Props = $props();
	let draft = $state('');
	let listEl = $state<HTMLDivElement | null>(null);

	function submit(e: Event) {
		e.preventDefault();
		const text = draft.trim();
		if (!text) return;
		onSend(text);
		draft = '';
	}

	function tokenizeLinks(text: string): Array<{ text: string; isUrl: boolean }> {
		const urlRegex = /(https?:\/\/[^\s]+)/g;
		const parts = text.split(urlRegex);
		return parts
			.filter((p) => p.length > 0)
			.map((p) => ({
				text: p,
				isUrl: /^https?:\/\//.test(p)
			}));
	}

	$effect(() => {
		if (open && listEl && messages.length >= 0) {
			queueMicrotask(() => {
				if (listEl) listEl.scrollTop = listEl.scrollHeight;
			});
		}
	});
</script>

<!-- Floating emoji reactions -->
<div class="pointer-events-none fixed inset-0 z-30 overflow-hidden">
	{#each reactions as r (r.id)}
		<div
			class={`reaction-float safe-inset-bottom fixed bottom-24 flex flex-col items-center gap-0.5 reaction-slot-${r.slot}`}
		>
			<span class="text-4xl drop-shadow-lg">{r.emoji}</span>
		</div>
	{/each}
</div>

<!-- Auto-fading ephemeral chat bubbles (when drawer is closed) -->
{#if !open && bubbles.length > 0}
	<div
		class="above-dock-bottom pointer-events-none fixed left-4 z-30 flex max-w-xs flex-col gap-2 sm:max-w-sm"
	>
		{#each bubbles as msg (msg.id)}
			<div
				class="glass-pill pointer-events-auto rounded-2xl px-3.5 py-2 text-xs leading-relaxed text-ink"
			>
				<span class="mr-1.5 font-medium text-accent">{msg.username}</span>
				<span class="break-words text-ink/95">
					{#each tokenizeLinks(msg.text) as part, idx (idx)}
						{#if part.isUrl}
							<a
								href={part.text}
								target="_blank"
								rel="noopener noreferrer"
								class="underline decoration-accent/60 underline-offset-2 hover:text-accent"
							>
								{part.text}
							</a>
						{:else}
							{part.text}
						{/if}
					{/each}
				</span>
			</div>
		{/each}
	</div>
{/if}

<!-- Lightweight expandable chat drawer -->
{#if open}
	<aside
		class="glass-panel chat-drawer-bounds fixed z-50 flex flex-col rounded-3xl sm:w-full sm:max-w-sm"
	>
		<header class="flex items-center justify-between border-b border-white/10 px-4 py-3">
			<span class="text-sm font-medium text-ink">消息</span>
			<button
				type="button"
				onclick={onClose}
				aria-label="关闭消息面板"
				class="flex size-7 cursor-pointer items-center justify-center rounded-full text-ink-muted hover:bg-white/10 hover:text-ink"
			>
				<X class="size-4" />
			</button>
		</header>

		<div bind:this={listEl} class="flex flex-1 flex-col gap-2.5 overflow-y-auto px-4 py-3">
			{#if messages.length === 0}
				<p class="my-auto text-center text-xs text-ink-muted">
					发送文字或链接，会轻柔浮现在画面角落
				</p>
			{:else}
				{#each messages as msg (msg.id)}
					<div class={`flex flex-col gap-0.5 ${msg.isSelf ? 'items-end' : 'items-start'}`}>
						<span class="px-1 text-[10px] text-ink-muted">{msg.username}</span>
						<div
							class={`max-w-[85%] rounded-2xl px-3 py-2 text-xs leading-relaxed break-words ${
								msg.isSelf ? 'bg-accent/25 text-ink' : 'bg-white/10 text-ink/95'
							}`}
						>
							{#each tokenizeLinks(msg.text) as part, idx (idx)}
								{#if part.isUrl}
									<a
										href={part.text}
										target="_blank"
										rel="noopener noreferrer"
										class="underline decoration-accent/70 underline-offset-2 hover:text-accent"
									>
										{part.text}
									</a>
								{:else}
									{part.text}
								{/if}
							{/each}
						</div>
					</div>
				{/each}
			{/if}
		</div>

		<form onsubmit={submit} class="flex items-center gap-2 border-t border-white/10 p-3">
			<input
				type="text"
				bind:value={draft}
				placeholder="说点什么或贴个链接…"
				class="flex-1 rounded-full bg-white/10 px-3.5 py-2 text-xs text-ink placeholder:text-ink-muted focus:ring-1 focus:ring-accent focus:outline-none"
			/>
			<button
				type="submit"
				aria-label="发送消息"
				class="flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-full bg-ink text-canvas transition hover:bg-white disabled:opacity-40"
				disabled={!draft.trim()}
			>
				<Send class="size-3.5" />
			</button>
		</form>
	</aside>
{/if}
