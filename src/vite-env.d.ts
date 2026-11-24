/// <reference types="vite/client" />

export {};

declare global {
	interface DocumentPictureInPictureOptions {
		width?: number;
		height?: number;
		disallowReturnToOpener?: boolean;
		preferInitialWindowPlacement?: boolean;
	}

	interface DocumentPictureInPictureEvent extends Event {
		readonly window: Window;
	}

	interface DocumentPictureInPicture extends EventTarget {
		requestWindow(options?: DocumentPictureInPictureOptions): Promise<Window>;
		readonly window: Window | null;
		onenter:
			((this: DocumentPictureInPicture, ev: DocumentPictureInPictureEvent) => unknown) | null;
	}

	interface Window {
		readonly documentPictureInPicture?: DocumentPictureInPicture;
		readonly CaptureController?: new () => CaptureControllerEx;
	}

	interface CaptureControllerEx extends EventTarget {
		setFocusBehavior?(behavior: 'focus-captured-surface' | 'no-focus-change'): void;
		forwardWheel?(element: HTMLElement | null): Promise<void>;
		getSupportedZoomLevels?(): number[];
		readonly zoomLevel?: number | null;
		setZoomLevel?(level: number): Promise<void>;
		increaseZoomLevel?(): Promise<void>;
		decreaseZoomLevel?(): Promise<void>;
		resetZoomLevel?(): Promise<void>;
		onzoomlevelchange?: ((this: CaptureControllerEx, ev: Event) => unknown) | null;
	}

	interface DisplayMediaStreamOptions {
		controller?: CaptureControllerEx;
		preferCurrentTab?: boolean;
		selfBrowserSurface?: 'include' | 'exclude';
		surfaceSwitching?: 'include' | 'exclude';
		systemAudio?: 'include' | 'exclude';
		monitorTypeSurfaces?: 'include' | 'exclude';
	}

	interface HTMLMediaElement {
		setSinkId?(sinkId: string): Promise<void>;
		readonly sinkId?: string;
	}

	interface MediaSession {
		setMicrophoneActive?(active: boolean): Promise<void>;
		setCameraActive?(active: boolean): Promise<void>;
	}
}
