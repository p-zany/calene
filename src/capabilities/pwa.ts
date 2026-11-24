export function registerServiceWorker(): void {
	if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
	if (!window.isSecureContext) return;
	window.addEventListener(
		'load',
		() => {
			void navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {
				// Ignore registration failure under restrictive host environments
			});
		},
		{ once: true }
	);
}
