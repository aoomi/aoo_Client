import {
    ProductionApiClient,
    ProductionApiError,
    type AccessTokenSource,
    type SessionRefresher,
    type SessionRefreshPolicy,
} from '../../Common/Code/Runtime/Activity/ProductionApiClient';
import { resolveRuntimeEndpoints } from '../../Common/Code/Runtime/config/RuntimeEndpoints';
import { resolvePublishedRoomBundle } from '../../Common/Code/Runtime/navigation/PublishedRoomResourceRoute';

export interface HallPlayFilter {
    regionCode: string; parentRegionCode?: string; regionType: 'ALL' | 'GLOBAL' | 'PROVINCE' | 'CITY' | 'DISTRICT';
    displayName: string; path?: string; depth: number;
}
export interface HallCatalogGame {
    gameId: number; gameCode: string; displayName: string; categoryCode: string; familyCode: string;
    playVersion: string; classificationRegionCode: string; classificationName: string;
    regionType: string; parentRegionCode?: string; parentRegionName?: string;
}
export interface HallRoomConfiguration {
    gameId: number; classificationRegionCode: string; playVersion: string;
    rules: Record<string, unknown>; ui: {
        fields?: HallRoomRuleField[];
        roomRuleSourceHash?: string;
        smallSettleTemplate?: string;
        bigSettleTemplate?: string;
    };
}
export interface HallRoomRuleOption {
    value: string | number | boolean;
    label: string;
    disabled?: boolean;
    helpText?: string;
}
export interface HallRoomRuleField {
    readonly [key: string]: unknown;
    order?: number;
    helpText?: string;
    visible?: boolean;
    defaultCandidateIndexes?: number[];
    trusteeCount?: number;
    key: string; label: string; control?: string; required?: boolean; defaultValue?: unknown;
    options?: HallRoomRuleOption[]; disabled?: boolean; min?: number; max?: number; step?: number;
}
export interface HallRoomHandoff {
    roomId: number; gameId: number; gameName: string; playVersion: string;
    authorityRoute: string; gameTicket: string; bundleName: string; sceneName: string;
    playFamily: string; smallSettleTemplate?: string; bigSettleTemplate?: string;
    ruleSnapshot?: Record<string, unknown>; ruleFields?: readonly HallRoomRuleField[];
}
export interface HallRoomPreparation {
    room: { roomId:number; gameId:number; playVersion:string; route:string; bundleName:string; sceneName:string; rules?:Record<string,unknown> };
    game: HallCatalogGame;
    configuration: HallRoomConfiguration;
}
export interface HallActiveRoom {
    active: boolean; roomId?: number; gameId?: number; playVersion?: string; state?: string;
    route?: string; bundleName?: string; sceneName?: string; playFamily?: string;
    smallSettleTemplate?: string; bigSettleTemplate?: string;
    rules?: Record<string, unknown>;
}
export interface HallRoomConnectionTicket {
    authorityRoute: string;
    gameTicket: string;
}
export interface HallRoomScope {
    type: 'PERSONAL' | 'CLUB'; clubId?: number; templateCode?: string;
}
export interface HallAdmissionLocation { latitude: number; longitude: number; }
export interface HallHistoryPage { items: unknown[]; nextBeforeRoomId: number; hasMore: boolean; }
export interface HallHistoryDetail { roomId: number; rounds: unknown[]; }
export interface HallReplayChunk { roomId: number; setId: number; events: unknown[]; nextSequence: number; hasMore: boolean; contentHash: string; }
export interface HallReplayCodeResolution {
    type: 'SHORT' | 'LEGACY_11'; replayCode: string; roomId: number; setId: number;
    legacyGameType?: number;
}
export interface HallCurrentReplayCode { code: string; roomId: number; setId: number; status: 'ACTIVE' | 'EXPIRED'; }

/** Canonical HTTPS boundary for room lifecycle before the realtime room connection exists. */
export class HallRoomGateway {
    private static readonly joins = new Map<string, Promise<HallRoomHandoff>>();
    private static readonly metadataCacheMs = 60_000;
    private readonly api: ProductionApiClient;
    private readonly catalogCache = new Map<string, { expiresAt: number; value: Promise<HallCatalogGame[]> }>();
    private readonly configurationCache = new Map<string, { expiresAt: number; value: Promise<HallRoomConfiguration> }>();
    private readonly roomPreparationCache = new Map<number, { expiresAt: number; value: Promise<HallRoomPreparation> }>();
    private pending: Promise<HallRoomHandoff> | null = null;
    public constructor(token: AccessTokenSource, private readonly playerId: string, private readonly deviceFingerprint: () => string,
        refreshSession?: SessionRefresher, shouldRefreshSession?: SessionRefreshPolicy) {
        this.api = new ProductionApiClient(token, playerId, undefined, undefined, refreshSession, shouldRefreshSession);
    }
    public create(gameCode: string, rules: Record<string, unknown>, scope: HallRoomScope = { type: 'PERSONAL' }, location?: HallAdmissionLocation): Promise<HallRoomHandoff> {
        if (this.pending) return this.pending;
        this.pending = this.createOnce(gameCode, rules, scope, location).finally(() => { this.pending = null; });
        return this.pending;
    }
    public join(roomId: number): Promise<HallRoomHandoff>;
    public join(roomId: number, location: HallAdmissionLocation): Promise<HallRoomHandoff>;
    public join(roomId: number, location?: HallAdmissionLocation): Promise<HallRoomHandoff> {
        if (!Number.isSafeInteger(roomId) || roomId < 100000 || roomId > 999999) {
            return Promise.reject(new Error('请输入6位纯数字房间号'));
        }
        const joinKey = `${this.playerId}:${roomId}`;
        const shared = HallRoomGateway.joins.get(joinKey);
        if (shared) return shared;
        if (this.pending) return this.pending;
        this.pending = this.joinOnce(roomId, location).finally(() => {
            this.pending = null;
            globalThis.setTimeout(() => HallRoomGateway.joins.delete(joinKey), 800);
        });
        HallRoomGateway.joins.set(joinKey, this.pending);
        return this.pending;
    }
    /** Read-only warmup; it never reserves a seat or issues a reusable game ticket. */
    public prepare(roomId: number): Promise<HallRoomPreparation> {
        if (!Number.isSafeInteger(roomId) || roomId < 100000 || roomId > 999999) {
            return Promise.reject(new Error('房间号无效，无法预热'));
        }
        const cached = this.roomPreparationCache.get(roomId);
        if (cached && cached.expiresAt > Date.now()) return cached.value;
        const value = Promise.all([
            this.api.get<HallRoomPreparation['room']>(`/api/v2/hall/rooms/${roomId}`),
            this.catalog('ALL'),
        ]).then(async ([room, catalog]) => {
            const game = catalog.find(item => Number(item.gameId) === Number(room.gameId));
            if (!game) throw new Error('该房间玩法当前不可用，请联系房主重新创建');
            return {
                room: { ...room, bundleName: resolvePublishedRoomBundle(room.bundleName) },
                game,
                configuration: await this.configuration(game),
            };
        }).catch((error: unknown) => {
            this.roomPreparationCache.delete(roomId);
            throw error;
        });
        this.roomPreparationCache.set(roomId, { expiresAt: Date.now() + HallRoomGateway.metadataCacheMs, value });
        return value;
    }
    public async leave(roomId: number): Promise<unknown> {
        if (!Number.isSafeInteger(roomId) || roomId < 100000 || roomId > 999999) {
            return Promise.reject(new Error('房间号无效'));
        }
        let result: unknown;
        let leaveError: unknown = null;
        try {
            result = await this.api.mutate('POST', `/api/v2/hall/rooms/${roomId}/leave`, {},
                ProductionApiClient.operationKey(`hall-room-leave:${roomId}`));
        } catch (error: unknown) {
            leaveError = error;
        }
        const active = await this.api.get<HallActiveRoom>('/api/v2/hall/rooms/active');
        if (active.active) throw new Error(`退出房间未完成，当前仍在房间 ${Number(active.roomId ?? 0)}`);
        // Hall 的成员状态不是牌桌座位是否已删除的证明。首个请求若在权威提交附近断线，
        // 不能只因 Hall 显示 inactive 就让客户端离场，否则其他玩家刷新仍会看见幽灵座位。
        // 使用新的幂等键重放一次；服务端会把“权威座位本就不存在”按已离房处理。
        if (leaveError && result === undefined) {
            result = await this.api.mutate('POST', `/api/v2/hall/rooms/${roomId}/leave`, {},
                ProductionApiClient.operationKey(`hall-room-leave-reconcile:${roomId}`));
        }
        return result;
    }
    public history(beforeRoomId = 0, limit = 20): Promise<HallHistoryPage> { return this.api.get('/api/v2/hall/history', { beforeRoomId, limit }); }
    public historyDetail(roomId: number): Promise<HallHistoryDetail> { return this.api.get(`/api/v2/hall/history/${roomId}`); }
    public replay(roomId: number, setId: number, afterSequence = 0, limit = 100): Promise<HallReplayChunk> { return this.api.get(`/api/v2/hall/replays/${roomId}/${setId}/chunks`, { afterSequence, limit }); }
    public resolveReplayCode(value: string): Promise<HallReplayCodeResolution> {
        return this.api.get('/api/v2/hall/replay-codes/resolve', { lookupType: 'REPLAY_CODE', value });
    }
    public currentReplayCode(roomId: number, setId: number): Promise<HallCurrentReplayCode> {
        return this.api.get('/api/v2/hall/replay-codes/current', { roomId, setId });
    }
    public async activeRoom(): Promise<HallRoomHandoff | null> {
        const room = await this.api.get<HallActiveRoom>('/api/v2/hall/rooms/active');
        if (!room.active || !Number.isSafeInteger(Number(room.roomId))) return null;
        return this.handoffFromRoom({
            roomId: Number(room.roomId), gameId: Number(room.gameId), playVersion: String(room.playVersion ?? ''),
            route: String(room.route ?? ''), bundleName: String(room.bundleName ?? ''), sceneName: String(room.sceneName ?? ''),
            rules: room.rules,
        }, '活动房间玩法当前不可用，请联系房主重新创建');
    }
    /** Obtain a fresh game ticket for an already committed waiting seat without joining twice. */
    public async resumeWaiting(roomId: number): Promise<HallRoomHandoff> {
        const active = await this.activeRoom();
        if (!active || Number(active.roomId) !== roomId) {
            throw new Error('等待房间状态已变化，请返回亲友圈重试');
        }
        return active;
    }
    public async refreshRoomConnection(roomId: number): Promise<HallRoomConnectionTicket> {
        if (!Number.isSafeInteger(roomId) || roomId < 100000 || roomId > 999999) throw new Error('房间号无效，无法重连');
        const room = await this.api.get<{route:string}>(`/api/v2/hall/rooms/${roomId}`);
        return this.issueRoomTicket(roomId, room.route);
    }
    public filters(): Promise<HallPlayFilter[]> {
        return this.api.get<HallPlayFilter[]>('/api/v2/hall/play-filters', { clientVersion: '3.8.8' });
    }
    public catalog(regionCode = 'ALL'): Promise<HallCatalogGame[]> {
        const key = regionCode.trim().toUpperCase() || 'ALL';
        const cached = this.catalogCache.get(key);
        if (cached && cached.expiresAt > Date.now()) return cached.value;
        const value = this.api.get<HallCatalogGame[]>('/api/v2/hall/catalog', {
            regionCode: key, clientVersion: '3.8.8',
        }).catch((error: unknown) => {
            this.catalogCache.delete(key);
            throw error;
        });
        this.catalogCache.set(key, { expiresAt: Date.now() + HallRoomGateway.metadataCacheMs, value });
        return value;
    }
    public configuration(game: HallCatalogGame): Promise<HallRoomConfiguration> {
        const key = `${game.gameId}:${game.playVersion}`;
        const cached = this.configurationCache.get(key);
        if (cached && cached.expiresAt > Date.now()) return cached.value;
        const value = this.api.get<HallRoomConfiguration>('/api/v2/hall/configuration', {
            gameId: game.gameId, playVersion: game.playVersion, clientVersion: '3.8.8',
        }).catch((error: unknown) => {
            this.configurationCache.delete(key);
            throw error;
        });
        this.configurationCache.set(key, { expiresAt: Date.now() + HallRoomGateway.metadataCacheMs, value });
        return value;
    }
    public destroy(): void { this.api.destroy(); }
    private async createOnce(gameCode: string, rules: Record<string, unknown>, scope: HallRoomScope, location?: HallAdmissionLocation): Promise<HallRoomHandoff> {
        const catalog = await this.catalog('ALL');
        const selected = catalog.find(item => String(item.gameCode).toLowerCase() === gameCode.toLowerCase());
        if (!selected) throw new Error('该玩法当前不可用，请重新选择');
        const configuration = await this.configuration(selected);
        const operation = ProductionApiClient.operationKey(`room-create:${selected.gameId}`);
        const room = await this.api.mutate<{roomId:number;gameId:number;playVersion:string;route:string;bundleName:string;sceneName:string}>('POST', '/api/v2/hall/rooms', {
            requestId: operation, gameId: selected.gameId, playVersion: selected.playVersion,
            clientVersion: '3.8.8', rules, scope, ...this.locationBody(location),
        }, operation);
        if (!Number.isSafeInteger(Number(room.roomId)) || Number(room.roomId) <= 0 || !room.route
            || !room.bundleName?.trim() || !room.sceneName?.trim()) {
            throw new Error('房间服务返回的数据无效，请重试');
        }
        return this.handoff({ ...room, rules }, gameCode, selected.familyCode, configuration.ui);
    }
    private async joinOnce(roomId: number, location?: HallAdmissionLocation): Promise<HallRoomHandoff> {
        await this.api.mutate('POST', `/api/v2/hall/rooms/${roomId}/join`, this.locationBody(location), ProductionApiClient.operationKey(`room-join:${roomId}`));
        // Warm metadata may already be ready before the click. Only seat mutation
        // and the one-time ticket are deliberately kept on the interaction path.
        const [prepared, ticket] = await Promise.all([
            this.prepare(roomId),
            this.issueRoomTicket(roomId, resolveRuntimeEndpoints().hallWebSocketUrl),
        ]);
        return this.handoff(prepared.room, prepared.game.gameCode, prepared.game.familyCode,
            prepared.configuration.ui, ticket);
    }
    /** Reserve a real seat while the player remains in the club lobby. */
    public async joinWaiting(roomId: number, location?: HallAdmissionLocation): Promise<void> {
        await this.api.mutate('POST', `/api/v2/hall/rooms/${roomId}/join`, this.locationBody(location),
            ProductionApiClient.operationKey(`room-waiting-join:${roomId}:${this.playerId}`));
    }

    /** Leave a waiting seat before returning to Hall or choosing another club desk. */
    public async leaveWaiting(roomId: number): Promise<void> {
        await this.api.mutate('POST', `/api/v2/hall/rooms/${roomId}/leave`, {},
            ProductionApiClient.operationKey(`room-waiting-leave:${roomId}:${this.playerId}:${Date.now()}`));
    }
    private async handoffFromRoom(
        room: {roomId:number;gameId:number;playVersion:string;route:string;bundleName:string;sceneName:string;rules?:Record<string,unknown>},
        unavailableMessage: string,
        ticket?: HallRoomConnectionTicket,
    ): Promise<HallRoomHandoff> {
        const catalog = await this.catalog('ALL');
        const selected = catalog.find(item => Number(item.gameId) === Number(room.gameId));
        if (!selected) throw new Error(unavailableMessage);
        const configuration = await this.configuration(selected);
        return this.handoff(room, selected.gameCode, selected.familyCode, configuration.ui, ticket);
    }
    private async handoff(
        room: {roomId:number;gameId:number;playVersion:string;route:string;bundleName:string;sceneName:string;rules?:Record<string,unknown>},
        gameCode: string,
        playFamily: string,
        ui: HallRoomConfiguration['ui'],
        issuedTicket?: HallRoomConnectionTicket,
    ): Promise<HallRoomHandoff> {
        if (!Number.isSafeInteger(Number(room.roomId)) || Number(room.roomId) <= 0 || !room.route || !room.bundleName?.trim() || !room.sceneName?.trim()) throw new Error('房间服务返回的数据无效，请重试');
        const ticket = issuedTicket ?? await this.issueRoomTicket(Number(room.roomId), room.route);
        return { roomId: Number(room.roomId), gameId: Number(room.gameId), gameName: gameCode,
            playVersion: room.playVersion, authorityRoute: ticket.authorityRoute, gameTicket: ticket.gameTicket,
            bundleName: resolvePublishedRoomBundle(room.bundleName), sceneName: room.sceneName.trim(), playFamily,
            ruleSnapshot: room.rules ? { ...room.rules } : undefined,
            ruleFields: Array.isArray(ui.fields) ? ui.fields.map((field) => ({ ...field })) : undefined,
            smallSettleTemplate: ui.smallSettleTemplate?.trim() || undefined,
            bigSettleTemplate: ui.bigSettleTemplate?.trim() || undefined };
    }
    private async issueRoomTicket(roomId: number, fallbackRoute: string): Promise<HallRoomConnectionTicket> {
        const ticket = await this.api.mutate<{ticket:string;route:string}>('POST', `/api/v2/hall/rooms/${roomId}/ticket`, {
            deviceFingerprint: this.deviceFingerprint(),
        }, ProductionApiClient.operationKey(`room-ticket:${roomId}:${Date.now()}:${Math.random().toString(16).slice(2)}`));
        if (!ticket.ticket) throw new Error('房间连接票据签发失败，请重试');
        const advertisedRoute = String(ticket.route || fallbackRoute).trim();
        if (!advertisedRoute) throw new Error('房间连接路由缺失，请重试');
        // Hall may advertise the Gateway's process-local loopback address. That
        // address happens to work in desktop Preview but points at the phone
        // itself in LAN Preview. All clients enter through the one canonical
        // edge resolved from the current page; the ticket remains authoritative.
        const canonicalRoute = resolveRuntimeEndpoints().hallWebSocketUrl;
        return { authorityRoute: canonicalRoute, gameTicket: ticket.ticket };
    }
    private locationBody(location?: HallAdmissionLocation): Record<string, number> {
        if (!location) return {};
        if (!Number.isFinite(location.latitude) || location.latitude < -90 || location.latitude > 90
            || !Number.isFinite(location.longitude) || location.longitude < -180 || location.longitude > 180) {
            throw new Error('定位坐标无效，请重新授权定位');
        }
        return { latitude: location.latitude, longitude: location.longitude };
    }
}
