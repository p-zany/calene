<script lang="ts">
	import { Monitor, VideoOff } from '@lucide/svelte';
	import { bindWheelForwarding, inspectSurfaceControl } from '@/capabilities/surface-ctrl';
	import type { CallStore } from '@/state/call.svelte';
	import PointerCanvas from './PointerCanvas.svelte';
	import SelfViewPip from './SelfViewPip.svelte';
	import VideoSurface from './VideoSurface.svelte';
	import WaitingOverlay from './WaitingOverlay.svelte';

	interface Props {
		store: CallStore;
		hudVisible: boolean;
		onRoomBadgeTap?: () => void;
	}

	let { store, hudVisible, onRoomBadgeTap }: Props = $props();
	let partnerSpeaking = $state(false);
	let screenContainerEl = $state<HTMLDivElement | null>(null);
	let wheelForwardActive = $state(false);

	const surfaceCaps = $derived(inspectSurfaceControl(store.screenController));

	// Automatically bind Chrome Captured Surface Control wheel forwarding when sharing a tab
	$effect(() => {
		const ctrl = store.screenController;
		const el = screenContainerEl;
		if (!ctrl || !el || !store.activeScreen?.isLocal) {
			wheelForwardActive = false;
			return;
		}
		void bindWheelForwarding(ctrl, el).then((ok) => {
			wheelForwardActive = ok;
		});
		return () => {
			void bindWheelForwarding(ctrl, null);
			wheelForwardActive = false;
		};
	});

	function handlePointerPing(x: number, y: number) {
		if (!store.activeScreen) return;
		store.sendPointer(x, y, store.activeScreen.id, 'tap');
	}
</script>

<div class="relative h-full w-full overflow-hidden bg-canvas">
	<!-- Top minimal status badge (auto-hides with HUD) -->
	<div
		class={`pwa-titlebar-pad pointer-events-none absolute inset-x-0 top-0 z-20 flex items-center justify-between px-4 transition-opacity duration-300 ${
			hudVisible ? 'opacity-100' : 'opacity-0'
		}`}
	>
		<button
			type="button"
			onclick={onRoomBadgeTap}
			class="glass-pill pointer-events-auto flex cursor-pointer items-center gap-2 rounded-full px-3 py-1.5 text-xs text-ink/90"
		>
			<span class={`size-2 rounded-full ${store.peerCount > 0 ? 'bg-live' : 'bg-accent'}`}></span>
			<span>{store.group}</span>
			{#if store.activeScreen}
				<span class="text-ink-muted">·</span>
				<span class="text-accent">
					{store.activeScreen.isLocal ? '你正在投屏' : `${store.activeScreen.username} 正在投屏`}
				</span>
			{/if}
		</button>
	</div>

	{#if store.phase === 'waiting'}
		<!-- State 1: Waiting Room (soft blurred self-view + invite card) -->
		<div class="h-full w-full">
			{#if store.localStream && store.camOn}
				<div class="h-full w-full scale-105 opacity-45 blur-md">
					<VideoSurface
						stream={store.localStream}
						muted={true}
						mirror={store.facingMode === 'user'}
						fit="cover"
					/>
				</div>
			{/if}
			<WaitingOverlay
				group={store.group}
				isMobile={store.isMobile}
				onShare={() => store.shareInviteLink()}
			/>
		</div>
	{:else if store.phase === 'sharing' && store.activeScreen}
		<!-- State 3: Co-Viewing / Screen Share Stage -->
		<!-- Smart Dual Layout:
		     - Mobile Portrait: flex-col split (Top 16:9 pinch-zoomable screen + Bottom partner video)
		     - Mobile Landscape & Desktop: Full-bleed screen stage + floating dual reaction strip -->
		<div class="flex h-full w-full flex-col sm:block landscape:block">
			<!-- Shared screen hero canvas -->
			<div
				bind:this={screenContainerEl}
				class="vt-screen relative aspect-video w-full shrink-0 bg-black sm:aspect-auto sm:h-full landscape:aspect-auto landscape:h-full"
			>
				<VideoSurface
					stream={store.activeScreen.stream}
					muted={store.activeScreen.isLocal || store.effectiveScreenVolume <= 0.001}
					volume={store.effectiveScreenVolume}
					sinkId={store.selectedSpeakerId}
					fit="contain"
					zoomable={!wheelForwardActive}
					onVideoReady={(el) => store.registerMainVideoElement(el)}
				/>

				<!-- Interactive Laser Pointer Ripple Layer -->
				<PointerCanvas
					ripples={store.pointerRipples}
					streamId={store.activeScreen.id}
					interactive={!wheelForwardActive}
					onPing={handlePointerPing}
				/>

				{#if store.activeScreen.isLocal && surfaceCaps.canForwardWheel && wheelForwardActive}
					<div
						class="glass-pill pointer-events-none absolute bottom-3 left-1/2 z-20 -translate-x-1/2 rounded-full px-3 py-1 text-[11px] text-ink/85"
					>
						支持直接在此处滚轮控制共享标签页
					</div>
				{/if}
			</div>

			<!-- Mobile Portrait Bottom Half: Partner full card + mini self view -->
			<div class="relative flex-1 overflow-hidden bg-surface sm:hidden landscape:hidden">
				{#if store.primaryPartnerStream}
					<div class={`h-full w-full ${partnerSpeaking ? 'speaking-ring' : ''}`}>
						<VideoSurface
							stream={store.primaryPartnerStream.stream}
							muted={store.effectiveVoiceVolume <= 0.001}
							volume={store.effectiveVoiceVolume}
							sinkId={store.selectedSpeakerId}
							fit="cover"
							monitorAudio={true}
							onSpeakingChange={(s) => (partnerSpeaking = s)}
						/>
					</div>
				{:else}
					<div class="flex h-full w-full flex-col items-center justify-center gap-2 text-ink-muted">
						<VideoOff class="size-7 opacity-60" />
						<span class="text-xs">{store.primaryPartnerName} 未开启摄像头</span>
					</div>
				{/if}
			</div>

			<!-- Desktop & Mobile Landscape Floating Reaction Strip (Partner + Self bubbles) -->
			<div
				class="safe-inset-top absolute right-4 z-30 hidden flex-col gap-2.5 sm:flex landscape:flex"
			>
				{#if store.primaryPartnerStream}
					<div
						class={`vt-partner glass-panel relative aspect-[16/10] w-44 overflow-hidden rounded-2xl sm:w-52 ${
							partnerSpeaking ? 'speaking-ring' : ''
						}`}
					>
						<VideoSurface
							stream={store.primaryPartnerStream.stream}
							muted={store.effectiveVoiceVolume <= 0.001}
							volume={store.effectiveVoiceVolume}
							sinkId={store.selectedSpeakerId}
							fit="cover"
							monitorAudio={true}
							onSpeakingChange={(s) => (partnerSpeaking = s)}
						/>
						<span
							class="pointer-events-none absolute bottom-1.5 left-2 rounded-full bg-black/55 px-2 py-0.5 text-[10px] text-ink"
						>
							{store.primaryPartnerStream.username}
						</span>
					</div>
				{/if}

				{#if !store.pipCollapsed}
					<div
						class={`vt-self glass-panel relative aspect-[16/10] w-36 self-end overflow-hidden rounded-2xl sm:w-40 ${
							store.micOn && store.localSpeaking ? 'speaking-ring' : ''
						}`}
					>
						{#if store.localStream && store.camOn}
							<VideoSurface
								stream={store.localStream}
								muted={true}
								mirror={store.facingMode === 'user'}
								fit="cover"
							/>
						{:else}
							<div class="flex h-full w-full items-center justify-center bg-surface text-ink-muted">
								<VideoOff class="size-4" />
							</div>
						{/if}
						<span
							class="pointer-events-none absolute bottom-1.5 left-2 rounded-full bg-black/55 px-2 py-0.5 text-[10px] text-ink"
						>
							我
						</span>
					</div>
				{/if}
			</div>
		</div>
	{:else}
		<!-- State 2: 1-on-1 Face-to-Face -->
		{#if store.swappedSelfMain}
			<!-- Swapped: Local full-bleed, Partner in PiP -->
			<div class="vt-self absolute inset-0">
				{#if store.localStream && store.camOn}
					<VideoSurface
						stream={store.localStream}
						muted={true}
						mirror={store.facingMode === 'user'}
						fit="cover"
						onVideoReady={(el) => store.registerMainVideoElement(el)}
					/>
				{:else}
					<div class="flex h-full w-full items-center justify-center bg-surface text-ink-muted">
						<VideoOff class="size-10 opacity-60" />
					</div>
				{/if}
			</div>

			<SelfViewPip
				stream={store.primaryPartnerStream?.stream ?? null}
				label={store.primaryPartnerName}
				mirror={false}
				camOff={!store.primaryPartnerStream?.hasVideo}
				micOff={false}
				speaking={partnerSpeaking}
				corner={store.pipCorner}
				collapsed={store.pipCollapsed}
				onCornerChange={(c) => store.setPipCorner(c)}
				onCollapsedChange={(v) => (store.pipCollapsed = v)}
				onSwap={() => store.toggleSwapSelfMain()}
			/>
			<!-- Keep partner audio playing cleanly when swapped -->
			{#if store.primaryPartnerStream}
				<div class="hidden">
					<VideoSurface
						stream={store.primaryPartnerStream.stream}
						muted={store.effectiveVoiceVolume <= 0.001}
						volume={store.effectiveVoiceVolume}
						sinkId={store.selectedSpeakerId}
						monitorAudio={true}
						onSpeakingChange={(s) => (partnerSpeaking = s)}
					/>
				</div>
			{/if}
		{:else}
			<!-- Default: Partner full-bleed, Self in magnetic PiP -->
			<div
				class={`vt-partner absolute inset-0 ${partnerSpeaking ? 'ring-2 ring-live/45 ring-inset' : ''}`}
			>
				{#if store.primaryPartnerStream}
					<VideoSurface
						stream={store.primaryPartnerStream.stream}
						muted={store.effectiveVoiceVolume <= 0.001}
						volume={store.effectiveVoiceVolume}
						sinkId={store.selectedSpeakerId}
						fit={store.remoteObjectFit}
						monitorAudio={true}
						onSpeakingChange={(s) => (partnerSpeaking = s)}
						onDoubleActivate={() => store.toggleRemoteFit()}
						onVideoReady={(el) => store.registerMainVideoElement(el)}
					/>
				{:else}
					<div
						class="flex h-full w-full flex-col items-center justify-center gap-3 bg-gradient-to-b from-surface to-canvas text-ink-muted"
					>
						<div
							class="flex size-20 items-center justify-center rounded-full bg-white/8 text-2xl font-semibold text-ink"
						>
							{store.primaryPartnerName.slice(0, 2).toUpperCase()}
						</div>
						<p class="text-sm text-ink/90">{store.primaryPartnerName}</p>
						<p class="text-xs text-ink-muted">对方暂未开启摄像头</p>
					</div>
				{/if}
			</div>

			<SelfViewPip
				stream={store.localStream}
				label="我"
				mirror={store.facingMode === 'user'}
				camOff={!store.camOn}
				micOff={!store.micOn}
				speaking={store.micOn && store.localSpeaking}
				corner={store.pipCorner}
				collapsed={store.pipCollapsed}
				onCornerChange={(c) => store.setPipCorner(c)}
				onCollapsedChange={(v) => (store.pipCollapsed = v)}
				onSwap={() => store.toggleSwapSelfMain()}
			/>
		{/if}
	{/if}

	<!-- Elastic Multi-Device / 3rd-Person Fallback Strip -->
	{#if store.extraStreams.length > 0}
		<div
			class="absolute bottom-24 left-4 z-30 flex flex-row gap-2 sm:top-16 sm:bottom-auto sm:flex-col"
		>
			{#each store.extraStreams as extra (extra.id)}
				<button
					type="button"
					onclick={() => store.pinStream(extra.id)}
					title={`切换到 ${extra.username}`}
					class="glass-panel relative aspect-[16/10] w-28 cursor-pointer overflow-hidden rounded-xl text-left transition hover:ring-2 hover:ring-accent sm:w-36"
				>
					<VideoSurface
						stream={extra.stream}
						muted={store.effectiveVoiceVolume <= 0.001}
						volume={store.effectiveVoiceVolume}
						sinkId={store.selectedSpeakerId}
						fit="cover"
					/>
					<span
						class="pointer-events-none absolute bottom-1 left-1.5 flex items-center gap-1 rounded-full bg-black/60 px-1.5 py-0.5 text-[10px] text-ink"
					>
						{#if extra.label === 'screenshare'}
							<Monitor class="size-2.5 text-accent" />
						{/if}
						<span class="max-w-20 truncate">{extra.username}</span>
					</span>
				</button>
			{/each}
		</div>
	{/if}
</div>
