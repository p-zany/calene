<script lang="ts">
	import { onMount } from 'svelte';
	import { openDocumentPip } from '@/capabilities/doc-pip';
	import { CallStore } from '@/state/call.svelte';
	import CallStage from '@/ui/CallStage.svelte';
	import ChatBubbles from '@/ui/ChatBubbles.svelte';
	import ControlDock from '@/ui/ControlDock.svelte';
	import DebugHud from '@/ui/DebugHud.svelte';
	import DocPipView from '@/ui/DocPipView.svelte';
	import FileDropOverlay from '@/ui/FileDropOverlay.svelte';
	import LobbyMirror from '@/ui/LobbyMirror.svelte';
	import SnapshotToast from '@/ui/SnapshotToast.svelte';

	const store = new CallStore();

	let hudVisible = $state(true);
	let dragActive = $state(false);
	let debugOpen = $state(
		typeof window !== 'undefined' && /(?:^|[?&])debug=1(?:&|$)/.test(window.location.search)
	);
	let dragDepth = 0;
	let badgeTapCount = 0;
	let badgeTapTimer: ReturnType<typeof setTimeout> | null = null;
	let idleTimer: ReturnType<typeof setTimeout> | null = null;

	function handleRoomBadgeTap() {
		badgeTapCount++;
		if (badgeTapTimer) clearTimeout(badgeTapTimer);
		if (badgeTapCount >= 3) {
			badgeTapCount = 0;
			debugOpen = !debugOpen;
			return;
		}
		badgeTapTimer = setTimeout(() => {
			badgeTapCount = 0;
		}, 600);
	}

	function pokeHud() {
		hudVisible = true;
		if (idleTimer) clearTimeout(idleTimer);
		idleTimer = setTimeout(() => {
			if (store.joined && !store.chatOpen) {
				hudVisible = false;
			}
		}, 3200);
	}

	async function openCompanionPip() {
		const handle = await openDocumentPip(
			DocPipView,
			{
				store,
				onReturnToCall: () => {
					window.focus();
					handle?.close();
				}
			},
			{
				width: 340,
				height: 220,
				onClose: () => store.setDocPipHandle(null)
			}
		);
		store.setDocPipHandle(handle);
	}

	function handleDragEnter(e: DragEvent) {
		if (!store.joined) return;
		if (!e.dataTransfer?.types.includes('Files')) return;
		e.preventDefault();
		dragDepth++;
		dragActive = true;
	}

	function handleDragOver(e: DragEvent) {
		if (!store.joined) return;
		if (!e.dataTransfer?.types.includes('Files')) return;
		e.preventDefault();
	}

	function handleDragLeave(e: DragEvent) {
		if (!store.joined) return;
		e.preventDefault();
		dragDepth = Math.max(0, dragDepth - 1);
		if (dragDepth === 0) dragActive = false;
	}

	function handleDrop(e: DragEvent) {
		if (!store.joined) return;
		e.preventDefault();
		dragDepth = 0;
		dragActive = false;
		if (e.dataTransfer?.files && e.dataTransfer.files.length > 0) {
			store.sendFiles(e.dataTransfer.files);
		}
	}

	onMount(() => {
		store.registerDocPipOpener(openCompanionPip);
		void store.initLobby();
		pokeHud();

		return () => {
			if (idleTimer) clearTimeout(idleTimer);
			store.destroy();
		};
	});
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
	class="relative h-full w-full overflow-hidden bg-canvas"
	onpointermove={pokeHud}
	onpointerdown={pokeHud}
	ondragenter={handleDragEnter}
	ondragover={handleDragOver}
	ondragleave={handleDragLeave}
	ondrop={handleDrop}
>
	<!-- Invisible top drag strip active only in desktop PWA Window Controls Overlay mode -->
	<div class="pwa-drag-strip" aria-hidden="true"></div>

	{#if store.phase === 'lobby'}
		<LobbyMirror {store} />
	{:else}
		<CallStage {store} {hudVisible} onRoomBadgeTap={handleRoomBadgeTap} />

		<ChatBubbles
			messages={store.chatMessages}
			bubbles={store.floatingBubbles}
			reactions={store.reactions}
			open={store.chatOpen}
			onClose={() => (store.chatOpen = false)}
			onSend={(text) => store.sendChat(text)}
		/>

		<ControlDock {store} visible={hudVisible || store.chatOpen} onInteract={pokeHud} />

		<FileDropOverlay
			transfers={store.fileTransfers}
			{dragActive}
			onAccept={(id) => store.acceptTransfer(id)}
			onCancel={(id) => store.cancelTransfer(id)}
			onDownload={(id) => store.downloadTransfer(id)}
			onDismiss={(id) => store.dismissTransfer(id)}
		/>

		<SnapshotToast
			snapshot={store.latestSnapshot}
			onSave={() => void store.saveLatestSnapshot()}
			onDismiss={() => store.dismissSnapshot()}
		/>
	{/if}

	<!-- Camera shutter flash feedback -->
	{#if store.shutterFlash}
		<div class="shutter-overlay pointer-events-none absolute inset-0 z-50 bg-white"></div>
	{/if}

	<!-- Optional viewport & layout diagnostics (?debug=1 or triple-tap room pill) -->
	<DebugHud
		open={debugOpen}
		fitMode={store.remoteObjectFit}
		phase={store.phase}
		onClose={() => (debugOpen = false)}
	/>

	<!-- Ephemeral glass notice pills (CSP-safe replacement for toast libraries) -->
	{#if store.notices.length > 0}
		<div
			class="pwa-titlebar-pad pointer-events-none absolute top-2 left-1/2 z-50 flex -translate-x-1/2 flex-col items-center gap-2"
		>
			{#each store.notices as n (n.id)}
				<div
					class={`glass-pill rounded-full px-4 py-1.5 text-xs font-medium ${
						n.tone === 'error'
							? 'border-danger/40 text-danger'
							: n.tone === 'warn'
								? 'border-amber-400/40 text-amber-200'
								: n.tone === 'success'
									? 'border-live/40 text-live'
									: 'text-ink'
					}`}
				>
					{n.text}
				</div>
			{/each}
		</div>
	{/if}
</div>
