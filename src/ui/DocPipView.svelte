<script lang="ts">
	import { ArrowUpRight, Heart, Mic, MicOff, PhoneOff, VideoOff } from '@lucide/svelte';
	import type { CallStore } from '@/state/call.svelte';
	import VideoSurface from './VideoSurface.svelte';

	interface Props {
		store: CallStore;
		onReturnToCall: () => void;
	}

	let { store, onReturnToCall }: Props = $props();
	let partnerSpeaking = $state(false);
</script>

<div class="group relative flex h-full w-full flex-col overflow-hidden bg-canvas">
	{#if store.primaryPartnerStream}
		<div class={`h-full w-full ${partnerSpeaking ? 'speaking-ring' : ''}`}>
			<VideoSurface
				stream={store.primaryPartnerStream.stream}
				muted={true}
				fit="cover"
				monitorAudio={true}
				onSpeakingChange={(s) => (partnerSpeaking = s)}
			/>
		</div>
	{:else}
		<div class="flex h-full w-full flex-col items-center justify-center gap-2 text-ink-muted">
			<VideoOff class="size-6 opacity-60" />
			<span class="text-xs">{store.primaryPartnerName}</span>
		</div>
	{/if}

	<!-- Subtle top partner pill -->
	<div
		class="pointer-events-none absolute top-2 left-2 rounded-full bg-black/55 px-2.5 py-1 text-[11px] text-ink backdrop-blur-md"
	>
		{store.primaryPartnerName}
	</div>

	<!-- Hover quick controls inside the always-on-top Document PiP window -->
	<div
		class="absolute inset-x-0 bottom-2 flex items-center justify-center gap-2 opacity-95 transition-opacity sm:opacity-0 sm:group-hover:opacity-100"
	>
		<div class="glass-pill flex items-center gap-1.5 rounded-full px-2 py-1.5">
			<button
				type="button"
				onclick={() => void store.toggleMic()}
				aria-label={store.micOn ? '静音' : '取消静音'}
				class={`flex size-8 cursor-pointer items-center justify-center rounded-full ${
					store.micOn ? 'bg-white/15 text-ink' : 'bg-danger text-white'
				}`}
			>
				{#if store.micOn}
					<Mic class="size-4" />
				{:else}
					<MicOff class="size-4" />
				{/if}
			</button>

			<button
				type="button"
				onclick={() => store.sendReaction('❤️')}
				aria-label="发送爱心"
				class="flex size-8 cursor-pointer items-center justify-center rounded-full bg-white/15 text-rose-300 hover:bg-white/25"
			>
				<Heart class="size-4" />
			</button>

			<button
				type="button"
				onclick={onReturnToCall}
				aria-label="回到通话窗口"
				title="回到通话窗口"
				class="flex size-8 cursor-pointer items-center justify-center rounded-full bg-white/15 text-ink hover:bg-white/25"
			>
				<ArrowUpRight class="size-4" />
			</button>

			<button
				type="button"
				onclick={() => store.leaveRoom()}
				aria-label="挂断"
				class="flex size-8 cursor-pointer items-center justify-center rounded-full bg-danger text-white hover:bg-rose-500"
			>
				<PhoneOff class="size-4" />
			</button>
		</div>
	</div>
</div>
