/**
 * Safely wraps DOM state transitions with Chrome's View Transitions API.
 * Falls back immediately on browsers without `document.startViewTransition`
 * or when the user prefers reduced motion.
 */
export function runViewTransition(update: () => void | Promise<void>): void {
	if (typeof document === 'undefined') {
		void update();
		return;
	}
	const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
	const doc = document as Document & {
		startViewTransition?: (cb: () => void | Promise<void>) => unknown;
	};
	if (!reducedMotion && typeof doc.startViewTransition === 'function') {
		try {
			doc.startViewTransition(update);
			return;
		} catch {
			// fall through
		}
	}
	void update();
}
