// Strongly typed ES Module port of Galène protocol v2 (originally by Juliusz Chroboczek, MIT).
// Preserves 100% wire compatibility with Galène's Go SFU server without global window scripts.

export interface GaleneUser {
	username: string;
	permissions: string[];
	data: Record<string, unknown>;
	streams: Record<string, Record<string, boolean>>;
}

export type GaleneCredentials =
	| string
	| { type: 'password'; password: string }
	| { type: 'token'; token: string }
	| { type: 'authServer'; authServer: string; location?: string; password: string };

export type JoinedKind = 'join' | 'fail' | 'change' | 'leave';
export type UserActionKind = 'add' | 'change' | 'delete';
export type TransferredFileState =
	'' | 'inviting' | 'connecting' | 'connected' | 'done' | 'cancelled' | 'closed';

interface WireMessage {
	type: string;
	version?: string[];
	kind?: string;
	error?: string;
	id?: string;
	replace?: string | null;
	source?: string;
	dest?: string;
	username?: string;
	password?: string;
	token?: string;
	privileged?: boolean;
	permissions?: string[];
	status?: Record<string, unknown>;
	data?: Record<string, unknown>;
	group?: string;
	value?: unknown;
	noecho?: boolean;
	time?: string | number;
	sdp?: string;
	candidate?: RTCIceCandidateInit | RTCIceCandidate | null;
	label?: string | null;
	request?: Record<string, string[]> | string[];
	rtcConfiguration?: RTCConfiguration;
}

function toHex(array: Uint8Array): string {
	let out = '';
	for (let i = 0; i < array.length; i++) {
		out += array[i].toString(16).padStart(2, '0');
	}
	return out;
}

export function newRandomId(): string {
	const a = new Uint8Array(16);
	crypto.getRandomValues(a);
	return toHex(a);
}

let localIdCounter = 0;
function newLocalId(): string {
	return `${localIdCounter++}`;
}

function parseTime(value?: string | number): Date | null {
	if (!value) return null;
	try {
		const d = new Date(value);
		return Number.isNaN(d.getTime()) ? null : d;
	} catch {
		return null;
	}
}

export class ServerConnection {
	readonly id: string = newRandomId();
	group: string | null = null;
	username: string | null = null;
	users: Record<string, GaleneUser> = {};
	socket: WebSocket | null = null;
	version: string | null = null;
	up: Record<string, GaleneStream> = {};
	down: Record<string, GaleneStream> = {};
	rtcConfiguration: RTCConfiguration | null = null;
	permissions: string[] = [];
	userdata: Record<string, unknown> = {};
	lastServerMessage: number | null = null;
	pingHandler: ReturnType<typeof setInterval> | null = null;
	transferredFiles: Record<string, TransferredFile> = {};

	// Callbacks
	onconnected: ((this: ServerConnection) => void) | null = null;
	onerror: ((this: ServerConnection, error: unknown) => void) | null = null;
	onclose: ((this: ServerConnection, code: number, reason: string) => void) | null = null;
	onpeerconnection: ((this: ServerConnection) => RTCConfiguration | null) | null = null;
	onuser: ((this: ServerConnection, id: string, kind: UserActionKind) => void) | null = null;
	onjoined:
		| ((
				this: ServerConnection,
				kind: JoinedKind,
				group: string,
				permissions: string[],
				status: Record<string, unknown> | undefined,
				data: Record<string, unknown> | undefined,
				error: string | null,
				message: string | null
		  ) => void)
		| null = null;
	ondownstream: ((this: ServerConnection, stream: GaleneStream) => void) | null = null;
	onchat:
		| ((
				this: ServerConnection,
				id: string | undefined,
				source: string | undefined,
				dest: string | undefined,
				username: string | undefined,
				time: Date | null,
				privileged: boolean,
				history: boolean,
				kind: string | undefined,
				message: string
		  ) => void)
		| null = null;
	onusermessage:
		| ((
				this: ServerConnection,
				id: string | undefined,
				dest: string | undefined,
				username: string | undefined,
				time: Date | null,
				privileged: boolean,
				kind: string | undefined,
				error: string | undefined,
				message: unknown
		  ) => void)
		| null = null;
	onfiletransfer: ((this: ServerConnection, f: TransferredFile) => void) | null = null;

	close(): void {
		if (this.socket) {
			this.socket.close(1000, 'Close requested by client');
			this.socket = null;
		}
	}

	error(e: unknown): void {
		this.onerror?.call(this, e);
		this.close();
	}

	send(m: WireMessage): void {
		if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
			throw new Error('Connection is not open');
		}
		this.socket.send(JSON.stringify(m));
	}

	connect(url: string): void {
		if (this.socket) {
			throw new Error('Attempting to connect stale connection');
		}

		this.socket = new WebSocket(url);

		this.pingHandler = setInterval(() => {
			if (!this.lastServerMessage) {
				this.error(new Error('Connection timeout'));
				return;
			}
			const elapsed = Date.now() - this.lastServerMessage;
			if (elapsed > 65000) {
				this.error(new Error('Connection timeout'));
				return;
			}
			if (this.version && elapsed >= 15000) {
				try {
					this.send({ type: 'ping' });
				} catch {
					// ignore if closing
				}
			}
		}, 10000);

		this.socket.onerror = () => {
			this.onerror?.call(this, new Error('WebSocket connection error'));
		};

		this.socket.onopen = () => {
			try {
				this.send({
					type: 'handshake',
					version: ['2'],
					id: this.id
				});
			} catch (e) {
				this.error(e);
			}
		};

		this.socket.onclose = (e: CloseEvent) => {
			this.permissions = [];
			for (const id of Object.keys(this.up)) {
				this.up[id]?.close();
			}
			for (const id of Object.keys(this.down)) {
				this.down[id]?.close();
			}
			for (const id of Object.keys(this.users)) {
				delete this.users[id];
				this.onuser?.call(this, id, 'delete');
			}
			if (this.group) {
				this.onjoined?.call(this, 'leave', this.group, [], {}, {}, null, null);
			}
			this.group = null;
			this.username = null;
			if (this.pingHandler) {
				clearInterval(this.pingHandler);
				this.pingHandler = null;
			}
			this.socket = null;
			this.onclose?.call(this, e.code, e.reason);
		};

		this.socket.onmessage = (e: MessageEvent<string>) => {
			let m: WireMessage;
			try {
				m = JSON.parse(e.data) as WireMessage;
			} catch (err) {
				this.error(err);
				return;
			}
			if (m.type !== 'handshake' && !this.version) {
				this.error(new Error("Server didn't send handshake"));
				return;
			}
			this.lastServerMessage = Date.now();

			switch (m.type) {
				case 'handshake':
					if (Array.isArray(m.version) && m.version.includes('2')) {
						this.version = '2';
					} else {
						this.version = null;
						this.error(new Error(`Unknown protocol version ${String(m.version)}`));
						return;
					}
					this.onconnected?.call(this);
					break;
				case 'offer':
					if (m.id && m.sdp) {
						void this.gotOffer(
							m.id,
							m.label ?? null,
							m.source ?? '',
							m.username ?? '',
							m.sdp,
							m.replace ?? null
						);
					}
					break;
				case 'answer':
					if (m.id && m.sdp) {
						void this.gotAnswer(m.id, m.sdp);
					}
					break;
				case 'renegotiate':
					if (m.id) this.gotRenegotiate(m.id);
					break;
				case 'close':
					if (m.id) this.gotClose(m.id);
					break;
				case 'abort':
					if (m.id) this.gotAbort(m.id);
					break;
				case 'ice':
					if (m.id && m.candidate) {
						void this.gotRemoteIce(m.id, m.candidate);
					}
					break;
				case 'joined': {
					const kind = (m.kind ?? 'fail') as JoinedKind;
					if (kind === 'leave' || kind === 'fail') {
						for (const id of Object.keys(this.users)) {
							delete this.users[id];
							this.onuser?.call(this, id, 'delete');
						}
						this.username = null;
						this.permissions = [];
						this.rtcConfiguration = null;
						if (kind === 'leave') {
							this.group = null;
						}
					} else if (kind === 'join' || kind === 'change') {
						if (kind === 'change' && m.group !== this.group) {
							break;
						}
						this.group = m.group ?? null;
						this.username = m.username ?? null;
						this.permissions = m.permissions ?? [];
						this.rtcConfiguration = m.rtcConfiguration ?? null;
					}
					this.onjoined?.call(
						this,
						kind,
						m.group ?? '',
						m.permissions ?? [],
						m.status,
						m.data,
						m.error ?? null,
						typeof m.value === 'string' ? m.value : null
					);
					break;
				}
				case 'user': {
					if (!m.id) return;
					const kind = m.kind as UserActionKind;
					if (kind === 'add') {
						this.users[m.id] = {
							username: m.username ?? '',
							permissions: m.permissions ?? [],
							data: m.data ?? {},
							streams: {}
						};
					} else if (kind === 'change') {
						if (!(m.id in this.users)) {
							this.users[m.id] = {
								username: m.username ?? '',
								permissions: m.permissions ?? [],
								data: m.data ?? {},
								streams: {}
							};
						} else {
							this.users[m.id].username = m.username ?? '';
							this.users[m.id].permissions = m.permissions ?? [];
							this.users[m.id].data = m.data ?? {};
						}
					} else if (kind === 'delete') {
						for (const fid of Object.keys(this.transferredFiles)) {
							const f = this.transferredFiles[fid];
							if (f.userid === m.id) {
								f.fail('Peer left the room');
							}
						}
						delete this.users[m.id];
					} else {
						return;
					}
					this.onuser?.call(this, m.id, kind);
					break;
				}
				case 'chat':
				case 'chathistory':
					this.onchat?.call(
						this,
						m.id,
						m.source,
						m.dest,
						m.username,
						parseTime(m.time),
						Boolean(m.privileged),
						m.type === 'chathistory',
						m.kind,
						`${m.value ?? ''}`
					);
					break;
				case 'usermessage':
					if (m.kind === 'filetransfer' && m.source && m.value && typeof m.value === 'object') {
						this.fileTransfer(m.source, m.username ?? '', m.value as Record<string, unknown>);
					} else {
						this.onusermessage?.call(
							this,
							m.source,
							m.dest,
							m.username,
							parseTime(m.time),
							Boolean(m.privileged),
							m.kind,
							m.error,
							m.value
						);
					}
					break;
				case 'ping':
					this.send({ type: 'pong' });
					break;
				case 'pong':
					break;
				default:
					break;
			}
		};
	}

	async join(
		group: string,
		username: string,
		credentials: GaleneCredentials = '',
		data?: Record<string, unknown>
	): Promise<void> {
		const m: WireMessage = {
			type: 'join',
			kind: 'join',
			group
		};
		if (username !== undefined && username !== null) {
			m.username = username;
		}
		if (typeof credentials === 'string') {
			if (credentials) m.password = credentials;
		} else {
			switch (credentials.type) {
				case 'password':
					if (credentials.password) m.password = credentials.password;
					break;
				case 'token':
					m.token = credentials.token;
					break;
				case 'authServer': {
					const r = await fetch(credentials.authServer, {
						method: 'POST',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify({
							location: credentials.location,
							username,
							password: credentials.password
						})
					});
					if (!r.ok) {
						throw new Error(`Auth server returned ${r.status} ${r.statusText}`);
					}
					if (r.status === 204) {
						m.password = credentials.password;
						break;
					}
					const ctype = (r.headers.get('Content-Type') ?? '').split(';')[0].trim().toLowerCase();
					if (ctype === 'application/jwt') {
						const token = await r.text();
						if (!token) throw new Error('Empty JWT token from auth server');
						m.token = token;
					} else {
						throw new Error(`Unexpected auth content type: ${ctype}`);
					}
					break;
				}
			}
		}
		if (data) m.data = data;
		this.send(m);
	}

	leave(group: string): void {
		this.send({ type: 'join', kind: 'leave', group });
	}

	request(what: Record<string, string[]>): void {
		this.send({ type: 'request', request: what });
	}

	findByLocalId(localId: string): GaleneStream | null {
		if (!localId) return null;
		for (const id of Object.keys(this.up)) {
			const s = this.up[id];
			if (s.localId === localId) return s;
		}
		return null;
	}

	getRTCConfiguration(): RTCConfiguration | undefined {
		if (this.onpeerconnection) {
			const conf = this.onpeerconnection.call(this);
			if (conf !== null) return conf;
		}
		return this.rtcConfiguration ?? undefined;
	}

	newUpStream(localId?: string): GaleneStream {
		const id = newRandomId();
		if (typeof RTCPeerConnection === 'undefined') {
			throw new Error("This browser doesn't support WebRTC");
		}
		const pc = new RTCPeerConnection(this.getRTCConfiguration());

		let oldId: string | null = null;
		if (localId) {
			const old = this.findByLocalId(localId);
			oldId = old ? old.id : null;
			if (old) old.close(true);
		}

		const c = new GaleneStream(this, id, localId || newLocalId(), pc, true);
		if (oldId) c.replace = oldId;
		this.up[id] = c;

		pc.onnegotiationneeded = async () => {
			try {
				await c.negotiate();
			} catch (err) {
				c.onerror?.call(c, err);
			}
		};
		pc.onicecandidate = (e) => {
			if (!e.candidate) return;
			c.gotLocalIce(e.candidate);
		};
		pc.oniceconnectionstatechange = () => {
			c.onstatus?.call(c, pc.iceConnectionState);
			if (pc.iceConnectionState === 'failed') {
				c.restartIce();
			}
		};

		return c;
	}

	chat(kind: string, dest: string, value: string): void {
		this.send({
			type: 'chat',
			source: this.id,
			dest,
			username: this.username ?? '',
			kind,
			value
		});
	}

	userMessage(kind: string, dest: string, value?: unknown, noecho?: boolean): void {
		this.send({
			type: 'usermessage',
			source: this.id,
			dest,
			username: this.username ?? '',
			kind,
			value,
			noecho
		});
	}

	getTransferredFile(userid: string, fileid: string): TransferredFile | undefined {
		return this.transferredFiles[`${userid}-${fileid}`];
	}

	sendFile(userid: string, file: File): TransferredFile | null {
		const fileid = newRandomId();
		const user = this.users[userid];
		if (!user) throw new Error('Target peer not found');

		const f = new TransferredFile(
			this,
			userid,
			fileid,
			true,
			user.username,
			file.name,
			file.type || 'application/octet-stream',
			file.size
		);
		f.file = file;

		try {
			if (this.onfiletransfer) {
				this.onfiletransfer.call(this, f);
			} else {
				throw new Error('File transfer handler not registered');
			}
		} catch (e) {
			f.cancel(e instanceof Error ? e : String(e));
			return null;
		}

		if (f.state === 'closed') return null;

		this.transferredFiles[f.fullid()] = f;
		this.userMessage('filetransfer', userid, {
			type: 'invite',
			version: ['1'],
			id: fileid,
			name: f.name,
			size: f.size,
			mimetype: f.mimetype
		});
		f.event('inviting');
		return f;
	}

	private async gotOffer(
		id: string,
		label: string | null,
		source: string,
		username: string,
		sdp: string,
		replace: string | null
	): Promise<void> {
		if (this.up[id]) {
			this.send({ type: 'abort', id });
			return;
		}

		let oldLocalId: string | null = null;
		if (replace) {
			const old = this.down[replace];
			if (old) {
				oldLocalId = old.localId;
				old.close(true);
			}
		}

		let c = this.down[id];
		if (!c) {
			let pc: RTCPeerConnection;
			try {
				pc = new RTCPeerConnection(this.getRTCConfiguration());
			} catch {
				this.send({ type: 'abort', id });
				return;
			}
			c = new GaleneStream(this, id, oldLocalId || newLocalId(), pc, false);
			c.label = label;
			this.down[id] = c;

			c.pc.onicecandidate = (e) => {
				if (!e.candidate) return;
				c.gotLocalIce(e.candidate);
			};

			pc.oniceconnectionstatechange = () => {
				c.onstatus?.call(c, pc.iceConnectionState);
				if (pc.iceConnectionState === 'failed') {
					try {
						this.send({ type: 'renegotiate', id });
					} catch {
						// ignore
					}
				}
			};

			c.pc.ontrack = (e) => {
				if (e.streams.length < 1) return;
				c.stream = e.streams[0];
				const changed = recomputeUserStreams(this, source);
				c.ondowntrack?.call(c, e.track, e.transceiver, e.streams[0]);
				if (changed) this.onuser?.call(this, source, 'change');
			};
		}

		c.source = source;
		c.username = username;
		this.ondownstream?.call(this, c);

		try {
			await c.pc.setRemoteDescription({ type: 'offer', sdp });
			await c.flushRemoteIceCandidates();

			const answer = await c.pc.createAnswer();
			await c.pc.setLocalDescription(answer);
			this.send({
				type: 'answer',
				id,
				sdp: c.pc.localDescription?.sdp ?? answer.sdp
			});
		} catch (e) {
			try {
				c.onerror?.call(c, e);
			} finally {
				c.abort();
			}
			return;
		}

		c.localDescriptionSent = true;
		c.flushLocalIceCandidates();
		c.onnegotiationcompleted?.call(c);
	}

	private async gotAnswer(id: string, sdp: string): Promise<void> {
		const c = this.up[id];
		if (!c) return;
		try {
			await c.pc.setRemoteDescription({ type: 'answer', sdp });
		} catch (e) {
			try {
				c.onerror?.call(c, e);
			} finally {
				c.close();
			}
			return;
		}
		await c.flushRemoteIceCandidates();
		c.onnegotiationcompleted?.call(c);
	}

	private gotRenegotiate(id: string): void {
		const c = this.up[id];
		if (c) c.restartIce();
	}

	private gotClose(id: string): void {
		const c = this.down[id];
		if (c) c.close();
	}

	private gotAbort(id: string): void {
		const c = this.up[id];
		if (c) c.close();
	}

	private async gotRemoteIce(
		id: string,
		candidate: RTCIceCandidateInit | RTCIceCandidate
	): Promise<void> {
		const c = this.up[id] ?? this.down[id];
		if (!c) return;
		if (c.pc.remoteDescription) {
			await c.pc.addIceCandidate(candidate).catch(() => {});
		} else {
			c.remoteIceCandidates.push(candidate);
		}
	}

	private fileTransfer(id: string, username: string, message: Record<string, unknown>): void {
		const fileId = String(message.id ?? '');
		switch (message.type) {
			case 'invite': {
				const versionList = message.version;
				if (!Array.isArray(versionList) || !versionList.includes('1')) {
					sendFileCancel(this, id, fileId, 'Unsupported file transfer protocol version');
					return;
				}
				const f = new TransferredFile(
					this,
					id,
					fileId,
					false,
					username,
					String(message.name ?? 'file'),
					String(message.mimetype ?? 'application/octet-stream'),
					Number(message.size ?? 0)
				);
				f.version = '1';
				f.state = 'inviting';

				const fid = f.fullid();
				if (fid in this.transferredFiles) {
					sendFileCancel(this, id, fileId, 'Duplicate file transfer id');
					return;
				}
				try {
					if (this.onfiletransfer) {
						this.onfiletransfer.call(this, f);
					} else {
						f.cancel('File transfer not supported');
						return;
					}
				} catch (e) {
					f.cancel(e instanceof Error ? e : String(e));
					return;
				}
				this.transferredFiles[fid] = f;
				break;
			}
			case 'offer': {
				const f = this.getTransferredFile(id, fileId);
				if (!f) return;
				if (!Array.isArray(message.version) || !message.version.includes('1')) {
					f.cancel('Unsupported file transfer protocol version');
					return;
				}
				f.version = '1';
				void f.answer(String(message.sdp ?? '')).catch((e) => f.cancel(e));
				break;
			}
			case 'answer': {
				const f = this.getTransferredFile(id, fileId);
				if (!f) return;
				void f.receiveFile(String(message.sdp ?? '')).catch((e) => f.cancel(e));
				break;
			}
			case 'ice': {
				const f = this.getTransferredFile(id, fileId);
				if (!f || !f.pc) return;
				const cand = message.candidate as RTCIceCandidateInit | null;
				if (!cand) return;
				if (f.pc.signalingState === 'stable') {
					void f.pc.addIceCandidate(cand).catch(() => {});
				} else {
					f.candidates.push(cand);
				}
				break;
			}
			case 'cancel': {
				const f = this.getTransferredFile(id, fileId);
				if (!f) return;
				f.event('cancelled', typeof message.message === 'string' ? message.message : undefined);
				f.close();
				break;
			}
			default:
				break;
		}
	}
}

export class GaleneStream {
	sc: ServerConnection | null;
	readonly id: string;
	readonly localId: string;
	readonly up: boolean;
	source: string | null = null;
	username: string | null = null;
	pc: RTCPeerConnection;
	stream: MediaStream | null = null;
	label: string | null = null;
	replace: string | null = null;
	localDescriptionSent = false;
	localIceCandidates: RTCIceCandidate[] = [];
	remoteIceCandidates: (RTCIceCandidateInit | RTCIceCandidate)[] = [];
	userdata: Record<string, unknown> = {};

	onclose: ((this: GaleneStream, replace: boolean) => void) | null = null;
	onerror: ((this: GaleneStream, error: unknown) => void) | null = null;
	onnegotiationcompleted: ((this: GaleneStream) => void) | null = null;
	ondowntrack:
		| ((
				this: GaleneStream,
				track: MediaStreamTrack,
				transceiver: RTCRtpTransceiver,
				stream: MediaStream
		  ) => void)
		| null = null;
	onstatus: ((this: GaleneStream, status: string) => void) | null = null;

	constructor(
		sc: ServerConnection,
		id: string,
		localId: string,
		pc: RTCPeerConnection,
		up: boolean
	) {
		this.sc = sc;
		this.id = id;
		this.localId = localId;
		this.pc = pc;
		this.up = up;
	}

	setStream(stream: MediaStream): void {
		if (!this.sc) return;
		this.stream = stream;
		const changed = recomputeUserStreams(this.sc, this.sc.id);
		if (changed) this.sc.onuser?.call(this.sc, this.sc.id, 'change');
	}

	close(replace = false): void {
		const sc = this.sc;
		if (!sc) return;

		this.pc.close();

		if (this.up && !replace && this.localDescriptionSent) {
			try {
				sc.send({ type: 'close', id: this.id });
			} catch {
				// ignore if socket closed
			}
		}

		let userid: string | null;
		if (this.up) {
			userid = sc.id;
			if (sc.up[this.id] === this) delete sc.up[this.id];
		} else {
			userid = this.source;
			if (sc.down[this.id] === this) delete sc.down[this.id];
		}

		if (userid) {
			const changed = recomputeUserStreams(sc, userid);
			if (changed) sc.onuser?.call(sc, userid, 'change');
		}

		this.onclose?.call(this, replace);
		this.sc = null;
	}

	abort(): void {
		if (!this.sc || this.up) return;
		try {
			this.sc.send({ type: 'abort', id: this.id });
		} catch {
			// ignore
		}
	}

	gotLocalIce(candidate: RTCIceCandidate): void {
		if (!this.sc) return;
		if (this.localDescriptionSent) {
			try {
				this.sc.send({ type: 'ice', id: this.id, candidate });
			} catch {
				// ignore
			}
		} else {
			this.localIceCandidates.push(candidate);
		}
	}

	flushLocalIceCandidates(): void {
		if (!this.sc) return;
		const candidates = this.localIceCandidates;
		this.localIceCandidates = [];
		for (const candidate of candidates) {
			try {
				this.sc.send({ type: 'ice', id: this.id, candidate });
			} catch {
				// ignore
			}
		}
	}

	async flushRemoteIceCandidates(): Promise<void> {
		const candidates = this.remoteIceCandidates;
		this.remoteIceCandidates = [];
		await Promise.all(candidates.map((c) => this.pc.addIceCandidate(c).catch(() => {})));
	}

	async negotiate(restartIce = false): Promise<void> {
		if (!this.sc || !this.up) return;
		const offer = await this.pc.createOffer(restartIce ? { iceRestart: true } : undefined);
		await this.pc.setLocalDescription(offer);

		this.sc.send({
			type: 'offer',
			source: this.sc.id,
			username: this.sc.username ?? '',
			kind: this.localDescriptionSent ? 'renegotiate' : '',
			id: this.id,
			replace: this.replace,
			label: this.label,
			sdp: this.pc.localDescription?.sdp ?? offer.sdp
		});
		this.localDescriptionSent = true;
		this.replace = null;
		this.flushLocalIceCandidates();
	}

	restartIce(): void {
		if (!this.sc) return;
		if (!this.up) {
			try {
				this.sc.send({ type: 'renegotiate', id: this.id });
			} catch {
				// ignore
			}
			return;
		}
		if (typeof this.pc.restartIce === 'function') {
			try {
				this.pc.restartIce();
				return;
			} catch {
				// fallback below
			}
		}
		void this.negotiate(true);
	}

	request(what: string[] | null): void {
		if (!this.sc) return;
		this.sc.send({
			type: 'requestStream',
			id: this.id,
			request: what ?? undefined
		});
	}
}

function recomputeUserStreams(sc: ServerConnection, userId: string): boolean {
	const user = sc.users[userId];
	if (!user) return false;

	const streams = userId === sc.id ? sc.up : sc.down;
	const prev = JSON.stringify(user.streams);
	user.streams = {};
	for (const sid of Object.keys(streams)) {
		const c = streams[sid];
		if (!c.stream) continue;
		if (!c.up && c.source !== userId) continue;
		const lbl = c.label ?? '';
		if (!user.streams[lbl]) user.streams[lbl] = {};
		for (const t of c.stream.getTracks()) {
			user.streams[lbl][t.kind] = true;
		}
	}
	return prev !== JSON.stringify(user.streams);
}

function sendFileCancel(
	sc: ServerConnection,
	userid: string,
	id: string,
	message?: string | Error
): void {
	const m: Record<string, unknown> = { type: 'cancel', id };
	if (message) m.message = message instanceof Error ? message.message : String(message);
	try {
		sc.userMessage('filetransfer', userid, m);
	} catch {
		// ignore
	}
}

export class TransferredFile {
	sc: ServerConnection;
	userid: string;
	id: string;
	version: string | null = null;
	up: boolean;
	state: TransferredFileState = '';
	username: string;
	name: string;
	mimetype: string;
	size: number;
	file: File | null = null;
	pc: RTCPeerConnection | null = null;
	dc: RTCDataChannel | null = null;
	candidates: RTCIceCandidateInit[] = [];
	data: (Blob | ArrayBuffer)[] = [];
	datalen = 0;

	onevent:
		((this: TransferredFile, state: TransferredFileState, data?: Blob | string) => void) | null =
		null;

	constructor(
		sc: ServerConnection,
		userid: string,
		id: string,
		up: boolean,
		username: string,
		name: string,
		mimetype: string,
		size: number
	) {
		this.sc = sc;
		this.userid = userid;
		this.id = id;
		this.up = up;
		this.username = username;
		this.name = name;
		this.mimetype = mimetype;
		this.size = size;
	}

	fullid(): string {
		return `${this.userid}-${this.id}`;
	}

	event(state: TransferredFileState, data?: Blob | string): void {
		this.state = state;
		this.onevent?.call(this, state, data);
	}

	close(): void {
		if (this.state === 'closed') return;
		if (this.dc) {
			this.dc.onclose = null;
			this.dc.onerror = null;
			this.dc.onmessage = null;
		}
		if (this.pc) {
			this.pc.onicecandidate = null;
			this.pc.close();
		}
		this.dc = null;
		this.pc = null;
		this.data = [];
		this.datalen = 0;
		delete this.sc.transferredFiles[this.fullid()];
		this.event('closed');
	}

	cancel(message?: string | Error): void {
		if (this.state === 'closed') return;
		if (this.state !== '' && this.state !== 'done' && this.state !== 'cancelled') {
			sendFileCancel(this.sc, this.userid, this.id, message);
		}
		if (this.state !== 'done' && this.state !== 'cancelled') {
			this.event('cancelled', message instanceof Error ? message.message : message);
		}
		this.close();
	}

	fail(message?: string | Error): void {
		if (this.state === 'done' || this.state === 'cancelled' || this.state === 'closed') return;
		this.event('cancelled', message instanceof Error ? message.message : message);
		this.close();
	}

	async receive(): Promise<void> {
		if (this.up || this.pc) return;
		const pc = new RTCPeerConnection(this.sc.getRTCConfiguration());
		this.pc = pc;
		this.event('connecting');
		this.candidates = [];

		pc.onsignalingstatechange = () => {
			if (pc.signalingState === 'stable') {
				for (const cand of this.candidates) {
					void pc.addIceCandidate(cand).catch(() => {});
				}
				this.candidates = [];
			}
		};
		pc.onicecandidate = (e) => {
			this.sc.userMessage('filetransfer', this.userid, {
				type: 'ice',
				id: this.id,
				candidate: e.candidate
			});
		};

		const dc = pc.createDataChannel('file');
		this.dc = dc;
		this.data = [];
		this.datalen = 0;
		dc.onclose = () => this.cancel('Peer closed connection');
		dc.onerror = () => this.cancel('DataChannel error');
		dc.onmessage = (e) => {
			void this.receiveData(e.data as Blob | ArrayBuffer).catch((err) => this.cancel(err));
		};

		const offer = await pc.createOffer();
		await pc.setLocalDescription(offer);
		this.sc.userMessage('filetransfer', this.userid, {
			type: 'offer',
			version: [this.version ?? '1'],
			id: this.id,
			sdp: pc.localDescription?.sdp ?? offer.sdp
		});
	}

	async answer(sdp: string): Promise<void> {
		if (!this.up || this.pc) return;
		const pc = new RTCPeerConnection(this.sc.getRTCConfiguration());
		this.pc = pc;
		this.event('connecting');
		this.candidates = [];

		pc.onicecandidate = (e) => {
			this.sc.userMessage('filetransfer', this.userid, {
				type: 'ice',
				id: this.id,
				candidate: e.candidate
			});
		};
		pc.onsignalingstatechange = () => {
			if (pc.signalingState === 'stable') {
				for (const cand of this.candidates) {
					void pc.addIceCandidate(cand).catch(() => {});
				}
				this.candidates = [];
			}
		};
		pc.ondatachannel = (e) => {
			if (this.dc) {
				this.cancel('Duplicate datachannel');
				return;
			}
			const dc = e.channel;
			this.dc = dc;
			dc.onclose = () => this.cancel('Peer closed connection');
			dc.onerror = () => this.cancel('DataChannel error');
			dc.onmessage = (ev) => {
				if (ev.data === 'done' && this.datalen === this.size) {
					this.event('done');
					dc.onclose = null;
					dc.onerror = null;
					this.close();
				} else {
					this.cancel('Unexpected data from receiver');
				}
			};
			void this.sendChunks().catch((err) => this.cancel(err));
		};

		await pc.setRemoteDescription({ type: 'offer', sdp });
		const answer = await pc.createAnswer();
		await pc.setLocalDescription(answer);
		this.sc.userMessage('filetransfer', this.userid, {
			type: 'answer',
			id: this.id,
			sdp: pc.localDescription?.sdp ?? answer.sdp
		});
		this.event('connected');
	}

	async receiveFile(sdp: string): Promise<void> {
		if (this.up || !this.pc) return;
		await this.pc.setRemoteDescription({ type: 'answer', sdp });
		this.event('connected');
	}

	private async sendChunks(): Promise<void> {
		if (!this.up || !this.file || !this.dc) return;
		const reader = this.file.stream().getReader();
		this.dc.bufferedAmountLowThreshold = 65536;

		const write = async (chunk: Uint8Array) => {
			while (this.dc && this.dc.bufferedAmount > this.dc.bufferedAmountLowThreshold) {
				await new Promise<void>((resolve, reject) => {
					const dc = this.dc;
					if (!dc) {
						reject(new Error('File transfer closed'));
						return;
					}
					dc.onbufferedamountlow = () => {
						dc.onbufferedamountlow = null;
						resolve();
					};
				});
			}
			if (!this.dc) throw new Error('File transfer closed');
			this.dc.send(chunk as unknown as ArrayBuffer);
			this.datalen += chunk.length;
			this.event('connected');
		};

		while (true) {
			const res = await reader.read();
			if (res.done) break;
			const data = res.value;
			if (data.length <= 16384) {
				await write(data);
			} else {
				for (let i = 0; i < data.length; i += 16384) {
					await write(data.subarray(i, Math.min(i + 16384, data.length)));
				}
			}
		}
	}

	private async receiveData(chunk: Blob | ArrayBuffer): Promise<void> {
		if (this.up || !this.dc) return;
		if (chunk instanceof Blob) {
			this.datalen += chunk.size;
		} else if (chunk instanceof ArrayBuffer) {
			this.datalen += chunk.byteLength;
		} else {
			throw new Error('Unexpected chunk type');
		}
		this.data.push(chunk);

		if (this.datalen < this.size) {
			this.event('connected');
			return;
		}

		this.dc.onmessage = null;
		if (this.datalen !== this.size) {
			this.cancel('Extra data at end of file');
			return;
		}

		const blob = new Blob(this.data, { type: this.mimetype });
		this.data = [];
		this.datalen = 0;
		this.event('done', blob);

		await new Promise<void>((resolve) => {
			const dc = this.dc;
			if (!dc) {
				resolve();
				return;
			}
			const timer = setTimeout(resolve, 2000);
			dc.onclose = () => {
				clearTimeout(timer);
				resolve();
			};
			dc.onerror = () => {
				clearTimeout(timer);
				resolve();
			};
			try {
				dc.send('done');
			} catch {
				clearTimeout(timer);
				resolve();
			}
		});
		this.close();
	}
}
