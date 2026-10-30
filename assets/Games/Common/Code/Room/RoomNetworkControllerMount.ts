import { Button, director, EditBox, isValid, Node } from 'cc';
import {
    RoomReconnectController, type RoomRecoveryEvent,
} from './RoomReconnectController';
import {
    AuthoritativeRoomStore, type AuthoritativeRoomState,
} from '../../../../Common/Code/Runtime/state/AuthoritativeRoomStore';
import { RoomVoiceController } from '../../../../Common/Code/Runtime/Voice/RoomVoiceController';
import { VoiceMediaClient, type VoiceRecorder } from '../../../../Common/Code/Runtime/Voice/VoiceMediaClient';
import type { ProtocolClient } from '../../../../Common/Code/Runtime/network/ProtocolClient';
import { resolveRuntimeEndpoints } from '../../../../Common/Code/Runtime/config/RuntimeEndpoints';
import type { VoiceClientContext } from '../../../../Common/Code/Runtime/Voice/VoiceMediaClient';
import type { CommonRoomChatActions, CommonRoomChatWindowPort } from './CommonRoomChatController';
import type { CommonRoomVoiceCapturePort, CommonRoomVoiceWindowPort } from './CommonRoomVoiceController';
import { CommonRoomHeadRenderer, type CommonRoomHeadPort } from './CommonRoomHeadMount';
import type { RoomReconnectRuntimeContext } from './RoomReconnectController';

export interface CommonRoomFormHost {
    readonly show: (path: string, ...args: readonly unknown[]) => Promise<CommonRoomFormHandle | null>;
    readonly close: (path: string) => void;
    /** Optional pointer-transaction close; Common falls back to close when absent. */
    readonly closeAfterPointer?: (path: string) => void;
}

/** Structural form handle exposed to Common without leaking LegacyForm ownership. */
export interface CommonRoomFormHandle {
    readonly node: Node;
    readonly find: (path: string) => Node | null;
}

export interface CommonRoomRuntimeDependencies {
    (): VoiceRecorder;
    readonly bearer: () => Promise<string>;
    readonly formHost: CommonRoomFormHost;
    readonly apiBaseUrl: string;
    readonly context: () => VoiceClientContext;
}

export interface CommonRoomDefaultSocialMediaPorts {
    readonly formHost: CommonRoomFormHost;
    /** Common-owned CommonHead resource/lifecycle port for settlement adapters. */
    readonly headRenderer: CommonRoomHeadPort;
    readonly chatWindow: CommonRoomChatWindowPort;
    readonly voiceCapture: CommonRoomVoiceCapturePort;
    readonly voiceWindow: CommonRoomVoiceWindowPort;
    readonly playVoice: (assetId: number) => Promise<void>;
    readonly destroy: () => void;
}

interface LobbyRoomState extends AuthoritativeRoomState { readonly payload?: unknown }
interface RoomMountContext {
    readonly roomId: string;
    readonly seatId: number;
    readonly playVersion: string;
    readonly stateVersion: number;
    readonly runtime: RoomReconnectRuntimeContext | null;
}
interface RoomMountPayload extends Partial<Omit<RoomMountContext, 'runtime'>>, Partial<RoomReconnectRuntimeContext> {
    room?: unknown;
    ticket?: unknown;
    snapshotMetadata?: unknown;
    reconnectToken?: string;
    eventSeq?: number;
}

/** Production ownership boundary for common room network controllers entered from the lobby scene. */
export class RoomNetworkControllerMount {
    private static readonly installed = new WeakMap<Node, RoomNetworkControllerMount>();
    private reconnect: RoomReconnectController<LobbyRoomState> | null = null;
    private voice: RoomVoiceController | null = null;
    private readonly store = new AuthoritativeRoomStore<LobbyRoomState>();
    private readonly disposers: Array<() => void> = [];
    private readonly commonSessions = new Set<() => void>();
    private generation = 0;

    public constructor(
        private readonly lobby: Node,
        private readonly protocol: ProtocolClient,
        private readonly accessToken: () => Promise<string>,
        private readonly recorder: CommonRoomRuntimeDependencies,
    ) {}

    public static createCommonRoomDefaultPorts(host: Node,
        sceneDependencies?: CommonRoomRuntimeDependencies): CommonRoomDefaultSocialMediaPorts {
        if (sceneDependencies) return this.buildDefaultSocialMediaPorts(host, sceneDependencies);
        const owner = this.installed.get(host);
        if (!owner) throw new Error('COMMON_ROOM_DEFAULT_DEPENDENCIES_REQUIRED');
        return this.buildDefaultSocialMediaPorts(host, owner.recorder, owner.commonSessions);
    }

    public install(): void {
        if (RoomNetworkControllerMount.installed.has(this.lobby)) {
            throw new Error('COMMON_ROOM_DEFAULT_FACTORY_DUPLICATE');
        }
        RoomNetworkControllerMount.installed.set(this.lobby, this);
        this.on('common-pdk-room-ready', value => this.mount(value));
        this.on('aoo-room-network-mount', value => this.mount(value));
        this.disposers.push(this.protocol.on('common.room.auto_dissolved', value => {
            const payload = this.record(value);
            this.generation += 1;this.reconnect = null;this.store.clear();
            this.lobby.emit('aoo-room-auto-dissolved', { reasonCode: String(payload.reasonCode ?? 'WAITING_ROOM_EXPIRED'), message: String(payload.message ?? '房间超过300秒未开始，已自动解散') });
        }));
        this.disposers.push(this.store.subscribe(state => this.lobby.emit('aoo-room-authoritative-state', state)));
    }

    public destroy(): void {
        this.generation += 1;
        RoomNetworkControllerMount.installed.delete(this.lobby);
        for (const destroy of [...this.commonSessions]) destroy();
        this.commonSessions.clear();
        this.voice?.destroy();
        this.voice = null;
        this.reconnect = null;
        for (const dispose of this.disposers.splice(0)) dispose();
        this.store.clear();
    }

    private static buildDefaultSocialMediaPorts(host: Node, dependencies: CommonRoomRuntimeDependencies,
        sessions?: Set<() => void>): CommonRoomDefaultSocialMediaPorts {
        const apiBaseUrl = String(dependencies.apiBaseUrl ?? '').trim();
        if (!apiBaseUrl) throw new Error('COMMON_ROOM_MEDIA_ENDPOINT_REQUIRED');
        try { new URL(apiBaseUrl); } catch { throw new Error('COMMON_ROOM_MEDIA_ENDPOINT_INVALID'); }
        if (typeof dependencies.bearer !== 'function' || typeof dependencies.context !== 'function'
            || typeof dependencies.formHost?.show !== 'function' || typeof dependencies.formHost.close !== 'function') {
            throw new Error('COMMON_ROOM_DEFAULT_DEPENDENCIES_REQUIRED');
        }
        // Entering a room must not instantiate optional chat/voice media through
        // the lobby's already-disposed form host. Resolve it on the first media
        // action, where the capability has a live presentation owner.
        let media: VoiceMediaClient | null = null;
        const resolveMedia = (): VoiceMediaClient => {
            if (media) return media;
            const recorder = dependencies();
            if (!recorder || typeof recorder.record !== 'function' || typeof recorder.play !== 'function'
                || typeof recorder.cancel !== 'function') throw new Error('COMMON_ROOM_VOICE_RECORDER_REQUIRED');
            media = new VoiceMediaClient(apiBaseUrl, dependencies.bearer, dependencies.context, recorder);
            return media;
        };
        const listeners: Array<() => void> = [];
        let chatActions: CommonRoomChatActions | null = null;
        let voiceWindowPending: Promise<void> | null = null;
        let destroyed = false;
        const headRenderer = new CommonRoomHeadRenderer();
        const trace = (stage: string, capability: string, error?: unknown): void => {
            console.info('[CommonRoomDefault]', Object.freeze({ stage, capability,
                errorCode: error instanceof Error ? error.message : error === undefined ? undefined : 'COMMON_ROOM_DEFAULT_FAILED' }));
        };
        const close = (path: string, capability: string): void => {
            try { dependencies.formHost.close(path); } catch (error) { trace('close-failed', capability, error); }
        };
        const find = (name: string): Node | null => {
            const visit = (node: Node): Node | null => {
                if (node.name === name && node.isValid) return node;
                for (const child of node.children) { const found = visit(child); if (found) return found; }
                return null;
            };
            // `host` owns the long-lived network session and can belong to the
            // lobby that initiated the room handoff. Forms are mounted in the
            // current gameplay scene, so resolve their live UI root here.
            const scene = director.getScene();
            return scene?.isValid ? visit(scene) : visit(host);
        };
        const bindChat = (root: Node, actions: CommonRoomChatActions): void => {
            for (const dispose of listeners.splice(0)) dispose();
            const bind = (path: string, action: () => void): void => {
                const node = root.getChildByPath(path);
                if (!node?.isValid || !node.getComponent(Button)) throw new Error(`COMMON_ROOM_CHAT_CONTROL_REQUIRED:${path}`);
                node.on(Button.EventType.CLICK, action);
                listeners.push(() => { if (node.isValid) node.off(Button.EventType.CLICK, action); });
            };
            // The native ChatPanel has no authored close button; the shared
            // room chat toggle is its close affordance. Bind an authored close
            // control when a future skin provides one, but do not turn an
            // optional visual into a runtime failure for every registered game.
            const close = root.getChildByPath('CloseButton');
            if (close?.isValid && close.getComponent(Button)) {
                bind('CloseButton', () => actions.close());
            }
            bind('Popup/SendButton', () => {
                const input = root.getChildByPath('Popup/MessageComposer/MessageInput')?.getComponent(EditBox);
                const value = String(input?.string ?? '').trim();
                if (!input || !value) return;
                void actions.sendText(value).then(() => { if (input.isValid) input.string = ''; })
                    .catch(error => trace('action-failed', 'chat', error));
            });
            for (let index = 1; index <= 20; index += 1) {
                const identity = String(index);
                bind(`EmojiGrid/Emoji${identity.padStart(2, '0')}`, () => {
                    void actions.sendExpression(identity).catch(error => trace('action-failed', 'chat', error));
                });
            }
            for (let index = 1; index <= 7; index += 1) {
                const identity = String(index);
                const path = `QuickTextPanel/Viewport/QuickTextList/QuickText${identity.padStart(2, '0')}`;
                // Skins may ship a shorter authored quick-text list. Missing
                // optional entries must not abort the whole shared chat form.
                if (!root.getChildByPath(path)) continue;
                bind(path, () => {
                    void actions.sendQuick(identity).catch(error => trace('action-failed', 'chat', error));
                });
            }
        };
        const destroy = (): void => {
            if (destroyed) return;
            destroyed = true;
            media?.cancel();
            close('room/VoiceRecordingPanel', 'voice');
            close('room/ChatPanel', 'chat');
            chatActions = null;
            voiceWindowPending = null;
            for (const dispose of listeners.splice(0)) dispose();
            headRenderer.destroy();
            sessions?.delete(destroy);
            trace('destroy', 'socialMedia');
        };
        sessions?.add(destroy);
        return Object.freeze({
            formHost: dependencies.formHost,
            headRenderer,
            playVoice: async (assetId: number): Promise<void> => {
                if (destroyed || !Number.isSafeInteger(assetId) || assetId <= 0) {
                    throw new Error('COMMON_ROOM_VOICE_ASSET_INVALID');
                }
                const client = resolveMedia();
                await client.play(await client.describe(assetId));
            },
            chatWindow: Object.freeze({
                open: async (actions: CommonRoomChatActions): Promise<void> => {
                    if (destroyed) throw new Error('COMMON_ROOM_DEFAULT_SESSION_DESTROYED');
                    chatActions = actions;
                    await dependencies.formHost.show('room/ChatPanel');
                    if (destroyed || chatActions !== actions) throw new Error('COMMON_ROOM_DEFAULT_SESSION_DESTROYED');
                    const root = find('ChatPanel');
                    if (!root) throw new Error('COMMON_ROOM_CHAT_FORM_REQUIRED');
                    bindChat(root, actions);
                    trace('open', 'chat');
                },
                close: () => close('room/ChatPanel', 'chat'),
                destroy,
            }),
            voiceCapture: Object.freeze({
                capture: async () => {
                    if (destroyed) throw new Error('COMMON_ROOM_DEFAULT_SESSION_DESTROYED');
                    await voiceWindowPending;
                    if (!find('VoiceRecordingPanel')) throw new Error('COMMON_ROOM_VOICE_FORM_REQUIRED');
                    const client = resolveMedia();
                    const recorded = await client.record();
                    if (!recorded || destroyed) return null;
                    const ready = await client.upload(recorded);
                    return Object.freeze({ identity: String(ready.assetId), payload: Object.freeze({
                        durationMs: ready.durationMillis, codec: ready.mimeType,
                    }) });
                },
                finish: () => media?.stop(),
                cancel: () => media?.cancel(),
                destroy,
            }),
            voiceWindow: Object.freeze({
                open: () => {
                    if (destroyed) throw new Error('COMMON_ROOM_DEFAULT_SESSION_DESTROYED');
                    voiceWindowPending = dependencies.formHost.show('room/VoiceRecordingPanel')
                        .then(() => { trace('open', 'voice'); });
                },
                close: () => close('room/VoiceRecordingPanel', 'voice'),
                destroy,
            }),
            destroy,
        });
    }

    private mount(value: unknown): void {
        const payload = this.record(value) as RoomMountPayload;
        const room = this.record(payload.room);
        const ticket = this.record(payload.ticket);
        const context = this.context(payload, room, ticket);
        if (!context) {
            this.lobby.emit('aoo-room-network-state', { state: 'FAILED', code: 'ROOM_AUTHORITY_CONTEXT_REQUIRED' });
            return;
        }
        const generation = ++this.generation;
        this.voice?.destroy();
        const reconnectToken = String(payload.reconnectToken ?? ticket.reconnectToken ?? room.reconnectToken ?? '');
        const eventSeq = Number(payload.eventSeq ?? room.eventSeq ?? room.serverSeq ?? 0);
        this.store.replaceSnapshot({ roomId: Number(context.roomId), playVersion: context.playVersion,
            eventSeq: Number.isSafeInteger(eventSeq) && eventSeq >= 0 ? eventSeq : 0,
            stateVersion: context.stateVersion, payload: room });
        if (reconnectToken && !context.runtime) {
            this.lobby.emit('aoo-room-network-state', { state: 'FAILED', code: 'ROOM_RUNTIME_IDENTITY_REQUIRED' });
            return;
        }
        this.reconnect = reconnectToken && context.runtime ? new RoomReconnectController(this.protocol, this.store, {
            recovering: () => this.emitIfCurrent(generation, 'RECOVERING'),
            recovered: state => this.emitIfCurrent(generation, 'READY', state),
            recoveryFailed: error => this.emitIfCurrent(generation, 'FAILED', undefined, error.message),
        }, (state, event: RoomRecoveryEvent) => ({ ...state, eventSeq: event.sequence, payload: event.payload }), {
            roomId: Number(context.roomId), playVersion: context.playVersion, reconnectToken,
            ...context.runtime,
        }) : null;
        const voiceRecorder = this.recorder();
        this.voice = voiceRecorder ? new RoomVoiceController(context.roomId, context.seatId, this.protocol,
            new VoiceMediaClient(resolveRuntimeEndpoints().apiBaseUrl, this.accessToken,
                () => ({ deviceId: 'cocos-client', channel: 'lobby-room', clientVersion: '3.8.8' }), voiceRecorder), {
                recording: active => this.lobby.emit('aoo-room-voice-state', { state: active ? 'RECORDING' : 'IDLE' }),
                uploading: active => this.lobby.emit('aoo-room-voice-state', { state: active ? 'UPLOADING' : 'IDLE' }),
                playing: (assetId, active, durationMillis) => this.lobby.emit('aoo-room-voice-state', { state: active ? 'PLAYING' : 'IDLE', assetId, durationMillis }),
                error: code => this.lobby.emit('aoo-room-voice-state', { state: 'FAILED', code }),
            }) : null;
        this.emitIfCurrent(generation, 'READY', { reconnect: Boolean(this.reconnect), voice: Boolean(this.voice) });
    }

    private context(payload: RoomMountPayload, room: Record<string, unknown>, ticket: Record<string, unknown>): RoomMountContext | null {
        const roomId = String(payload.roomId ?? room.roomId ?? room.roomID ?? ticket.roomId ?? ticket.roomID ?? '');
        const seatId = Number(payload.seatId ?? room.seatId ?? room.posID ?? room.clientPos ?? -1);
        const playVersion = String(payload.playVersion ?? room.playVersion ?? ticket.playVersion ?? '');
        const stateVersion = Number(payload.stateVersion ?? room.stateVersion ?? 0);
        if (!roomId || !Number.isSafeInteger(seatId) || seatId < 0 || !playVersion
            || !Number.isSafeInteger(stateVersion) || stateVersion < 0) return null;
        const metadata = this.record(payload.snapshotMetadata ?? room.snapshotMetadata ?? ticket.snapshotMetadata);
        const runtimeValues = {
            gameId: Number(payload.gameId ?? room.gameId ?? ticket.gameId),
            gameCode: this.text(payload.gameCode ?? room.gameCode ?? ticket.gameCode),
            ownerId: this.decimal(payload.ownerId ?? room.ownerId ?? ticket.ownerId),
            roomInstanceId: this.text(payload.roomInstanceId ?? room.roomInstanceId ?? ticket.roomInstanceId),
            lifecycleEpoch: this.decimal(payload.lifecycleEpoch ?? room.lifecycleEpoch ?? ticket.lifecycleEpoch),
            fencingToken: this.decimal(payload.fencingToken ?? room.fencingToken ?? ticket.fencingToken),
            sessionId: this.text(payload.sessionId ?? room.sessionId ?? ticket.sessionId),
            stateVersion,
            eventSequence: this.decimal(payload.eventSequence ?? payload.eventSeq ?? room.eventSequence ?? room.eventSeq ?? ticket.eventSequence),
            eventId: this.text(payload.eventId ?? room.eventId ?? ticket.eventId),
            connectionGeneration: this.decimal(payload.connectionGeneration ?? room.connectionGeneration ?? ticket.connectionGeneration),
            releaseId: this.decimal(payload.releaseId ?? metadata.releaseId ?? room.releaseId ?? ticket.releaseId),
            indexGeneration: this.decimal(payload.indexGeneration ?? metadata.indexGeneration ?? room.indexGeneration ?? ticket.indexGeneration),
            regionCode: this.text(payload.regionCode ?? metadata.regionCode ?? room.regionCode ?? ticket.regionCode),
            sourceHash: this.text(payload.sourceHash ?? metadata.sourceHash ?? room.sourceHash ?? ticket.sourceHash),
            ruleContentHash: this.text(payload.ruleContentHash ?? metadata.ruleContentHash ?? room.ruleContentHash ?? ticket.ruleContentHash),
            componentContentHash: this.text(payload.componentContentHash ?? metadata.componentContentHash ?? room.componentContentHash ?? ticket.componentContentHash),
            cardCodecVersion: this.text(payload.cardCodecVersion ?? metadata.cardCodecVersion ?? room.cardCodecVersion ?? ticket.cardCodecVersion),
            eventInterpreterVersion: this.text(payload.eventInterpreterVersion ?? metadata.eventInterpreterVersion ?? room.eventInterpreterVersion ?? ticket.eventInterpreterVersion),
            protocolVersion: this.text(payload.protocolVersion ?? metadata.protocolVersion ?? room.protocolVersion ?? ticket.protocolVersion),
            snapshotSchemaVersion: this.text(payload.snapshotSchemaVersion ?? metadata.snapshotSchemaVersion ?? room.snapshotSchemaVersion ?? ticket.snapshotSchemaVersion),
        } satisfies RoomReconnectRuntimeContext;
        const runtimeKeys: ReadonlyArray<keyof RoomReconnectRuntimeContext> = [
            'gameId', 'gameCode', 'ownerId', 'roomInstanceId', 'lifecycleEpoch', 'fencingToken',
            'sessionId', 'eventSequence', 'eventId', 'connectionGeneration', 'releaseId',
            'indexGeneration', 'regionCode', 'sourceHash', 'ruleContentHash', 'componentContentHash',
            'cardCodecVersion', 'eventInterpreterVersion', 'protocolVersion', 'snapshotSchemaVersion',
        ];
        const runtime = runtimeKeys.every(key => {
            const value = runtimeValues[key];
            return key === 'gameId' ? typeof value === 'number' && Number.isSafeInteger(value) && value > 0 : Boolean(value);
        }) ? runtimeValues : null;
        return { roomId, seatId, playVersion, stateVersion, runtime };
    }

    private text(value: unknown): string {
        const result = String(value ?? '').trim();
        return result;
    }

    private decimal(value: unknown): string {
        // Runtime identity values may exceed JavaScript's safe integer range. A
        // numeric JSON value has already lost precision before this boundary, so
        // only canonical decimal strings are admissible; all other inputs fail
        // closed through the required runtime-key check above.
        if (typeof value !== 'string') return '';
        const result = value.trim();
        return /^(0|[1-9]\d*)$/.test(result) ? result : '';
    }

    private emitIfCurrent(generation: number, state: string, data?: unknown, code?: string): void {
        if (generation !== this.generation) return;
        this.lobby.emit('aoo-room-network-state', { state, data, code });
    }

    private on(name: string, listener: (value: unknown) => void): void {
        this.lobby.on(name, listener);
        this.disposers.push(() => {
            const eventProcessor = (this.lobby as unknown as { _eventProcessor?: unknown })._eventProcessor;
            if (isValid(this.lobby, true) && eventProcessor) this.lobby.off(name, listener);
        });
    }

    private record(value: unknown): Record<string, unknown> {
        return value && typeof value === 'object' ? value as Record<string, unknown> : {};
    }
}
