import { isValid, Node } from 'cc';
import { RoomController, type RoomAuthorityContext } from './RoomController';
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

interface LobbyRoomState extends AuthoritativeRoomState { readonly payload?: unknown }
interface RoomMountPayload extends Partial<RoomAuthorityContext> {
    room?: unknown;
    ticket?: unknown;
    reconnectToken?: string;
    eventSeq?: number;
}

/** Production ownership boundary for common room network controllers entered from the lobby scene. */
export class RoomNetworkControllerMount {
    private room: RoomController | null = null;
    private reconnect: RoomReconnectController<LobbyRoomState> | null = null;
    private voice: RoomVoiceController | null = null;
    private readonly store = new AuthoritativeRoomStore<LobbyRoomState>();
    private readonly disposers: Array<() => void> = [];
    private generation = 0;

    public constructor(
        private readonly lobby: Node,
        private readonly protocol: ProtocolClient,
        private readonly accessToken: () => Promise<string>,
        private readonly recorder: () => VoiceRecorder | undefined,
    ) {}

    public install(): void {
        this.on('common-pdk-room-ready', value => this.mount(value));
        this.on('aoo-room-network-mount', value => this.mount(value));
        this.on('aoo-room-ready-change', value => void this.invoke('ready', () => this.room?.ready(Boolean(this.record(value).ready))));
        this.on('aoo-room-state-refresh', () => void this.invoke('state', () => this.room?.state()));
        this.on('aoo-room-exit', () => void this.invoke('exit', () => this.room?.exit()));
        this.on('aoo-room-reconnect', () => void this.reconnect?.reconnect());
        this.on('aoo-room-voice-record', () => void this.voice?.recordUploadSend());
        this.disposers.push(this.protocol.on('common.room.auto_dissolved', value => {
            const payload = this.record(value);
            this.generation += 1;this.reconnect = null;this.room = null;this.store.clear();
            this.lobby.emit('aoo-room-auto-dissolved', { reasonCode: String(payload.reasonCode ?? 'WAITING_ROOM_EXPIRED'), message: String(payload.message ?? '房间超过300秒未开始，已自动解散') });
        }));
        this.disposers.push(this.store.subscribe(state => this.lobby.emit('aoo-room-authoritative-state', state)));
    }

    public destroy(): void {
        this.generation += 1;
        this.voice?.destroy();
        this.voice = null;
        this.reconnect = null;
        this.room = null;
        for (const dispose of this.disposers.splice(0)) dispose();
        this.store.clear();
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
        this.room = new RoomController(this.protocol, context);
        const reconnectToken = String(payload.reconnectToken ?? ticket.reconnectToken ?? room.reconnectToken ?? '');
        const eventSeq = Number(payload.eventSeq ?? room.eventSeq ?? room.serverSeq ?? 0);
        this.store.replaceSnapshot({ roomId: Number(context.roomId), playVersion: context.playVersion,
            eventSeq: Number.isSafeInteger(eventSeq) && eventSeq >= 0 ? eventSeq : 0,
            stateVersion: context.stateVersion, payload: room });
        this.reconnect = reconnectToken ? new RoomReconnectController(this.protocol, this.store, {
            recovering: () => this.emitIfCurrent(generation, 'RECOVERING'),
            recovered: state => this.emitIfCurrent(generation, 'READY', state),
            recoveryFailed: error => this.emitIfCurrent(generation, 'FAILED', undefined, error.message),
        }, (state, event: RoomRecoveryEvent) => ({ ...state, eventSeq: event.sequence, payload: event.payload }), {
            roomId: Number(context.roomId), playVersion: context.playVersion, reconnectToken,
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

    private context(payload: RoomMountPayload, room: Record<string, unknown>, ticket: Record<string, unknown>): RoomAuthorityContext | null {
        const roomId = String(payload.roomId ?? room.roomId ?? room.roomID ?? ticket.roomId ?? ticket.roomID ?? '');
        const seatId = Number(payload.seatId ?? room.seatId ?? room.posID ?? room.clientPos ?? -1);
        const playVersion = String(payload.playVersion ?? room.playVersion ?? ticket.playVersion ?? '');
        const stateVersion = Number(payload.stateVersion ?? room.stateVersion ?? 0);
        if (!roomId || !Number.isSafeInteger(seatId) || seatId < 0 || !playVersion
            || !Number.isSafeInteger(stateVersion) || stateVersion < 0) return null;
        return { roomId, seatId, playVersion, stateVersion };
    }

    private async invoke(name: string, action: () => Promise<unknown> | undefined): Promise<void> {
        try {
            const pending = action();
            if (!pending) throw new Error('ROOM_NETWORK_NOT_MOUNTED');
            const data = await pending;
            this.lobby.emit('aoo-room-action-state', { action: name, state: 'SUCCESS', data });
        } catch (error) {
            this.lobby.emit('aoo-room-action-state', { action: name, state: 'FAILED',
                code: error instanceof Error ? error.message : 'ROOM_ACTION_FAILED' });
        }
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
