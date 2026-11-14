import { assetManager, AssetManager, Button, instantiate, Label, Layers, Node, Prefab, RenderRoot2D, UITransform, Widget } from 'cc';
import type { LegacySubgameTicket } from '../../../../../Common/Code/Runtime/subgame/AuthoritativeSubgameHandoff';
import { publishCommonRoomPublicView, type CommonRoomFeaturePorts, type CommonRoomPublicView, type GameRuntimeEntry } from '../../../../Common/Code/Runtime/GameRuntimeEntry';
import { createOwnedGameClient } from '../../../../../Common/Code/Runtime/network/ConnectionOwnership';
import type { ProtocolClient } from '../../../../../Common/Code/Runtime/network/ProtocolClient';
import { ZjhProtocolAdapter, ZjhProtocolClientTransport, type ZjhSettlementResult } from './ZjhProtocol';
import { RoomSettlementHistoryFeed } from '../../../../Common/Code/Room/RoomSettlementHistory';
import { ZJH_PLAY_VERSION } from './ZjhRules';
import { ZjhRoomController } from './ZjhRoomController';
import type { ZjhSnapshot } from './ZjhRoomState';

export const ZJH_RUNTIME_ASSETS = Object.freeze({
    room: Object.freeze({ bundle: 'poker-zjh', path: 'Prefab/ZJH_CommonRoom' }),
    commonRoom: Object.freeze({ bundle: 'games-common', path: 'Prefab/CommonRoom' }),
    realtimeRecord: Object.freeze({ bundle: 'poker-common', path: 'Prefab/RealTimeRecord' }),
    smallSettlement: Object.freeze({ bundle: 'poker-zjh', path: 'Prefab/SmallSettlement' }),
    bigSettlement: Object.freeze({ bundle: 'poker-zjh', path: 'Prefab/BigSettlement_0' }),
});

export interface ZjhRuntimeEntryOptions {
    readonly playerId: number;
    readonly host: () => Node | null;
    readonly requestRoomExit: (roomId: number) => Promise<void>;
}

type LoadedAssets = Readonly<Record<keyof typeof ZJH_RUNTIME_ASSETS, Prefab>>;
type Binding = Readonly<{ node: Node; event: string; callback: () => void }>;

/** Owns the complete ZJH room session: table, common shell, record and settlement overlays. */
export class ZjhGameRuntimeEntry implements GameRuntimeEntry {
    public readonly id = 'zjh';
    public readonly canonicalGameCodes = Object.freeze(['quanguo2997']);
    public readonly families = Object.freeze(['poker-compare-hand']);
    public supportsPlayVersion(playVersion: string): boolean { return playVersion === ZJH_PLAY_VERSION; }
    private gameClient: ProtocolClient | null = null;
    private controller: ZjhRoomController | null = null;
    private mounted: Node[] = [];
    private bindings: Binding[] = [];
    private generation = 0;
    private exitStarted = false;
    private roomId = 0;
    private assets: LoadedAssets | null = null;
    private commonRoom: Node | null = null;
    private recordNode: Node | null = null;
    private settlementNode: Node | null = null;
    private readonly settlementHistory = new RoomSettlementHistoryFeed();
    private settlementHistoryClose: (() => void) | null = null;
    private cumulativeScores = new Map<number, number>();

    public constructor(private readonly options: ZjhRuntimeEntryOptions) {
        if (!Number.isSafeInteger(options.playerId) || options.playerId <= 0) {
            throw new Error('[ZJH] runtime player identity is invalid');
        }
    }

    public async preload(): Promise<void> { await this.loadAssets(); }

    public async enter(handoff: LegacySubgameTicket): Promise<void> {
        this.destroy();
        const generation = ++this.generation;
        const roomId = Number(handoff.roomId ?? handoff.roomID ?? 0);
        const authorityRoute = String(handoff.authorityRoute ?? '').trim();
        const gameTicket = String(handoff.gameTicket ?? '').trim();
        if (!Number.isSafeInteger(roomId) || roomId <= 0 || !authorityRoute || !gameTicket
            || (handoff.playVersion && handoff.playVersion !== ZJH_PLAY_VERSION)) {
            throw new Error('[ZJH] authoritative handoff is invalid');
        }
        const host = this.options.host();
        if (!host?.isValid) throw new Error('[ZJH] room host is unavailable');
        const gameClient = createOwnedGameClient();
        this.gameClient = gameClient;
        this.roomId = roomId;
        try {
            gameClient.setWsTicket(gameTicket);
            gameClient.bindRoomAuthority(roomId, ZJH_PLAY_VERSION);
            await gameClient.connect(authorityRoute);
            this.assertCurrent(generation);
            const assets = await this.loadAssets();
            this.assertCurrent(generation);
            const room = this.mount(host, assets.room);
            const commonRoom = this.mount(host, assets.commonRoom);
            const record = this.mount(host, assets.realtimeRecord);
            this.commonRoom = commonRoom;
            this.recordNode = record;
            record.active = false;
            this.applyUiLayer(room);
            this.configureOverlay(commonRoom, room.layer, 1);
            this.configureOverlay(record, room.layer, 20);
            this.setLabel(commonRoom, 'RoomInfo/Lb_RoomId', `房号 ${roomId}`);
            this.bindCommonRoom(commonRoom);
            const trace = handoff as LegacySubgameTicket & { stateVersion?: unknown; roundNo?: unknown };
            let stateVersion = this.nonNegativeInteger(trace.stateVersion);
            let roundNo = this.nonNegativeInteger(trace.roundNo);
            const protocol = new ZjhProtocolAdapter(new ZjhProtocolClientTransport(gameClient), roomId,
                () => stateVersion, () => roundNo, `zjh-${roomId}`);
            const controller = new ZjhRoomController(protocol, gameClient, room, this.options.playerId,
                snapshot => this.publishCommonRoomSeats(snapshot),
                (settlementRound, settlement) => this.presentSettlement(settlementRound, settlement));
            this.controller = controller;
            const initial = await controller.initialize();
            this.assertCurrent(generation);
            stateVersion = initial.stateVersion;
            roundNo = initial.roundNo;
            this.setLabel(commonRoom, 'RoomInfo/Lb_Round', `第 ${roundNo} 局`);
            console.info('[ZjhGameRuntimeEntry]', { action: 'entered', roomId,
                playVersion: ZJH_PLAY_VERSION, stateVersion, roundNo });
        } catch (error) {
            if (generation === this.generation) this.releaseSession();
            throw error;
        }
    }

    public destroy(): void { this.generation += 1; this.releaseSession(); }

    public commonRoomPorts(): CommonRoomFeaturePorts {
        const root = this.commonRoom;
        if (!root?.isValid || this.roomId <= 0) throw new Error('[ZJH] common room is not mounted');
        return {
            mountedRoot: root,
            exit: { request: async () => {
                await this.options.requestRoomExit(this.roomId);
                this.destroy();
            } },
            settlementHistoryRenderer: {
                open: (entries, close) => {
                    const latest = entries.at(-1)?.payload as
                        { roundNo: number; settlement: Readonly<ZjhSettlementResult> } | undefined;
                    if (!latest) throw new Error('[ZJH] authoritative settlement is unavailable');
                    this.settlementHistoryClose = close;
                    this.showSettlementOverlay(latest.roundNo, latest.settlement);
                },
                close: () => this.closeSettlementOverlay(),
                destroy: () => this.closeSettlementOverlay(),
            },
            settlementHistoryFeed: this.settlementHistory,
        };
    }

    /** Refreshes the gameplay projection after the shared room transport recovers. */
    public async restoreAfterReconnect(): Promise<void> {
        await this.controller?.restoreAfterReconnect();
    }

    private publishCommonRoomSeats(snapshot: ZjhSnapshot): void {
        const seatCount = snapshot.seatLimit;
        const localSeatId = snapshot.viewerRole === 'SEATED'
            ? Object.entries(snapshot.seats).find(([, seat]) => seat.playerId === this.options.playerId)?.[0]
            : undefined;
        const localSeat = localSeatId === undefined ? -1 : Number(localSeatId);
        const seats = Array.from({ length: seatCount }, (_, seatId) => {
            const source = snapshot.seats[seatId];
            const playerId = Number(source?.playerId ?? 0);
            if (!Number.isSafeInteger(playerId) || playerId <= 0 || !source.active) {
                return Object.freeze({ seatId, occupied: false });
            }
            return Object.freeze({ seatId, occupied: true, playerId,
                displayName: `玩家${playerId}`, score: 0 });
        });
        const view: CommonRoomPublicView = Object.freeze({ seatCount, localSeatId: localSeat, seats: Object.freeze(seats) });
        publishCommonRoomPublicView(this.roomId, view,
            Object.freeze({ stateVersion: snapshot.stateVersion, roundNo: snapshot.roundNo }));
    }

    private async loadAssets(): Promise<LoadedAssets> {
        if (this.assets) return this.assets;
        const entries = await Promise.all(Object.entries(ZJH_RUNTIME_ASSETS).map(async ([key, ref]) => {
            const bundle = await this.loadBundle(ref.bundle);
            return [key, await this.loadPrefab(bundle, ref.path)] as const;
        }));
        this.assets = Object.freeze(Object.fromEntries(entries)) as LoadedAssets;
        return this.assets;
    }

    private loadBundle(name: string): Promise<AssetManager.Bundle> {
        const loaded = assetManager.getBundle(name);
        if (loaded) return Promise.resolve(loaded);
        return new Promise((resolve, reject) => assetManager.loadBundle(name, (error, bundle) =>
            error || !bundle ? reject(error ?? new Error(`[ZJH] bundle unavailable name=${name}`)) : resolve(bundle)));
    }

    private loadPrefab(bundle: AssetManager.Bundle, path: string): Promise<Prefab> {
        return new Promise((resolve, reject) => bundle.load(path, Prefab, (error, prefab) =>
            error || !prefab ? reject(error ?? new Error(`[ZJH] prefab unavailable path=${path}`)) : resolve(prefab)));
    }

    private mount(host: Node, prefab: Prefab): Node {
        const node = instantiate(prefab);
        host.addChild(node);
        this.mounted.push(node);
        return node;
    }

    private bindCommonRoom(commonRoom: Node): void {
        const record = this.require(commonRoom, 'Btn/RealTimeRecord');
        if (!record.getComponent(Button)) throw new Error('[ZJH] CommonRoom real-time record button is missing');
        // CommonRoom authors optional capabilities hidden. ZJH owns a real
        // record overlay, so publish its user entry while keeping the overlay
        // itself closed until the player explicitly clicks it.
        record.active = true;
        this.bind(record, () => { if (this.recordNode?.isValid) this.recordNode.active = !this.recordNode.active; });
        this.bind(this.require(this.recordNode!, 'Mask'), () => {
            if (this.recordNode?.isValid) this.recordNode.active = false;
        });
    }

    private requestExit(button?: Button): void {
        if (this.exitStarted) return;
        this.exitStarted = true;
        if (button) button.interactable = false;
        void this.options.requestRoomExit(this.roomId).then(() => this.destroy()).catch((error: unknown) => {
            this.exitStarted = false;
            if (button?.node.isValid) button.interactable = true;
            console.error('[ZJH] room exit failed', { roomId: this.roomId,
                reason: error instanceof Error ? error.message : String(error) });
        });
    }

    private presentSettlement(roundNo: number, settlement: Readonly<ZjhSettlementResult>): void {
        for (const entry of settlement.entries) {
            this.cumulativeScores.set(entry.playerId,
                settlement.cumulativeEntries?.find(item => item.playerId === entry.playerId)?.scoreDelta
                ?? ((this.cumulativeScores.get(entry.playerId) ?? 0) + entry.scoreDelta));
        }
        this.renderRealtimeRecord(roundNo);
        const identity = `${this.roomId}:${roundNo}:${settlement.final ? 'final' : 'round'}`;
        this.settlementHistory.record({ identity, payload: Object.freeze({ roundNo, settlement }) });
        this.showSettlementOverlay(roundNo, settlement);
    }

    private showSettlementOverlay(roundNo: number, settlement: Readonly<ZjhSettlementResult>): void {
        if (this.settlementNode?.isValid) this.settlementNode.destroy();
        const prefab = settlement.final ? this.assets?.bigSettlement : this.assets?.smallSettlement;
        const host = this.commonRoom?.parent;
        if (!prefab || !host?.isValid) throw new Error('[ZJH] settlement assets are unavailable');
        const overlay = this.mount(host, prefab);
        this.settlementNode = overlay;
        this.configureOverlay(overlay, this.commonRoom?.layer ?? Layers.Enum.UI_2D, 30);
        if (settlement.final) this.renderBigSettlement(overlay, roundNo, settlement);
        else this.renderSmallSettlement(overlay, roundNo, settlement);
    }

    private closeSettlementOverlay(): void {
        this.settlementHistoryClose = null;
        if (this.settlementNode?.isValid) this.settlementNode.destroy();
        this.settlementNode = null;
    }

    private renderRealtimeRecord(roundNo: number): void {
        const root = this.recordNode;
        if (!root?.isValid) return;
        this.setLabel(root, 'Score/Top/RoomID', `房号 ${this.roomId}`);
        this.setLabel(root, 'Score/Top/Time', `第 ${roundNo} 局`);
        const content = this.require(root, 'Score/Players/View/Content');
        const template = this.require(content, 'Clone');
        this.resetClones(content, template);
        [...this.cumulativeScores.entries()].forEach(([playerId, score], index) => {
            const row = index === 0 ? template : instantiate(template);
            if (index > 0) content.addChild(row);
            row.active = true;
            this.setLabel(row, 'Head/NickName/Name', `玩家 ${playerId}`);
            this.setScore(row, 'Score/Win', 'Score/Lose', score);
        });
    }

    private renderSmallSettlement(root: Node, roundNo: number, settlement: Readonly<ZjhSettlementResult>): void {
        this.setLabel(root, 'Small/Top/RoomID', `房号 ${this.roomId}`);
        this.setLabel(root, 'Small/Top/Time', `第 ${roundNo} 局`);
        const content = this.require(root, 'Small/Players/View/Content');
        const template = this.require(content, 'Clone');
        this.resetClones(content, template);
        settlement.entries.forEach((entry, index) => {
            const row = index === 0 ? template : instantiate(template);
            if (index > 0) content.addChild(row);
            row.active = true;
            this.setLabel(row, 'Head/NickName/Name', `玩家 ${entry.playerId}`);
            this.setScore(row, 'Score/Win', 'Score/Lose', entry.scoreDelta);
        });
        this.bind(this.require(root, 'Small/Bottom/Btns/Goon'), () => {
            const close = this.settlementHistoryClose;
            this.settlementHistoryClose = null;
            if (close) { close(); return; }
            if (root.isValid) root.destroy();
            this.settlementNode = null;
            this.controller?.invoke('continue');
        });
        this.bind(this.require(root, 'Small/Bottom/Btns/BigSettlement'), () => {
            const close = this.settlementHistoryClose;
            this.settlementHistoryClose = null;
            if (close) { close(); return; }
            if (root.isValid) root.destroy();
            this.settlementNode = null;
            if (this.recordNode?.isValid) this.recordNode.active = true;
        });
    }

    private renderBigSettlement(root: Node, roundNo: number, settlement: Readonly<ZjhSettlementResult>): void {
        this.setLabel(root, 'FinalSettlementPanel/TopBar/RoomIdLabel', `房号 ${this.roomId}`);
        this.setLabel(root, 'FinalSettlementPanel/TopBar/RoundCountLabel', `共 ${roundNo} 局`);
        const entries = settlement.cumulativeEntries ?? settlement.entries;
        const content = this.require(root, 'FinalSettlementPanel/PlayerList/PlayerListView/PlayerListContent');
        const template = this.require(content, 'PlayerItemTemplate');
        this.resetClones(content, template);
        entries.forEach((entry, index) => {
            const row = index === 0 ? template : instantiate(template);
            if (index > 0) content.addChild(row);
            row.active = true;
            this.setLabel(row, 'Head/NickNameBackground/PlayerNameLabel', `玩家 ${entry.playerId}`);
            this.setScore(row, 'TotalScore/TotalWinScoreLabel', 'TotalScore/TotalLoseScoreLabel', entry.scoreDelta);
        });
        for (const path of ['FinalSettlementPanel/BottomBar/NormalActions/Btn_ReturnLobby',
            'FinalSettlementPanel/BottomBar/FinishedActions/Btn_ReturnLobby']) {
            this.bind(this.require(root, path), () => this.requestExit());
        }
    }

    private resetClones(content: Node, template: Node): void {
        for (const child of [...content.children]) if (child !== template) child.destroy();
        template.active = false;
    }

    private setScore(root: Node, winPath: string, losePath: string, score: number): void {
        const win = this.require(root, winPath); const lose = this.require(root, losePath);
        win.active = score >= 0; lose.active = score < 0;
        this.setLabel(root, score >= 0 ? winPath : losePath, `${score >= 0 ? '+' : ''}${score}`);
    }

    private bind(node: Node, callback: () => void): void {
        let lastInvokeAt = 0;
        const invoke = (): void => { const now = Date.now();
            if (!node.activeInHierarchy || now - lastInvokeAt < 180) return;
            lastInvokeAt = now; callback(); };
        for (const event of [Button.EventType.CLICK, Node.EventType.TOUCH_END, Node.EventType.MOUSE_UP]) {
            node.on(event, invoke, this); this.bindings.push({ node, event, callback: invoke });
        }
    }

    private configureOverlay(node: Node, layer: number, z: number): void {
        const widget = node.getComponent(Widget);
        if (widget) widget.enabled = false;
        node.getComponent(UITransform)?.setContentSize(1280, 720);
        node.setPosition(0, 0, z);
        this.setLayerRecursively(node, layer);
    }

    private applyUiLayer(root: Node): void {
        this.setLayerRecursively(root, root.parent?.layer === Layers.Enum.UI_2D ? root.parent.layer : Layers.Enum.UI_2D);
        if (!root.getComponent(RenderRoot2D)) root.addComponent(RenderRoot2D);
    }

    private setLayerRecursively(node: Node, layer: number): void {
        node.layer = layer;
        node.children.forEach(child => this.setLayerRecursively(child, layer));
    }

    private require(root: Node, path: string): Node {
        const node = root.getChildByPath(path);
        if (!node) throw new Error(`[ZJH] prefab node missing: ${root.name}/${path}`);
        return node;
    }

    private setLabel(root: Node, path: string, value: string): void {
        const label = this.require(root, path).getComponent(Label);
        if (!label) throw new Error(`[ZJH] label missing: ${root.name}/${path}`);
        label.string = value;
    }

    private releaseSession(): void {
        this.settlementHistory.clear();
        this.controller?.destroy(); this.controller = null;
        for (const binding of this.bindings) if (binding.node.isValid) binding.node.off(binding.event, binding.callback, this);
        this.bindings = [];
        for (const node of [...this.mounted].reverse()) if (node.isValid) node.destroy();
        this.mounted = [];
        this.commonRoom = null; this.recordNode = null; this.settlementNode = null;
        this.cumulativeScores.clear(); this.exitStarted = false; this.roomId = 0;
        this.gameClient?.close(); this.gameClient = null;
    }

    private assertCurrent(generation: number): void {
        if (generation !== this.generation) throw new Error('[ZJH] runtime entry superseded');
    }
    private nonNegativeInteger(value: unknown): number {
        const parsed = Number(value ?? 0);
        return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : 0;
    }
}

export function createZjhGameRuntimeEntry(options: ZjhRuntimeEntryOptions): GameRuntimeEntry {
    return new ZjhGameRuntimeEntry(options);
}
