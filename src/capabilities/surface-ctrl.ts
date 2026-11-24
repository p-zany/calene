export interface SurfaceControlCapabilities {
	canForwardWheel: boolean;
	canZoom: boolean;
	zoomLevel: number | null;
	supportedZoomLevels: number[];
}

export function inspectSurfaceControl(
	controller: CaptureControllerEx | null
): SurfaceControlCapabilities {
	if (!controller) {
		return {
			canForwardWheel: false,
			canZoom: false,
			zoomLevel: null,
			supportedZoomLevels: []
		};
	}

	let supportedZoomLevels: number[];
	try {
		supportedZoomLevels = controller.getSupportedZoomLevels?.() ?? [];
	} catch {
		supportedZoomLevels = [];
	}

	return {
		canForwardWheel: typeof controller.forwardWheel === 'function',
		canZoom: typeof controller.setZoomLevel === 'function' && supportedZoomLevels.length > 0,
		zoomLevel: controller.zoomLevel ?? null,
		supportedZoomLevels
	};
}

export async function bindWheelForwarding(
	controller: CaptureControllerEx | null,
	element: HTMLElement | null
): Promise<boolean> {
	if (!controller || typeof controller.forwardWheel !== 'function') return false;
	try {
		await controller.forwardWheel(element);
		return true;
	} catch {
		return false;
	}
}

export async function stepSurfaceZoom(
	controller: CaptureControllerEx | null,
	direction: 'in' | 'out' | 'reset'
): Promise<void> {
	if (!controller) return;
	try {
		if (direction === 'in') {
			await controller.increaseZoomLevel?.();
		} else if (direction === 'out') {
			await controller.decreaseZoomLevel?.();
		} else {
			await controller.resetZoomLevel?.();
		}
	} catch {
		// ignore permission or non-tab surface errors
	}
}
