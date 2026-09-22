import { ProtocolClient } from '../../../../../../Common/Code/Runtime/network/ProtocolClient';
import {
    CommonPdkRoom,
    CommonPdkRoomManager,
    CommonPdkRoomPosManager,
    CommonPdkRoomSet,
} from './model/index';
import {
    projectCommonPdkAuthoritativeView,
    type CommonPdkAuthoritativeRoomView,
} from './CommonPdkAuthoritativeViewAdapter';
import type { PdkBusinessCode } from '../Regional/PdkBusinessCodes';
import { resolvePdkGameplayCapabilities } from '../Regional/PdkGameplayCapabilities';

export interface CommonPdkRuntimeOptions {
    gameCode: PdkBusinessCode;
    playerId: number;
    /** Disabled by default; a future room mode must inject the authoritative action explicitly. */
    manualStart?: () => Promise<unknown>;
    onRoomReady?: (room: CommonPdkRoom) => void;
    onEvent?: (event: string, body: unknown) => void;
    onMessage?: (message: string) => void;
    onExit?: (reason: string) => void;
    isActualGameScene?: () => boolean;
}

interface LegacyNetManagerFacade {
    RegNetPack(event: string, callback: (body: unknown) => void, target: unknown): void;
    requestV2(
        event: string,
        body: unknown,
        success?: (body: unknown) => void,
        failure?: (error: unknown) => void,
    ): void;
}

const shareDefine = {
    RoomState_Init: 0,
    RoomState_Playing: 1,
    RoomState_End: 2,
    RoomState_Waiting: 3,
    RoomState_WaitingEx: 4,
    RoomStateStringDict: { Init: 0, Playing: 1, End: 2, Waiting: 3, WaitingEx: 4 },
    SetState_Init: 0,
    SetState_Playing: 1,
    SetState_End: 2,
    SetState_Waiting: 3,
    SetState_WaitingEx: 4,
    SetStateStringDict: { Init: 0, Playing: 1, End: 2, Waiting: 3, WaitingEx: 4 },
    isCoinRoom: false,
};

/** Connects the mechanically migrated 2.4.8 room layer to the 3.8 network client. */
export class CommonPdkRuntime {
    private readonly disposers: Array<() => void> = [];
    private readonly roomPos: CommonPdkRoomPosManager;
    private readonly roomSet: CommonPdkRoomSet;
    private readonly room: CommonPdkRoom;
    private readonly manager: CommonPdkRoomManager;
    private sceneType = '';
    private authorityRoomId = 0;
    private authorityStateVersion = -1;
    private authorityStateFingerprint = '';
    private authorityPhase = '';
    private readonly pendingActions = new Map<string, Promise<unknown>>();
    private activeDissolveApplicant = 0;
    private readonly appliedDissolveVotes = new Map<number, boolean>();
    private disposed = false;
    private terminalStateVersion = -1;
    private resumePending: Promise<void> | null = null;
    private roomRestoreRetryTimer = 0;
    private roomRestoreAttempt = 0;
    private authorityReconcilePending: Promise<void> | null = null;
    private authorityReconcileTimer = 0;
    /** Client intent identity; authority operationId identifies a turn, not one click. */
    private actionAttemptSequence = 0;

    public constructor(
        private readonly client: ProtocolClient,
        private readonly options: CommonPdkRuntimeOptions,
    ) {
        let roomPos!: CommonPdkRoomPosManager;
        let roomSet!: CommonPdkRoomSet;
        let room!: CommonPdkRoom;
        const netManager: LegacyNetManagerFacade = {
            RegNetPack: (event, callback, target) => {
                this.disposers.push(this.client.on(event, (body) => callback.call(target, body)));
            },
            requestV2: (event, body, success, failure) => {
                void this.request<unknown>(event, body).then(
                    (packet) => success?.(this.unwrapDispatchPayload(packet)),
                    (error) => failure?.(error),
                );
            },
        };
        const heroManager = {
            GetHeroID: () => this.options.playerId,
            GetHeroProperty: (property: string) => property === 'pid' ? this.options.playerId : undefined,
        };
        const sceneManager = {
            GetSceneType: () => this.sceneType,
            LoadScene: (name: string) => {
                this.sceneType = name;
                if (name === 'pdkScene') this.options.onRoomReady?.(room);
            },
        };
        const formManager = {
            ShowForm: (name: string) => {
                if (name === 'pdk/PDK_CommonRoom') this.options.onRoomReady?.(room);
            },
            CloseForm: () => undefined,
        };
        const runtimeClient = {
            OnEvent: (event: string, body: unknown) => this.options.onEvent?.(event, body),
            ExitGame: () => this.options.onExit?.('room-not-found'),
        };
        const context: Record<string, unknown> = {
            // Migrated model accessors are keyed by the shared runtime namespace;
            // the immutable business identity travels separately in the v2 envelope.
            subGameName: 'pdk',
            businessGameCode: this.options.gameCode,
            __isActualGameScene: () => this.options.isActualGameScene?.() ?? false,
            pdk_ComTool: () => ({}),
            pdk_ShareDefine: () => shareDefine,
            pdk_NetManager: () => netManager,
            pdk_SysNotifyManager: () => ({
                ShowSysMsg: (message: string) => this.options.onMessage?.(message),
            }),
            pdk_HeroManager: () => heroManager,
            pdk_WeChatManager: () => ({
                InitHeroHeadImageByDict: () => undefined,
                InitHeroHeadImage: () => undefined,
            }),
            pdk_SysDataManager: () => ({ GetTableDict: () => ({}) }),
            pdk_SceneManager: () => sceneManager,
            pdk_FormManager: () => formManager,
            pdkClient: runtimeClient,
            PDKRoomPosMgr: () => roomPos,
            PDKRoomSet: () => roomSet,
            PDKRoom: () => room,
            CommonPdkRoomPosMgr: () => roomPos,
            CommonPdkRoomSet: () => roomSet,
            CommonPdkRoom: () => room,
        };
        roomPos = new CommonPdkRoomPosManager(context);
        roomSet = new CommonPdkRoomSet(context);
        room = new CommonPdkRoom(context);
        this.roomPos = roomPos;
        this.roomSet = roomSet;
        this.room = room;
        this.manager = new CommonPdkRoomManager(context);
        this.registerCommonRoomEvents();
        this.disposers.push(this.client.on('common.room.state_push', (packet) => {
            try {
                this.applyAuthoritativePacket(packet, false);
            } catch (error: unknown) {
                this.options.onMessage?.(error instanceof Error ? error.message : '房间状态同步失败');
            }
        }));
        this.disposers.push(this.client.on(`poker.${this.options.gameCode}.state_push`, (packet) => {
            try {
                this.applyAuthoritativePacket(packet, false);
            } catch (error: unknown) {
                this.options.onMessage?.(error instanceof Error ? error.message : '房间状态同步失败');
            }
        }));
        this.disposers.push(this.client.on('common.room.auto_dissolved', (packet) => {
            const body = packet && typeof packet === 'object' ? packet as Record<string, unknown> : {};
            this.options.onMessage?.(String(body.message ?? '房间超过300秒未开始，已自动解散'));
            this.options.onExit?.('waiting-room-expired');
        }));
        this.disposers.push(this.client.onReconnect(() => this.restoreRoomAfterReconnect()));
        // Mutation responses and room pushes both carry the complete viewer-specific authority
        // view. Reconciliation is reserved for reconnect/resume; polling after every packet used
        // to turn one play into another state request and a room-wide duplicate broadcast.
        const resume = (): void => {
            if (globalThis.document?.visibilityState === 'hidden') return;
            void this.restoreRoomAfterReconnect();
        };
        globalThis.addEventListener?.('pageshow', resume);
        globalThis.document?.addEventListener?.('visibilitychange', resume);
        this.disposers.push(() => globalThis.removeEventListener?.('pageshow', resume));
        this.disposers.push(() => globalThis.document?.removeEventListener?.('visibilitychange', resume));
    }

    public async enterRoom(roomId: number): Promise<CommonPdkRoom> {
        if (!Number.isSafeInteger(roomId) || roomId <= 0) throw new Error('CommonPdk 房间ID无效');
        const packet = await this.client.request<unknown>('common.room.state_req', { roomID: roomId });
        this.applyAuthoritativePacket(packet, true);
        if (Number(this.manager.GetEnterRoomID()) !== roomId) {
            throw new Error('CommonPdk 完整房间信息未初始化');
        }
        return this.room;
    }

    public getRoom(): CommonPdkRoom {
        return this.room;
    }

    public getPlayerId(): number {
        return this.options.playerId;
    }

    public getRoomManager(): CommonPdkRoomManager {
        return this.manager;
    }

    public getRoomPosManager(): CommonPdkRoomPosManager {
        return this.roomPos;
    }

    public getRoomSet(): CommonPdkRoomSet {
        return this.roomSet;
    }

    public getGameCode(): PdkBusinessCode {
        return this.options.gameCode;
    }

    public arrangementEnabled(): boolean {
        if (resolvePdkGameplayCapabilities(this.options.gameCode).arrangementMode !== 'enabled') return false;
        const ruleOptions = this.room.GetRoomConfig()?.ruleOptions;
        if (!ruleOptions || typeof ruleOptions !== 'object') {
            throw new Error('CommonPdk 权威 ruleOptions 缺失');
        }
        const visibility = String(ruleOptions.playedCardVisibility ?? '');
        if (visibility !== 'LAST_ONLY' && visibility !== 'ALL_IN_ORDER') {
            throw new Error('CommonPdk 权威 playedCardVisibility 无效');
        }
        return visibility === 'ALL_IN_ORDER';
    }

    public currentPlayArrowEnabled(): boolean {
        return resolvePdkGameplayCapabilities(this.options.gameCode).currentPlayArrow === 'enabled';
    }

    public supportsManualStart(): boolean {
        return typeof this.options.manualStart === 'function';
    }

    public manualStart(): Promise<unknown> {
        return this.options.manualStart?.() ?? Promise.reject(new Error('当前玩法不支持手动开始'));
    }

    public request<T = unknown>(event: string, body: unknown): Promise<T> {
        if (event === 'common.room.continue_req') {
            const phase = String(this.roomSet.GetRoomSetProperty('authorityPhase') ?? '').toUpperCase();
            if (phase.length > 0 && phase !== 'FINISHED') {
                console.info('[CommonPdkContinueSuppressed]', { phase, reason: 'round-in-progress' });
                return Promise.resolve(undefined as T);
            }
        }
        const source = body && typeof body === 'object' && !Array.isArray(body)
            ? body as Record<string, unknown> : {};
        const currentRound = Number(this.roomSet.GetRoomSetProperty('roundNo')
            ?? this.room.GetRoomProperty('setID') ?? 0);
        const protocolSetId = Number.isSafeInteger(currentRound) && currentRound > 0 ? currentRound - 1 : 0;
        const authorityBody = {
            ...source,
            roundNo: source.roundNo ?? protocolSetId,
            playVersion: source.playVersion ?? this.room.GetRoomConfigByProperty('playVersion'),
        };
        const dispatchEvent = `poker.${this.options.gameCode}.dispatch`;
        if (event === 'common.room.dispatch') {
            const command = String(source.command ?? '').trim();
            if (!command) return Promise.reject(new Error('公共房间请求缺少 command'));
            return this.client.request<unknown>(event, { ...authorityBody, action: command })
                .then((packet) => this.unwrapDispatchPayload(packet) as T);
        }
        const dispatchBody = event === dispatchEvent ? authorityBody : {
            roundNo: authorityBody.roundNo,
            playVersion: authorityBody.playVersion,
            action: event,
            payload: source,
            ...(typeof source.idempotencyKey === 'string'
                ? { idempotencyKey: source.idempotencyKey } : {}),
        };
        return this.client.request<unknown>(dispatchEvent, dispatchBody)
            .then((packet) => {
                // A successful play response already contains the committed
                // authoritative room view. Apply it before resolving the user
                // action; otherwise controls keep rendering the previous turn
                // until a later WebSocket push happens to arrive.
                if (event === 'common.room.play_req') this.applyAuthoritativePacket(packet, false);
                return this.unwrapDispatchPayload(packet) as T;
            });
    }

    /** One in-flight request per user action; a rejected request is always released for retry. */
    public action<T = unknown>(key: string, event: string, body: unknown): Promise<T> {
        if (this.disposed) return Promise.reject(new Error('房间会话已结束'));
        const pending = this.pendingActions.get(key);
        if (pending) return pending as Promise<T>;
        const requestBody = this.withActionIdempotency(body);
        console.info('[CommonPdkActionIntent]', {
            roomId: this.authorityRoomId,
            playerId: this.options.playerId,
            actionKey: key,
            event,
            operationId: String((body as Record<string, unknown> | null)?.operationId ?? ''),
            idempotencyKey: String(requestBody.idempotencyKey),
        });
        const request = this.request<T>(event, requestBody).finally(() => {
            if (this.pendingActions.get(key) === request) this.pendingActions.delete(key);
        });
        this.pendingActions.set(key, request);
        return request;
    }

    /**
     * Allocate one identity per user intent. StableTransportFacade keeps this key
     * unchanged only when replaying that same intent after a connection switch;
     * a later click always receives a new key even inside the same authority turn.
     */
    private withActionIdempotency(body: unknown): Record<string, unknown> {
        const source = body && typeof body === 'object' && !Array.isArray(body)
            ? body as Record<string, unknown> : {};
        const explicit = typeof source.idempotencyKey === 'string' ? source.idempotencyKey.trim() : '';
        if (explicit) return source;
        this.actionAttemptSequence = this.actionAttemptSequence >= Number.MAX_SAFE_INTEGER
            ? 1 : this.actionAttemptSequence + 1;
        const randomUuid = globalThis.crypto?.randomUUID?.();
        const nonce = randomUuid || `${Date.now().toString(36)}-${this.actionAttemptSequence.toString(36)}`;
        return {
            ...source,
            idempotencyKey: `pdk:${this.authorityRoomId}:${this.options.playerId}:${nonce}`.slice(0, 128),
        };
    }

    public reconcileAuthority(): void {
        this.scheduleAuthorityReconcile();
    }

    /** Consumes the authoritative terminal marker returned to the final dissolve voter. */
    public acceptDissolveVoteResult(result: unknown): boolean {
        if (this.disposed || !result || typeof result !== 'object' || Array.isArray(result)) return false;
        const body = result as Record<string, unknown>;
        const phase = String(body.phase ?? '').toUpperCase();
        if (body.roomTerminal !== true && body.dissolved !== true && phase !== 'DISSOLVED') return false;
        const stateVersion = Number(body.stateVersion ?? this.authorityStateVersion + 1);
        this.options.onEvent?.('CommonPdk_DissolveRoom', {
            roomId: Number(body.roomId ?? this.authorityRoomId),
            operationId: String(body.operationId ?? ''),
            stateVersion: Number.isSafeInteger(stateVersion) ? stateVersion : this.authorityStateVersion + 1,
            reason: String(body.roomTerminalReason ?? body.dissolveReason ?? 'ROOM_DISSOLVED'),
        });
        return true;
    }

    public competeDealer(compete: boolean): Promise<unknown> {
        return this.action(`competeDealer:${compete}`, `poker.${this.options.gameCode}.dispatch`, {
            action: 'robDealer',
            payload: { compete },
        });
    }

    public on(event: string, listener: (body: unknown) => void): () => void {
        return this.client.on(event, listener);
    }

    public destroy(): void {
        if (this.disposed) return;
        this.disposed = true;
        if (this.authorityReconcileTimer) globalThis.clearTimeout(this.authorityReconcileTimer);
        this.authorityReconcileTimer = 0;
        if (this.roomRestoreRetryTimer) globalThis.clearTimeout(this.roomRestoreRetryTimer);
        this.roomRestoreRetryTimer = 0;
        for (const dispose of this.disposers.splice(0)) dispose();
        this.manager.OnReload();
        this.pendingActions.clear();
    }

    private registerCommonRoomEvents(): void {
        const emit = (event: string, body: unknown) => this.options.onEvent?.(event, body);
        const listen = (packet: string, handler: (body: any) => void) => {
            this.disposers.push(this.client.on(packet, handler));
        };
        listen('CommonPdk_PosContinueGame', (body) => {
            this.room.OnPosContinueGame(body.pos);
            emit('CommonPdk_PosContinueGame', body);
        });
        listen('CommonPdk_PosReadyChg', (body) => {
            if (this.roomPos.OnPosReadyChg(body.pos, body.isReady)) emit('CommonPdk_PosReadyChg', body);
        });
        listen('CommonPdk_PosUpdate', (body) => {
            if (this.roomPos.OnPosUpdate(body.pos, body.posInfo)) emit('CommonPdk_PosUpdate', body);
        });
        listen('CommonPdk_PosLeave', (body) => {
            const clientPos = this.roomPos.GetClientPos();
            this.room.OnPosLeave(body.pos);
            if (Number(body.ownerID) > 0) this.room.UpdateOwnerID(body.ownerID);
            emit('CommonPdk_PosLeave', body);
            if (Number(body.pos) === Number(clientPos) && !body.beKick) this.options.onExit?.('authority-left');
        });
        listen('CommonPdk_Dissolve', (body) => emit('CommonPdk_DissolveRoom', body));
        listen('CommonPdk_StartVoteDissolve', (body) => {
            emit('CommonPdk_StartVoteDissolve', this.room.OnStartVoteDissolve(body.createPos, body.endSec));
        });
        listen('CommonPdk_PosDealVote', (body) => emit('PosDealVote', this.room.OnPosDealVote(body.pos, body.agreeDissolve)));
        listen('CommonPdk_LostConnect', (body) => {
            const players = this.roomPos.GetRoomAllPlayerInfo();
            for (const key of Object.keys(players)) {
                if (Number(players[key]?.pid) === Number(body.pid)) {
                    this.roomPos.SetPlayerOfflineState(key, body.isLostConnect, body.isShowLeave);
                    break;
                }
            }
            emit('PlayerOffline', body);
        });
        listen('CommonPdk_Trusteeship', (body) => {
            const players = this.roomPos.GetRoomAllPlayerInfo();
            const player = players[body.pos];
            if (player && (!body.pid || Number(player.pid) === Number(body.pid))) player.trusteeship = Boolean(body.trusteeship);
            emit('SPlayer_Trusteeship', body);
        });
        listen('CommonPdk_SendGift', (body) => emit('GameGift', body));
        listen('room.quick_text', (body) => emit('RoomQuickText', body));
        listen('room.voice', (body) => emit('RoomVoice', body));
        listen('room.magic_expression', (body) => emit('RoomMagicExpression', body));
    }

    private async restoreRoomAfterReconnect(): Promise<void> {
        if (this.disposed) return;
        if (this.resumePending) return this.resumePending;
        const pending = this.restoreRoomSnapshot();
        this.resumePending = pending;
        try { await pending; } finally { if (this.resumePending === pending) this.resumePending = null; }
    }

    private scheduleAuthorityReconcile(): void {
        if (this.disposed || this.authorityRoomId <= 0 || this.authorityReconcilePending || this.authorityReconcileTimer) return;
        this.authorityReconcileTimer = globalThis.setTimeout(() => {
            this.authorityReconcileTimer = 0;
            if (this.disposed || this.authorityRoomId <= 0 || this.authorityReconcilePending) return;
            const pending = this.reconcileAuthoritativeState();
            this.authorityReconcilePending = pending;
            void pending.finally(() => {
                if (this.authorityReconcilePending === pending) this.authorityReconcilePending = null;
            });
        }, 40);
    }

    private async reconcileAuthoritativeState(): Promise<void> {
        const roomId = this.authorityRoomId;
        try {
            const packet = await this.client.request('common.room.state_req', { roomID: roomId });
            if (this.disposed || roomId !== this.authorityRoomId) return;
            this.applyAuthoritativePacket(packet, false);
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : String(error ?? '');
            const dissolve = this.room.GetRoomProperty('dissolve');
            const terminalRoom = /room (?:is )?dissolved|room (?:not found|does not exist)|room authority is not active|room route not found|request_not_found|\b3001\b/i.test(message);
            const revokedMember = /authentication required|player (?:is )?not (?:a room member|seated)|\b1002\b/i.test(message);
            if (!this.disposed && (terminalRoom || (dissolve && typeof dissolve === 'object' && revokedMember))) {
                // 2.2.2 used the server's Dissolve broadcast as the sole terminal
                // boundary. Protocol V2 may remove the room before the final push is
                // delivered. A definitive room terminal response remains authoritative
                // even after the local ballot payload has been cleared by an earlier ack.
                this.options.onEvent?.('CommonPdk_DissolveRoom', {
                    roomId,
                    stateVersion: this.authorityStateVersion + 1,
                    reason: terminalRoom ? 'ROOM_DISSOLVED' : 'ROOM_AUTHORITY_REVOKED',
                });
                return;
            }
            // A failed opportunistic reconciliation must not eject a player. The normal
            // reconnect path remains responsible for visible connection failures.
            if (!this.disposed) console.warn('[CommonPdkRuntime] 权威状态对账失败', error);
        }
    }

    private async restoreRoomSnapshot(): Promise<void> {
        const roomId = Number(this.manager.GetEnterRoomID());
        if (!Number.isSafeInteger(roomId) || roomId <= 0) return;
        try {
            const packet = await this.client.request('common.room.state_req', { roomID: roomId });
            if (this.disposed) return;
            this.applyAuthoritativePacket(packet, true);
            if (Number(this.manager.GetEnterRoomID()) !== roomId) throw new Error('重连房间信息不一致');
            this.roomRestoreAttempt = 0;
            if (this.roomRestoreRetryTimer) globalThis.clearTimeout(this.roomRestoreRetryTimer);
            this.roomRestoreRetryTimer = 0;
            this.options.onEvent?.('CommonPdk_Reconnected', { roomID: roomId });
            this.options.onRoomReady?.(this.room);
        } catch (error: unknown) {
            if (this.disposed) return;
            const message = error instanceof Error ? error.message : String(error ?? '');
            const terminalRoom = /room (?:is )?dissolved|room (?:not found|does not exist)|room authority is not active|room route not found|request_not_found|\b3001\b/i.test(message);
            if (terminalRoom) {
                console.info('[CommonPdkReconnect] authoritative-room-terminal', {
                    roomId,
                    playerId: this.options.playerId,
                    operationId: 'ROOM_SNAPSHOT_RESTORE',
                    stateVersion: this.authorityStateVersion,
                    reason: message,
                });
                this.options.onExit?.('room-not-found');
                return;
            }
            const attempt = ++this.roomRestoreAttempt;
            if (attempt === 1) this.options.onMessage?.('连接恢复失败，正在自动重试');
            if (attempt <= 3 || attempt % 12 === 0) {
                console.warn('[CommonPdkReconnect] transient-restore-failed', {
                    roomId,
                    playerId: this.options.playerId,
                    operationId: 'ROOM_SNAPSHOT_RESTORE',
                    stateVersion: this.authorityStateVersion,
                    attempt,
                    retryDelayMs: Math.min(5_000, 250 * (2 ** Math.min(attempt - 1, 5))),
                    error: message,
                });
            }
            if (this.roomRestoreRetryTimer) return;
            const retryDelayMs = Math.min(5_000, 250 * (2 ** Math.min(attempt - 1, 5)));
            this.roomRestoreRetryTimer = globalThis.setTimeout(() => {
                this.roomRestoreRetryTimer = 0;
                void this.restoreRoomAfterReconnect();
            }, retryDelayMs);
        }
    }

    private unwrapDispatchPayload(packet: unknown): unknown {
        if (!packet || typeof packet !== 'object' || !('payload' in packet)) return packet;
        return (packet as { payload: unknown }).payload;
    }

    private applyAuthoritativePacket(packet: unknown, force: boolean): void {
        if (this.disposed) return;
        const { view, snapshot } = projectCommonPdkAuthoritativeView(packet, this.options.playerId);
        const deadlineForFingerprint = view.operationDeadline && typeof view.operationDeadline === 'object'
            ? view.operationDeadline as Record<string, unknown> : {};
        const latestActionForFingerprint = view.tableLastOperation;
        const latestActionRecord = latestActionForFingerprint && typeof latestActionForFingerprint === 'object'
            ? latestActionForFingerprint as Record<string, unknown> : {};
        const seatFingerprint = Object.entries(view.seats ?? {})
            .sort(([left], [right]) => Number(left) - Number(right))
            .map(([seatId, value]) => {
                const seat = value && typeof value === 'object' ? value as Record<string, unknown> : {};
                return [seatId, Number(seat.playerId ?? 0), Boolean(seat.ready), Boolean(seat.offline), Boolean(seat.hosting)].join(':');
            })
            .join(',');
        const stateFingerprint = [
            view.phase,
            view.currentSeat,
            Number(view.trickId ?? 0),
            String(view.operationId || deadlineForFingerprint.operationId || latestActionRecord.operationId || ''),
            Array.isArray(view.tableOperations) ? view.tableOperations.length : 0,
            seatFingerprint,
        ].join('|');
        if (!force && view.roomId === this.authorityRoomId) {
            if (view.stateVersion < this.authorityStateVersion) return;
            // The common and game-specific push channels can legally deliver two
            // projections with the same committed version. Drop only an identical
            // projection; otherwise the second packet may contain the new turn seat
            // and operation id that the first envelope did not carry.
            if (view.stateVersion === this.authorityStateVersion
                && stateFingerprint === this.authorityStateFingerprint) return;
        }
        const firstView = Number(this.manager.GetEnterRoomID()) !== view.roomId;
        if (firstView) this.manager.OnPack_GetRoomInfo(snapshot);
        else this.room.OnInitRoomData(snapshot);
        const previousPhase = this.authorityPhase;
        this.authorityRoomId = view.roomId;
        this.authorityStateVersion = view.stateVersion;
        this.authorityStateFingerprint = stateFingerprint;
        this.authorityPhase = view.phase;
        const deadline = view.operationDeadline && typeof view.operationDeadline === 'object'
            ? view.operationDeadline as Record<string, unknown> : {};
        const lastActionValue = view.tableLastOperation;
        const lastAction = lastActionValue && typeof lastActionValue === 'object'
            ? lastActionValue as Record<string, unknown> : {};
        const authorityOperationId = String(view.operationId || deadline.operationId || lastAction.operationId || '');
        console.info('[CommonRoomState]', {
            roomId: view.roomId,
            stateVersion: view.stateVersion,
            serverSeq: Number(view.serverSeq ?? 0),
            phase: view.phase, // Settlement recovery diagnostics are part of the authoritative envelope.
            operationId: authorityOperationId,
            turnSeat: view.currentSeat,
            trickId: Number(view.trickId ?? 0),
            tableOperationCount: Array.isArray(view.tableOperations) ? view.tableOperations.length : 0,
        });
        const liveDealBoundary = previousPhase !== view.phase
            && (Boolean(previousPhase) || !force)
            && (view.phase === 'PLAYING' || view.phase === 'COMPETE_DEALER');
        this.options.onEvent?.('CommonPdk_AuthoritativeState', {
            ...view,
            staticRestore: force,
            dealBoundary: liveDealBoundary,
        });
        if (Boolean(view.dissolved)) {
            if (this.terminalStateVersion >= 0 && view.stateVersion <= this.terminalStateVersion) return;
            this.terminalStateVersion = view.stateVersion;
            this.activeDissolveApplicant = 0;
            this.appliedDissolveVotes.clear();
            this.options.onEvent?.('CommonPdk_DissolveRoom', {
                roomId: view.roomId,
                operationId: authorityOperationId,
                stateVersion: view.stateVersion,
                reason: String(view.dissolveReason ?? 'ROOM_DISSOLVED'),
                ownnerForce: String(view.dissolveReason ?? '').includes('OWNER'),
            });
            return;
        }
        this.applyDissolveVote(view);
        const settlementPhase = ['FINISHED', 'ROUND_SETTLEMENT', 'INTER_ROUND', 'SETTLED'].includes(view.phase);
        if (settlementPhase && (force || !previousPhase || previousPhase !== view.phase)) {
            const rawSetEnd = this.roomSet.GetRoomSetProperty('setEnd') ?? {};
            const setEnd = {
                ...rawSetEnd,
                roomId: view.roomId,
                roundNo: view.roundNo,
                shuffleSequence: view.shuffleSequence,
                stateVersion: view.stateVersion,
                operationId: authorityOperationId,
                authorityPhase: view.phase,
                staticRestore: force,
            };
            console.info('[CommonRoomSetEnd]', {
                roomId: view.roomId, stateVersion: view.stateVersion,
                operationId: authorityOperationId, phase: view.phase,
                staticRestore: force, matchFinished: Boolean(setEnd.matchFinished),
            });
            this.options.onEvent?.('CommonPdkSetEnd', setEnd);
            const setInfo = (snapshot as Record<string, unknown>).set as Record<string, unknown> | undefined;
            if (Boolean(setInfo?.matchFinished)) {
                const roomEnd = { roomId: view.roomId, ...setEnd };
                this.room.OnRoomEnd(roomEnd);
                this.options.onEvent?.('RoomEnd', roomEnd);
            }
        }
        // A live create/join response may already be the first PLAYING snapshot.
        // It has no previous phase, but it is still the authoritative deal
        // boundary and must drive the shared deal animation once. A forced
        // restore is a static projection and must never replay that animation.
        if (previousPhase !== view.phase && (Boolean(previousPhase) || !force)) {
            this.options.onEvent?.('CommonPdk_AuthoritativePhaseChanged', {
                roomId: view.roomId,
                from: previousPhase,
                to: view.phase,
                stateVersion: view.stateVersion,
                staticRestore: force,
            });
        }
    }

    private applyDissolveVote(view: CommonPdkAuthoritativeRoomView): void {
        const raw = view.dissolveVote;
        if (!raw || typeof raw !== 'object' || Array.isArray(raw) || !Number.isSafeInteger(Number(raw.applicantId))) {
            if (this.activeDissolveApplicant > 0) this.room.ClearDissolve();
            this.activeDissolveApplicant = 0;
            this.appliedDissolveVotes.clear();
            return;
        }
        const applicantId = Number(raw.applicantId);
        const applicantSeat = Object.entries(view.seats).find(([, value]) =>
            Number((value as Record<string, unknown>)?.playerId) === applicantId)?.[0];
        if (applicantSeat === undefined) return;
        const votes = raw.votes && typeof raw.votes === 'object' && !Array.isArray(raw.votes)
            ? raw.votes as Record<string, unknown> : {};
        const rejected = String(view.dissolveReason ?? '') === 'VOTE_REJECTED';
        if (rejected) {
            const rejectedPlayer = Object.entries(votes).find(([, approved]) => !Boolean(approved));
            const rejectedSeat = rejectedPlayer && Object.entries(view.seats).find(([, value]) =>
                Number((value as Record<string, unknown>)?.playerId) === Number(rejectedPlayer[0]))?.[0];
            this.options.onEvent?.('CommonPdk_DissolveVoteRejected', {
                roomId: view.roomId,
                stateVersion: view.stateVersion,
                rejectedSeat: rejectedSeat === undefined ? undefined : Number(rejectedSeat),
            });
            this.activeDissolveApplicant = 0;
            this.appliedDissolveVotes.clear();
            return;
        }
        if (this.activeDissolveApplicant !== applicantId) {
            this.activeDissolveApplicant = applicantId;
            this.appliedDissolveVotes.clear();
            const endSec = Number(raw.deadlineEpochMillis ?? 0) / 1000;
            this.options.onEvent?.('CommonPdk_StartVoteDissolve',
                this.room.OnStartVoteDissolve(Number(applicantSeat), endSec));
        }
        for (const [playerId, approved] of Object.entries(votes)) {
            // Authority only exposes affirmative votes while the ballot is active.
            if (!Boolean(approved)) continue;
            const seat = Object.entries(view.seats).find(([, value]) =>
                Number((value as Record<string, unknown>)?.playerId) === Number(playerId))?.[0];
            if (seat === undefined || this.appliedDissolveVotes.get(Number(seat)) === Boolean(approved)) continue;
            this.appliedDissolveVotes.set(Number(seat), Boolean(approved));
            this.options.onEvent?.('PosDealVote', this.room.OnPosDealVote(Number(seat), Boolean(approved)));
        }
    }
}
