export interface MediaDeviceLists {
	cameras: MediaDeviceInfo[];
	microphones: MediaDeviceInfo[];
	speakers: MediaDeviceInfo[];
}

export function isSpeakerSelectionSupported(): boolean {
	return typeof HTMLMediaElement !== 'undefined' && 'setSinkId' in HTMLMediaElement.prototype;
}

export function isLikelyMobile(): boolean {
	if (typeof navigator === 'undefined') return false;
	return /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
}

export async function listMediaDevices(): Promise<MediaDeviceLists> {
	if (!navigator.mediaDevices?.enumerateDevices) {
		return { cameras: [], microphones: [], speakers: [] };
	}
	const devices = await navigator.mediaDevices.enumerateDevices();
	return {
		cameras: devices.filter((d) => d.kind === 'videoinput'),
		microphones: devices.filter((d) => d.kind === 'audioinput'),
		speakers: devices.filter((d) => d.kind === 'audiooutput')
	};
}

export async function acquireLocalMedia(options: {
	video: boolean;
	audio: boolean;
	cameraId?: string;
	microphoneId?: string;
	facingMode?: 'user' | 'environment';
}): Promise<MediaStream | null> {
	if (!options.video && !options.audio) return null;
	if (!navigator.mediaDevices?.getUserMedia) {
		throw new Error('当前浏览器不支持访问摄像头或麦克风');
	}

	const videoConstraint: boolean | MediaTrackConstraints = options.video
		? {
				width: { ideal: 1280 },
				height: { ideal: 720 },
				frameRate: { ideal: 30 },
				...(options.cameraId
					? { deviceId: { exact: options.cameraId } }
					: options.facingMode
						? { facingMode: { ideal: options.facingMode } }
						: {})
			}
		: false;

	const audioConstraint: boolean | MediaTrackConstraints = options.audio
		? {
				echoCancellation: true,
				noiseSuppression: true,
				autoGainControl: true,
				...(options.microphoneId ? { deviceId: { exact: options.microphoneId } } : {})
			}
		: false;

	try {
		return await navigator.mediaDevices.getUserMedia({
			video: videoConstraint,
			audio: audioConstraint
		});
	} catch (err) {
		// Retry with relaxed constraints if exact deviceId failed (e.g. unplugged device)
		if (options.cameraId || options.microphoneId) {
			return await navigator.mediaDevices.getUserMedia({
				video: options.video
					? options.facingMode
						? { facingMode: { ideal: options.facingMode } }
						: true
					: false,
				audio: options.audio
			});
		}
		throw err;
	}
}

export function stopMediaStream(stream: MediaStream | null): void {
	if (!stream) return;
	for (const track of stream.getTracks()) {
		track.stop();
	}
}

export async function applySinkId(el: HTMLMediaElement | null, sinkId: string): Promise<void> {
	if (!el || !sinkId || typeof el.setSinkId !== 'function') return;
	try {
		await el.setSinkId(sinkId);
	} catch {
		// ignore permission or disconnected sink errors
	}
}
