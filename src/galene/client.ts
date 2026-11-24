import {
	GaleneStream,
	ServerConnection,
	TransferredFile,
	type GaleneCredentials,
	type GaleneUser,
	type JoinedKind,
	type UserActionKind
} from './protocol';
import {
	SIGNAL_POINTER,
	SIGNAL_REACTION,
	parsePointerSignal,
	parseReactionSignal,
	type PointerSignal,
	type ReactionSignal
} from './signals';

export interface GroupStatus {
	exists: boolean;
	name: string;
	description?: string;
	endpoint: string;
	authServer?: string;
	authPortal?: string;
	locked?: boolean;
	clientCount?: number;
	/** Galène may omit `authRequired`; we infer conservatively and also allow empty password */
	requiresPassword: boolean;
}

export interface RemoteStreamEntry {
	id: string;
	localId: string;
	userId: string;
	username: string;
	label: 'camera' | 'screenshare' | string;
	stream: MediaStream;
	hasVideo: boolean;
	hasAudio: boolean;
	raw: GaleneStream;
}

export interface ChatEntry {
	id: string;
	source: string;
	username: string;
	text: string;
	time: Date;
	isSelf: boolean;
	history: boolean;
}

export interface GaleneClientCallbacks {
	onConnectionState?: (state: 'disconnected' | 'connecting' | 'connected') => void;
	onJoined?: (
		kind: JoinedKind,
		group: string,
		error: string | null,
		message: string | null
	) => void;
	onUsersChanged?: (users: Record<string, GaleneUser>, selfId: string) => void;
	onRemoteStreamsChanged?: (streams: RemoteStreamEntry[]) => void;
	onChat?: (entry: ChatEntry) => void;
	onPointer?: (signal: PointerSignal, senderName: string, isSelf: boolean) => void;
	onReaction?: (signal: ReactionSignal, senderName: string, isSelf: boolean) => void;
	onFileTransfer?: (file: TransferredFile) => void;
	onError?: (message: string) => void;
}

function getBaseOrigin(): string {
	const configured = import.meta.env.VITE_GALENE_ORIGIN as string | undefined;
	if (configured && configured.trim()) {
		return configured.trim().replace(/\/+$/, '');
	}
	return window.location.origin;
}

function resolveWsEndpoint(endpoint: string, baseOrigin: string): string {
	const url =
		endpoint.startsWith('ws://') || endpoint.startsWith('wss://')
			? new URL(endpoint)
			: new URL(endpoint, baseOrigin);
	if (window.location.protocol === 'https:' && url.protocol === 'ws:') {
		url.protocol = 'wss:';
	} else if (url.protocol === 'http:' || url.protocol === 'https:') {
		url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
	}
	return url.toString();
}

export async function probeGroupStatus(group: string): Promise<GroupStatus> {
	const cleanGroup = group.trim().replace(/^\/+|\/+$/g, '');
	const origin = getBaseOrigin();
	const encoded = cleanGroup
		.split('/')
		.map((part) => encodeURIComponent(part))
		.join('/');
	const url = `${origin}/group/${encoded}/.status`;

	const res = await fetch(url, { method: 'GET', credentials: 'same-origin' });
	if (res.status === 404) {
		return {
			exists: false,
			name: cleanGroup,
			endpoint: resolveWsEndpoint('/ws', origin),
			requiresPassword: false
		};
	}
	if (!res.ok) {
		throw new Error(`无法探测房间状态 (${res.status})`);
	}

	const raw = (await res.json()) as Record<string, unknown>;
	const endpoint = resolveWsEndpoint(
		typeof raw.endpoint === 'string' && raw.endpoint ? raw.endpoint : '/ws',
		origin
	);
	const authServer = typeof raw.authServer === 'string' ? raw.authServer : undefined;
	const authPortal = typeof raw.authPortal === 'string' ? raw.authPortal : undefined;
	const clientCount = typeof raw.clientCount === 'number' ? raw.clientCount : undefined;
	const locked = Boolean(raw.locked);

	// Galène `.status.json` doesn't always expose whether password is required;
	// if `authKeys` or `authServer` is present or public access isn't advertised, keep password optional.
	const requiresPassword = Boolean(authServer || raw.requiresPassword);

	return {
		exists: true,
		name: typeof raw.name === 'string' && raw.name ? raw.name : cleanGroup,
		description: typeof raw.description === 'string' ? raw.description : undefined,
		endpoint,
		authServer,
		authPortal,
		locked,
		clientCount,
		requiresPassword
	};
}

export class GaleneClient {
	private sc: ServerConnection | null = null;
	private callbacks: GaleneClientCallbacks;
	private remoteStreams = new Map<string, RemoteStreamEntry>();
	private cameraUpStream: GaleneStream | null = null;
	private screenUpStream: GaleneStream | null = null;
	private currentGroup = '';

	constructor(callbacks: GaleneClientCallbacks) {
		this.callbacks = callbacks;
	}

	get selfId(): string {
		return this.sc?.id ?? '';
	}

	get isConnected(): boolean {
		return Boolean(this.sc?.socket && this.sc.socket.readyState === WebSocket.OPEN);
	}

	async connectAndJoin(params: {
		group: string;
		username: string;
		password?: string;
		status: GroupStatus;
	}): Promise<void> {
		this.disconnect();
		this.currentGroup = params.group;
		this.callbacks.onConnectionState?.('connecting');

		const sc = new ServerConnection();
		this.sc = sc;

		sc.onconnected = () => {
			this.callbacks.onConnectionState?.('connected');
			const creds: GaleneCredentials = params.status.authServer
				? {
						type: 'authServer',
						authServer: params.status.authServer,
						location: window.location.href,
						password: params.password ?? ''
					}
				: (params.password ?? '');
			void sc.join(params.group, params.username, creds).catch((err) => {
				this.callbacks.onError?.(err instanceof Error ? err.message : String(err));
			});
		};

		sc.onerror = (err) => {
			this.callbacks.onError?.(err instanceof Error ? err.message : String(err));
		};

		sc.onclose = () => {
			this.remoteStreams.clear();
			this.cameraUpStream = null;
			this.screenUpStream = null;
			this.emitRemoteStreams();
			this.callbacks.onConnectionState?.('disconnected');
		};

		sc.onjoined = (kind, group, _perms, _status, _data, error, message) => {
			if (kind === 'join') {
				sc.request({ '': ['audio', 'video'] });
			}
			this.callbacks.onJoined?.(kind, group, error, message);
			this.callbacks.onUsersChanged?.({ ...sc.users }, sc.id);
		};

		sc.onuser = (_id: string, _kind: UserActionKind) => {
			this.callbacks.onUsersChanged?.({ ...sc.users }, sc.id);
		};

		sc.ondownstream = (down: GaleneStream) => {
			down.ondowntrack = (_track, _transceiver, stream) => {
				const entry: RemoteStreamEntry = {
					id: down.id,
					localId: down.localId,
					userId: down.source ?? '',
					username: down.username ?? '对方',
					label: down.label || 'camera',
					stream,
					hasVideo: stream.getVideoTracks().length > 0,
					hasAudio: stream.getAudioTracks().length > 0,
					raw: down
				};
				this.remoteStreams.set(down.id, entry);
				this.emitRemoteStreams();
			};
			down.onclose = () => {
				if (this.remoteStreams.delete(down.id)) {
					this.emitRemoteStreams();
				}
			};
			down.onerror = (err) => {
				console.warn('[Galene] downstream error', err);
			};
		};

		sc.onchat = (id, source, _dest, username, time, _priv, history, _kind, message) => {
			const selfName = (sc.username || params.username || '').trim();
			const senderName = (username ?? '').trim();
			const isSelf =
				source === sc.id || ((history || !source) && Boolean(selfName) && senderName === selfName);
			this.callbacks.onChat?.({
				id: id || `${Date.now()}-${Math.random()}`,
				source: source ?? '',
				username: senderName || '对方',
				text: message,
				time: time ?? new Date(),
				isSelf,
				history
			});
		};

		sc.onusermessage = (source, _dest, username, _time, _priv, kind, _error, value) => {
			if (kind === SIGNAL_POINTER) {
				const sig = parsePointerSignal(value);
				if (sig) {
					this.callbacks.onPointer?.(sig, username || '对方', source === sc.id);
				}
			} else if (kind === SIGNAL_REACTION) {
				const sig = parseReactionSignal(value);
				if (sig) {
					this.callbacks.onReaction?.(sig, username || '对方', source === sc.id);
				}
			}
		};

		sc.onfiletransfer = (file) => {
			this.callbacks.onFileTransfer?.(file);
		};

		sc.connect(params.status.endpoint);
	}

	publishCameraStream(stream: MediaStream | null): void {
		const sc = this.sc;
		if (!sc) return;

		if (!stream || stream.getTracks().length === 0) {
			this.cameraUpStream?.close();
			this.cameraUpStream = null;
			return;
		}

		// If an upstream already exists, replace tracks seamlessly without renegotiation churn when possible
		if (this.cameraUpStream && this.cameraUpStream.pc.connectionState !== 'closed') {
			const pc = this.cameraUpStream.pc;
			const senders = pc.getSenders();
			let needsRebuild = false;

			for (const kind of ['video', 'audio'] as const) {
				const newTrack = stream.getTracks().find((t) => t.kind === kind) ?? null;
				const sender = senders.find((s) => s.track?.kind === kind);
				if (sender && newTrack) {
					void sender.replaceTrack(newTrack);
				} else if (!sender && newTrack) {
					needsRebuild = true;
				} else if (sender && !newTrack) {
					needsRebuild = true;
				}
			}

			if (!needsRebuild) {
				this.cameraUpStream.setStream(stream);
				return;
			}
		}

		const up = sc.newUpStream('camera');
		up.label = 'camera';
		for (const track of stream.getTracks()) {
			up.pc.addTransceiver(track, {
				direction: 'sendonly',
				streams: [stream],
				sendEncodings: track.kind === 'audio' ? [{ maxBitrate: 128000 }] : undefined
			});
		}
		up.setStream(stream);
		this.cameraUpStream = up;
	}

	publishScreenStream(stream: MediaStream | null): void {
		const sc = this.sc;
		if (!sc) return;

		if (!stream || stream.getTracks().length === 0) {
			this.screenUpStream?.close();
			this.screenUpStream = null;
			return;
		}

		const up = sc.newUpStream('screenshare');
		up.label = 'screenshare';
		for (const track of stream.getTracks()) {
			if (track.kind === 'video' && 'contentHint' in track) {
				try {
					track.contentHint = 'detail';
				} catch {
					// ignore unsupported hint
				}
			}
			up.pc.addTransceiver(track, {
				direction: 'sendonly',
				streams: [stream],
				sendEncodings: track.kind === 'audio' ? [{ maxBitrate: 192000 }] : undefined
			});
		}
		up.setStream(stream);
		this.screenUpStream = up;
	}

	sendChat(text: string): void {
		if (!this.sc || !text.trim()) return;
		this.sc.chat('', '', text.trim());
	}

	sendPointer(signal: PointerSignal): void {
		if (!this.sc) return;
		this.sc.userMessage(SIGNAL_POINTER, '', signal, false);
	}

	sendReaction(emoji: string): void {
		if (!this.sc) return;
		const signal: ReactionSignal = {
			emoji,
			id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
		};
		this.sc.userMessage(SIGNAL_REACTION, '', signal, false);
	}

	sendFileToPeers(file: File): TransferredFile[] {
		if (!this.sc) return [];
		const sent: TransferredFile[] = [];
		for (const uid of Object.keys(this.sc.users)) {
			if (uid === this.sc.id) continue;
			const tf = this.sc.sendFile(uid, file);
			if (tf) sent.push(tf);
		}
		return sent;
	}

	disconnect(): void {
		if (this.sc) {
			if (this.currentGroup && this.isConnected) {
				try {
					this.sc.leave(this.currentGroup);
				} catch {
					// ignore
				}
			}
			this.cameraUpStream?.close();
			this.screenUpStream?.close();
			this.cameraUpStream = null;
			this.screenUpStream = null;
			this.sc.close();
			this.sc = null;
		}
		this.remoteStreams.clear();
		this.emitRemoteStreams();
	}

	private emitRemoteStreams(): void {
		this.callbacks.onRemoteStreamsChanged?.(Array.from(this.remoteStreams.values()));
	}
}
