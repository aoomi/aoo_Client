import { assetManager, instantiate, Node, Prefab, UITransform, Widget } from 'cc';
import { publishCommonRoomPublicView, type CommonRoomFeaturePorts, type CommonRoomPublicView, type GameRuntimeEntry } from '../../../Common/Code/Runtime/GameRuntimeEntry';
import type { LegacySubgameTicket } from '../../../../Common/Code/Runtime/subgame/AuthoritativeSubgameHandoff';
import { createOwnedGameClient } from '../../../../Common/Code/Runtime/network/ConnectionOwnership';
import type { ProtocolClient } from '../../../../Common/Code/Runtime/network/ProtocolClient';
import { CD299RuntimeController as CxRuntimeController } from './CxController';
import { CD299LandscapeRoomViewComponent as CxLandscapeRoomViewComponent } from './CxLandscapeView';
import { Cx_PLAY_VERSION as CX_PLAY_VERSION } from './CxRules';
import type { CD299Snapshot as CxSnapshot } from './CxRoomState';
import { RoomSettlementHistoryFeed } from '../../../Common/Code/Room/RoomSettlementHistory';
import { mountCommonRoomShell } from '../../../Common/Code/Room/CommonRoomShellMount';

const BUNDLE = 'poker-cx';
const LANDSCAPE_PREFAB = 'Prefab/CX_CommonRoom';

export interface CxGameRuntimeEntryOptions {
    readonly parent: Node;
    readonly playerId: number;
    readonly requestPrefix?: string;
    readonly onEntered?: (roomId: number, node: Node, controller: CxRuntimeController) => void;
    readonly onExitRequested?: (roomId: number) => Promise<void>;
}

/** Feature-owned CX entry dedicated to the live authoritative table. */
export class CxGameRuntimeEntry implements GameRuntimeEntry {
    public readonly id = 'cx';
    public readonly canonicalGameCodes = Object.freeze(['chengdu2999']);
    public readonly families = Object.freeze(['poker-cx']);
    public supportsPlayVersion(playVersion: string): boolean { return playVersion === CX_PLAY_VERSION; }
    private client: ProtocolClient | null = null;
    private host: Node | null = null;
    private controller: CxRuntimeController | null = null;
    private unbindCommands: (() => void) | null = null;
    private commonRoom: Node | null = null;
    private gameRoom: Node | null = null;
    private roomView: CxLandscapeRoomViewComponent | null = null;
    private readonly settlementHistory = new RoomSettlementHistoryFeed();
    private roomId = 0;

    public constructor(private readonly options: CxGameRuntimeEntryOptions) {
        if (!Number.isSafeInteger(options.playerId) || options.playerId <= 0) {
            throw new Error('[CX] runtime playerId invalid');
        }
    }

    public async preload(handoff?: LegacySubgameTicket): Promise<void> {
        await Promise.all([
            this.loadPrefab(this.prefabPath(handoff)),
        ]);
    }

    public async enter(handoff: LegacySubgameTicket): Promise<void> {
        this.destroy();
        const roomId = Number(handoff.roomId ?? handoff.roomID ?? 0);
        const authorityRoute = String(handoff.authorityRoute ?? '').trim();
        const gameTicket = String(handoff.gameTicket ?? '').trim();
        if (!Number.isSafeInteger(roomId) || roomId <= 0 || !authorityRoute || !gameTicket) {
            throw new Error('[CX] authoritative handoff incomplete');
        }
        const client = createOwnedGameClient();
        this.client = client;
        try {
            client.setWsTicket(gameTicket);
            client.bindRoomAuthority(roomId, CX_PLAY_VERSION);
            await client.connect(authorityRoute);
            const prefabPath = this.prefabPath(handoff);
            const prefab = await this.loadPrefab(prefabPath);
            const node = instantiate(prefab);
            const view = node.getComponent(CxLandscapeRoomViewComponent)
                ?? node.addComponent(CxLandscapeRoomViewComponent);
            this.roomView = view;
            const host = new Node('CxRuntimeHost');
            host.layer = this.options.parent.layer;
            this.options.parent.addChild(host);
            host.setPosition(0, 0, 0);
            host.setScale(1, 1, 1);
            host.addChild(node);
            this.gameRoom = node;
            // CommonRoom is the shared room chrome and must render above the gameplay
            // desk. Its controls occupy only their own hit areas, so gameplay seats remain clickable.
            const commonRoom = await mountCommonRoomShell(host);
            this.commonRoom = commonRoom;
            this.roomId = roomId;
            this.configureLandscapeLayout(node);
            this.configureCommonRoomLayout(commonRoom, node.layer);
            view.attachCommonRoom(commonRoom, roomId);
            const prefix = `${this.options.requestPrefix ?? 'cx'}-${roomId}-${this.options.playerId}`;
            const controller = new CxRuntimeController(client, view, roomId, prefix,
                snapshot => { this.publishCommonRoomSeats(snapshot); this.recordSettlement(snapshot); });
            this.controller = controller;
            this.host = host;
            const diagnostics = globalThis as typeof globalThis & {
                __PDK_E2E_LOGS__?: unknown[];
                __CX_RUNTIME__?: { root: Node; controller: CxRuntimeController };
            };
            if (Array.isArray(diagnostics.__PDK_E2E_LOGS__)) {
                diagnostics.__CX_RUNTIME__ = { root: node, controller };
            }
            this.unbindCommands = view.bindController(controller);
            await controller.state();
            this.options.onEntered?.(roomId, node, controller);
            console.info('[CX] runtime entered', { roomId, playVersion: CX_PLAY_VERSION });
        } catch (error: unknown) {
            console.error('[CX] runtime enter failed', { roomId,
                reason: error instanceof Error ? error.message : String(error) });
            this.destroy();
            throw error;
        }
    }

    public commonRoomPorts(): CommonRoomFeaturePorts {
        const root = this.commonRoom;
        const controller = this.controller;
        const roomView = this.roomView;
        if (!root?.isValid || !controller || !roomView?.isValid || this.roomId <= 0) {
            throw new Error('[CX] common room is not mounted');
        }
        return {
            mountedRoot: root,
            mounted: view => roomView.bindCommonRoomMountedView(view),
            exit: { request: async () => {
                if (controller.isSeated()) {
                    if (!await controller.stand()) throw new Error('[CX] stand was not committed');
                } else {
                    if (!this.options.onExitRequested) throw new Error('[CX] spectator exit unavailable');
                    await this.options.onExitRequested(this.roomId);
                }
            } },
            openRoomRule: async () => {
                const rules = this.gameRoom?.getChildByPath('RuleDisplay');
                if (!rules?.isValid) throw new Error('[CX] room rules are unavailable');
                rules.active = !rules.active;
            },
            waitingActions: { start: async () => {
                if (!await controller.continueRound()) throw new Error('[CX] continue was not committed');
            } },
            settlementHistoryRenderer: {
                open: async (entries, close) => {
                    const latest = entries.at(-1)?.payload as CxSnapshot | undefined;
                    if (!latest || !this.roomView?.isValid) {
                        throw new Error('[CX] authoritative round settlement is unavailable');
                    }
                    await this.roomView.openSmallSettlementHistory(latest, close);
                },
                close: () => this.roomView?.closeSmallSettlementHistory(),
                destroy: () => this.roomView?.closeSmallSettlementHistory(),
            },
            settlementHistoryFeed: this.settlementHistory,
        };
    }

    /** Refreshes the gameplay projection after the shared room transport recovers. */
    public async restoreAfterReconnect(): Promise<void> {
        if (!this.controller || !this.roomId) return;
        await this.controller.state();
    }

    private publishCommonRoomSeats(snapshot: CxSnapshot): void {
        const seatCount = snapshot.rules.maxPlayers;
        const localSeatId = snapshot.viewerRole === 'SEATED' ? snapshot.viewerSeat : -1;
        const seats = Array.from({ length: seatCount }, (_, seatId) => {
            const playerId = Number(snapshot.players[seatId] ?? 0);
            if (!Number.isSafeInteger(playerId) || playerId <= 0) return Object.freeze({ seatId, occupied: false });
            const score = Number(snapshot.scores[playerId] ?? 0);
            return Object.freeze({ seatId, occupied: true, playerId,
                displayName: `玩家${playerId}`, score: Number.isFinite(score) ? score : 0 });
        });
        const view: CommonRoomPublicView = Object.freeze({ seatCount, localSeatId, seats: Object.freeze(seats) });
        publishCommonRoomPublicView(this.roomId, view,
            Object.freeze({ stateVersion: snapshot.stateVersion, roundNo: snapshot.round }));
    }

    private recordSettlement(snapshot: CxSnapshot): void {
        if (snapshot.phase !== 'ROUND_SETTLEMENT' && snapshot.phase !== 'FINISHED') return;
        const identity = `${snapshot.roomId}:${snapshot.round}:${snapshot.phase}`;
        this.settlementHistory.record({ identity, payload: snapshot });
    }

    public destroy(): void {
        const diagnostics = globalThis as typeof globalThis & {
            __CX_RUNTIME__?: { root: Node; controller: CxRuntimeController };
        };
        if (diagnostics.__CX_RUNTIME__?.controller === this.controller) delete diagnostics.__CX_RUNTIME__;
        this.unbindCommands?.();
        this.unbindCommands = null;
        this.controller?.destroy();
        this.controller = null;
        this.host?.destroy();
        this.host = null;
        this.commonRoom = null;
        this.gameRoom = null;
        this.roomView = null;
        this.settlementHistory.clear();
        this.roomId = 0;
        this.client?.close();
        this.client = null;
    }

    private prefabPath(_handoff?: LegacySubgameTicket): string {
        return LANDSCAPE_PREFAB;
    }

    /**
     * The migrated XQP desk carries Widget constraints authored against its
     * original Canvas. The Aoo runtime mounts it below the 1600-wide lobby
     * presentation, so those constraints would recompute and overwrite the
     * authoritative 1280x720 seat coordinates. Freeze only the landscape desk
     * at its design transform; the portrait prefab remains untouched.
     */
    private configureLandscapeLayout(node: Node): void {
        node.getComponent(Widget)!.enabled = false;
        node.getComponent(UITransform)?.setContentSize(1280, 720);
        node.setPosition(0, 0, 0);
        node.setScale(1, 1, 1);

        const players = node.getChildByName('Players');
        if (!players) throw new Error('[CX] landscape prefab missing Players');
        const playersWidget = players.getComponent(Widget);
        if (playersWidget) playersWidget.enabled = false;
        players.getComponent(UITransform)?.setContentSize(1280, 720);
        players.setPosition(0, 0, 0);
        players.setScale(1, 1, 1);

        for (let seat = 0; seat < 8; seat += 1) {
            const seatNode = players.getChildByName(`Seat_${seat}`);
            if (!seatNode) throw new Error(`[CX] landscape prefab missing seat=${seat}`);
            const widget = seatNode.getComponent(Widget);
            if (widget) widget.enabled = false;
            const hitArea = seatNode.getComponent(UITransform) ?? seatNode.addComponent(UITransform);
            hitArea.setContentSize(160, 140);
        }
        console.info('[CX] landscape layout fixed', {
            designWidth: 1280, designHeight: 720, seatCount: 8,
        });
    }

    /** The gameplay Camera renders the CX game layer, not the prefab's default UI_2D layer. */
    private configureCommonRoomLayout(commonRoom: Node, gameLayer: number): void {
        const widget = commonRoom.getComponent(Widget);
        if (widget) widget.enabled = false;
        commonRoom.getComponent(UITransform)?.setContentSize(1280, 720);
        commonRoom.setPosition(0, 0, 1);
        commonRoom.setScale(1, 1, 1);
        this.setLayerRecursively(commonRoom, gameLayer);
        console.info('[CX] common room layout fixed', {
            commonRoom: commonRoom.name, gameLayer, designWidth: 1280, designHeight: 720,
        });
    }

    private setLayerRecursively(node: Node, layer: number): void {
        node.layer = layer;
        for (const child of node.children) this.setLayerRecursively(child, layer);
    }

    private async loadPrefab(path: string): Promise<Prefab> {
        return this.loadPrefabFromBundle(BUNDLE, path);
    }

    private async loadPrefabFromBundle(bundleName: string, path: string): Promise<Prefab> {
        const bundle = assetManager.getBundle(bundleName) ?? await new Promise<ReturnType<typeof assetManager.getBundle>>((resolve, reject) => {
            assetManager.loadBundle(bundleName, (error, loaded) => error || !loaded
                ? reject(error ?? new Error(`[CX] bundle unavailable name=${bundleName}`)) : resolve(loaded));
        });
        if (!bundle) throw new Error(`[CX] bundle unavailable name=${bundleName}`);
        return new Promise<Prefab>((resolve, reject) => bundle.load(path, Prefab, (error, prefab) =>
            error || !prefab ? reject(error ?? new Error(`[CX] prefab unavailable path=${path}`)) : resolve(prefab)));
    }
}

export function createCxGameRuntimeEntry(options: CxGameRuntimeEntryOptions): GameRuntimeEntry {
    return new CxGameRuntimeEntry(options);
}
