export interface ScreenShareResult {
	stream: MediaStream;
	controller: CaptureControllerEx | null;
}

/**
 * Checks whether the current browser supports initiating screen sharing.
 * Returns `false` on iOS Safari so the UI can cleanly hide the button.
 */
export function isScreenShareSupported(): boolean {
	if (typeof navigator === 'undefined' || !navigator.mediaDevices) return false;
	if (typeof navigator.mediaDevices.getDisplayMedia !== 'function') return false;
	// iOS Safari (iPhone/iPad) historically lacks usable getDisplayMedia
	if (/iPhone|iPod/i.test(navigator.userAgent)) return false;
	return true;
}

export async function acquireScreenShare(): Promise<ScreenShareResult> {
	if (!isScreenShareSupported()) {
		throw new Error('当前设备不支持发起网页投屏');
	}

	let controller: CaptureControllerEx | null = null;
	if (typeof window !== 'undefined' && typeof window.CaptureController === 'function') {
		try {
			controller = new window.CaptureController();
			// Stay on the video call tab instead of abruptly jumping away from partner's face
			controller.setFocusBehavior?.('no-focus-change');
		} catch {
			controller = null;
		}
	}

	const options: DisplayMediaStreamOptions = {
		video: {
			frameRate: { ideal: 30, max: 60 }
		},
		audio: {
			echoCancellation: false,
			noiseSuppression: false,
			autoGainControl: false
		},
		selfBrowserSurface: 'exclude',
		surfaceSwitching: 'include',
		systemAudio: 'include',
		...(controller ? { controller } : {})
	};

	const stream = await navigator.mediaDevices.getDisplayMedia(options);
	return { stream, controller };
}
