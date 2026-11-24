<script lang="ts">
	import {
		ArrowRight,
		LoaderCircle,
		Lock,
		Mic,
		MicOff,
		SwitchCamera,
		Video,
		VideoOff
	} from '@lucide/svelte';
	import type { CallStore } from '@/state/call.svelte';
	import VideoSurface from './VideoSurface.svelte';

	interface Props {
		store: CallStore;
	}

	let { store }: Props = $props();
	let showPasswordField = $state(false);

	const partnerWaiting = $derived(
		Boolean(store.roomStatus?.exists && (store.roomStatus.clientCount ?? 0) > 0)
	);

	const shouldShowPassword = $derived(
		showPasswordField || Boolean(store.roomStatus?.requiresPassword) || Boolean(store.password)
	);

	function handleSubmit(e: Event) {
		e.preventDefault();
		void store.joinRoom();
	}
</script>

<div class="relative flex h-full w-full items-center justify-center overflow-hidden bg-canvas">
	<!-- Full-bleed mirrored camera backdrop -->
	<div class="absolute inset-0">
		{#if store.localStream && store.camOn}
			<VideoSurface
				stream={store.localStream}
				muted={true}
				mirror={store.facingMode === 'user'}
				fit="cover"
			/>
			<div
				class="pointer-events-none absolute inset-0 bg-gradient-to-t from-canvas/85 via-canvas/25 to-canvas/55"
			></div>
		{:else}
			<div
				class="flex h-full w-full items-center justify-center bg-gradient-to-b from-surface to-canvas"
			>
				<div class="flex flex-col items-center gap-3 text-ink-muted/60">
					<VideoOff class="size-10" />
					<span class="text-xs">摄像头已关闭</span>
				</div>
			</div>
		{/if}
	</div>

	<!-- Top subtle branding + partner presence pill -->
	<header
		class="pwa-titlebar-pad pointer-events-none fixed inset-x-0 top-0 z-20 flex items-center justify-between px-5"
	>
		<div class="flex items-center gap-2">
			<span class="size-2.5 rounded-full bg-accent"></span>
			<span class="text-sm font-semibold tracking-tight text-ink">Calene</span>
		</div>

		{#if partnerWaiting}
			<div class="glass-pill flex items-center gap-2 rounded-full px-3.5 py-1.5 text-xs text-ink">
				<span class="size-2 rounded-full bg-live"></span>
				<span>对方已在房间等你</span>
			</div>
		{/if}
	</header>

	<!-- Central obsidian glass entry card -->
	<main class="relative z-20 w-full max-w-sm px-5">
		<form onsubmit={handleSubmit} class="glass-panel flex flex-col gap-4 rounded-3xl p-6">
			<div class="space-y-1 text-center">
				<h1 class="text-lg font-semibold tracking-tight text-ink">
					{partnerWaiting ? '点击进入通话' : '准备好了吗'}
				</h1>
				{#if store.mediaError}
					<p class="text-xs text-danger">{store.mediaError}</p>
				{:else if store.probeError}
					<p class="text-xs text-danger">{store.probeError}</p>
				{:else if store.roomStatus?.exists}
					<p class="text-xs text-live">
						房间「{store.roomStatus.name}」已就绪
						{#if (store.roomStatus.clientCount ?? 0) > 0}
							· 当前 {store.roomStatus.clientCount} 人在线
						{/if}
					</p>
				{:else}
					<p class="text-xs text-ink-muted">输入固定私密房间名，下次打开可一键直连</p>
				{/if}
			</div>

			<div class="space-y-3">
				<label class="block space-y-1">
					<span class="text-[11px] font-medium text-ink-muted">房间名</span>
					<input
						type="text"
						value={store.group}
						oninput={(e) => store.scheduleProbeRoom((e.currentTarget as HTMLInputElement).value)}
						placeholder="例如：our-room"
						autocomplete="off"
						class="w-full rounded-2xl border border-white/10 bg-white/8 px-3.5 py-2.5 text-sm text-ink placeholder:text-ink-muted/60 focus:border-accent/60 focus:outline-none"
					/>
				</label>

				<label class="block space-y-1">
					<span class="text-[11px] font-medium text-ink-muted">你的昵称</span>
					<input
						type="text"
						bind:value={store.username}
						placeholder="对方看到的名字"
						autocomplete="nickname"
						class="w-full rounded-2xl border border-white/10 bg-white/8 px-3.5 py-2.5 text-sm text-ink placeholder:text-ink-muted/60 focus:border-accent/60 focus:outline-none"
					/>
				</label>

				{#if shouldShowPassword}
					<div class="space-y-2">
						<label class="block space-y-1">
							<span class="text-[11px] font-medium text-ink-muted">房间密码（公开房可留空）</span>
							<input
								type="password"
								bind:value={store.password}
								placeholder="••••••••"
								autocomplete="current-password"
								class="w-full rounded-2xl border border-white/10 bg-white/8 px-3.5 py-2.5 text-sm text-ink placeholder:text-ink-muted/60 focus:border-accent/60 focus:outline-none"
							/>
						</label>
						<label class="flex cursor-pointer items-center gap-2 text-[11px] text-ink-muted">
							<input
								type="checkbox"
								bind:checked={store.rememberPassword}
								class="rounded accent-accent"
							/>
							<span>在此设备记住房间凭证，下次一键直连</span>
						</label>
					</div>
				{:else}
					<button
						type="button"
						onclick={() => (showPasswordField = true)}
						class="flex cursor-pointer items-center gap-1.5 text-[11px] text-ink-muted hover:text-ink"
					>
						<Lock class="size-3" />
						<span>需要输入房间密码？</span>
					</button>
				{/if}
			</div>

			<!-- Pre-call mic / camera / flip toggles -->
			<div class="flex items-center justify-center gap-3 pt-1">
				<button
					type="button"
					onclick={() => void store.toggleMic()}
					aria-label={store.micOn ? '关闭麦克风' : '开启麦克风'}
					class={`flex size-11 cursor-pointer items-center justify-center rounded-full transition active:scale-95 ${
						store.micOn ? 'bg-white/12 text-ink hover:bg-white/20' : 'bg-danger/85 text-white'
					} ${store.micOn && store.localSpeaking ? 'speaking-ring' : ''}`}
				>
					{#if store.micOn}
						<Mic class="size-5" />
					{:else}
						<MicOff class="size-5" />
					{/if}
				</button>

				<button
					type="button"
					onclick={() => void store.toggleCamera()}
					aria-label={store.camOn ? '关闭摄像头' : '开启摄像头'}
					class={`flex size-11 cursor-pointer items-center justify-center rounded-full transition active:scale-95 ${
						store.camOn ? 'bg-white/12 text-ink hover:bg-white/20' : 'bg-danger/85 text-white'
					}`}
				>
					{#if store.camOn}
						<Video class="size-5" />
					{:else}
						<VideoOff class="size-5" />
					{/if}
				</button>

				{#if store.canFlipCamera}
					<button
						type="button"
						onclick={() => void store.flipCamera()}
						aria-label="翻转摄像头"
						class="flex size-11 cursor-pointer items-center justify-center rounded-full bg-white/12 text-ink transition hover:bg-white/20 active:scale-95"
					>
						<SwitchCamera class="size-5" />
					</button>
				{/if}
			</div>

			<button
				type="submit"
				disabled={store.joining || store.probingRoom || !store.group.trim()}
				class="flex w-full cursor-pointer items-center justify-center gap-2 rounded-full bg-ink py-3 text-sm font-semibold text-canvas transition hover:bg-white active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-45"
			>
				{#if store.joining || store.probingRoom}
					<LoaderCircle class="size-4 animate-spin" />
					<span>{store.joining ? '正在连接…' : '正在探测房间…'}</span>
				{:else}
					<span>{partnerWaiting ? '立刻加入通话' : '进入房间'}</span>
					<ArrowRight class="size-4" />
				{/if}
			</button>
		</form>
	</main>
</div>
