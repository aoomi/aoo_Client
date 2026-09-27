import { assetManager, instantiate, Node, Prefab, SpriteAtlas } from 'cc';
import type { LegacySubgameTicket } from '../../../../../Common/Code/Runtime/subgame/AuthoritativeSubgameHandoff';
import { COMMON_PREFAB_BUNDLE } from '../../../../../Common/Code/Runtime/ui/CommonPrefabRegistry';
import { createOwnedGameClient } from '../../../../../Common/Code/Runtime/network/ConnectionOwnership';
import type { ProtocolClient } from '../../../../../Common/Code/Runtime/network/ProtocolClient';
import type { GameRuntimeEntry } from '../../../../Common/Code/Runtime/GameRuntimeEntry';
import {
    CD101SmallSettlementAdapter,
    type CD101RoundSettlementData,
} from './CD101SmallSettlementAdapter';
import {
    CDXZBigSettlementAdapter,
    type CDXZBigSettlementData,
} from './CDXZBigSettlementAdapter';
import { CD101RoomView, type CD101GangCandidate, type CD101RoomSnapshot } from './CD101RoomView';

const BUNDLE = 'games-mahjong';
const COMMON_ROOM = 'Prefab/CommonRoom';
const TILE_ATLAS = 'Common/Atlas/CDXZ_JDZ2D/mjAtlas';
const SMALL_SETTLEMENT = 'Common/Prefab/CD101SmallSettlement_JDZ2D';
const BIG_SETTLEMENT = 'Common/Prefab/BigSettlement_0';
const DISPATCH = 'mahjong.cdxzmj.dispatch';
const RESPONSE = 'mahjong.cdxzmj.response';

export interface CD101GameRuntimeEntryOptions {
    readonly parent: Node;
    /** Gateway ticket identity; distinct from the public RoleSession.playerId. */
    readonly accountId: number;
    readonly requestRoomExit: (roomId: number) => Promise<void>;
}

/** Dedicated CD101 runtime with only the catalog-authority protocol. */
export class CD101GameRuntimeEntry implements GameRuntimeEntry {
    public readonly id = 'cd101-xuezhan';
    public readonly canonicalGameCodes = Object.freeze(['CD101']);
    /** Exact stable code only: other xue-zhan catalog games must not resolve to CD101. */
    public readonly families = Object.freeze([] as string[]);
    private client: ProtocolClient | null = null;
    private view: CD101RoomView | null = null;
    private smallSettlement: CD101SmallSettlementAdapter | null = null;
    private bigSettlement: CDXZBigSettlementAdapter | null = null;
    private smallNode: Node | null = null;
    private bigNode: Node | null = null;
    private snapshot: CD101RoomSnapshot | null = null;
    private roomId = 0;
    private playVersion = '';
    private sequence = 0;
    private pending = false;
    private generation = 0;

    public constructor(private readonly options: CD101GameRuntimeEntryOptions) {
        if (!options.parent || !Number.isSafeInteger(options.accountId) || options.accountId <= 0) {
            throw new Error('[CD101] invalid runtime identity');
        }
    }

    public async preload(): Promise<void> {
        await Promise.all([
            this.loadPrefab(SMALL_SETTLEMENT), this.loadPrefab(BIG_SETTLEMENT),
            this.loadPrefab(COMMON_ROOM, COMMON_PREFAB_BUNDLE), this.loadTileAtlas(),
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
            throw new Error('[CD101] authoritative handoff is incomplete');
        }
        const client = createOwnedGameClient();
        this.client = client;
        try {
            client.setWsTicket(gameTicket);
            client.bindRoomAuthority(this.roomId, this.playVersion);
            client.on(RESPONSE, body => { void this.accept(body, 'push'); });
            client.on('game.state_push', body => { void this.accept(body, 'game-push'); });
            client.on('common.room.state_push', body => { void this.accept(body, 'common-push'); });
            await client.connect(authorityRoute);
            this.assertCurrent(generation);
            const [smallPrefab, bigPrefab, commonRoomPrefab, tileAtlas] = await Promise.all([
                this.loadPrefab(SMALL_SETTLEMENT), this.loadPrefab(BIG_SETTLEMENT),
                this.loadPrefab(COMMON_ROOM, COMMON_PREFAB_BUNDLE), this.loadTileAtlas(),
            ]);
            this.assertCurrent(generation);
            this.mountUi(smallPrefab, bigPrefab, commonRoomPrefab, tileAtlas);
            const initial = await this.dispatch('state', {}, 0);
            this.assertCurrent(generation);
            const localSeat = this.findLocalSeat(initial);
            if (localSeat < 0) throw new Error('[CD101] Hall membership is absent from Mahjong authority');
            await this.applySnapshot(initial, 'state');
            console.info('[CD101]', { action: 'entered', roomId: this.roomId,
                accountId: this.options.accountId, playVersion: this.playVersion,
                stateVersion: initial.stateVersion, localSeat });
        } catch (error: unknown) {
            console.error('[CD101]', { action: 'enter-failed', roomId: this.roomId,
                reason: error instanceof Error ? error.message : String(error) });
            this.destroy();
            throw error;
        }
    }

    public destroy(): void {
        this.generation += 1;
        this.smallSettlement?.dispose(); this.smallSettlement = null;
        this.bigSettlement?.dispose(); this.bigSettlement = null;
        this.smallNode?.destroy(); this.smallNode = null;
        this.bigNode?.destroy(); this.bigNode = null;
        this.view?.destroy(); this.view = null;
        this.client?.close(); this.client = null;
        this.snapshot = null; this.roomId = 0; this.playVersion = ''; this.sequence = 0; this.pending = false;
    }

    private mountUi(smallPrefab: Prefab, bigPrefab: Prefab, commonRoomPrefab: Prefab,
        tileAtlas: SpriteAtlas): void {
        const view = new CD101RoomView({
            ready: () => this.run('ready'), start: () => this.run('start'), draw: () => this.run('draw'),
            discard: tile => this.run('discard', { tile: this.requireTile(tile) }),
            hu: () => this.run('hu'), pass: () => this.run('pass'),
            peng: tiles => this.run('peng', { consumedTiles: tiles }),
            gang: (candidate, stateVersion) => this.runGang(candidate, stateVersion),
            exchange: tiles => this.run('exchange', { tiles: this.requireExchange(tiles) }),
            dingque: suit => this.run('dingque', { suit }), refresh: () => this.run('state'),
            exit: async () => { await this.options.requestRoomExit(this.roomId); this.destroy(); },
        }, commonRoomPrefab, tileAtlas);
        this.options.parent.addChild(view.root);
        this.view = view;

        this.smallNode = instantiate(smallPrefab);
        this.smallNode.active = false;
        view.root.addChild(this.smallNode);
        this.smallSettlement = new CD101SmallSettlementAdapter(this.smallNode, {
            continueGame: () => this.run('continue'),
            exitRoom: async () => { await this.options.requestRoomExit(this.roomId); this.destroy(); },
        });

        this.bigNode = instantiate(bigPrefab);
        this.bigNode.active = false;
        view.root.addChild(this.bigNode);
        this.bigSettlement = new CDXZBigSettlementAdapter(this.bigNode, {
            returnLobby: async () => { await this.options.requestRoomExit(this.roomId); this.destroy(); },
            continueGame: () => this.run('continue'),
        });
    }

    private async run(action: string, payload: Readonly<Record<string, unknown>> = {}): Promise<void> {
        if (this.pending) return;
        this.pending = true;
        try {
            const seat = this.requireLocalSeat();
            const snapshot = await this.dispatch(action, payload, seat);
            await this.applySnapshot(snapshot, action);
        } finally {
            this.pending = false;
        }
    }

    private async runGang(candidate: CD101GangCandidate, stateVersion: number): Promise<void> {
        const current = this.snapshot;
        if (!current || current.stateVersion !== stateVersion
            || !current.gangCandidates.some(item => item.type === candidate.type
                && item.mahjongId === candidate.mahjongId)) {
            throw new Error('[CD101] gang candidate expired; refresh the room state');
        }
        await this.run('gang', { type: candidate.type, mahjongId: candidate.mahjongId, stateVersion });
    }

    private async dispatch(action: string, payload: Readonly<Record<string, unknown>>, seatId: number): Promise<CD101RoomSnapshot> {
        if (!this.client) throw new Error('[CD101] runtime is not connected');
        const sequence = ++this.sequence;
        const raw = await this.client.request<unknown>(DISPATCH, Object.freeze({
            roomId: this.roomId,
            playVersion: this.playVersion,
            roundNo: this.snapshot?.roundNo ?? 0,
            sequence,
            seatId,
            action,
            payload: Object.freeze({ ...payload }),
        }));
        const snapshot = this.parseSnapshot(raw);
        console.info('[CD101]', { action: 'authority-response', intent: action, roomId: this.roomId,
            sequence, stateVersion: snapshot.stateVersion, phase: snapshot.phase });
        return snapshot;
    }

    private async accept(raw: unknown, source: string): Promise<void> {
        try {
            const snapshot = this.parseSnapshot(raw);
            if (this.snapshot && snapshot.stateVersion < this.snapshot.stateVersion) return;
            await this.applySnapshot(snapshot, source);
        } catch (error: unknown) {
            console.info('[CD101]', { action: 'ignored-push', source,
                reason: error instanceof Error ? error.message : String(error) });
        }
    }

    private async applySnapshot(snapshot: CD101RoomSnapshot, source: string): Promise<void> {
        if (!this.view) return;
        this.snapshot = snapshot;
        this.view.render(snapshot, this.options.accountId);
        this.smallSettlement?.hide();
        this.bigSettlement?.hide();
        if (snapshot.roundScored && snapshot.roomFinished) {
            await this.bigSettlement?.render(this.bigSettlementData(snapshot));
        } else if (snapshot.roundScored) {
            await this.smallSettlement?.render(this.smallSettlementData(snapshot));
        }
        console.info('[CD101]', { action: 'snapshot-applied', source, roomId: snapshot.roomId,
            stateVersion: snapshot.stateVersion, roundNo: snapshot.roundNo,
            roundScored: snapshot.roundScored, roomFinished: snapshot.roomFinished });
    }

    private parseSnapshot(raw: unknown): CD101RoomSnapshot {
        let value = raw;
        for (let depth = 0; depth < 3; depth += 1) {
            if (!value || typeof value !== 'object') break;
            const record = value as Record<string, unknown>;
            const nested = record.payload ?? record.body;
            if (!nested || typeof nested !== 'object') break;
            value = nested;
        }
        if (!value || typeof value !== 'object') throw new Error('[CD101] authority snapshot is missing');
        const snapshot = value as CD101RoomSnapshot;
        if (Number(snapshot.roomId) !== this.roomId || String(snapshot.gameCode).toLowerCase() !== 'cdxzmj'
            || !Number.isSafeInteger(Number(snapshot.stateVersion))
            || !['LOBBY', 'PLAYING', 'SETTLED'].includes(String(snapshot.phase))
            || !snapshot.seats || typeof snapshot.seats !== 'object'
            || !Array.isArray(snapshot.gangCandidates)
            || snapshot.gangCandidates.some(candidate => ![2, 3, 4].includes(candidate.type)
                || !Number.isSafeInteger(candidate.mahjongId) || candidate.mahjongId <= 0)) {
            throw new Error('[CD101] authority snapshot identity mismatch');
        }
        return snapshot;
    }

    private smallSettlementData(snapshot: CD101RoomSnapshot): CD101RoundSettlementData {
        const delta = snapshot.roundScoreDelta ?? {};
        return {
            roomId: String(snapshot.roomId), stateVersion: snapshot.stateVersion,
            currentRound: snapshot.roundNo, totalRounds: snapshot.totalRounds,
            settledAtText: '--', ruleText: '成都血战麻将 · 服务器权威结算',
            players: Object.values(snapshot.seats).map(seat => ({
                playerId: String(seat.playerId), displayName: `玩家 ${seat.playerId}`,
                scoreDelta: Number(delta[String(seat.playerId)] ?? 0), detailLines: [],
            })),
        };
    }

    private bigSettlementData(snapshot: CD101RoomSnapshot): CDXZBigSettlementData {
        return {
            roomId: String(snapshot.roomId), stateVersion: snapshot.stateVersion,
            currentRound: snapshot.completedRounds, totalRounds: snapshot.totalRounds,
            endedAtText: '--', roomFinished: snapshot.roomFinished,
            players: Object.values(snapshot.seats).map(seat => ({
                playerId: String(seat.playerId), displayName: `玩家 ${seat.playerId}`,
                totalScore: Number(snapshot.totalScore[String(seat.playerId)] ?? 0),
            })),
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
        if (seat < 0) throw new Error('[CD101] local player is not seated');
        return seat;
    }

    private requireTile(tile: number): number {
        if (!Number.isSafeInteger(tile) || tile <= 0) throw new Error('[CD101] select one hand tile first');
        return tile;
    }

    private requireExchange(tiles: readonly number[]): readonly number[] {
        if (tiles.length !== 3 || tiles.some(tile => !Number.isSafeInteger(tile) || tile <= 0)) {
            throw new Error('[CD101] exchange requires exactly three selected tiles');
        }
        return [...tiles];
    }

    private assertCurrent(generation: number): void {
        if (generation !== this.generation) throw new Error('[CD101] runtime entry superseded');
    }

    private async loadPrefab(path: string, bundleName = BUNDLE): Promise<Prefab> {
        const bundle = await this.loadBundle(bundleName);
        return new Promise<Prefab>((resolve, reject) => bundle.load(path, Prefab, (error, loaded) =>
            error || !loaded ? reject(error ?? new Error(`[CD101] prefab unavailable path=${path}`)) : resolve(loaded)));
    }

    private async loadTileAtlas(): Promise<SpriteAtlas> {
        const bundle = await this.loadBundle(BUNDLE);
        return new Promise<SpriteAtlas>((resolve, reject) => bundle.load(TILE_ATLAS, SpriteAtlas, (error, loaded) =>
            error || !loaded ? reject(error ?? new Error(`[CD101] tile atlas unavailable path=${TILE_ATLAS}`)) : resolve(loaded)));
    }

    private async loadBundle(name: string): Promise<NonNullable<ReturnType<typeof assetManager.getBundle>>> {
        const bundle = assetManager.getBundle(name) ?? await new Promise<ReturnType<typeof assetManager.getBundle>>(
            (resolve, reject) => assetManager.loadBundle(name, (error, loaded) =>
                error || !loaded ? reject(error ?? new Error(`[CD101] bundle unavailable name=${name}`)) : resolve(loaded)),
        );
        if (!bundle) throw new Error(`[CD101] bundle unavailable name=${name}`);
        return bundle;
    }
}

export function createCD101GameRuntimeEntry(options: CD101GameRuntimeEntryOptions): GameRuntimeEntry {
    return new CD101GameRuntimeEntry(options);
}
