export interface LevelMonitor {
	stop(): void;
}

/**
 * Lightweight Web Audio API voice activity / RMS level monitor.
 * Emits normalized [0..1] audio level ~15 times per second without heavy DOM thrashing.
 */
export function createAudioLevelMonitor(
	stream: MediaStream | null,
	onLevel: (level: number, speaking: boolean) => void
): LevelMonitor {
	if (!stream || stream.getAudioTracks().length === 0) {
		onLevel(0, false);
		return { stop() {} };
	}

	const AudioCtx =
		window.AudioContext ||
		(window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
	if (!AudioCtx) {
		return { stop() {} };
	}

	let ctx: AudioContext | null = null;
	let rafId = 0;
	let stopped = false;

	try {
		ctx = new AudioCtx();
		const source = ctx.createMediaStreamSource(stream);
		const analyser = ctx.createAnalyser();
		analyser.fftSize = 256;
		analyser.smoothingTimeConstant = 0.72;
		source.connect(analyser);

		const buf = new Uint8Array(analyser.frequencyBinCount);
		let lastEmit = 0;
		let smoothed = 0;

		const tick = (now: number) => {
			if (stopped) return;
			rafId = requestAnimationFrame(tick);
			if (now - lastEmit < 66) return;
			lastEmit = now;

			const audioTrack = stream.getAudioTracks()[0];
			if (!audioTrack || !audioTrack.enabled || audioTrack.readyState !== 'live') {
				if (smoothed !== 0) {
					smoothed = 0;
					onLevel(0, false);
				}
				return;
			}

			analyser.getByteTimeDomainData(buf);
			let sumSq = 0;
			for (let i = 0; i < buf.length; i++) {
				const v = (buf[i] - 128) / 128;
				sumSq += v * v;
			}
			const rms = Math.sqrt(sumSq / buf.length);
			const normalized = Math.min(1, rms * 3.8);
			smoothed = smoothed * 0.65 + normalized * 0.35;
			onLevel(smoothed, smoothed > 0.08);
		};

		rafId = requestAnimationFrame(tick);
	} catch {
		return { stop() {} };
	}

	return {
		stop() {
			stopped = true;
			if (rafId) cancelAnimationFrame(rafId);
			if (ctx && ctx.state !== 'closed') {
				void ctx.close().catch(() => {});
			}
			onLevel(0, false);
		}
	};
}
