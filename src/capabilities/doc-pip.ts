import { mount, unmount, type Component } from 'svelte';

export interface DocPipHandle {
	window: Window;
	close(): void;
}

export function isDocumentPipSupported(): boolean {
	return typeof window !== 'undefined' && Boolean(window.documentPictureInPicture);
}

/**
 * Copies external stylesheet links from the main document into the Document PiP window.
 * Never injects inline `<style>` blocks so strict `style-src 'self'` CSP remains satisfied.
 */
function mirrorStylesheets(targetDoc: Document): void {
	const links = document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]');
	for (const link of links) {
		const clone = targetDoc.createElement('link');
		clone.rel = 'stylesheet';
		clone.href = link.href;
		targetDoc.head.appendChild(clone);
	}
	targetDoc.documentElement.className = document.documentElement.className;
	targetDoc.body.className = 'bg-canvas text-ink antialiased overflow-hidden m-0 p-0';
}

export async function openDocumentPip<Props extends Record<string, unknown>>(
	component: Component<Props>,
	props: Props,
	options: { width?: number; height?: number; onClose?: () => void } = {}
): Promise<DocPipHandle | null> {
	if (!isDocumentPipSupported() || !window.documentPictureInPicture) return null;

	// Close any existing PiP window before opening a fresh one
	if (window.documentPictureInPicture.window) {
		window.documentPictureInPicture.window.close();
	}

	const pipWindow = await window.documentPictureInPicture.requestWindow({
		width: options.width ?? 360,
		height: options.height ?? 240,
		preferInitialWindowPlacement: true
	});

	mirrorStylesheets(pipWindow.document);
	pipWindow.document.title = 'Calene · 通话中';

	const root = pipWindow.document.createElement('div');
	root.className = 'h-screen w-screen overflow-hidden bg-canvas';
	pipWindow.document.body.appendChild(root);

	const instance = mount(component, {
		target: root,
		props
	});

	let cleaned = false;
	const cleanup = () => {
		if (cleaned) return;
		cleaned = true;
		try {
			void unmount(instance);
		} catch {
			// ignore if already unmounted
		}
		options.onClose?.();
	};

	pipWindow.addEventListener('pagehide', cleanup, { once: true });

	return {
		window: pipWindow,
		close() {
			if (!pipWindow.closed) pipWindow.close();
			cleanup();
		}
	};
}

/**
 * Registers Chrome's Auto Picture-in-Picture MediaSession action handler so switching
 * away from the call tab during active video/screen share pops out the companion window.
 */
export function registerAutoPip(handler: (() => void) | null): void {
	if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return;
	try {
		navigator.mediaSession.setActionHandler('enterpictureinpicture' as MediaSessionAction, handler);
	} catch {
		// Browser does not support Auto-PiP action
	}
}
