<script lang="ts">
	import {
		Aperture,
		Link2,
		MessageCircle,
		Mic,
		MicOff,
		MonitorUp,
		MoreHorizontal,
		Paperclip,
		PhoneOff,
		PictureInPicture2,
		Smile,
		SwitchCamera,
		Video,
		VideoOff,
		Volume2,
		VolumeX,
		ZoomIn,
		ZoomOut
	} from '@lucide/svelte';
	import { QUICK_REACTIONS } from '@/galene/signals';
	import { inspectSurfaceControl, stepSurfaceZoom } from '@/capabilities/surface-ctrl';
	import type { CallStore } from '@/state/call.svelte';

	interface Props {
		store: CallStore;
		visible: boolean;
		onInteract: () => void;
	}

	let { store, visible, onInteract }: Props = $props();
	let fileInputEl = $state<HTMLInputElement | null>(null);
	let audioPopoverEl = $state<HTMLDivElement | null>(null);
	let reactPopoverEl = $state<HTMLDivElement | null>(null);
	let morePopoverEl = $state<HTMLDivElement | null>(null);

	const surfaceCaps = $derived(inspectSurfaceControl(store.screenController));

	function closeAllPopovers() {
		try {
			audioPopoverEl?.hidePopover?.();
			reactPopoverEl?.hidePopover?.();
			morePopoverEl?.hidePopover?.();
		} catch {
			// ignore if already closed
		}
	}

	function handleReactionClick(emoji: string) {
		store.sendReaction(emoji);
		closeAllPopovers();
		onInteract();
	}

	function handleFileChange(e: Event) {
		const input = e.currentTarget as HTMLInputElement;
		if (input.files && input.files.length > 0) {
			store.sendFiles(input.files);
			input.value = '';
		}
		closeAllPopovers();
	}

	function handlePickFile() {
		closeAllPopovers();
		fileInputEl?.click();
	}
</script>

<input bind:this={fileInputEl} type="file" multiple class="hidden" onchange={handleFileChange} />

<!-- Floating Glass Control Dock -->
<nav
	aria-label="通话控制栏"
	onpointerenter={onInteract}
	class={`safe-inset-bottom absolute left-1/2 z-40 -translate-x-1/2 transition-all duration-300 ${
		visible ? 'translate-y-0 opacity-100' : 'pointer-events-none translate-y-4 opacity-0'
	} ${store.chatOpen ? 'max-sm:pointer-events-none max-sm:opacity-0' : ''}`}
>
	<div
		class="glass-panel flex max-w-[calc(100vw-1rem)] items-center gap-1 rounded-full px-2 py-1.5 sm:gap-2 sm:px-3 sm:py-2"
	>
		<!-- Mic toggle -->
		<button
			type="button"
			onclick={() => {
				onInteract();
				void store.toggleMic();
			}}
			aria-label={store.micOn ? '静音麦克风' : '开启麦克风'}
			title={store.micOn ? '静音麦克风' : '开启麦克风'}
			class={`relative flex size-10 cursor-pointer items-center justify-center rounded-full transition active:scale-95 sm:size-11 ${
				store.micOn
					? 'bg-white/12 text-ink hover:bg-white/20'
					: 'bg-danger/85 text-white hover:bg-danger'
			} ${store.micOn && store.localSpeaking ? 'speaking-ring' : ''}`}
		>
			{#if store.micOn}
				<Mic class="size-4 sm:size-5" />
			{:else}
				<MicOff class="size-4 sm:size-5" />
			{/if}
		</button>

		<!-- Camera toggle -->
		<button
			type="button"
			onclick={() => {
				onInteract();
				void store.toggleCamera();
			}}
			aria-label={store.camOn ? '关闭摄像头' : '开启摄像头'}
			title={store.camOn ? '关闭摄像头' : '开启摄像头'}
			class={`flex size-10 cursor-pointer items-center justify-center rounded-full transition active:scale-95 sm:size-11 ${
				store.camOn
					? 'bg-white/12 text-ink hover:bg-white/20'
					: 'bg-danger/85 text-white hover:bg-danger'
			}`}
		>
			{#if store.camOn}
				<Video class="size-4 sm:size-5" />
			{:else}
				<VideoOff class="size-4 sm:size-5" />
			{/if}
		</button>

		<!-- Flip camera (iPhone / multi-camera) -->
		{#if store.canFlipCamera}
			<button
				type="button"
				onclick={() => {
					onInteract();
					void store.flipCamera();
				}}
				aria-label="翻转摄像头"
				title="翻转摄像头"
				class="flex size-10 cursor-pointer items-center justify-center rounded-full bg-white/10 text-ink transition hover:bg-white/20 active:scale-95 sm:size-11"
			>
				<SwitchCamera class="size-4 sm:size-5" />
			</button>
		{/if}

		<!-- Screen share (cleanly hidden on iPhone where unsupported) -->
		{#if store.canShareScreen}
			<button
				type="button"
				onclick={() => {
					onInteract();
					void store.toggleScreenShare();
				}}
				aria-label={store.localScreenStream ? '停止共享屏幕' : '共享屏幕'}
				title={store.localScreenStream ? '停止共享屏幕' : '共享屏幕'}
				class={`flex size-10 cursor-pointer items-center justify-center rounded-full transition active:scale-95 sm:size-11 ${
					store.localScreenStream
						? 'bg-accent text-canvas hover:bg-accent/90'
						: 'bg-white/10 text-ink hover:bg-white/20'
				}`}
			>
				<MonitorUp class="size-4 sm:size-5" />
			</button>
		{/if}

		<!-- Snapshot capture -->
		<button
			type="button"
			onclick={() => {
				onInteract();
				void store.takeSnapshot();
			}}
			aria-label="拍照留念"
			title="拍照留念"
			class="flex size-10 cursor-pointer items-center justify-center rounded-full bg-white/10 text-ink transition hover:bg-white/20 active:scale-95 sm:size-11"
		>
			<Aperture class="size-4 sm:size-5" />
		</button>

		<!-- Audio & Devices Native Popover trigger -->
		<button
			type="button"
			popovertarget="calene-audio-popover"
			onclick={onInteract}
			aria-label="音量与设备"
			title="音量与设备"
			class={`anchor-audio-btn flex size-10 cursor-pointer items-center justify-center rounded-full transition active:scale-95 sm:size-11 ${
				store.masterMuted ? 'bg-danger/80 text-white' : 'bg-white/10 text-ink hover:bg-white/20'
			}`}
		>
			{#if store.masterMuted}
				<VolumeX class="size-4 sm:size-5" />
			{:else}
				<Volume2 class="size-4 sm:size-5" />
			{/if}
		</button>

		<!-- Quick Reactions Popover trigger -->
		<button
			type="button"
			popovertarget="calene-react-popover"
			onclick={onInteract}
			aria-label="发送表情"
			title="发送表情"
			class="anchor-react-btn hidden size-11 cursor-pointer items-center justify-center rounded-full bg-white/10 text-ink transition hover:bg-white/20 active:scale-95 sm:flex"
		>
			<Smile class="size-5" />
		</button>

		<!-- Chat drawer toggle -->
		<button
			type="button"
			onclick={() => {
				onInteract();
				store.toggleChat();
			}}
			aria-label="消息"
			title="消息"
			class={`relative flex size-10 cursor-pointer items-center justify-center rounded-full transition active:scale-95 sm:size-11 ${
				store.chatOpen ? 'bg-ink text-canvas' : 'bg-white/10 text-ink hover:bg-white/20'
			}`}
		>
			<MessageCircle class="size-4 sm:size-5" />
			{#if store.unreadCount > 0}
				<span
					class="absolute top-1.5 right-1.5 flex size-4 items-center justify-center rounded-full bg-accent text-[10px] font-semibold text-canvas"
				>
					{store.unreadCount > 9 ? '9+' : store.unreadCount}
				</span>
			{/if}
		</button>

		<!-- More Popover trigger -->
		<button
			type="button"
			popovertarget="calene-more-popover"
			onclick={onInteract}
			aria-label="更多功能"
			title="更多功能"
			class="anchor-more-btn flex size-10 cursor-pointer items-center justify-center rounded-full bg-white/10 text-ink transition hover:bg-white/20 active:scale-95 sm:size-11"
		>
			<MoreHorizontal class="size-4 sm:size-5" />
		</button>

		<!-- Hang up -->
		<button
			type="button"
			onclick={() => store.leaveRoom()}
			aria-label="挂断"
			title="挂断"
			class="ml-0.5 flex h-10 cursor-pointer items-center justify-center rounded-full bg-danger px-3 text-white transition hover:bg-rose-500 active:scale-95 sm:h-11 sm:px-4"
		>
			<PhoneOff class="size-4 sm:size-5" />
		</button>
	</div>
</nav>

<!-- Native Popover 1: Minimalist Audio Mix + Device Selector (Top Layer, CSS Anchor Positioned) -->
<div
	bind:this={audioPopoverEl}
	id="calene-audio-popover"
	popover="auto"
	class="calene-popover calene-popover-audio glass-panel w-72 rounded-3xl p-4"
>
	<div class="flex flex-col gap-3.5">
		<div class="flex items-center justify-between">
			<span class="text-xs font-medium text-ink">声音控制</span>
			<button
				type="button"
				onclick={() => (store.masterMuted = !store.masterMuted)}
				class={`cursor-pointer rounded-full px-2.5 py-1 text-[11px] transition ${
					store.masterMuted
						? 'bg-danger/80 text-white'
						: 'bg-white/10 text-ink-muted hover:text-ink'
				}`}
			>
				{store.masterMuted ? '已全部静音' : '全部静音'}
			</button>
		</div>

		<!-- Partner voice volume -->
		<div class="space-y-1.5">
			<div class="flex items-center justify-between text-xs">
				<span class="text-ink/90">对方人声</span>
				<button
					type="button"
					onclick={() => (store.voiceMuted = !store.voiceMuted)}
					class="cursor-pointer text-[11px] text-ink-muted hover:text-ink"
				>
					{store.voiceMuted ? '已静音' : `${Math.round(store.voiceVolume * 100)}%`}
				</button>
			</div>
			<input
				type="range"
				min="0"
				max="1"
				step="0.05"
				bind:value={store.voiceVolume}
				oninput={() => (store.voiceMuted = false)}
				class="calene-slider w-full"
			/>
		</div>

		<!-- Screen share independent audio volume -->
		{#if store.activeScreen && !store.activeScreen.isLocal}
			<div class="space-y-1.5">
				<div class="flex items-center justify-between text-xs">
					<span class="text-ink/90">投屏声音</span>
					<button
						type="button"
						onclick={() => (store.screenAudioMuted = !store.screenAudioMuted)}
						class="cursor-pointer text-[11px] text-ink-muted hover:text-ink"
					>
						{store.screenAudioMuted ? '已静音' : `${Math.round(store.screenAudioVolume * 100)}%`}
					</button>
				</div>
				<input
					type="range"
					min="0"
					max="1"
					step="0.05"
					bind:value={store.screenAudioVolume}
					oninput={() => (store.screenAudioMuted = false)}
					class="calene-slider w-full"
				/>
			</div>
		{/if}

		<!-- Devices -->
		<div class="space-y-2 border-t border-white/10 pt-3">
			{#if store.devices.microphones.length > 0}
				<label class="block space-y-1">
					<span class="text-[11px] text-ink-muted">麦克风</span>
					<select
						value={store.selectedMicId}
						onchange={(e) =>
							void store.selectMicrophone((e.currentTarget as HTMLSelectElement).value)}
						class="w-full rounded-xl bg-white/10 px-2.5 py-1.5 text-xs text-ink focus:ring-1 focus:ring-accent focus:outline-none"
					>
						{#each store.devices.microphones as mic (mic.deviceId)}
							<option class="bg-surface text-ink" value={mic.deviceId}>
								{mic.label || '默认麦克风'}
							</option>
						{/each}
					</select>
				</label>
			{/if}

			{#if !store.isMobile && store.devices.cameras.length > 0}
				<label class="block space-y-1">
					<span class="text-[11px] text-ink-muted">摄像头</span>
					<select
						value={store.selectedCameraId}
						onchange={(e) => void store.selectCamera((e.currentTarget as HTMLSelectElement).value)}
						class="w-full rounded-xl bg-white/10 px-2.5 py-1.5 text-xs text-ink focus:ring-1 focus:ring-accent focus:outline-none"
					>
						{#each store.devices.cameras as cam (cam.deviceId)}
							<option class="bg-surface text-ink" value={cam.deviceId}>
								{cam.label || '默认摄像头'}
							</option>
						{/each}
					</select>
				</label>
			{/if}

			{#if store.canSelectSpeaker && store.devices.speakers.length > 0}
				<label class="block space-y-1">
					<span class="text-[11px] text-ink-muted">扬声器 / 耳机</span>
					<select
						value={store.selectedSpeakerId}
						onchange={(e) => store.selectSpeaker((e.currentTarget as HTMLSelectElement).value)}
						class="w-full rounded-xl bg-white/10 px-2.5 py-1.5 text-xs text-ink focus:ring-1 focus:ring-accent focus:outline-none"
					>
						{#each store.devices.speakers as spk (spk.deviceId)}
							<option class="bg-surface text-ink" value={spk.deviceId}>
								{spk.label || '系统默认输出'}
							</option>
						{/each}
					</select>
				</label>
			{/if}
		</div>
	</div>
</div>

<!-- Native Popover 2: Quick Reactions -->
<div
	bind:this={reactPopoverEl}
	id="calene-react-popover"
	popover="auto"
	class="calene-popover calene-popover-react glass-panel rounded-full px-3 py-2"
>
	<div class="flex items-center gap-1.5">
		{#each QUICK_REACTIONS as emoji (emoji)}
			<button
				type="button"
				onclick={() => handleReactionClick(emoji)}
				class="flex size-10 cursor-pointer items-center justify-center rounded-full text-2xl transition hover:scale-125 hover:bg-white/10 active:scale-95"
			>
				{emoji}
			</button>
		{/each}
	</div>
</div>

<!-- Native Popover 3: More Actions -->
<div
	bind:this={morePopoverEl}
	id="calene-more-popover"
	popover="auto"
	class="calene-popover calene-popover-more glass-panel w-56 rounded-3xl p-2"
>
	<div class="flex flex-col gap-1">
		<!-- Quick reactions row on mobile where toolbar smile button is hidden -->
		<div class="flex items-center justify-between border-b border-white/10 px-1.5 pb-2 sm:hidden">
			{#each QUICK_REACTIONS as emoji (emoji)}
				<button
					type="button"
					onclick={() => handleReactionClick(emoji)}
					class="flex size-8 cursor-pointer items-center justify-center rounded-full text-lg hover:bg-white/10"
				>
					{emoji}
				</button>
			{/each}
		</div>

		<button
			type="button"
			onclick={() => {
				closeAllPopovers();
				void store.requestDocPip();
			}}
			class="flex w-full cursor-pointer items-center gap-2.5 rounded-2xl px-3 py-2.5 text-left text-xs text-ink transition hover:bg-white/10"
		>
			<PictureInPicture2 class="size-4 text-accent" />
			<span>{store.docPipOpen ? '关闭悬浮伴随窗' : '弹出悬浮伴随窗 (PiP)'}</span>
		</button>

		<button
			type="button"
			onclick={handlePickFile}
			class="flex w-full cursor-pointer items-center gap-2.5 rounded-2xl px-3 py-2.5 text-left text-xs text-ink transition hover:bg-white/10"
		>
			<Paperclip class="size-4 text-ink-muted" />
			<span>P2P 发送文件</span>
		</button>

		<button
			type="button"
			onclick={() => {
				closeAllPopovers();
				void store.shareInviteLink();
			}}
			class="flex w-full cursor-pointer items-center gap-2.5 rounded-2xl px-3 py-2.5 text-left text-xs text-ink transition hover:bg-white/10"
		>
			<Link2 class="size-4 text-ink-muted" />
			<span>分享 / 复制房间链接</span>
		</button>

		{#if surfaceCaps.canZoom && store.screenController}
			<div class="mt-1 flex items-center justify-between border-t border-white/10 px-2 pt-2">
				<span class="text-[11px] text-ink-muted">共享页缩放</span>
				<div class="flex items-center gap-1">
					<button
						type="button"
						onclick={() => void stepSurfaceZoom(store.screenController, 'out')}
						aria-label="缩小共享页面"
						class="flex size-7 cursor-pointer items-center justify-center rounded-full bg-white/10 hover:bg-white/20"
					>
						<ZoomOut class="size-3.5" />
					</button>
					<button
						type="button"
						onclick={() => void stepSurfaceZoom(store.screenController, 'reset')}
						class="cursor-pointer rounded-full bg-white/10 px-2 py-1 text-[10px] hover:bg-white/20"
					>
						100%
					</button>
					<button
						type="button"
						onclick={() => void stepSurfaceZoom(store.screenController, 'in')}
						aria-label="放大共享页面"
						class="flex size-7 cursor-pointer items-center justify-center rounded-full bg-white/10 hover:bg-white/20"
					>
						<ZoomIn class="size-3.5" />
					</button>
				</div>
			</div>
		{/if}
	</div>
</div>
