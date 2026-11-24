export const SIGNAL_POINTER = 'calene:pointer';
export const SIGNAL_REACTION = 'calene:reaction';

export interface PointerSignal {
	/** Normalized [0..1] X coordinate within the rendered video box */
	x: number;
	/** Normalized [0..1] Y coordinate within the rendered video box */
	y: number;
	streamId: string;
	phase: 'tap' | 'move';
}

export interface ReactionSignal {
	emoji: string;
	id: string;
}

export const QUICK_REACTIONS = ['❤️', '😂', '👍', '🔥', '😮'] as const;

export function parsePointerSignal(raw: unknown): PointerSignal | null {
	if (!raw || typeof raw !== 'object') return null;
	const r = raw as Record<string, unknown>;
	if (typeof r.x !== 'number' || typeof r.y !== 'number' || typeof r.streamId !== 'string') {
		return null;
	}
	if (r.x < 0 || r.x > 1 || r.y < 0 || r.y > 1) return null;
	const phase = r.phase === 'move' ? 'move' : 'tap';
	return { x: r.x, y: r.y, streamId: r.streamId, phase };
}

export function parseReactionSignal(raw: unknown): ReactionSignal | null {
	if (!raw || typeof raw !== 'object') return null;
	const r = raw as Record<string, unknown>;
	if (typeof r.emoji !== 'string' || !r.emoji) return null;
	return {
		emoji: r.emoji.slice(0, 8),
		id: typeof r.id === 'string' ? r.id : `${Date.now()}-${Math.random()}`
	};
}
