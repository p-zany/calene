export class WakeLockManager {
	private sentinel: WakeLockSentinel | null = null;
	private active = false;

	private handleVisibilityChange = () => {
		if (this.active && document.visibilityState === 'visible') {
			void this.request();
		}
	};

	async enable(): Promise<void> {
		this.active = true;
		document.addEventListener('visibilitychange', this.handleVisibilityChange);
		await this.request();
	}

	async disable(): Promise<void> {
		this.active = false;
		document.removeEventListener('visibilitychange', this.handleVisibilityChange);
		if (this.sentinel) {
			try {
				await this.sentinel.release();
			} catch {
				// ignore
			}
			this.sentinel = null;
		}
	}

	private async request(): Promise<void> {
		if (!('wakeLock' in navigator) || this.sentinel) return;
		try {
			const sentinel = await navigator.wakeLock.request('screen');
			this.sentinel = sentinel;
			sentinel.addEventListener('release', () => {
				if (this.sentinel === sentinel) this.sentinel = null;
			});
		} catch {
			// Low battery or browser restriction; fail silently
		}
	}
}
