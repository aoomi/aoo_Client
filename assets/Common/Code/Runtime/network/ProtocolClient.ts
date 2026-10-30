import { LegacyWebSocketClient, sessionLifecycle } from './LegacyWebSocketClient';
import { CausalEventGuard } from '../CompatibilityApp/core/CausalEventGuard';
import { ClientErrorCorrelation } from './ClientErrorCorrelation';
import { requireCanonicalWebSocketUrl } from './GatewayEntryPolicy';
import { resolvePageInstanceId } from '../config/RuntimeEndpoints';
import type { LegacyIncomingPacket } from './LegacyPacketCodec';
import { RoomPushGate } from '../state/RoomPushGate';
import { ProtocolDefinitions } from './GeneratedProtocolIds';
import { AppError } from '../core/AppError';

export type ProtocolStage = 'M1' | 'M2' | 'M3' | 'M4' | 'M5' | 'M6' | 'M7' | 'M8';
export type ProtocolWireMode = 'v2';

// Canonical poker room identities are derived from the generated machine protocol
// registry (Server/protocol/aoo-protocol-v2.json rendered by tools/protocol/generate.mjs).
// A region becomes routable by declaring `poker.<CODE>.dispatch` and
// `poker.<CODE>.state_push` in the machine source; no global network layer edit is
// required for a new region. Unknown names still must not become authoritative room
// traffic merely because they share a `poker.` prefix: admission requires a registered
// business dispatch identity.
const POKER_CANONICAL_IDENTITY = '[a-z][a-z0-9]*(?:20(?:0[1-9]|1[0-9]|2[0-8])|299[7-9])';
const POKER_BUSINESS_DISPATCH = new RegExp(`^(poker\\.${POKER_CANONICAL_IDENTITY})\\.dispatch$`);
const POKER_BUSINESS_MESSAGE = new RegExp(`^(poker\\.${POKER_CANONICAL_IDENTITY})\\.(?:dispatch|state_push)$`);
interface RegisteredDefinition {
    readonly kind: string;
    readonly auth: string;
    readonly stage: ProtocolStage;
}
const registeredDefinitions = ProtocolDefinitions as unknown as Readonly<Record<string, RegisteredDefinition | undefined>>;
const registeredPokerMessageIds: ReadonlySet<string> = new Set(
    Object.keys(ProtocolDefinitions).filter(msgId => msgId.startsWith('poker.')));

/** Registered canonical poker region of `msgId`, or undefined when the region has no declared dispatch. */
function canonicalPokerRegion(msgId: string): string | undefined {
    const match = POKER_BUSINESS_MESSAGE.exec(msgId);
    if (!match) return undefined;
    return registeredDefinitions[`${match[1]}.dispatch`] && registeredDefinitions[msgId] ? match[1] : undefined;
}

function isCanonicalPokerMessage(msgId: string): boolean {
    return canonicalPokerRegion(msgId) !== undefined;
}

function isCanonicalPokerDispatch(msgId: string): boolean {
    return POKER_BUSINESS_DISPATCH.test(msgId) && registeredDefinitions[msgId] !== undefined;
}

/** Registry-declared room-scoped authoritative snapshot push (stage M4/M5/M6, room session). */
function isRegisteredRoomStatePush(msgId: string): boolean {
    const definition = registeredDefinitions[msgId];
    return definition !== undefined && definition.kind === 'push' && definition.auth === 'room_session'
        && msgId.endsWith('.state_push')
        && (definition.stage === 'M4' || definition.stage === 'M5' || definition.stage === 'M6');
}

export interface ProtocolRouteDecision {
    readonly mode: ProtocolWireMode;
    readonly stage: ProtocolStage;
    readonly canonicalMsgId: string;
    readonly legacyEvent: string;
}

export interface ProtocolMigrationConfig {
    readonly defaultMode: ProtocolWireMode;
    readonly stageModes?: Partial<Record<ProtocolStage, ProtocolWireMode>>;
    readonly messageModes?: Readonly<Record<string, ProtocolWireMode>>;
}

export type CommonRoomSessionEvent = Readonly<
    | { kind: 'snapshot'; snapshot: unknown }
    | { kind: 'social'; event: 'room.quick_text' | 'room.magic_expression' | 'room.voice'; payload: unknown }
>;

export interface CommonRoomSession {
    snapshot(): unknown;
    subscribe(listener: (event: CommonRoomSessionEvent) => void): () => void;
    dispatch(command: string,
        payload: Readonly<Record<string, unknown>>): Promise<unknown>;
}

/**
 * The only network client business modules may depend on.
 * Business traffic is V2-only; the inherited packet transport is an isolated framing adapter.
 */
export class ProtocolClient extends LegacyWebSocketClient {
    private static readonly activeRoomClients = new Map<string, Set<ProtocolClient>>();
    private static readonly commonRoomListeners = new Map<string, Set<(event: CommonRoomSessionEvent) => void>>();
    private static readonly commonRoomSnapshots = new Map<string, unknown>();
    private static readonly commonRoomCursors = new Map<string, { stateVersion: number; roundNo: number }>();
    private readonly routeListeners = new Set<(route: ProtocolRouteDecision) => void>();
    private readonly v2PushListeners = new Map<string, Set<(body: unknown) => void>>();
    private pushBridgeDisposer: (() => void) | null = null;
    private v2Sequence = 0;
    private wsTicket = '';
    private roomAuthority: Readonly<{ roomId: string; playVersion: string }> | null = null;
    private readonly roomPushGate = new RoomPushGate();
    private readonly causalGuard = new CausalEventGuard();
    private commonRoomSendTail: Promise<void> = Promise.resolve();
    private commonRoomGeneration = 0;
    private registeredRoomId: string | null = null;

    public setWsTicket(ticket: string): void { this.wsTicket = ticket; }

    public override async connect(url: string, timeoutMs = 5000): Promise<void> {
        await super.connect(url, timeoutMs);
        // LegacyWebSocketClient.connect starts by calling the polymorphic close().
        // ProtocolClient.close deliberately clears push gating state, so restore
        // the already selected room authority only after the new socket is live.
        // Without this, raw room pushes reach the browser but are rejected before
        // every gameplay listener on the first connection and after reconnect.
        const authority = this.roomAuthority;
        if (authority) {
            this.roomPushGate.bind(authority.roomId, authority.playVersion);
            this.registerRoomClient(authority.roomId);
        }
    }

    public bindRoomAuthority(roomId: number | string, playVersion: string): void {
        const normalizedRoomId = String(roomId).trim();
        const normalizedVersion = playVersion.trim();
        if (!/^[1-9]\d*$/.test(normalizedRoomId)) throw new Error('房间权威上下文 roomId 无效');
        if (!normalizedVersion) throw new Error('房间权威上下文 playVersion 无效');
        this.commonRoomGeneration += 1;
        this.commonRoomSendTail = Promise.resolve();
        this.unregisterRoomClient();
        this.roomAuthority = Object.freeze({ roomId: normalizedRoomId, playVersion: normalizedVersion });
        this.roomPushGate.bind(normalizedRoomId, normalizedVersion);
        if (this.isConnected()) this.registerRoomClient(normalizedRoomId);
    }

    public static commonRoomSession(roomId: number | string): CommonRoomSession {
        const normalizedRoomId = ProtocolClient.positiveId(roomId);
        if (!normalizedRoomId) throw new Error('COMMON_ROOM_SESSION_ROOM_ID_INVALID');
        ProtocolClient.requireActiveRoomClient(normalizedRoomId);
        return Object.freeze({
            snapshot: (): unknown => {
                ProtocolClient.requireActiveRoomClient(normalizedRoomId);
                if (!ProtocolClient.commonRoomSnapshots.has(normalizedRoomId)) {
                    throw new Error('COMMON_ROOM_PUBLIC_VIEW_MISSING');
                }
                return ProtocolClient.commonRoomSnapshots.get(normalizedRoomId);
            },
            subscribe: (listener: (event: CommonRoomSessionEvent) => void): (() => void) => {
                ProtocolClient.requireActiveRoomClient(normalizedRoomId);
                const listeners = ProtocolClient.commonRoomListeners.get(normalizedRoomId) ?? new Set();
                listeners.add(listener);
                ProtocolClient.commonRoomListeners.set(normalizedRoomId, listeners);
                return () => {
                    listeners.delete(listener);
                    if (listeners.size === 0) ProtocolClient.commonRoomListeners.delete(normalizedRoomId);
                };
            },
            dispatch: (command: string, payload: Readonly<Record<string, unknown>>) =>
                ProtocolClient.requireActiveRoomClient(normalizedRoomId)
                .dispatchCommonRoom(command, payload),
        });
    }

    /**
     * Publishes the normalized public seat projection when an established
     * runtime receives its authoritative snapshot through a request response
     * rather than a state-push envelope.
     */
    public static publishCommonRoomSnapshot(roomId: number | string, snapshot: unknown,
        cursor?: Readonly<{ stateVersion: number; roundNo: number }>): void {
        const normalizedRoomId = ProtocolClient.positiveId(roomId);
        if (!normalizedRoomId) throw new Error('COMMON_ROOM_SESSION_ROOM_ID_INVALID');
        ProtocolClient.requireActiveRoomClient(normalizedRoomId);
        if (cursor) {
            const stateVersion = Number(cursor.stateVersion);
            const roundNo = Number(cursor.roundNo);
            if (!Number.isSafeInteger(stateVersion) || stateVersion < 0
                || !Number.isSafeInteger(roundNo) || roundNo < 0) {
                throw new Error('COMMON_ROOM_SESSION_CURSOR_INVALID');
            }
            ProtocolClient.commonRoomCursors.set(normalizedRoomId, { stateVersion, roundNo });
        }
        ProtocolClient.commonRoomSnapshots.set(normalizedRoomId, snapshot);
        ProtocolClient.emitCommonRoom(normalizedRoomId, { kind: 'snapshot', snapshot });
    }

    public publishCommonRoomSnapshot(snapshot: unknown): void {
        const roomId = this.registeredRoomId;
        if (!roomId || ProtocolClient.requireActiveRoomClient(roomId) !== this) {
            throw new Error('COMMON_ROOM_SESSION_NOT_ACTIVE');
        }
        ProtocolClient.publishCommonRoomSnapshot(roomId, snapshot);
    }

    protected override resolveSocketUrl(url: string): string {
        if (!this.wsTicket) throw new Error('连接唯一 WSS 入口前必须取得 wsTicket');
        // Gateway 的 V2 序号按“单条 WebSocket 连接”校验连续性。
        // 重连或新房间重新建链时必须从 1 开始，不能沿用上一条连接的账号级序号。
        this.v2Sequence = 0;
        return requireCanonicalWebSocketUrl(url);
    }

    protected override resolveSocketProtocols(): string[] {
        if (!this.wsTicket) throw new Error('连接唯一 WSS 入口前必须取得 wsTicket');
        return ['aoo.v2', `aoo.ticket.${this.wsTicket}`, `aoo.page.${resolvePageInstanceId()}`];
    }

    public configureMigration(config: ProtocolMigrationConfig): void {
        if (config.defaultMode !== 'v2' || Object.values(config.stageModes ?? {}).some(mode => mode !== 'v2')
            || Object.values(config.messageModes ?? {}).some(mode => mode !== 'v2')) throw new Error('only protocol V2 is enabled');
    }

    public getRoute(msgId: string): ProtocolRouteDecision {
        const canonicalMsgId = ProtocolClient.canonicalize(msgId);
        const stage = ProtocolClient.stageOf(canonicalMsgId);
        return {
            mode: 'v2',
            stage,
            canonicalMsgId,
            legacyEvent: msgId,
        };
    }

    public override request<T>(msgId: string, body: unknown, timeoutMs = 8000): Promise<T> {
        return this.dispatchProtocolRequest(msgId, body, timeoutMs,
            (event, outbound, requestTimeoutMs) => super.request<ProtocolResponse<T>>(event, outbound, requestTimeoutMs));
    }

    public requestLobby<T>(legacyMsgId: string, body: unknown, timeoutMs = 8000): Promise<T> {
        const route: ProtocolRouteDecision = {
            mode: 'v2', stage: 'M2', canonicalMsgId: 'hall.dispatch', legacyEvent: legacyMsgId,
        };
        return this.dispatchProtocolRequest(legacyMsgId, body, timeoutMs,
            (event, outbound, requestTimeoutMs) => super.request<ProtocolResponse<T>>(event, outbound, requestTimeoutMs), route);
    }

    protected override requestImmediate<T>(msgId: string, body: unknown, timeoutMs = 8000): Promise<T> {
        return this.dispatchProtocolRequest(msgId, body, timeoutMs,
            (event, outbound, requestTimeoutMs) => super.requestImmediate<ProtocolResponse<T>>(event, outbound, requestTimeoutMs));
    }

    private dispatchProtocolRequest<T>(
        msgId: string,
        body: unknown,
        timeoutMs: number,
        send: (event: string, outbound: unknown, timeoutMs: number) => Promise<ProtocolResponse<T>>,
        forcedRoute?: ProtocolRouteDecision,
    ): Promise<T> {
        const route = forcedRoute ?? this.getRoute(msgId);
        if (route.canonicalMsgId === 'poker.pdk.dispatch') {
            throw new Error('旧 pdk 写协议已停用；跑得快请求必须携带规范地区业务编码');
        }
        this.publishRoute(route);
        const outbound = this.deferEnvelope(route, 'req', body);
        return send('protocol.v2.dispatch', outbound, timeoutMs).then((response) => {
            const envelope = outbound.envelope;
            if (!envelope) throw AppError.fromProtocol('INVALID_ENVELOPE', 'V2 协议请求未发送');
            if (response.protocolVersion !== '2.0' || response.kind !== 'resp'
                || response.requestId !== envelope.requestId || response.traceId !== envelope.traceId
                || response.msgId !== envelope.msgId || response.seq !== envelope.seq) {
                console.error('[ProtocolV2ResponseMismatch]', {
                    roomId: this.correlatedRoomId(body) ?? '',
                    expected: {
                        protocolVersion: '2.0', kind: 'resp', msgId: envelope.msgId,
                        requestId: envelope.requestId, traceId: envelope.traceId, seq: envelope.seq,
                    },
                    received: {
                        protocolVersion: response?.protocolVersion, kind: response?.kind, msgId: response?.msgId,
                        requestId: response?.requestId, traceId: response?.traceId, seq: response?.seq,
                    },
                });
                throw AppError.fromProtocol('INVALID_ENVELOPE', 'V2 协议响应不匹配');
            }
            if ((response.code ?? 0) !== 0) throw AppError.fromProtocol(response.code, response.message ?? '请求失败');
            return response.body;
        }).catch((error: unknown) => {
            const roomId = this.correlatedRoomId(body);
            const envelope = outbound.envelope;
            throw ClientErrorCorrelation.enrich(AppError.fromUnknown(error), {
                traceId: envelope?.traceId ?? 'unsent',
                requestId: envelope?.requestId ?? 'unsent',
                msgId: envelope?.msgId ?? route.canonicalMsgId,
                roomId,
            });
        });
    }

    public override notify(msgId: string, body: unknown): void {
        const route = this.getRoute(msgId);
        this.publishRoute(route);
        super.notify('protocol.v2.dispatch', this.deferEnvelope(route, 'push', body));
    }

    public override on(event: string, listener: (body: unknown) => void): () => void {
        const canonical = ProtocolClient.canonicalize(event);
        const listeners = this.v2PushListeners.get(canonical) ?? new Set<(body: unknown) => void>();
        listeners.add(listener);
        this.v2PushListeners.set(canonical, listeners);
        if (!this.pushBridgeDisposer) {
            this.pushBridgeDisposer = super.on('protocol.v2.push', (packet) => this.dispatchV2Push(packet));
        }
        return () => {
            listeners.delete(listener);
            if (listeners.size === 0) this.v2PushListeners.delete(canonical);
        };
    }

    public override close(): void {
        this.commonRoomGeneration += 1;
        this.commonRoomSendTail = Promise.resolve();
        this.unregisterRoomClient();
        this.pushBridgeDisposer?.();
        this.pushBridgeDisposer = null;
        this.v2PushListeners.clear();
        this.roomPushGate.clear();
        super.close();
    }

    public onRoute(listener: (route: ProtocolRouteDecision) => void): () => void {
        this.routeListeners.add(listener);
        return () => this.routeListeners.delete(listener);
    }

    private publishRoute(route: ProtocolRouteDecision): void {
        for (const listener of this.routeListeners) listener(route);
    }

    private dispatchV2Push(packet: unknown): void {
        if (!packet || typeof packet !== 'object') return;
        const envelope = packet as { protocolVersion?: unknown; msgId?: unknown; kind?: unknown; requestId?: unknown;
            seq?: unknown; timestamp?: unknown; traceId?: unknown; body?: unknown };
        if (envelope.protocolVersion !== '2.0' || envelope.kind !== 'push' || typeof envelope.msgId !== 'string'
            || typeof envelope.requestId !== 'string' || typeof envelope.traceId !== 'string'
            || !Number.isSafeInteger(envelope.seq) || Number(envelope.seq) <= 0
            || !Number.isSafeInteger(envelope.timestamp) || Number(envelope.timestamp) <= 0) return;
        const directRoomState = isRegisteredRoomStatePush(envelope.msgId);
        const directRoomEvent = directRoomState || envelope.msgId === 'room.quick_text'
            || envelope.msgId === 'room.magic_expression' || envelope.msgId === 'room.voice';
        const wrapper = envelope.body && typeof envelope.body === 'object'
            ? envelope.body as { action?: unknown; payload?: unknown }
            : {};
        const action = directRoomEvent ? envelope.msgId : wrapper.action;
        if (typeof action !== 'string') return;
        if (ProtocolClient.canonicalize(action) === 'system.kick_out') {
            const replacement = wrapper.payload && typeof wrapper.payload === 'object'
                ? wrapper.payload as { reasonCode?: unknown }
                : {};
            sessionLifecycle.confirmReplacement('protocol-push', String(replacement.reasonCode ?? ''));
        }
        const canonicalAction = ProtocolClient.canonicalize(action);
        const payload = directRoomEvent ? envelope.body : wrapper.payload;
        // State snapshots are version-gated. Ephemeral room events are already scoped by the
        // authenticated room WebSocket and intentionally do not carry a full room snapshot.
        if (directRoomState && ProtocolClient.isRoomPush(canonicalAction)
            && !this.roomPushGate.accepts(payload, envelope)) return;
        if (directRoomState) {
            const publicView = payload && typeof payload === 'object'
                ? (payload as Record<string, unknown>).commonRoom : undefined;
            if (publicView !== undefined) {
                if (this.registeredRoomId) {
                    ProtocolClient.commonRoomSnapshots.set(this.registeredRoomId, publicView);
                    const state = payload as Record<string, unknown>;
                    const stateVersion = Number(state.stateVersion);
                    const roundNo = Number(state.roundNo ?? state.round);
                    if (Number.isSafeInteger(stateVersion) && stateVersion >= 0
                        && Number.isSafeInteger(roundNo) && roundNo >= 0) {
                        ProtocolClient.commonRoomCursors.set(this.registeredRoomId, { stateVersion, roundNo });
                    }
                }
                this.publishCommonRoom({ kind: 'snapshot', snapshot: publicView });
            }
        } else if (canonicalAction === 'room.quick_text' || canonicalAction === 'room.magic_expression'
            || canonicalAction === 'room.voice') {
            this.publishCommonRoom({ kind: 'social', event: canonicalAction, payload });
        }
        const listeners = this.v2PushListeners.get(canonicalAction);
        if (!listeners) return;
        const causalId = envelope.requestId;
        this.causalGuard.dispatch('network', causalId, () => {
            for (const listener of listeners) listener(payload);
        });
    }

    private dispatchCommonRoom(command: string,
        payload: Readonly<Record<string, unknown>>): Promise<unknown> {
        const generation = this.commonRoomGeneration;
        const operation = this.commonRoomSendTail.then(() => {
            if (generation !== this.commonRoomGeneration) {
                throw new Error('COMMON_ROOM_SESSION_CHANGED');
            }
            return this.sendCommonRoom(command, payload);
        });
        this.commonRoomSendTail = operation.then(() => undefined, () => undefined);
        return operation;
    }

    private sendCommonRoom(command: string,
        payload: Readonly<Record<string, unknown>>): Promise<unknown> {
        const authority = this.roomAuthority;
        if (!authority || this.registeredRoomId !== authority.roomId || !this.isConnected()) {
            return Promise.reject(new Error('COMMON_ROOM_SESSION_NOT_ACTIVE'));
        }
        const dissolveMessage = command === 'dissolve.request' ? 'common.room.dissolve_req'
            : command === 'dissolve.agree' ? 'common.room.dissolve_agree_req'
                : command === 'dissolve.refuse' ? 'common.room.dissolve_refuse_req' : null;
        if (dissolveMessage) return this.sendCommonRoomDissolve(dissolveMessage, payload);
        const action = command === 'chat.text' || command === 'chat.quick' || command === 'chat.expression'
            || command === 'chat.quickText' ? 'quick_text'
            : command === 'voice' ? 'voice'
                : command === 'magic.expression' || command === 'magicExpression' ? 'magic_expression' : null;
        if (!action) return Promise.reject(new Error('COMMON_ROOM_COMMAND_UNSUPPORTED'));
        const cursor = ProtocolClient.commonRoomCursors.get(authority.roomId);
        const view = ProtocolClient.commonRoomSnapshots.get(authority.roomId) as
            { localSeatId?: unknown } | undefined;
        const seatId = Number(view?.localSeatId);
        if (!cursor || !Number.isSafeInteger(seatId) || seatId < 0) {
            return Promise.reject(new Error('COMMON_ROOM_AUTHORITY_CURSOR_REQUIRED'));
        }
        const identity = String(payload.identity ?? '').trim();
        const quickId = command === 'chat.text' ? 0
            : command === 'chat.expression' ? 100 + Number(identity)
                : command === 'chat.quick' ? Number(identity) : undefined;
        if (quickId !== undefined && (!Number.isSafeInteger(quickId) || quickId < 0 || quickId > 9999)) {
            return Promise.reject(new Error('COMMON_ROOM_QUICK_ID_INVALID'));
        }
        const assetId = command === 'voice' ? Number(identity) : undefined;
        if (assetId !== undefined && (!Number.isSafeInteger(assetId) || assetId <= 0)) {
            return Promise.reject(new Error('COMMON_ROOM_VOICE_ASSET_INVALID'));
        }
        return this.request<unknown>('common.room.dispatch', {
            ...payload, action,
            ...(quickId !== undefined ? { quickId, content: command === 'chat.text' ? payload.text : '' } : {}),
            ...(assetId !== undefined ? { assetId } : {}),
            roomId: authority.roomId, playVersion: authority.playVersion,
            roundNo: cursor.roundNo, expectedStateVersion: cursor.stateVersion, seatId,
        }).then(response => {
            const body = response && typeof response === 'object'
                ? response as Record<string, unknown> : {};
            const nested = body.payload && typeof body.payload === 'object'
                ? body.payload as Record<string, unknown> : {};
            const stateVersion = Number(body.stateVersion ?? nested.stateVersion);
            const latest = ProtocolClient.commonRoomCursors.get(authority.roomId);
            if (latest && Number.isSafeInteger(stateVersion) && stateVersion > latest.stateVersion) {
                ProtocolClient.commonRoomCursors.set(authority.roomId,
                    { stateVersion, roundNo: latest.roundNo });
            }
            return response;
        });
    }

    /** Common owns the canonical dissolve wire messages; gameplay only supplies typed state. */
    private sendCommonRoomDissolve(message: string,
        payload: Readonly<Record<string, unknown>>): Promise<unknown> {
        const authority = this.roomAuthority;
        if (!authority || this.registeredRoomId !== authority.roomId || !this.isConnected()) {
            return Promise.reject(new Error('COMMON_ROOM_SESSION_NOT_ACTIVE'));
        }
        const cursor = ProtocolClient.commonRoomCursors.get(authority.roomId);
        const view = ProtocolClient.commonRoomSnapshots.get(authority.roomId) as
            { localSeatId?: unknown } | undefined;
        const seatId = Number(view?.localSeatId);
        if (!cursor || !Number.isSafeInteger(seatId) || seatId < 0) {
            return Promise.reject(new Error('COMMON_ROOM_AUTHORITY_CURSOR_REQUIRED'));
        }
        return this.request<unknown>(message, {
            ...payload,
            roomID: Number(authority.roomId),
            playVersion: authority.playVersion,
            roundNo: cursor.roundNo,
            expectedStateVersion: cursor.stateVersion,
            seatId,
        }).then(response => {
            const body = response && typeof response === 'object'
                ? response as Record<string, unknown> : {};
            const stateVersion = Number(body.stateVersion);
            const latest = ProtocolClient.commonRoomCursors.get(authority.roomId);
            if (latest && Number.isSafeInteger(stateVersion) && stateVersion > latest.stateVersion) {
                ProtocolClient.commonRoomCursors.set(authority.roomId,
                    { stateVersion, roundNo: latest.roundNo });
            }
            return response;
        });
    }

    private static emitCommonRoom(roomId: string, event: CommonRoomSessionEvent): void {
        for (const listener of ProtocolClient.commonRoomListeners.get(roomId) ?? []) listener(event);
    }

    private publishCommonRoom(event: CommonRoomSessionEvent): void {
        const roomId = this.registeredRoomId;
        if (!roomId || ProtocolClient.requireActiveRoomClient(roomId) !== this) return;
        ProtocolClient.emitCommonRoom(roomId, event);
    }

    private registerRoomClient(roomId: string): void {
        this.unregisterRoomClient();
        const clients = ProtocolClient.activeRoomClients.get(roomId) ?? new Set<ProtocolClient>();
        clients.add(this);
        ProtocolClient.activeRoomClients.set(roomId, clients);
        this.registeredRoomId = roomId;
    }

    private unregisterRoomClient(): void {
        const roomId = this.registeredRoomId;
        if (!roomId) return;
        const clients = ProtocolClient.activeRoomClients.get(roomId);
        clients?.delete(this);
        if (clients?.size === 0) {
            ProtocolClient.activeRoomClients.delete(roomId);
            ProtocolClient.commonRoomSnapshots.delete(roomId);
            ProtocolClient.commonRoomCursors.delete(roomId);
        }
        this.registeredRoomId = null;
    }

    private static requireActiveRoomClient(roomId: string): ProtocolClient {
        const clients = [...(ProtocolClient.activeRoomClients.get(roomId) ?? [])]
            .filter(client => client.isConnected() && client.roomAuthority?.roomId === roomId);
        if (clients.length !== 1) throw new Error(`COMMON_ROOM_SESSION_CLIENT_COUNT:${clients.length}`);
        return clients[0];
    }

    protected override prepareOutboundBody(_event: string, body: unknown): unknown {
        if (!ProtocolClient.isDeferredEnvelope(body)) return body;
        const envelope = this.envelope(body.route, body.kind, body.body);
        body.envelope = envelope;
        return envelope;
    }

    private deferEnvelope(route: ProtocolRouteDecision, kind: 'req' | 'push', body: unknown): DeferredProtocolEnvelope {
        return { protocolDeferred: true, route, kind, body };
    }

    private envelope(route: ProtocolRouteDecision, kind: 'req' | 'push', body: unknown): ProtocolRequest {
        const authority = body && typeof body === 'object' ? body as Record<string, unknown> : {};
        const nestedPayload = authority.payload && typeof authority.payload === 'object'
            ? authority.payload as Record<string, unknown> : {};
        const suppliedIdempotencyKey = typeof authority.idempotencyKey === 'string'
            ? authority.idempotencyKey.trim()
            : route.canonicalMsgId === 'room.handoff' && typeof nestedPayload.requestId === 'string'
                ? nestedPayload.requestId.trim() : '';
        const requestId = suppliedIdempotencyKey || ProtocolClient.uuid();
        this.v2Sequence = this.v2Sequence >= Number.MAX_SAFE_INTEGER ? 1 : this.v2Sequence + 1;
        const reconnect = route.canonicalMsgId === 'room.reconnect'
            || route.canonicalMsgId === 'room.handoff';
        const roomDispatch = route.canonicalMsgId === 'common.room.dispatch';
        const canonicalPokerDispatch = isCanonicalPokerDispatch(route.canonicalMsgId);
        const canonicalMahjongDispatch = /^mahjong\.[a-z0-9]+\.dispatch$/.test(route.canonicalMsgId)
            && registeredDefinitions[route.canonicalMsgId] !== undefined;
        const directRoomRequest = (route.canonicalMsgId.startsWith('common.room.')
            && route.canonicalMsgId.endsWith('_req'))
            || route.canonicalMsgId === 'room.reconnect'
            || route.canonicalMsgId === 'room.handoff';
        const nonRoomDispatch = route.canonicalMsgId === 'account.session_dispatch'
            || route.canonicalMsgId === 'hall.dispatch' || route.canonicalMsgId === 'club.dispatch';
        const authoritative = reconnect || directRoomRequest
            || (route.canonicalMsgId.endsWith('.dispatch') && !nonRoomDispatch);
        const roomId = this.authoritativeRoomId(authority);
        const playVersion = String(authority.playVersion ?? this.roomAuthority?.playVersion ?? '').trim();
        if (authoritative) {
            const roundNo = Number(authority.roundNo ?? 0);
            if (!roomId) throw new Error('权威请求缺少 roomId');
            if (!playVersion) throw new Error('权威请求缺少 playVersion');
            if (!Number.isSafeInteger(roundNo) || roundNo < 0) throw new Error('权威请求 roundNo 无效');
        }
        return {
            protocolVersion: '2.0', msgId: route.canonicalMsgId,
            kind, requestId, seq: this.v2Sequence, timestamp: Date.now(), traceId: requestId,
            roomId: authoritative ? roomId : undefined,
            roundNo: authoritative ? Number(authority.roundNo ?? 0) : undefined,
            playVersion: authoritative ? playVersion : undefined,
            body: directRoomRequest ? authority
                : roomDispatch ? { command: String(authority.action ?? ''), ...authority }
                : canonicalPokerDispatch || canonicalMahjongDispatch ? authority
                : { action: route.legacyEvent, payload: body ?? {} },
        };
    }

    protected override requestSequence(_event: string, body: unknown): number | null {
        const seq = Number((body as { seq?: unknown } | null)?.seq);
        return Number.isSafeInteger(seq) && seq > 0 ? seq : null;
    }

    protected override encodeWire(_event: string, body: unknown, _sequence: number, _notify: boolean): string {
        return JSON.stringify(body);
    }

    private authoritativeRoomId(authority: Record<string, unknown>): string {
        return ProtocolClient.positiveId(authority.roomId)
            ?? ProtocolClient.positiveId(authority.roomID)
            ?? this.roomAuthority?.roomId
            ?? '';
    }

    private correlatedRoomId(body: unknown): string | undefined {
        const authority = body && typeof body === 'object' ? body as Record<string, unknown> : {};
        return ProtocolClient.positiveId(authority.roomId)
            ?? ProtocolClient.positiveId(authority.roomID)
            ?? this.roomAuthority?.roomId;
    }

    protected override decodeWire(data: string | ArrayBuffer): LegacyIncomingPacket {
        const text = typeof data === 'string' ? data : new TextDecoder().decode(data);
        const envelope = JSON.parse(text) as { kind?: unknown; seq?: unknown; code?: unknown };
        const sequence = Number(envelope.seq ?? 0);
        const kind = envelope.kind;
        if ((kind !== 'resp' && kind !== 'push') || !Number.isSafeInteger(sequence) || sequence < 0) {
            throw new Error('V2 WebSocket envelope invalid');
        }
        return { event: kind === 'push' ? 'protocol.v2.push' : 'protocol.v2.dispatch',
            sequence, errorCode: 0, body: envelope };
    }

    private static uuid(): string {
        return globalThis.crypto?.randomUUID?.()
            ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    }

    private static isDeferredEnvelope(body: unknown): body is DeferredProtocolEnvelope {
        return Boolean(body && typeof body === 'object' && (body as { protocolDeferred?: unknown }).protocolDeferred === true);
    }

    private static positiveId(value: unknown): string | undefined {
        const text = String(value ?? '').trim();
        return /^[1-9]\d*$/.test(text) ? text : undefined;
    }

    private static isRoomPush(action: string): boolean {
        return action.startsWith('common.room.')
            || registeredPokerMessageIds.has(action)
            || action.startsWith('mahjong.') || action.startsWith('longcard.') || action.startsWith('wordcard.');
    }

    private static canonicalize(event: string): string {
        if (event === 'gateway.heartbeat') return event;
        if (event === 'system.heartbeat' || event === 'system.kick_out') return event;
        if (event === 'room.reconnect') return 'room.reconnect';
        if (event === 'room.handoff') return 'room.handoff';
        // Social pushes are independent room events. Keeping their exact names
        // prevents quick text, voice and magic-expression listeners from sharing
        // the generic dispatch bucket and consuming one another's payloads.
        if (event === 'room.quick_text' || event === 'room.magic_expression' || event === 'room.voice') return event;
        if (event === 'common.room.state_push' || /^common\.room\.[a-z0-9_]+_req$/.test(event)) return event;
        if (event === 'common.room.dispatch') return event;
        if (event === 'mahjong.cdxzmj.dispatch') return event;
        if (/^mahjong\.[a-z0-9]+\.(?:dispatch|state_push)$/.test(event)
            && registeredDefinitions[event] !== undefined) return event;
        if (event === 'club.room_templates_changed') return event;
        if (event === 'club.waiting_room_ready') return event;
        if (event === 'account.session_dispatch' || event === 'hall.dispatch' || event === 'club.dispatch') return event;
        if (isCanonicalPokerMessage(event)) return event;
        // These are session-scoped lobby queries despite their inherited names.
        // Keep the list explicit: authority boundaries must never be inferred from
        // a loose `room` substring because creation and current-room discovery run
        // before a room session exists.
        if (event === 'game.C1101GetRoomID'
            || event === 'game.CPlayerSetRoomRecord' || event === 'game.CPlayerPlayBack') return 'hall.dispatch';
        const normalized = event.replace(/^S/, '').replace(/^C/, '');
        const snake = normalized
            .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
            .replace(/[._-]+/g, '_')
            .toLowerCase();
        if (/login|token|account|auth/.test(snake)) return 'account.session_dispatch';
        if (/club|union/.test(snake)) return 'club.dispatch';
        if (/aydss/.test(snake)) return 'longcard.aydss.dispatch';
        if (/aycp/.test(snake)) return 'longcard.aycp.dispatch';
        if (/byzp/.test(snake)) return 'wordcard.byzp.dispatch';
        if (/(?:^|_)bzp(?:_|$)/.test(snake)) return 'wordcard.bzp.dispatch';
        if (/ycsdr/.test(snake)) return 'wordcard.ycsdr.dispatch';
        if (/yzchz/.test(snake)) return 'wordcard.yzchz.dispatch';
        if (/(?:^|_)pdk(?:_|$)/.test(snake)) return 'poker.pdk.dispatch';
        if (/cdxzmj|xuezhan/.test(snake)) return 'mahjong.xuezhan.dispatch';
        if (/^room[._]/i.test(event)) return 'common.room.dispatch';
        return 'hall.dispatch';
    }

    private static stageOf(msgId: string): ProtocolStage {
        if (msgId === 'gateway.heartbeat') return 'M2';
        if (msgId === 'room.reconnect' || msgId === 'room.handoff') return 'M8';
        if (msgId.startsWith('account.')) return 'M1';
        if (msgId.startsWith('hall.')) return 'M2';
        if (msgId.startsWith('club.')) return 'M3';
        if (msgId.startsWith('common.room.')) return 'M4';
        const pokerRegion = canonicalPokerRegion(msgId);
        if (pokerRegion) {
            const definition = registeredDefinitions[msgId] ?? registeredDefinitions[`${pokerRegion}.dispatch`];
            if (definition) return definition.stage;
        }
        const registeredMessage = registeredDefinitions[msgId];
        if (registeredMessage) return registeredMessage.stage;
        if (msgId.startsWith('mahjong.xuezhan.') || msgId.startsWith('mahjong.cdxzmj.')) return 'M6';
        if (msgId.startsWith('longcard.')) return 'M7';
        return 'M7';
    }
}

interface ProtocolRequest {
    protocolVersion: '2.0';
    msgId: string;
    kind: 'req' | 'push';
    requestId: string;
    seq: number;
    timestamp: number;
    traceId: string;
    roomId?: string;
    roundNo?: number;
    playVersion?: string;
    body: unknown;
}

interface DeferredProtocolEnvelope {
    protocolDeferred: true;
    route: ProtocolRouteDecision;
    kind: 'req' | 'push';
    body: unknown;
    envelope?: ProtocolRequest;
}

interface ProtocolResponse<T> extends Omit<ProtocolRequest, 'kind' | 'body'> {
    kind: 'resp';
    code?: number;
    message?: string;
    body: T;
}
