export interface MediaSessionCallbacks {
	onToggleMic: () => void;
	onToggleCamera: () => void;
	onHangUp: () => void;
}

export function bindCallMediaSession(callbacks: MediaSessionCallbacks): () => void {
	if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) {
		return () => {};
	}

	const ms = navigator.mediaSession;
	const actions: Array<[string, () => void]> = [
		['togglemicrophone', callbacks.onToggleMic],
		['togglecamera', callbacks.onToggleCamera],
		['hangup', callbacks.onHangUp]
	];

	for (const [action, fn] of actions) {
		try {
			ms.setActionHandler(action as MediaSessionAction, fn);
		} catch {
			// Action not supported on this browser
		}
	}

	return () => {
		for (const [action] of actions) {
			try {
				ms.setActionHandler(action as MediaSessionAction, null);
			} catch {
				// ignore
			}
		}
	};
}

export function syncMediaSessionState(micOn: boolean, camOn: boolean): void {
	if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return;
	try {
		void navigator.mediaSession.setMicrophoneActive?.(micOn);
		void navigator.mediaSession.setCameraActive?.(camOn);
	} catch {
		// ignore unsupported browsers
	}
}
