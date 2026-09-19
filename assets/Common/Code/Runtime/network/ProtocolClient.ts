import { LegacyWebSocketClient, sessionLifecycle } from './LegacyWebSocketClient';
import { CausalEventGuard } from '../CompatibilityApp/core/CausalEventGuard';
import { ClientErrorCorrelation } from './ClientErrorCorrelation';
import { requireCanonicalWebSocketUrl } from './GatewayEntryPolicy';
import { resolvePageInstanceId } from '../config/RuntimeEndpoints';
import type { LegacyIncomingPacket } from './LegacyPacketCodec';
import { RoomPushGate } from '../state/RoomPushGate';

export type ProtocolStage = 'M1' | 'M2' | 'M3' | 'M4' | 'M5' | 'M6' | 'M7' | 'M8';
export type ProtocolWireMode = 'v2';

// Canonical Poker identities are admitted explicitly. Unknown names must not
// become authoritative room traffic merely because they share a `poker.` prefix.
const CANONICAL_POKER_RUNTIME = '(?:CD201|NJ201|LS201|CD299|CN298|CN297)';
const CANONICAL_POKER_MESSAGE = new RegExp(`^poker\\.${CANONICAL_POKER_RUNTIME}\\.(?:dispatch|state_push)$`);
const CANONICAL_POKER_DISPATCH = new RegExp(`^poker\\.${CANONICAL_POKER_RUNTIME}\\.dispatch$`);
const CANONICAL_POKER_STAGE = new RegExp(`^poker\\.(?:${CANONICAL_POKER_RUNTIME}|pdk)\\.`);

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

/**
 * The only network client business modules may depend on.
 * Business traffic is V2-only; the inherited packet transport is an isolated framing adapter.
 */
export class ProtocolClient extends LegacyWebSocketClient {
    private readonly routeListeners = new Set<(route: ProtocolRouteDecision) => void>();
    private readonly v2PushListeners = new Map<string, Set<(body: unknown) => void>>();
    private pushBridgeDisposer: (() => void) | null = null;
    private v2Sequence = 0;
    private wsTicket = '';
    private roomAuthority: Readonly<{ roomId: string; playVersion: string }> | null = null;
    private readonly roomPushGate = new RoomPushGate();
    private readonly causalGuard = new CausalEventGuard();

    public setWsTicket(ticket: string): void { this.wsTicket = ticket; }

    public override async connect(url: string, timeoutMs = 5000): Promise<void> {
        await super.connect(url, timeoutMs);
        // LegacyWebSocketClient.connect starts by calling the polymorphic close().
        // ProtocolClient.close deliberately clears push gating state, so restore
        // the already selected room authority only after the new socket is live.
        // Without this, raw room pushes reach the browser but are rejected before
        // every gameplay listener on the first connection and after reconnect.
        const authority = this.roomAuthority;
        if (authority) this.roomPushGate.bind(authority.roomId, authority.playVersion);
    }

    public bindRoomAuthority(roomId: number | string, playVersion: string): void {
        const normalizedRoomId = String(roomId).trim();
        const normalizedVersion = playVersion.trim();
        if (!/^[1-9]\d*$/.test(normalizedRoomId)) throw new Error('房间权威上下文 roomId 无效');
        if (!normalizedVersion) throw new Error('房间权威上下文 playVersion 无效');
        this.roomAuthority = Object.freeze({ roomId: normalizedRoomId, playVersion: normalizedVersion });
        this.roomPushGate.bind(normalizedRoomId, normalizedVersion);
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
            throw new Error('旧 pdk 写协议已停用；跑得快请求必须携带 CD201、NJ201 或 LS201 地区业务编码');
        }
        this.publishRoute(route);
        const outbound = this.deferEnvelope(route, 'req', body);
        return send('protocol.v2.dispatch', outbound, timeoutMs).then((response) => {
            const envelope = outbound.envelope;
            if (!envelope) throw new Error('V2 协议请求未发送');
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
                throw new Error('V2 协议响应不匹配');
            }
            if ((response.code ?? 0) !== 0) throw new Error(`${response.code}: ${response.message ?? '请求失败'}`);
            if (route.canonicalMsgId === 'common.room.hint_req') {
                const value = response.body && typeof response.body === 'object'
                    ? response.body as Record<string, unknown> : {};
                console.info('[CommonRoomHint]', {
                    requestId: envelope.requestId,
                    roomId: Number(value.roomId ?? this.correlatedRoomId(body) ?? 0),
                    stateVersion: Number(value.stateVersion ?? -1),
                    operationId: String(value.operationId ?? ''),
                    turnSeat: Number(value.turnSeat ?? -1),
                    canPass: value.canPass === true,
                    hintCount: Array.isArray(value.hints) ? value.hints.length : 0,
                });
            }
            return response.body;
        }).catch((error: unknown) => {
            const roomId = this.correlatedRoomId(body);
            const envelope = outbound.envelope;
            throw ClientErrorCorrelation.enrich(error, {
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
        const directRoomState = envelope.msgId === 'common.room.state_push'
            || /^poker\.[A-Z0-9]+\.state_push$/.test(envelope.msgId);
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
        const listeners = this.v2PushListeners.get(canonicalAction);
        if (!listeners) return;
        const payload = directRoomEvent ? envelope.body : wrapper.payload;
        // State snapshots are version-gated. Ephemeral room events are already scoped by the
        // authenticated room WebSocket and intentionally do not carry a full room snapshot.
        if (directRoomState && ProtocolClient.isRoomPush(canonicalAction)
            && !this.roomPushGate.accepts(payload, envelope)) return;
        const causalId = envelope.requestId;
        this.causalGuard.dispatch('network', causalId, () => {
            for (const listener of listeners) listener(payload);
        });
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
        const suppliedIdempotencyKey = typeof authority.idempotencyKey === 'string'
            ? authority.idempotencyKey.trim() : '';
        const requestId = suppliedIdempotencyKey || ProtocolClient.uuid();
        this.v2Sequence = this.v2Sequence >= Number.MAX_SAFE_INTEGER ? 1 : this.v2Sequence + 1;
        const reconnect = route.canonicalMsgId === 'room.reconnect';
        const roomDispatch = route.canonicalMsgId === 'common.room.dispatch';
        const canonicalPokerDispatch = CANONICAL_POKER_DISPATCH.test(route.canonicalMsgId);
        const directRoomRequest = route.canonicalMsgId.startsWith('common.room.')
            && route.canonicalMsgId.endsWith('_req');
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
                : canonicalPokerDispatch ? authority
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
            || CANONICAL_POKER_MESSAGE.test(action) || /^poker\.pdk\.(?:dispatch|state_push)$/.test(action)
            || action.startsWith('mahjong.') || action.startsWith('longcard.') || action.startsWith('wordcard.');
    }

    private static canonicalize(event: string): string {
        if (event === 'gateway.heartbeat') return event;
        if (event === 'system.heartbeat' || event === 'system.kick_out') return event;
        if (event === 'room.reconnect') return 'room.reconnect';
        // Social pushes are independent room events. Keeping their exact names
        // prevents quick text, voice and magic-expression listeners from sharing
        // the generic dispatch bucket and consuming one another's payloads.
        if (event === 'room.quick_text' || event === 'room.magic_expression' || event === 'room.voice') return event;
        if (event === 'common.room.state_push' || /^common\.room\.[a-z0-9_]+_req$/.test(event)) return event;
        if (event === 'common.room.dispatch') return event;
        if (event === 'club.room_templates_changed') return event;
        if (event === 'club.waiting_room_ready') return event;
        if (event === 'account.session_dispatch' || event === 'hall.dispatch' || event === 'club.dispatch') return event;
        if (CANONICAL_POKER_MESSAGE.test(event)) return event;
        // These are session-scoped lobby queries despite their inherited names.
        // Keep the list explicit: authority boundaries must never be inferred from
        // a loose `room` substring because creation and current-room discovery run
        // before a room session exists.
        if (event === 'game.C1101GetRoomID' || event === 'room.CBaseRoomConfig'
            || event === 'room.CBaseEnterRoom'
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
        if (msgId === 'room.reconnect') return 'M8';
        if (msgId.startsWith('account.')) return 'M1';
        if (msgId.startsWith('hall.')) return 'M2';
        if (msgId.startsWith('club.')) return 'M3';
        if (msgId.startsWith('common.room.')) return 'M4';
        if (CANONICAL_POKER_STAGE.test(msgId)) return 'M5';
        if (msgId.startsWith('mahjong.xuezhan.')) return 'M6';
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
