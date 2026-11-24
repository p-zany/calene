export type PipCorner = 'tr' | 'tl' | 'br' | 'bl';

export interface StoredPrefs {
	lastGroup: string;
	username: string;
	password: string;
	rememberPassword: boolean;
	pipCorner: PipCorner;
	cameraId: string;
	microphoneId: string;
	speakerId: string;
}

const STORAGE_KEY = 'calene:v2:prefs';

const DEFAULT_PREFS: StoredPrefs = {
	lastGroup: '',
	username: '',
	password: '',
	rememberPassword: true,
	pipCorner: 'tr',
	cameraId: '',
	microphoneId: '',
	speakerId: ''
};

export function loadPrefs(): StoredPrefs {
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (!raw) return { ...DEFAULT_PREFS };
		const parsed = JSON.parse(raw) as Partial<StoredPrefs>;
		return {
			...DEFAULT_PREFS,
			...parsed,
			pipCorner:
				parsed.pipCorner === 'tl' ||
				parsed.pipCorner === 'tr' ||
				parsed.pipCorner === 'bl' ||
				parsed.pipCorner === 'br'
					? parsed.pipCorner
					: 'tr'
		};
	} catch {
		return { ...DEFAULT_PREFS };
	}
}

export function savePrefs(prefs: StoredPrefs): void {
	try {
		const toStore: StoredPrefs = {
			...prefs,
			password: prefs.rememberPassword ? prefs.password : ''
		};
		localStorage.setItem(STORAGE_KEY, JSON.stringify(toStore));
	} catch {
		// ignore quota / private browsing errors
	}
}

export function parseInitialGroupFromUrl(): string {
	const pathname = window.location.pathname;
	const match = pathname.match(/^\/group\/(.+?)\/?$/);
	if (match && match[1]) {
		try {
			return decodeURIComponent(match[1]);
		} catch {
			return match[1];
		}
	}
	const params = new URLSearchParams(window.location.search);
	const fromQuery = params.get('group') ?? params.get('room');
	if (fromQuery) return fromQuery.trim();
	return '';
}

export function syncGroupUrl(group: string): void {
	const clean = group.trim().replace(/^\/+|\/+$/g, '');
	if (!clean) return;
	const target = `/group/${clean
		.split('/')
		.map((s) => encodeURIComponent(s))
		.join('/')}/`;
	if (window.location.pathname !== target) {
		try {
			window.history.replaceState(null, '', target);
		} catch {
			// ignore history restrictions
		}
	}
}
