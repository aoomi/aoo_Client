import { assetManager, AssetManager, director, instantiate, Node, Prefab, UITransform, Widget } from 'cc';
import type { LegacySubgameTicket } from '../../../../../Common/Code/Runtime/subgame/AuthoritativeSubgameHandoff';
import { publishCommonRoomPublicView, type CommonRoomFeaturePorts, type CommonRoomPublicView, type GameRuntimeEntry } from '../../../../Common/Code/Runtime/GameRuntimeEntry';
import { createOwnedGameClient } from '../../../../../Common/Code/Runtime/network/ConnectionOwnership';
import type { ProtocolClient } from '../../../../../Common/Code/Runtime/network/ProtocolClient';
import { NnRuntimeController } from './NnRuntimeController';
import { NnRoomViewComponent } from './NnRoomViewComponent';
import { NN_PLAY_VERSION } from './NnRules';
import type { NnSnapshot } from './NnRoomState';
import { RoomSettlementHistoryFeed } from '../../../../Common/Code/Room/RoomSettlementHistory';
import { mountCommonRoomShell } from '../../../../Common/Code/Room/CommonRoomShellMount';

const BUNDLE = 'poker-nn';
const POKER_COMMON_BUNDLE = 'poker-common';
const REAL_TIME_RECORD_PREFAB = 'Prefab/RealTimeRecord';
const PREFAB_PATH = 'Prefab/NN_CommonRoom';
const SMALL_SETTLEMENT_PREFAB_PATH = 'Prefab/SmallSettlement';
const BIG_SETTLEMENT_PREFAB_PATH = 'Prefab/BigSettlement_0';

export interface NnRuntimeEntryOptions {
    readonly playerId: number;
    readonly requestPrefix: string;
    readonly host?: () => Node | null;
    readonly requestRoomExit: (roomId: number) => Promise<void>;
}

export class NnGameRuntimeEntry implements GameRuntimeEntry {
    public readonly id = 'nn';
    public readonly canonicalGameCodes = Object.freeze(['quanguo2998']);
    public readonly families = Object.freeze(['poker-betting']);
    public supportsPlayVersion(playVersion: string): boolean { return playVersion === NN_PLAY_VERSION; }
    private gameClient: ProtocolClient | null = null;
    private roomNode: Node | null = null;
    private commonRoomNode: Node | null = null;
    private roomView: NnRoomViewComponent | null = null;
    private controller: NnRuntimeController | null = null;
    private roomId = 0;
    private generation = 0;
    private readonly settlementHistory = new RoomSettlementHistoryFeed();

    public constructor(private readonly options: NnRuntimeEntryOptions) {
        if (!Number.isSafeInteger(options.playerId) || options.playerId <= 0 || !options.requestPrefix.trim()) {
            throw new Error('[NN] invalid runtime entry identity');
        }
    }

    public async preload(): Promise<void> {
        const bundle = await this.loadBundle();
        await Promise.all([this.loadPrefab(bundle, PREFAB_PATH),
            this.loadPrefab(bundle, SMALL_SETTLEMENT_PREFAB_PATH),
            this.loadPrefab(bundle, BIG_SETTLEMENT_PREFAB_PATH),
            this.loadPrefabFromBundle(POKER_COMMON_BUNDLE, REAL_TIME_RECORD_PREFAB)]);
    }

    public async enter(handoff: LegacySubgameTicket): Promise<void> {
        const generation = ++this.generation;
        this.releaseSession();
        const roomId = Number(handoff.roomId ?? handoff.roomID ?? handoff.roomKey);
        const authorityRoute = String(handoff.authorityRoute ?? '').trim();
        const gameTicket = String(handoff.gameTicket ?? '').trim();
        if (!Number.isSafeInteger(roomId) || roomId <= 0 || !authorityRoute || !gameTicket) {
            throw new Error('[NN] authoritative handoff is incomplete');
        }
        if (handoff.playVersion && handoff.playVersion !== NN_PLAY_VERSION) {
            throw new Error(`[NN] unexpected playVersion=${handoff.playVersion}`);
        }
        console.info('[NN] enter', { roomId, playVersion: NN_PLAY_VERSION, authorityRoute });
        const client = createOwnedGameClient();
        this.gameClient = client;
        try {
            client.setWsTicket(gameTicket);
            client.bindRoomAuthority(roomId, NN_PLAY_VERSION);
            await client.connect(authorityRoute);
            if (generation !== this.generation) return;
            const bundle = await this.loadBundle();
            const [prefab, smallSettlementPrefab, bigSettlementPrefab,
                realTimeRecordPrefab] = await Promise.all([
                this.loadPrefab(bundle, PREFAB_PATH),
                this.loadPrefab(bundle, SMALL_SETTLEMENT_PREFAB_PATH),
                this.loadPrefab(bundle, BIG_SETTLEMENT_PREFAB_PATH),
                this.loadPrefabFromBundle(POKER_COMMON_BUNDLE, REAL_TIME_RECORD_PREFAB),
            ]);
            if (generation !== this.generation) return;
            const host = this.options.host?.() ?? director.getScene()?.getChildByName('Canvas') ?? null;
            if (!host?.isValid) throw new Error('[NN] room host is unavailable');
            const roomNode = instantiate(prefab);
            host.addChild(roomNode);
            this.roomNode = roomNode;
            const commonRoom = await mountCommonRoomShell(host);
            this.commonRoomNode = commonRoom;
            this.roomId = roomId;
            this.configureCommonRoomLayout(commonRoom, roomNode.layer);
            const roomView = roomNode.getComponent(NnRoomViewComponent)
                ?? roomNode.addComponent(NnRoomViewComponent);
            this.roomView = roomView;
            roomView.attachCommonRoom(commonRoom, roomId, realTimeRecordPrefab);
            const controller = new NnRuntimeController(client, roomView, roomId,
                this.options.playerId, this.options.requestPrefix,
                snapshot => { this.publishCommonRoomSeats(snapshot); this.recordSettlement(snapshot); });
            this.controller = controller;
            roomView.attachSettlementPrefabs(smallSettlementPrefab, bigSettlementPrefab,
                () => controller.continueRound());
            roomView.bindActions({
                sit: () => controller.sit(), rob: value => controller.rob(value),
                bet: value => controller.bet(value),
                start: () => controller.start(),
                toggleSplitCard: (seat, cardIndex) => controller.toggleSplitCard(seat, cardIndex),
                split: () => controller.split(),
                continueRound: () => controller.continueRound(),
                seatContext: () => controller.seatInputContext(),
            });
            await controller.state();
            console.info('[NN] initial state ready', { roomId, playVersion: NN_PLAY_VERSION });
        } catch (error: unknown) {
            console.error('[NN] enter failed', { roomId, playVersion: NN_PLAY_VERSION,
                reason: error instanceof Error ? error.message : String(error) });
            this.releaseSession();
            throw error;
        }
    }

    public commonRoomPorts(): CommonRoomFeaturePorts {
        const root = this.commonRoomNode;
        const view = this.roomView;
        if (!root?.isValid || !view?.isValid || this.roomId <= 0) {
            throw new Error('[NN] common room is not mounted');
        }
        return {
            mountedRoot: root,
            exit: { request: async () => {
                await this.options.requestRoomExit(this.roomId);
                this.destroy();
            } },
            openRoomRule: async () => view.toggleRoomRules(),
            settlementHistoryRenderer: {
                open: (entries, close) => {
                    const latest = entries.at(-1)?.payload as NnSnapshot | undefined;
                    if (!latest) throw new Error('[NN] authoritative settlement is unavailable');
                    view.openSettlementHistory(latest, close);
                },
                close: () => view.closeSettlementHistory(),
                destroy: () => view.closeSettlementHistory(),
            },
            settlementHistoryFeed: this.settlementHistory,
        };
    }

    /** Refreshes the gameplay projection after the shared room transport recovers. */
    public async restoreAfterReconnect(): Promise<void> {
        if (!this.gameClient || !this.roomId) return;
        // NnRuntimeController owns the authoritative cursor and presenter;
        // its state request is the single recovery read path.
        await this.controller?.state();
    }

    private publishCommonRoomSeats(snapshot: NnSnapshot): void {
        const seatCount = snapshot.maxPlayers;
        const localSeatId = snapshot.viewerStatus === 'SEATED' ? snapshot.viewerSeat : -1;
        const seats = Array.from({ length: seatCount }, (_, seatId) => {
            const playerId = Number(snapshot.players[seatId] ?? 0);
            if (!Number.isSafeInteger(playerId) || playerId <= 0) return Object.freeze({ seatId, occupied: false });
            const score = Number(snapshot.totalScores[playerId] ?? 0);
            return Object.freeze({ seatId, occupied: true, playerId,
                displayName: String(snapshot.playerNames?.[seatId] ?? `玩家${playerId}`).trim() || `玩家${playerId}`,
                score: Number.isFinite(score) ? score : 0 });
        });
        const view: CommonRoomPublicView = Object.freeze({ seatCount, localSeatId, seats: Object.freeze(seats) });
        publishCommonRoomPublicView(this.roomId, view,
            Object.freeze({ stateVersion: snapshot.stateVersion, roundNo: snapshot.round }));
    }

    private recordSettlement(snapshot: NnSnapshot): void {
        if (snapshot.phase !== 'SETTLEMENT' && snapshot.phase !== 'FINISHED') return;
        const identity = `${snapshot.roomId}:${snapshot.round}:${snapshot.phase}`;
        this.settlementHistory.record({ identity, payload: snapshot });
    }

    public destroy(): void {
        this.generation += 1;
        this.releaseSession();
    }

    private loadBundle(): Promise<AssetManager.Bundle> {
        const loaded = assetManager.getBundle(BUNDLE);
        if (loaded) return Promise.resolve(loaded);
        return new Promise((resolve, reject) => assetManager.loadBundle(BUNDLE,
            (error, bundle) => error || !bundle ? reject(error ?? new Error('[NN] bundle unavailable')) : resolve(bundle)));
    }
    private loadPrefab(bundle: AssetManager.Bundle, path: string): Promise<Prefab> {
        return new Promise((resolve, reject) => bundle.load(path, Prefab, (error, prefab) => {
            if (error || !prefab) {
                const failure = error ?? new Error(`[NN] prefab unavailable path=${path}`);
                console.error('[NN] prefab load failed', { bundle: BUNDLE, path,
                    reason: failure instanceof Error ? failure.message : String(failure) });
                reject(failure);
                return;
            }
            resolve(prefab);
        }));
    }
    private async loadPrefabFromBundle(bundleName: string, path: string): Promise<Prefab> {
        const bundle = assetManager.getBundle(bundleName) ?? await new Promise<ReturnType<typeof assetManager.getBundle>>((resolve, reject) => {
            assetManager.loadBundle(bundleName, (error, loaded) => error || !loaded
                ? reject(error ?? new Error(`[NN] bundle unavailable name=${bundleName}`)) : resolve(loaded));
        });
        if (!bundle) throw new Error(`[NN] bundle unavailable name=${bundleName}`);
        return new Promise<Prefab>((resolve, reject) => bundle.load(path, Prefab, (error, prefab) =>
            error || !prefab ? reject(error ?? new Error(`[NN] prefab unavailable path=${path}`)) : resolve(prefab)));
    }
    private configureCommonRoomLayout(commonRoom: Node, gameLayer: number): void {
        const widget = commonRoom.getComponent(Widget);
        if (widget) widget.enabled = false;
        commonRoom.getComponent(UITransform)?.setContentSize(1280, 720);
        commonRoom.setPosition(0, 0, 1);
        commonRoom.setScale(1, 1, 1);
        this.setLayerRecursively(commonRoom, gameLayer);
        console.info('[NN] common room layout fixed', {
            commonRoom: commonRoom.name, gameLayer, designWidth: 1280, designHeight: 720,
        });
    }
    private setLayerRecursively(node: Node, layer: number): void {
        node.layer = layer;
        for (const child of node.children) this.setLayerRecursively(child, layer);
    }
    private releaseSession(): void {
        this.settlementHistory.clear();
        this.roomView = null;
        this.controller = null;
        this.roomId = 0;
        if (this.commonRoomNode?.isValid) this.commonRoomNode.destroy();
        this.commonRoomNode = null;
        if (this.roomNode?.isValid) this.roomNode.destroy();
        this.roomNode = null;
        this.gameClient?.close();
        this.gameClient = null;
    }
}

export function createNnGameRuntimeEntry(options: NnRuntimeEntryOptions): GameRuntimeEntry {
    return new NnGameRuntimeEntry(options);
}
