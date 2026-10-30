import { assetManager, instantiate, Node, Prefab, SpriteAtlas } from 'cc';
import type { LegacySubgameTicket } from '../../../Common/Code/Runtime/subgame/AuthoritativeSubgameHandoff';
import { createOwnedGameClient } from '../../../Common/Code/Runtime/network/ConnectionOwnership';
import { ProtocolClient } from '../../../Common/Code/Runtime/network/ProtocolClient';
import type {
    CommonRoomFeaturePorts,
    CommonRoomMountedView,
    GameRuntimeEntry,
} from '../../Common/Code/Runtime/GameRuntimeEntry';
import type { CommonRoomSocialEvent } from '../../Common/Code/Room/CommonRoomSocialController';
import type { CommonRoomVoiceCapture } from '../../Common/Code/Room/CommonRoomVoiceController';
import { RoomSettlementHistoryFeed, type RoomSettlementHistoryEntry } from '../../Common/Code/Room/RoomSettlementHistory';
import {
    Chengdu1001SmallSettlementAdapter,
    type Chengdu1001RoundSettlementData,
} from './Chengdu1001SmallSettlementAdapter';
import {
    Chengdu1001BigSettlementAdapter,
    type Chengdu1001BigSettlementData,
} from './Chengdu1001BigSettlementAdapter';
import { Chengdu1001RoomView, type Chengdu1001GangCandidate, type Chengdu1001RoomSnapshot } from './Chengdu1001RoomView';
import { Chengdu1001ProtocolAdapter } from './Chengdu1001ProtocolAdapter';
import { Chengdu1001RuleAdapter } from './Chengdu1001RuleAdapter';

const BUNDLE = 'games-mahjong';
const MAHJONG_ROOM_PRESENTATION = 'Common/Prefab/MJ_CommonRoom_2D';
const TILE_ATLAS = 'Common/Atlas/CDXZ_JDZ2D/mjAtlas';
const SMALL_SETTLEMENT = 'Common/Prefab/SmallSettlement';
const BIG_SETTLEMENT = 'Common/Prefab/BigSettlement_0';

export interface Chengdu1001VoicePort {
    capture(): Promise<CommonRoomVoiceCapture | null>;
    finish(): void;
    cancel(): void;
    destroy(): void;
    play?(payload: unknown): Promise<void> | void;
}

export interface Chengdu1001RuntimeEntryOptions {
    readonly parent: Node;
    /** Gateway ticket identity; distinct from the public RoleSession.playerId. */
    readonly accountId: number;
    readonly requestRoomExit: (roomId: number) => Promise<void>;
    /** Platform media stays outside Common; hosts may inject the authenticated Chengdu1001 adapter. */
    readonly voicePort?: Chengdu1001VoicePort;
}

/** Dedicated Chengdu1001 runtime with only the catalog-authority protocol. */
export class Chengdu1001RuntimeEntry implements GameRuntimeEntry {
    public readonly id = 'chengdu1001';
    public readonly canonicalGameCodes = Object.freeze(['chengdu1001']);
    public readonly families = Object.freeze([] as string[]);
    public supportsPlayVersion(playVersion: string): boolean { return playVersion === 'chengdu1001-v1.0.0'; }
    private readonly protocol = new Chengdu1001ProtocolAdapter();
    private readonly rules = new Chengdu1001RuleAdapter();
    private client: ProtocolClient | null = null;
    private view: Chengdu1001RoomView | null = null;
    private smallSettlement: Chengdu1001SmallSettlementAdapter | null = null;
    private bigSettlement: Chengdu1001BigSettlementAdapter | null = null;
    private smallNode: Node | null = null;
    private bigNode: Node | null = null;
    private snapshot: Chengdu1001RoomSnapshot | null = null;
    private roomId = 0;
    private playVersion = '';
    private sequence = 0;
    private pending = false;
    private generation = 0;
    private voicePort: Chengdu1001VoicePort | null = null;
    private commonMountedView: CommonRoomMountedView | null = null;
    private roomRuleVisible = false;
    private autoStartPending = false;
    private autoDrawStateVersion = -1;
    private readonly commonRoomHistory = new RoomSettlementHistoryFeed();

    public constructor(private readonly options: Chengdu1001RuntimeEntryOptions) {
        if (!options.parent || !Number.isSafeInteger(options.accountId) || options.accountId <= 0) {
            throw new Error('[chengdu1001] invalid runtime identity');
        }
    }

    public async preload(): Promise<void> {
        await Promise.all([
            this.loadPrefab(SMALL_SETTLEMENT), this.loadPrefab(BIG_SETTLEMENT),
            this.loadPrefab(MAHJONG_ROOM_PRESENTATION),
            this.loadTileAtlas(),
        ]);
    }

    public async enter(handoff: LegacySubgameTicket): Promise<void> {
        this.destroy();
        const generation = ++this.generation;
        this.roomId = Number(handoff.roomId ?? handoff.roomID ?? 0);
        this.playVersion = String(handoff.playVersion ?? '').trim();
        const authorityRoute = String(handoff.authorityRoute ?? '').trim();
        const gameTicket = String(handoff.gameTicket ?? '').trim();
        if (!Number.isSafeInteger(this.roomId) || this.roomId <= 0 || !this.playVersion
            || !authorityRoute || !gameTicket) {
            throw new Error('[chengdu1001] authoritative handoff is incomplete');
        }
        const client = createOwnedGameClient();
        this.client = client;
        try {
            client.setWsTicket(gameTicket);
            client.bindRoomAuthority(this.roomId, this.playVersion);
            client.on(this.protocol.response, body => { void this.accept(body); });
            client.on(this.protocol.statePush, body => { void this.accept(body); });
            // CommonRoom broadcasts carry the same public seats/ready state but
            // deliberately omit gameplay identity fields.  Merge that projection
            // into the last Mahjong authority snapshot instead of rejecting it as
            // an incomplete gameplay response.
            client.on('common.room.state_push', body => { void this.accept(body, true); });
            await client.connect(authorityRoute);
            this.assertCurrent(generation);
            const [smallPrefab, bigPrefab, mahjongRoomPresentationPrefab,
                tileAtlas] = await Promise.all([
                this.loadPrefab(SMALL_SETTLEMENT), this.loadPrefab(BIG_SETTLEMENT),
                this.loadPrefab(MAHJONG_ROOM_PRESENTATION),
                this.loadTileAtlas(),
            ]);
            this.assertCurrent(generation);
            this.mountUi(smallPrefab, bigPrefab, mahjongRoomPresentationPrefab, tileAtlas);
            const initial = await this.dispatch('state', {}, 0);
            this.assertCurrent(generation);
            const localSeat = this.findLocalSeat(initial);
            if (localSeat < 0) throw new Error('[chengdu1001] Hall membership is absent from Mahjong authority');
            await this.applySnapshot(initial);
        } catch (error: unknown) {
            console.error('[chengdu1001]', { action: 'enter-failed', roomId: this.roomId,
                reason: error instanceof Error ? error.message : String(error) });
            this.destroy();
            throw error;
        }
    }

    public commonRoomPorts(): CommonRoomFeaturePorts {
        if (!this.view?.root.isValid || !this.client || !this.smallSettlement) {
            throw new Error('[chengdu1001] room runtime is not mounted');
        }
        const ports: CommonRoomFeaturePorts = {
            socialRenderer: this.voicePort ? {
                render: event => this.renderCommonSocial(event),
                clear: () => this.view?.showRoomNotice(''),
            } : undefined,
            settlementHistoryRenderer: {
                open: async entries => {
                    const latest = entries.at(-1)?.payload;
                    if (!this.smallSettlement || !this.isRoundSettlementData(latest)) {
                        throw new Error('[chengdu1001] authoritative round settlement is unavailable');
                    }
                    await this.smallSettlement.render(latest);
                },
                close: () => this.smallSettlement?.hide(),
                destroy: () => this.smallSettlement?.hide(),
            },
            settlementHistoryFeed: this.commonRoomHistory,
            exit: {
                request: async () => {
                    await this.options.requestRoomExit(this.roomId);
                    this.destroy();
                },
            },
            openRoomRule: () => this.toggleRoomRule(),
            waitingActions: { ready: () => this.run('ready') },
            mounted: view => {
                this.commonMountedView = view;
                this.renderCommonRoomChrome();
                return () => {
                    if (this.commonMountedView === view) this.commonMountedView = null;
                };
            },
            report: error => this.view?.showError(error instanceof Error ? error.message : String(error)),
        };
        if (this.voicePort) {
            return {
                ...ports,
                voiceCapture: {
                    capture: () => this.requireVoicePort().capture(),
                    finish: () => this.voicePort?.finish(),
                    cancel: () => this.voicePort?.cancel(),
                    destroy: () => { this.voicePort?.destroy(); this.voicePort = null; },
                },
            };
        }
        return ports;
    }

    /** The common connection owner calls this after a fresh room ticket is connected. */
    public async restoreAfterReconnect(): Promise<void> {
        if (!this.client || !this.view || this.roomId <= 0) return;
        const generation = this.generation;
        const localSeat = this.findLocalSeat();
        const snapshot = await this.dispatch('state', {}, localSeat >= 0 ? localSeat : 0);
        this.assertCurrent(generation);
        await this.applySnapshot(snapshot);
    }

    public destroy(): void {
        this.autoStartPending = false;
        this.generation += 1;
        this.view?.destroy(); this.view = null;
        this.voicePort?.destroy(); this.voicePort = null;
        this.commonMountedView = null; this.roomRuleVisible = false;
        this.smallSettlement?.dispose(); this.smallSettlement = null;
        this.bigSettlement?.dispose(); this.bigSettlement = null;
        this.smallNode?.destroy(); this.smallNode = null;
        this.bigNode?.destroy(); this.bigNode = null;
        this.client?.close(); this.client = null;
        this.commonRoomHistory.clear();
        this.snapshot = null; this.roomId = 0; this.playVersion = ''; this.sequence = 0; this.pending = false;
        this.autoDrawStateVersion = -1;
    }

    private mountUi(smallPrefab: Prefab, bigPrefab: Prefab,
        mahjongRoomPresentationPrefab: Prefab, tileAtlas: SpriteAtlas): void {
        const view = new Chengdu1001RoomView({
            draw: () => this.run('draw'),
            discard: tile => this.run('discard', { tile: this.requireTile(tile) }),
            hu: () => this.run('hu'), pass: () => this.run('pass'),
            peng: tiles => this.run('peng', { consumedTiles: tiles }),
            gang: (candidate, stateVersion) => this.runGang(candidate, stateVersion),
            exchange: tiles => this.run('exchange', { tiles: this.requireExchange(tiles) }),
            dingque: suit => this.run('dingque', { suit }), refresh: () => this.run('state'),
        }, mahjongRoomPresentationPrefab, tileAtlas);
        this.options.parent.addChild(view.root);
        this.view = view;

        this.smallNode = instantiate(smallPrefab);
        this.smallNode.active = false;
        view.root.addChild(this.smallNode);
        this.smallSettlement = new Chengdu1001SmallSettlementAdapter(this.smallNode, {
            continueGame: () => this.run('continue'),
            exitRoom: async () => { await this.options.requestRoomExit(this.roomId); this.destroy(); },
        });

        this.bigNode = instantiate(bigPrefab);
        this.bigNode.active = false;
        view.root.addChild(this.bigNode);
        this.bigSettlement = new Chengdu1001BigSettlementAdapter(this.bigNode, {
            returnLobby: async () => { await this.options.requestRoomExit(this.roomId); this.destroy(); },
            continueGame: () => this.run('continue'),
        });
        this.voicePort = this.resolveVoicePort();
    }

    private renderCommonSocial(event: CommonRoomSocialEvent): void {
        if (event.kind === 'room.voice') {
            if (!this.voicePort?.play) {
                this.view?.showError('[chengdu1001] current platform does not provide voice playback');
                return;
            }
            const port = this.voicePort;
            void Promise.resolve().then(() => port.play!(event.payload)).catch(error =>
                this.view?.showError(error instanceof Error ? error.message : String(error)));
            return;
        }
        const payload = event.payload && typeof event.payload === 'object'
            ? event.payload as Record<string, unknown> : {};
        const content = String(payload.content ?? '').trim();
        const quickId = Number(payload.quickId ?? payload.quickID ?? 0);
        if (content) this.view?.showRoomNotice(content);
        else if (quickId > 100) this.view?.showRoomNotice(`表情 ${quickId - 100}`);
        else if (quickId > 0) this.view?.showRoomNotice(`快捷语 ${quickId}`);
    }

    private resolveVoicePort(): Chengdu1001VoicePort | null {
        const globals = globalThis as typeof globalThis & { aooChengdu1001VoicePort?: Chengdu1001VoicePort };
        return this.options.voicePort ?? globals.aooChengdu1001VoicePort ?? null;
    }

    private requireVoicePort(): Chengdu1001VoicePort {
        if (!this.voicePort) throw new Error('[chengdu1001] current platform does not provide the Mahjong voice port');
        return this.voicePort;
    }

    private isRoundSettlementData(value: unknown): value is Chengdu1001RoundSettlementData {
        if (!value || typeof value !== 'object') return false;
        const data = value as Partial<Chengdu1001RoundSettlementData>;
        return typeof data.roomId === 'string' && Number.isSafeInteger(data.stateVersion)
            && Array.isArray(data.players);
    }

    private async run(action: string, payload: Readonly<Record<string, unknown>> = {}): Promise<void> {
        if (this.pending) return;
        this.pending = true;
        try {
            const seat = this.requireLocalSeat();
            const snapshot = await this.dispatch(action, payload, seat);
            await this.applySnapshot(snapshot);
        } finally {
            this.pending = false;
            // A state received while the preceding intent was in flight may
            // expose the next server-authoritative DRAW transition.  The
            // render path intentionally does not submit while `pending` is
            // true; retry once the request has released the gate so a stale
            // action cannot strand the room between discard/pass and draw.
            const latest = this.snapshot;
            if (latest) void this.ensureAutomaticDraw(latest);
        }
    }

    private async runGang(candidate: Chengdu1001GangCandidate, stateVersion: number): Promise<void> {
        const current = this.snapshot;
        if (!current || current.stateVersion !== stateVersion
            || !current.gangCandidates.some(item => item.type === candidate.type
                && item.mahjongId === candidate.mahjongId)) {
            throw new Error('[chengdu1001] gang candidate expired; refresh the room state');
        }
        await this.run('gang', { type: candidate.type, mahjongId: candidate.mahjongId, stateVersion });
    }

    private async dispatch(action: string, payload: Readonly<Record<string, unknown>>, seatId: number): Promise<Chengdu1001RoomSnapshot> {
        if (!this.client) throw new Error('[chengdu1001] runtime is not connected');
        this.rules.validateAction(action);
        const sequence = ++this.sequence;
        const raw = await this.client.request<unknown>(this.protocol.dispatch, Object.freeze({
            roomId: this.roomId,
            playVersion: this.playVersion,
            roundNo: this.snapshot?.roundNo ?? 0,
            sequence,
            seatId,
            action,
            payload: Object.freeze({ ...payload }),
        }));
        const snapshot = this.parseSnapshot(raw);
        return snapshot;
    }

    private async accept(raw: unknown, commonProjection = false): Promise<void> {
        try {
            const snapshot = commonProjection
                ? this.mergeCommonRoomSnapshot(raw)
                : this.parseSnapshot(raw);
            if (this.snapshot && snapshot.stateVersion < this.snapshot.stateVersion) return;
            await this.applySnapshot(snapshot);
        } catch (error: unknown) {
            // Pushes for other message shapes are ignored by design; the next
            // authoritative state response remains the source of truth.
            console.error('[chengdu1001] state-push-ignored', error instanceof Error ? error.message : String(error));
        }
    }

    private mergeCommonRoomSnapshot(raw: unknown): Chengdu1001RoomSnapshot {
        if (!this.snapshot) return this.parseSnapshot(raw);
        let value = raw;
        for (let depth = 0; depth < 3; depth += 1) {
            if (!value || typeof value !== 'object') break;
            const record = value as Record<string, unknown>;
            const nested = record.payload ?? record.body;
            if (!nested || typeof nested !== 'object') break;
            value = nested;
        }
        if (!value || typeof value !== 'object') {
            throw new Error('[chengdu1001] common room projection is missing');
        }
        const projection = value as Record<string, unknown>;
        const current = this.snapshot;
        const merged: Record<string, unknown> = { ...current, ...projection };
        // CommonRoom owns only the public seat projection.  It must never be
        // allowed to erase gameplay fields that are intentionally private or
        // absent from a public broadcast.
        for (const key of ['gameId', 'gameCode', 'createRules', 'gangCandidates',
            'totalScore', 'roundScoreDelta', 'continueSeats']) {
            if (projection[key] === undefined) {
                merged[key] = (current as unknown as Record<string, unknown>)[key];
            }
        }
        return this.parseSnapshot(merged);
    }

    private async applySnapshot(snapshot: Chengdu1001RoomSnapshot): Promise<void> {
        if (!this.view) return;
        this.snapshot = snapshot;
        const localSeat = this.findLocalSeat(snapshot);
        if (localSeat < 0) console.error('[chengdu1001] local-seat-unresolved', {
            accountId: this.options.accountId, phase: snapshot.phase,
            roomId: snapshot.roomId, seatIds: Object.keys(snapshot.seats),
        });
        this.publishCommonRoomSeats(snapshot);
        this.view.render(snapshot, this.options.accountId);
        this.renderCommonRoomChrome();
        void this.ensureAutomaticDraw(snapshot);
        void this.ensureRoundStarted(snapshot);
        this.smallSettlement?.hide();
        this.bigSettlement?.hide();
        const roundSettlement = snapshot.roundScored ? this.smallSettlementData(snapshot) : null;
        if (roundSettlement) {
            this.recordCommonRoomHistory({
                identity: `${roundSettlement.roomId}:${roundSettlement.currentRound}:${roundSettlement.stateVersion}`,
                payload: roundSettlement,
            });
        }
        if (roundSettlement && snapshot.roomFinished) {
            await this.bigSettlement?.render(this.bigSettlementData(snapshot));
        } else if (roundSettlement) {
            await this.smallSettlement?.render(roundSettlement);
        }
    }

    /**
     * DRAW is a server-authoritative transition, not a user-facing room
     * operation.  Once the local seat is the current seat and the authority
     * exposes DRAW, consume it exactly once for that state version; otherwise
     * the shared operation bar has no valid control and the table deadlocks
     * after the previous player's discard/pass.
     */
    private async ensureAutomaticDraw(snapshot: Chengdu1001RoomSnapshot): Promise<void> {
        if (snapshot.phase !== 'PLAYING' || !snapshot.legalActions?.includes('DRAW')
            || this.autoDrawStateVersion === snapshot.stateVersion || this.pending) return;
        this.autoDrawStateVersion = snapshot.stateVersion;
        try {
            await this.run('draw');
        } catch (error: unknown) {
            this.view?.showError(error instanceof Error ? error.message : String(error));
        }
    }

    private renderCommonRoomChrome(): void {
        const view = this.commonMountedView;
        const snapshot = this.snapshot;
        if (!view || !snapshot) return;
        view.setLabel('RoomInfo/Lb_RoomId', `房间号：${snapshot.roomId}`);
        view.setLabel('RoomInfo/Lb_Round', `第${snapshot.roundNo || 0}/${snapshot.totalRounds}局`);
        const localSeat = this.findLocalSeat(snapshot);
        const readySeats = new Set((snapshot.readySeats ?? []).filter(seat => Number.isSafeInteger(seat)));
        const canReady = localSeat >= 0 && !snapshot.started && !readySeats.has(localSeat);
        view.setWaitingActions(canReady, false);
    }

    /** Mahjong starts from the authoritative room once all seats acknowledge. */
    private async ensureRoundStarted(snapshot: Chengdu1001RoomSnapshot): Promise<void> {
        if (this.autoStartPending || !this.client || snapshot.phase !== 'LOBBY' || snapshot.started) return;
        const configuredSeatCount = Number(snapshot.createRules?.playerCount
            ?? snapshot.createRules?.playerNum ?? 0);
        const seatCount = [2, 3, 4].includes(configuredSeatCount)
            ? configuredSeatCount : Object.keys(snapshot.seats).length;
        if (seatCount < 2) return;
        const localSeat = this.findLocalSeat(snapshot);
        if (localSeat < 0) return;
        const readySeats = new Set((snapshot.readySeats ?? []).filter(seat => Number.isSafeInteger(seat)));
        const occupiedSeatCount = Object.values(snapshot.seats).filter(seat => {
            const playerId = Number(seat?.playerId ?? 0);
            return Number.isSafeInteger(playerId) && playerId > 0;
        }).length;
        if (occupiedSeatCount < seatCount) return;
        // Every occupied seat acknowledges readiness independently.  The owner
        // follows the same path first; only its subsequent snapshot may pass the
        // all-ready gate and issue the start command.
        if (!readySeats.has(localSeat)) {
            this.autoStartPending = true;
            try { await this.run('ready'); }
            catch (error: unknown) {
                this.view?.showError(error instanceof Error ? error.message : String(error));
            } finally { this.autoStartPending = false; }
            return;
        }
        if (localSeat !== 0) return;
        // The owner may start only after every configured seat is occupied and
        // every occupied seat has acknowledged ready.  A first-seat snapshot
        // must never issue start early; the following authoritative push will
        // re-enter this gate once the joining player has prepared.
        if (readySeats.size < seatCount) return;
        this.autoStartPending = true;
        try {
            await this.run('start');
        } catch (error: unknown) {
            this.view?.showError(error instanceof Error ? error.message : String(error));
        } finally {
            this.autoStartPending = false;
        }
    }

    /**
     * The room shell never reads Mahjong's private table model.  Chengdu1001 owns
     * that model, and publishes its already-authoritative public projection
     * here so every game reaches the same CommonHead lifecycle.
     */
    private publishCommonRoomSeats(snapshot: Chengdu1001RoomSnapshot): void {
        if (!this.client) return;
        const configuredSeatCount = Number(snapshot.createRules?.playerCount
            ?? snapshot.createRules?.playerNum ?? 0);
        const seatIds = Object.keys(snapshot.seats).map(Number)
            .filter(Number.isSafeInteger);
        const seatCount = [2, 3, 4].includes(configuredSeatCount)
            ? configuredSeatCount : Math.max(2, ...seatIds.map(seat => seat + 1));
        if (seatCount > 4) throw new Error('[chengdu1001] public seat count exceeds supported Mahjong room size');
        const localSeatId = this.findLocalSeat(snapshot);
        if (localSeatId < 0 || localSeatId >= seatCount) return;
        const seats = Array.from({ length: seatCount }, (_, seatId) => {
            const source = snapshot.seats[String(seatId)];
            const playerId = Number(source?.playerId ?? 0);
            if (!Number.isSafeInteger(playerId) || playerId <= 0) {
                return Object.freeze({ seatId, occupied: false });
            }
            const displayName = String(source.displayName ?? '').trim() || `玩家${playerId}`;
            const avatarUrl = String(source.avatarUrl ?? '').trim();
            const rawScore = Number(snapshot.totalScore[String(source.playerId)] ?? 0);
            return Object.freeze({
                seatId,
                occupied: true,
                playerId,
                displayName,
                score: Number.isFinite(rawScore) ? rawScore : 0,
                ...(avatarUrl ? { avatarUrl } : {}),
            });
        });
        ProtocolClient.publishCommonRoomSnapshot(this.roomId, Object.freeze({
            seatCount,
            localSeatId,
            seats: Object.freeze(seats),
        }), Object.freeze({ stateVersion: snapshot.stateVersion, roundNo: snapshot.roundNo }));
    }

    private async toggleRoomRule(): Promise<void> {
        const view = this.commonMountedView;
        const rules = this.snapshot?.createRules;
        if (!view || !rules || Object.keys(rules).length === 0) {
            throw new Error('[chengdu1001] authoritative room rules are unavailable');
        }
        const nextVisible = !this.roomRuleVisible;
        if (nextVisible) {
            const description = Object.entries(rules).map(([key, value]) =>
                `${key}: ${typeof value === 'object' ? JSON.stringify(value) : String(value)}`).join('\n');
            view.setLabel('RulePanel/Label', description);
        }
        view.setVisible('RulePanel', nextVisible);
        this.roomRuleVisible = nextVisible;
    }

    private recordCommonRoomHistory(entry: RoomSettlementHistoryEntry): void {
        this.commonRoomHistory.record(entry);
    }

    private parseSnapshot(raw: unknown): Chengdu1001RoomSnapshot {
        let value = raw;
        for (let depth = 0; depth < 3; depth += 1) {
            if (!value || typeof value !== 'object') break;
            const record = value as Record<string, unknown>;
            const nested = record.payload ?? record.body;
            if (!nested || typeof nested !== 'object') break;
            value = nested;
        }
        if (!value || typeof value !== 'object') throw new Error('[chengdu1001] authority snapshot is missing');
        const snapshot = value as Chengdu1001RoomSnapshot;
        this.rules.validateSnapshot(snapshot);
        if (Number(snapshot.roomId) !== this.roomId
            || !Number.isSafeInteger(Number(snapshot.stateVersion))
            || !['LOBBY', 'PLAYING', 'SETTLED'].includes(String(snapshot.phase))
            || !snapshot.seats || typeof snapshot.seats !== 'object'
            || !Array.isArray(snapshot.gangCandidates)
            || snapshot.gangCandidates.some(candidate => ![2, 3, 4].includes(candidate.type)
                || !Number.isSafeInteger(candidate.mahjongId) || candidate.mahjongId <= 0)) {
            throw new Error('[chengdu1001] authority snapshot identity mismatch');
        }
        return snapshot;
    }

    private smallSettlementData(snapshot: Chengdu1001RoomSnapshot): Chengdu1001RoundSettlementData {
        const delta = snapshot.roundScoreDelta ?? {};
        return {
            roomId: String(snapshot.roomId), stateVersion: snapshot.stateVersion,
            currentRound: snapshot.roundNo, totalRounds: snapshot.totalRounds,
            settledAtText: '--', ruleText: '成都麻将 · 服务器权威结算',
            players: Object.values(snapshot.seats).map(seat => ({
                playerId: String(seat.playerId), displayName: `玩家 ${seat.playerId}`,
                scoreDelta: Number(delta[String(seat.playerId)] ?? 0), detailLines: [],
            })),
        };
    }

    private bigSettlementData(snapshot: Chengdu1001RoomSnapshot): Chengdu1001BigSettlementData {
        const players = Object.values(snapshot.seats).map(seat => ({
            playerId: String(seat.playerId), displayName: `玩家 ${seat.playerId}`,
            totalScore: Number(snapshot.totalScore[String(seat.playerId)] ?? 0),
        }));
        const winner = players.reduce<(typeof players)[number] | undefined>((best, player) =>
            !best || player.totalScore > best.totalScore ? player : best, undefined);
        return {
            roomId: String(snapshot.roomId), stateVersion: snapshot.stateVersion,
            currentRound: snapshot.completedRounds, totalRounds: snapshot.totalRounds,
            endedAtText: '--', roomFinished: snapshot.roomFinished,
            bestWinnerPlayerId: winner?.playerId,
            players,
        };
    }

    private findLocalSeat(snapshot = this.snapshot): number {
        if (!snapshot) return -1;
        const entry = Object.entries(snapshot.seats).find(([, seat]) =>
            String(seat.playerId) === String(this.options.accountId));
        return entry ? Number(entry[0]) : -1;
    }

    private requireLocalSeat(): number {
        const seat = this.findLocalSeat();
        if (seat < 0) throw new Error('[chengdu1001] local player is not seated');
        return seat;
    }

    private requireTile(tile: number): number {
        if (!Number.isSafeInteger(tile) || tile <= 0) throw new Error('[chengdu1001] select one hand tile first');
        return tile;
    }

    private requireExchange(tiles: readonly number[]): readonly number[] {
        if (tiles.length !== 3 || tiles.some(tile => !Number.isSafeInteger(tile) || tile <= 0)) {
            throw new Error('[chengdu1001] exchange requires exactly three selected tiles');
        }
        return [...tiles];
    }

    private assertCurrent(generation: number): void {
        if (generation !== this.generation) throw new Error('[chengdu1001] runtime entry superseded');
    }

    private async loadPrefab(path: string, bundleName = BUNDLE): Promise<Prefab> {
        const bundle = await this.loadBundle(bundleName);
        return new Promise<Prefab>((resolve, reject) => bundle.load(path, Prefab, (error, loaded) =>
            error || !loaded ? reject(error ?? new Error(`[chengdu1001] prefab unavailable path=${path}`)) : resolve(loaded)));
    }

    private async loadTileAtlas(): Promise<SpriteAtlas> {
        const bundle = await this.loadBundle(BUNDLE);
        return new Promise<SpriteAtlas>((resolve, reject) => bundle.load(TILE_ATLAS, SpriteAtlas, (error, loaded) =>
            error || !loaded ? reject(error ?? new Error(`[chengdu1001] tile atlas unavailable path=${TILE_ATLAS}`)) : resolve(loaded)));
    }

    private async loadBundle(name: string): Promise<NonNullable<ReturnType<typeof assetManager.getBundle>>> {
        const bundle = assetManager.getBundle(name) ?? await new Promise<ReturnType<typeof assetManager.getBundle>>(
            (resolve, reject) => assetManager.loadBundle(name, (error, loaded) =>
                error || !loaded ? reject(error ?? new Error(`[chengdu1001] bundle unavailable name=${name}`)) : resolve(loaded)),
        );
        if (!bundle) throw new Error(`[chengdu1001] bundle unavailable name=${name}`);
        return bundle;
    }
}

export function createChengdu1001RuntimeEntry(options: Chengdu1001RuntimeEntryOptions): GameRuntimeEntry {
    return new Chengdu1001RuntimeEntry(options);
}
