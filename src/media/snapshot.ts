import { downloadBlob } from '@/galene/file-transfer';

export interface SnapshotResult {
	id: string;
	canvas: HTMLCanvasElement;
	blob: Blob;
	filename: string;
	width: number;
	height: number;
	capturedAt: number;
}

/**
 * Captures a crisp PNG snapshot from an active HTMLVideoElement onto an offscreen canvas.
 * Note: Callers should render `canvas` directly rather than `<img src="blob:...">`
 * to stay 100% compliant with Galène's `img-src 'self'` CSP.
 */
export async function captureVideoSnapshot(
	video: HTMLVideoElement,
	label = 'calene'
): Promise<SnapshotResult | null> {
	const width = video.videoWidth;
	const height = video.videoHeight;
	if (!width || !height) return null;

	const canvas = document.createElement('canvas');
	canvas.width = width;
	canvas.height = height;
	const ctx = canvas.getContext('2d');
	if (!ctx) return null;

	ctx.drawImage(video, 0, 0, width, height);

	const blob = await new Promise<Blob | null>((resolve) =>
		canvas.toBlob((b) => resolve(b), 'image/png')
	);
	if (!blob) return null;

	const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
	const safeLabel = label.replace(/[^a-zA-Z0-9_-]/g, '') || 'calene';
	const filename = `${safeLabel}-${stamp}.png`;

	return {
		id: `${Date.now()}`,
		canvas,
		blob,
		filename,
		width,
		height,
		capturedAt: Date.now()
	};
}

export async function saveOrShareSnapshot(snap: SnapshotResult): Promise<'shared' | 'downloaded'> {
	const file = new File([snap.blob], snap.filename, { type: 'image/png' });
	if (
		typeof navigator !== 'undefined' &&
		typeof navigator.share === 'function' &&
		typeof navigator.canShare === 'function' &&
		navigator.canShare({ files: [file] })
	) {
		try {
			await navigator.share({ files: [file], title: 'Calene 留念' });
			return 'shared';
		} catch (err) {
			if (err instanceof DOMException && err.name === 'AbortError') {
				return 'shared';
			}
		}
	}

	downloadBlob(snap.blob, snap.filename);
	return 'downloaded';
}
