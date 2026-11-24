import {
	GaleneClient,
	probeGroupStatus,
	type ChatEntry,
	type GroupStatus,
	type RemoteStreamEntry
} from '@/galene/client';
import { downloadBlob, type FileTransferItem } from '@/galene/file-transfer';
import type { GaleneUser, TransferredFile } from '@/galene/protocol';
import type { PointerSignal, ReactionSignal } from '@/galene/signals';
import {
	acquireLocalMedia,
	isLikelyMobile,
	isSpeakerSelectionSupported,
	listMediaDevices,
	stopMediaStream,
	type MediaDeviceLists
} from '@/media/devices';
import { createAudioLevelMonitor, type LevelMonitor } from '@/media/audio-mix';
import { acquireScreenShare, isScreenShareSupported } from '@/media/screen-share';
import { captureVideoSnapshot, saveOrShareSnapshot, type SnapshotResult } from '@/media/snapshot';
import { isDocumentPipSupported, registerAutoPip, type DocPipHandle } from '@/capabilities/doc-pip';
import { bindCallMediaSession, syncMediaSessionState } from '@/capabilities/media-session';
import { runViewTransition } from '@/capabilities/transitions';
import { WakeLockManager } from '@/capabilities/wake-lock';
import {
	loadPrefs,
	parseInitialGroupFromUrl,
	savePrefs,
	syncGroupUrl,
	type PipCorner
} from './prefs';

export type CallPhase = 'lobby' | 'waiting' | 'active' | 'sharing';

export interface PointerRipple {
	id: string;
	x: number;
	y: number;
	streamId: string;
	senderName: string;
	isSelf: boolean;
	createdAt: number;
}

export interface FloatingReaction {
	id: string;
	emoji: string;
	senderName: string;
	slot: number;
}

export interface NoticePill {
	id: string;
	text: string;
	tone: 'info' | 'success' | 'warn' | 'error';
}

export class CallStore {
	// Room & credentials
	group = $state('');
	username = $state('');
	password = $state('');
	rememberPassword = $state(true);
	roomStatus = $state<GroupStatus | null>(null);
	probingRoom = $state(false);
	probeError = $state<string | null>(null);
	joining = $state(false);
	joined = $state(false);
	connectionState = $state<'disconnected' | 'connecting' | 'connected'>('disconnected');

	// Local media
	localStream = $state<MediaStream | null>(null);
	micOn = $state(true);
	camOn = $state(true);
	facingMode = $state<'user' | 'environment'>('user');
	localSpeaking = $state(false);
	localAudioLevel = $state(0);
	mediaError = $state<string | null>(null);

	// Devices
	devices = $state<MediaDeviceLists>({ cameras: [], microphones: [], speakers: [] });
	selectedCameraId = $state('');
	selectedMicId = $state('');
	selectedSpeakerId = $state('');
	readonly canSelectSpeaker = isSpeakerSelectionSupported();
	readonly canShareScreen = isScreenShareSupported();
	readonly canDocPip = isDocumentPipSupported();
	readonly isMobile = isLikelyMobile();

	// Screen share
	localScreenStream = $state<MediaStream | null>(null);
	screenController = $state<CaptureControllerEx | null>(null);

	// Remote participants & streams
	users = $state<Record<string, GaleneUser>>({});
	selfId = $state('');
	remoteStreams = $state<RemoteStreamEntry[]>([]);

	// Layout & UI state
	pipCorner = $state<PipCorner>('tr');
	pipCollapsed = $state(false);
	swappedSelfMain = $state(false);
	pinnedStreamId = $state<string | null>(null);
	remoteObjectFit = $state<'cover' | 'contain'>('cover');
	docPipOpen = $state(false);

	// Minimalist audio mixing
	masterMuted = $state(false);
	voiceMuted = $state(false);
	voiceVolume = $state(1);
	screenAudioMuted = $state(false);
	screenAudioVolume = $state(0.8);

	// Interactive features
	chatMessages = $state<ChatEntry[]>([]);
	floatingBubbles = $state<ChatEntry[]>([]);
	chatOpen = $state(false);
	unreadCount = $state(0);
	reactions = $state<FloatingReaction[]>([]);
	pointerRipples = $state<PointerRipple[]>([]);
	fileTransfers = $state<FileTransferItem[]>([]);
	latestSnapshot = $state<SnapshotResult | null>(null);
	shutterFlash = $state(false);
	notices = $state<NoticePill[]>([]);

	// Internals
	private client: GaleneClient;
	private wakeLock = new WakeLockManager();
	private localAudioMonitor: LevelMonitor | null = null;
	private unbindMediaSession: (() => void) | null = null;
	private docPipHandle: DocPipHandle | null = null;
	private mainVideoRef: HTMLVideoElement | null = null;
	private probeTimer: ReturnType<typeof setTimeout> | null = null;
	private openPipHandler: (() => Promise<void>) | null = null;

	// Derived state
	readonly peerCount = $derived.by(() => {
		let count = 0;
		for (const uid of Object.keys(this.users)) {
			if (uid !== this.selfId) count++;
		}
		return count;
	});

	readonly primaryPartnerName = $derived.by(() => {
		for (const [uid, u] of Object.entries(this.users)) {
			if (uid !== this.selfId) return u.username || '对方';
		}
		return '对方';
	});

	readonly remoteScreenStreams = $derived(
		this.remoteStreams.filter((s) => s.label === 'screenshare')
	);

	readonly remoteCameraStreams = $derived(
		this.remoteStreams.filter((s) => s.label !== 'screenshare')
	);

	readonly activeScreen = $derived.by<{
		id: string;
		stream: MediaStream;
		isLocal: boolean;
		username: string;
		hasAudio: boolean;
	} | null>(() => {
		if (this.pinnedStreamId) {
			const pinnedScreen = this.remoteScreenStreams.find((s) => s.id === this.pinnedStreamId);
			if (pinnedScreen) {
				return {
					id: pinnedScreen.id,
					stream: pinnedScreen.stream,
					isLocal: false,
					username: pinnedScreen.username,
					hasAudio: pinnedScreen.hasAudio
				};
			}
		}
		const firstRemote = this.remoteScreenStreams[0];
		if (firstRemote) {
			return {
				id: firstRemote.id,
				stream: firstRemote.stream,
				isLocal: false,
				username: firstRemote.username,
				hasAudio: firstRemote.hasAudio
			};
		}
		if (this.localScreenStream) {
			return {
				id: 'local-screen',
				stream: this.localScreenStream,
				isLocal: true,
				username: this.username || '我',
				hasAudio: this.localScreenStream.getAudioTracks().length > 0
			};
		}
		return null;
	});

	readonly primaryPartnerStream = $derived.by<RemoteStreamEntry | null>(() => {
		if (this.pinnedStreamId) {
			const pinnedCam = this.remoteCameraStreams.find((s) => s.id === this.pinnedStreamId);
			if (pinnedCam) return pinnedCam;
		}
		return this.remoteCameraStreams[0] ?? null;
	});

	/** Elastic multi-device / 3rd-person fallback streams */
	readonly extraStreams = $derived.by<RemoteStreamEntry[]>(() => {
		const primaryCamId = this.primaryPartnerStream?.id;
		const activeScreenId = this.activeScreen?.isLocal ? null : this.activeScreen?.id;
		return this.remoteStreams.filter((s) => s.id !== primaryCamId && s.id !== activeScreenId);
	});

	readonly phase = $derived.by<CallPhase>(() => {
		if (!this.joined) return 'lobby';
		if (this.activeScreen) return 'sharing';
		if (this.peerCount === 0 && this.remoteStreams.length === 0) return 'waiting';
		return 'active';
	});

	readonly effectiveVoiceVolume = $derived(
		this.masterMuted || this.voiceMuted ? 0 : this.voiceVolume
	);

	readonly effectiveScreenVolume = $derived(
		this.masterMuted || this.screenAudioMuted ? 0 : this.screenAudioVolume
	);

	readonly canFlipCamera = $derived(this.isMobile || this.devices.cameras.length > 1);

	constructor() {
		const prefs = loadPrefs();
		const urlGroup = parseInitialGroupFromUrl();
		this.group = urlGroup || prefs.lastGroup;
		this.username = prefs.username;
		this.password = prefs.rememberPassword ? prefs.password : '';
		this.rememberPassword = prefs.rememberPassword;
		this.pipCorner = prefs.pipCorner;
		this.selectedCameraId = prefs.cameraId;
		this.selectedMicId = prefs.microphoneId;
		this.selectedSpeakerId = prefs.speakerId;

		this.client = new GaleneClient({
			onConnectionState: (state) => {
				this.connectionState = state;
				if (state === 'disconnected' && this.joined) {
					this.joined = false;
					this.joining = false;
					this.pushNotice('通话连接已断开', 'warn');
					this.teardownCallCapabilities();
				}
			},
			onJoined: (kind, group, error, message) => {
				this.joining = false;
				if (kind === 'join') {
					this.joined = true;
					syncGroupUrl(group);
					this.persistPrefs();
					this.publishCurrentLocalMedia();
					this.setupCallCapabilities();
				} else if (kind === 'fail') {
					this.joined = false;
					const reason = message || error || '加入房间失败，请检查房间名或密码';
					this.pushNotice(reason, 'error');
					this.client.disconnect();
				} else if (kind === 'leave') {
					this.joined = false;
					this.teardownCallCapabilities();
				}
			},
			onUsersChanged: (users, selfId) => {
				const prevPeers = this.peerCount;
				this.users = users;
				this.selfId = selfId;
				const nextPeers = this.peerCount;
				if (this.joined && prevPeers === 0 && nextPeers > 0) {
					this.pushNotice(`${this.primaryPartnerName} 加入了通话`, 'success');
				} else if (this.joined && prevPeers > 0 && nextPeers === 0) {
					this.pushNotice('对方已离开房间', 'info');
				}
			},
			onRemoteStreamsChanged: (streams) => {
				runViewTransition(() => {
					this.remoteStreams = streams;
				});
			},
			onChat: (entry) => {
				if (this.chatMessages.some((m) => m.id === entry.id)) return;
				this.chatMessages = [...this.chatMessages.slice(-199), entry];
				if (!entry.history) {
					if (!this.chatOpen && !entry.isSelf) {
						this.unreadCount++;
					}
					this.floatingBubbles = [...this.floatingBubbles.slice(-3), entry];
					setTimeout(() => {
						this.floatingBubbles = this.floatingBubbles.filter((b) => b.id !== entry.id);
					}, 6000);
				}
			},
			onPointer: (signal, senderName, isSelf) => {
				this.addPointerRipple(signal, senderName, isSelf);
			},
			onReaction: (signal, senderName) => {
				this.addReaction(signal, senderName);
			},
			onFileTransfer: (file) => {
				this.trackFileTransfer(file);
			},
			onError: (msg) => {
				this.joining = false;
				this.pushNotice(msg, 'error');
			}
		});
	}

	async initLobby(): Promise<void> {
		await this.refreshLocalPreview();
		await this.refreshDevices();
		if (typeof navigator !== 'undefined' && navigator.mediaDevices) {
			navigator.mediaDevices.addEventListener('devicechange', this.handleDeviceChange);
		}
		if (this.group) {
			void this.probeRoom(this.group);
		}
	}

	destroy(): void {
		if (typeof navigator !== 'undefined' && navigator.mediaDevices) {
			navigator.mediaDevices.removeEventListener('devicechange', this.handleDeviceChange);
		}
		this.leaveRoom();
		this.localAudioMonitor?.stop();
		stopMediaStream(this.localStream);
		this.localStream = null;
	}

	private handleDeviceChange = () => {
		void this.refreshDevices();
	};

	async refreshDevices(): Promise<void> {
		try {
			this.devices = await listMediaDevices();
		} catch {
			// ignore enumeration failures before permission
		}
	}

	scheduleProbeRoom(groupName: string): void {
		this.group = groupName;
		if (this.probeTimer) clearTimeout(this.probeTimer);
		const trimmed = groupName.trim();
		if (!trimmed) {
			this.roomStatus = null;
			this.probeError = null;
			return;
		}
		this.probeTimer = setTimeout(() => {
			void this.probeRoom(trimmed);
		}, 350);
	}

	async probeRoom(groupName: string): Promise<GroupStatus | null> {
		const trimmed = groupName.trim();
		if (!trimmed) return null;
		this.probingRoom = true;
		this.probeError = null;
		try {
			const status = await probeGroupStatus(trimmed);
			if (this.group.trim() === trimmed) {
				this.roomStatus = status;
				if (!status.exists) {
					this.probeError = `房间「${trimmed}」不存在`;
				}
			}
			return status;
		} catch (err) {
			if (this.group.trim() === trimmed) {
				this.roomStatus = null;
				this.probeError = err instanceof Error ? err.message : '无法连接 Galène 服务器';
			}
			return null;
		} finally {
			this.probingRoom = false;
		}
	}

	async refreshLocalPreview(): Promise<void> {
		this.mediaError = null;
		this.localAudioMonitor?.stop();
		this.localAudioMonitor = null;
		stopMediaStream(this.localStream);

		if (!this.camOn && !this.micOn) {
			this.localStream = null;
			if (this.joined) this.publishCurrentLocalMedia();
			return;
		}

		try {
			const stream = await acquireLocalMedia({
				video: this.camOn,
				audio: this.micOn,
				cameraId: this.isMobile ? undefined : this.selectedCameraId || undefined,
				microphoneId: this.selectedMicId || undefined,
				facingMode: this.isMobile ? this.facingMode : undefined
			});
			this.localStream = stream;
			if (stream) {
				this.localAudioMonitor = createAudioLevelMonitor(stream, (level, speaking) => {
					this.localAudioLevel = level;
					this.localSpeaking = speaking;
				});
			}
			await this.refreshDevices();
			if (this.joined) {
				this.publishCurrentLocalMedia();
			}
		} catch (err) {
			// Graceful degradation: if camera fails, try audio-only
			if (this.camOn && this.micOn) {
				try {
					const audioOnly = await acquireLocalMedia({
						video: false,
						audio: true,
						microphoneId: this.selectedMicId || undefined
					});
					this.camOn = false;
					this.localStream = audioOnly;
					this.mediaError = '摄像头不可用，已切换为仅语音';
					if (this.joined) this.publishCurrentLocalMedia();
					return;
				} catch {
					// fall through
				}
			}
			this.localStream = null;
			this.mediaError =
				err instanceof Error ? err.message : '无法访问摄像头或麦克风，请检查浏览器权限';
		}
	}

	async joinRoom(): Promise<void> {
		const trimmedGroup = this.group.trim();
		const trimmedUser = this.username.trim() || '访客';
		if (!trimmedGroup) {
			this.pushNotice('请先输入房间名', 'warn');
			return;
		}
		this.username = trimmedUser;
		this.joining = true;

		let status = this.roomStatus;
		if (!status || status.name !== trimmedGroup) {
			status = await this.probeRoom(trimmedGroup);
		}
		if (!status || !status.exists) {
			this.joining = false;
			this.pushNotice(this.probeError || `未找到房间「${trimmedGroup}」`, 'error');
			return;
		}

		await this.client.connectAndJoin({
			group: trimmedGroup,
			username: trimmedUser,
			password: this.password,
			status
		});
	}

	leaveRoom(): void {
		this.stopScreenShare();
		this.teardownCallCapabilities();
		this.client.disconnect();
		this.joined = false;
		this.joining = false;
		this.users = {};
		this.remoteStreams = [];
		this.pinnedStreamId = null;
		this.swappedSelfMain = false;
		this.chatOpen = false;
		this.unreadCount = 0;
		this.chatMessages = [];
		this.floatingBubbles = [];
		this.pointerRipples = [];
	}

	private publishCurrentLocalMedia(): void {
		this.client.publishCameraStream(this.localStream);
		syncMediaSessionState(this.micOn, this.camOn);
	}

	async toggleMic(): Promise<void> {
		const next = !this.micOn;
		this.micOn = next;
		const audioTrack = this.localStream?.getAudioTracks()[0];
		if (audioTrack && audioTrack.readyState === 'live') {
			audioTrack.enabled = next;
			syncMediaSessionState(this.micOn, this.camOn);
		} else {
			await this.refreshLocalPreview();
		}
	}

	async toggleCamera(): Promise<void> {
		const next = !this.camOn;
		this.camOn = next;
		const videoTrack = this.localStream?.getVideoTracks()[0];
		if (next && (!videoTrack || videoTrack.readyState !== 'live')) {
			await this.refreshLocalPreview();
			return;
		}
		if (!next && videoTrack) {
			videoTrack.stop();
			this.localStream?.removeTrack(videoTrack);
			if (this.localStream && this.localStream.getTracks().length === 0) {
				this.localStream = null;
			} else if (this.localStream) {
				this.localStream = new MediaStream(this.localStream.getTracks());
			}
			if (this.joined) this.publishCurrentLocalMedia();
			syncMediaSessionState(this.micOn, this.camOn);
			return;
		}
		await this.refreshLocalPreview();
	}

	async flipCamera(): Promise<void> {
		if (this.isMobile) {
			this.facingMode = this.facingMode === 'user' ? 'environment' : 'user';
			if (!this.camOn) this.camOn = true;
			await this.refreshLocalPreview();
			return;
		}
		const cams = this.devices.cameras;
		if (cams.length < 2) return;
		const idx = cams.findIndex((c) => c.deviceId === this.selectedCameraId);
		const nextCam = cams[(idx + 1) % cams.length];
		await this.selectCamera(nextCam.deviceId);
	}

	async selectCamera(deviceId: string): Promise<void> {
		this.selectedCameraId = deviceId;
		this.persistPrefs();
		if (this.camOn) {
			await this.refreshLocalPreview();
		}
	}

	async selectMicrophone(deviceId: string): Promise<void> {
		this.selectedMicId = deviceId;
		this.persistPrefs();
		if (this.micOn) {
			await this.refreshLocalPreview();
		}
	}

	selectSpeaker(deviceId: string): void {
		this.selectedSpeakerId = deviceId;
		this.persistPrefs();
	}

	async toggleScreenShare(): Promise<void> {
		if (this.localScreenStream) {
			this.stopScreenShare();
			return;
		}
		try {
			const { stream, controller } = await acquireScreenShare();
			const videoTrack = stream.getVideoTracks()[0];
			if (videoTrack) {
				videoTrack.addEventListener(
					'ended',
					() => {
						this.stopScreenShare();
					},
					{ once: true }
				);
			}
			runViewTransition(() => {
				this.localScreenStream = stream;
				this.screenController = controller;
			});
			this.client.publishScreenStream(stream);
			this.pushNotice('已开始共享屏幕', 'info');
		} catch (err) {
			if (err instanceof DOMException && err.name === 'NotAllowedError') {
				return; // User cancelled picker
			}
			this.pushNotice(err instanceof Error ? err.message : '投屏启动失败', 'error');
		}
	}

	stopScreenShare(): void {
		if (!this.localScreenStream) return;
		stopMediaStream(this.localScreenStream);
		runViewTransition(() => {
			this.localScreenStream = null;
			this.screenController = null;
		});
		this.client.publishScreenStream(null);
	}

	// Layout helpers
	setPipCorner(corner: PipCorner): void {
		this.pipCorner = corner;
		this.persistPrefs();
	}

	toggleSwapSelfMain(): void {
		if (this.phase !== 'active') return;
		runViewTransition(() => {
			this.swappedSelfMain = !this.swappedSelfMain;
		});
	}

	pinStream(streamId: string | null): void {
		runViewTransition(() => {
			this.pinnedStreamId = this.pinnedStreamId === streamId ? null : streamId;
		});
	}

	toggleRemoteFit(): void {
		this.remoteObjectFit = this.remoteObjectFit === 'cover' ? 'contain' : 'cover';
	}

	// Interactive features
	sendChat(text: string): void {
		this.client.sendChat(text);
	}

	toggleChat(): void {
		this.chatOpen = !this.chatOpen;
		if (this.chatOpen) this.unreadCount = 0;
	}

	sendReaction(emoji: string): void {
		this.client.sendReaction(emoji);
	}

	sendPointer(x: number, y: number, streamId: string, phase: 'tap' | 'move' = 'tap'): void {
		this.client.sendPointer({ x, y, streamId, phase });
	}

	private addPointerRipple(signal: PointerSignal, senderName: string, isSelf: boolean): void {
		const ripple: PointerRipple = {
			id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
			x: signal.x,
			y: signal.y,
			streamId: signal.streamId,
			senderName,
			isSelf,
			createdAt: performance.now()
		};
		this.pointerRipples = [...this.pointerRipples.slice(-24), ripple];
		setTimeout(() => {
			this.pointerRipples = this.pointerRipples.filter((r) => r.id !== ripple.id);
		}, 1400);
	}

	private addReaction(signal: ReactionSignal, senderName: string): void {
		const item: FloatingReaction = {
			id: signal.id,
			emoji: signal.emoji,
			senderName,
			slot: Math.floor(Math.random() * 5)
		};
		this.reactions = [...this.reactions.slice(-14), item];
		setTimeout(() => {
			this.reactions = this.reactions.filter((r) => r.id !== item.id);
		}, 2400);
	}

	// File transfers
	sendFiles(files: FileList | File[]): void {
		if (this.peerCount === 0) {
			this.pushNotice('等待对方加入后才能发送文件', 'warn');
			return;
		}
		const list = Array.from(files);
		for (const file of list) {
			try {
				this.client.sendFileToPeers(file);
			} catch (err) {
				this.pushNotice(err instanceof Error ? err.message : '发送文件失败', 'error');
			}
		}
	}

	private trackFileTransfer(tf: TransferredFile): void {
		const upsert = (blob?: Blob, error?: string) => {
			const progress =
				tf.size > 0 ? Math.min(1, tf.datalen / tf.size) : tf.state === 'done' ? 1 : 0;
			const item: FileTransferItem = {
				id: tf.fullid(),
				name: tf.name,
				mimeType: tf.mimetype,
				size: tf.size,
				transferred: tf.datalen,
				progress,
				direction: tf.up ? 'up' : 'down',
				peerName: tf.username || '对方',
				state: tf.state,
				blob,
				error,
				handle: tf
			};
			const existing = this.fileTransfers.findIndex((x) => x.id === item.id);
			if (existing >= 0) {
				const prev = this.fileTransfers[existing];
				this.fileTransfers = [
					...this.fileTransfers.slice(0, existing),
					{ ...item, blob: blob ?? prev.blob, error: error ?? prev.error },
					...this.fileTransfers.slice(existing + 1)
				];
			} else {
				this.fileTransfers = [...this.fileTransfers, item];
			}
		};

		tf.onevent = (state, data) => {
			if (state === 'done') {
				const blob = data instanceof Blob ? data : undefined;
				upsert(blob);
				if (!tf.up && blob) {
					this.pushNotice(`已收到文件：${tf.name}`, 'success');
				} else if (tf.up) {
					this.pushNotice(`文件已发送：${tf.name}`, 'success');
				}
			} else if (state === 'cancelled') {
				upsert(undefined, typeof data === 'string' ? data : '已取消');
			} else if (state === 'closed') {
				// Keep completed items visible for download; remove cancelled after short delay
				const current = this.fileTransfers.find((x) => x.id === tf.fullid());
				if (current && current.state === 'cancelled') {
					setTimeout(() => this.dismissTransfer(tf.fullid()), 3500);
				}
			} else {
				upsert();
			}
		};

		upsert();
	}

	acceptTransfer(id: string): void {
		const item = this.fileTransfers.find((t) => t.id === id);
		if (item && !item.handle.up) {
			void item.handle.receive();
		}
	}

	cancelTransfer(id: string): void {
		const item = this.fileTransfers.find((t) => t.id === id);
		item?.handle.cancel('用户取消');
		this.dismissTransfer(id);
	}

	downloadTransfer(id: string): void {
		const item = this.fileTransfers.find((t) => t.id === id);
		if (item?.blob) {
			downloadBlob(item.blob, item.name);
		}
	}

	dismissTransfer(id: string): void {
		this.fileTransfers = this.fileTransfers.filter((t) => t.id !== id);
	}

	// Snapshot capture
	registerMainVideoElement(el: HTMLVideoElement | null): void {
		this.mainVideoRef = el;
	}

	async takeSnapshot(): Promise<void> {
		if (!this.mainVideoRef) {
			this.pushNotice('当前没有可抓拍的画面', 'warn');
			return;
		}
		const label = this.activeScreen ? 'screen' : this.primaryPartnerName;
		const snap = await captureVideoSnapshot(this.mainVideoRef, label);
		if (!snap) {
			this.pushNotice('画面尚未就绪', 'warn');
			return;
		}
		this.shutterFlash = true;
		setTimeout(() => {
			this.shutterFlash = false;
		}, 240);
		this.latestSnapshot = snap;
	}

	async saveLatestSnapshot(): Promise<void> {
		if (!this.latestSnapshot) return;
		const mode = await saveOrShareSnapshot(this.latestSnapshot);
		this.pushNotice(mode === 'shared' ? '已调起系统保存/分享' : '已保存照片到本地', 'success');
	}

	dismissSnapshot(): void {
		this.latestSnapshot = null;
	}

	// Invite link sharing
	async shareInviteLink(): Promise<void> {
		const url = window.location.href;
		if (
			typeof navigator !== 'undefined' &&
			typeof navigator.share === 'function' &&
			this.isMobile
		) {
			try {
				await navigator.share({
					title: `加入 Calene 房间 ${this.group}`,
					url
				});
				return;
			} catch (err) {
				if (err instanceof DOMException && err.name === 'AbortError') return;
			}
		}
		try {
			await navigator.clipboard.writeText(url);
			this.pushNotice('已复制房间链接，发给对方即可加入', 'success');
		} catch {
			this.pushNotice('请直接复制地址栏链接分享给对方', 'info');
		}
	}

	// Document PiP hooks
	registerDocPipOpener(fn: () => Promise<void>): void {
		this.openPipHandler = fn;
	}

	setDocPipHandle(handle: DocPipHandle | null): void {
		this.docPipHandle = handle;
		this.docPipOpen = Boolean(handle);
	}

	async requestDocPip(): Promise<void> {
		if (this.docPipHandle) {
			this.docPipHandle.close();
			this.setDocPipHandle(null);
			return;
		}
		if (this.openPipHandler) {
			await this.openPipHandler();
			return;
		}
		// Fallback to standard video PiP (e.g. Safari)
		if (this.mainVideoRef && 'requestPictureInPicture' in this.mainVideoRef) {
			try {
				if (document.pictureInPictureElement) {
					await document.exitPictureInPicture();
				} else {
					await this.mainVideoRef.requestPictureInPicture();
				}
			} catch {
				this.pushNotice('当前浏览器暂不支持画中画', 'warn');
			}
		}
	}

	// Notices
	pushNotice(text: string, tone: NoticePill['tone'] = 'info'): void {
		const id = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
		this.notices = [...this.notices.slice(-2), { id, text, tone }];
		setTimeout(() => {
			this.notices = this.notices.filter((n) => n.id !== id);
		}, 3600);
	}

	persistPrefs(): void {
		savePrefs({
			lastGroup: this.group.trim(),
			username: this.username.trim(),
			password: this.password,
			rememberPassword: this.rememberPassword,
			pipCorner: this.pipCorner,
			cameraId: this.selectedCameraId,
			microphoneId: this.selectedMicId,
			speakerId: this.selectedSpeakerId
		});
	}

	private setupCallCapabilities(): void {
		void this.wakeLock.enable();
		this.unbindMediaSession = bindCallMediaSession({
			onToggleMic: () => void this.toggleMic(),
			onToggleCamera: () => void this.toggleCamera(),
			onHangUp: () => this.leaveRoom()
		});
		syncMediaSessionState(this.micOn, this.camOn);
		if (this.canDocPip) {
			registerAutoPip(() => {
				if (this.joined && !this.docPipOpen && this.openPipHandler) {
					void this.openPipHandler();
				}
			});
		}
	}

	private teardownCallCapabilities(): void {
		void this.wakeLock.disable();
		this.unbindMediaSession?.();
		this.unbindMediaSession = null;
		registerAutoPip(null);
		if (this.docPipHandle) {
			this.docPipHandle.close();
			this.setDocPipHandle(null);
		}
	}
}
