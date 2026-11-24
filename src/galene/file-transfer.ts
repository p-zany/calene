import type { TransferredFile, TransferredFileState } from './protocol';

export interface FileTransferItem {
	id: string;
	name: string;
	mimeType: string;
	size: number;
	transferred: number;
	progress: number;
	direction: 'up' | 'down';
	peerName: string;
	state: TransferredFileState;
	blob?: Blob;
	error?: string;
	handle: TransferredFile;
}

export function formatBytes(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
	if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
	return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

/**
 * Triggers a browser file download using a temporary object URL on an anchor tag.
 * CSP-safe under Galène's `img-src 'self'` policy (does not render blob into <img>).
 */
export function downloadBlob(blob: Blob, filename: string): void {
	const url = URL.createObjectURL(blob);
	const a = document.createElement('a');
	a.href = url;
	a.download = filename;
	document.body.appendChild(a);
	a.click();
	a.remove();
	setTimeout(() => URL.revokeObjectURL(url), 10000);
}
