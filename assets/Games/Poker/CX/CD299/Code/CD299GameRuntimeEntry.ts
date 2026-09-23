import { assetManager, Button, instantiate, Node, Prefab, UITransform, Widget } from 'cc';
import type { GameRuntimeEntry } from '../../../../Common/Code/Runtime/GameRuntimeEntry';
import type { LegacySubgameTicket } from '../../../../../Common/Code/Runtime/subgame/AuthoritativeSubgameHandoff';
import { createOwnedGameClient } from '../../../../../Common/Code/Runtime/network/ConnectionOwnership';
import type { ProtocolClient } from '../../../../../Common/Code/Runtime/network/ProtocolClient';
import { CD299RuntimeController } from './CD299RuntimeController';
import { CD299RoomViewComponent } from './CD299RoomViewComponent';
import { CD299LandscapeRoomViewComponent } from './CD299LandscapeRoomViewComponent';
import { CD299_PLAY_VERSION } from './CD299Rules';

const BUNDLE = 'poker-cx';
const COMMON_ROOM_BUNDLE = 'games-common';
const COMMON_ROOM_PREFAB = 'Prefab/CommonRoom';
const LANDSCAPE_PREFAB = 'CD299/Prefab/Landscape/CD299RoomLandscape';
const PORTRAIT_PREFAB = 'CD299/Prefab/Portrait/CD299RoomPortrait';

export interface CD299GameRuntimeEntryOptions {
    readonly parent: Node;
    readonly playerId: number;
    readonly requestPrefix?: string;
    readonly onEntered?: (roomId: number, node: Node, controller: CD299RuntimeController) => void;
    readonly onExitRequested?: (roomId: number) => Promise<void>;
}

/** Feature-owned CD299 entry dedicated to the live authoritative table. */
export class CD299GameRuntimeEntry implements GameRuntimeEntry {
    public readonly id = 'cd299';
    public readonly canonicalGameCodes = Object.freeze(['CD299']);
    public readonly families = Object.freeze(['poker-cd299']);
    private client: ProtocolClient | null = null;
    private host: Node | null = null;
    private controller: CD299RuntimeController | null = null;
    private unbindCommands: (() => void) | null = null;
    private unbindExit: (() => void) | null = null;

    public constructor(private readonly options: CD299GameRuntimeEntryOptions) {
        if (!Number.isSafeInteger(options.playerId) || options.playerId <= 0) {
            throw new Error('[CD299] runtime playerId invalid');
        }
    }

    public async preload(handoff?: LegacySubgameTicket): Promise<void> {
        await Promise.all([
            this.loadPrefab(this.prefabPath(handoff)),
            this.loadPrefabFromBundle(COMMON_ROOM_BUNDLE, COMMON_ROOM_PREFAB),
        ]);
    }

    public async enter(handoff: LegacySubgameTicket): Promise<void> {
        this.destroy();
        const roomId = Number(handoff.roomId ?? handoff.roomID ?? 0);
        const authorityRoute = String(handoff.authorityRoute ?? '').trim();
        const gameTicket = String(handoff.gameTicket ?? '').trim();
        if (!Number.isSafeInteger(roomId) || roomId <= 0 || !authorityRoute || !gameTicket) {
            throw new Error('[CD299] authoritative handoff incomplete');
        }
        const client = createOwnedGameClient();
        this.client = client;
        try {
            client.setWsTicket(gameTicket);
            client.bindRoomAuthority(roomId, CD299_PLAY_VERSION);
            await client.connect(authorityRoute);
            const prefabPath = this.prefabPath(handoff);
            const [prefab, commonRoomPrefab] = await Promise.all([
                this.loadPrefab(prefabPath),
                this.loadPrefabFromBundle(COMMON_ROOM_BUNDLE, COMMON_ROOM_PREFAB),
            ]);
            const node = instantiate(prefab);
            const commonRoom = instantiate(commonRoomPrefab);
            const portrait = prefabPath === PORTRAIT_PREFAB;
            const view = portrait
                ? node.getComponent(CD299RoomViewComponent)
                : (node.getComponent(CD299LandscapeRoomViewComponent)
                    ?? node.addComponent(CD299LandscapeRoomViewComponent));
            if (!view) throw new Error(`[CD299] room prefab missing ${portrait ? 'portrait' : 'landscape'} view`);
            const host = new Node('CD299RuntimeHost');
            host.layer = this.options.parent.layer;
            this.options.parent.addChild(host);
            host.setPosition(0, 0, 0);
            host.setScale(1, 1, 1);
            host.addChild(node);
            // CommonRoom is the shared room chrome and must render above the gameplay
            // desk. Its controls occupy only their own hit areas, so gameplay seats remain clickable.
            host.addChild(commonRoom);
            if (!portrait) {
                this.configureLandscapeLayout(node);
                this.configureCommonRoomLayout(commonRoom, node.layer);
            }
            if (!portrait && view instanceof CD299LandscapeRoomViewComponent) {
                view.attachCommonRoom(commonRoom, roomId);
            }
            const prefix = `${this.options.requestPrefix ?? 'cd299'}-${roomId}-${this.options.playerId}`;
            const controller = new CD299RuntimeController(client, view, roomId, prefix);
            this.controller = controller;
            const back = commonRoom.getChildByPath('Btn/Btn_Back');
            const backButton = back?.getComponent(Button);
            if (back && backButton) {
                let exitStarted = false;
                const exit = (): void => {
                    if (exitStarted) return;
                    if (!backButton.interactable) return;
                    const seated = controller.isSeated();
                    const exitRequested = this.options.onExitRequested;
                    if (!seated && !exitRequested) {
                        console.error('[CD299] spectator exit unavailable', {
                            roomId,
                            playerId: this.options.playerId,
                        });
                        return;
                    }
                    exitStarted = true;
                    backButton.interactable = false;
                    const action = seated
                        ? controller.stand()
                        : exitRequested!(roomId).then(() => true);
                    console.info('[CD299] room back requested', { roomId, playerId: this.options.playerId,
                        action: seated ? 'stand' : 'spectator-exit' });
                    void action.then(ok => {
                        exitStarted = false;
                        if (back.isValid) backButton.interactable = true;
                        return ok;
                    }).catch((error: unknown) => {
                        exitStarted = false;
                        if (back.isValid) backButton.interactable = true;
                        console.error('[CD299] room exit failed', { roomId, playerId: this.options.playerId,
                            reason: error instanceof Error ? error.message : String(error) });
                    });
                };
                back.on(Button.EventType.CLICK, exit, this);
                back.on(Node.EventType.TOUCH_END, exit, this);
                back.on(Node.EventType.MOUSE_UP, exit, this);
                this.unbindExit = () => {
                    back.off(Button.EventType.CLICK, exit, this);
                    back.off(Node.EventType.TOUCH_END, exit, this);
                    back.off(Node.EventType.MOUSE_UP, exit, this);
                };
            }
            this.host = host;
            const diagnostics = globalThis as typeof globalThis & {
                __PDK_E2E_LOGS__?: unknown[];
                __CD299_RUNTIME__?: { root: Node; controller: CD299RuntimeController };
            };
            if (Array.isArray(diagnostics.__PDK_E2E_LOGS__)) {
                diagnostics.__CD299_RUNTIME__ = { root: node, controller };
            }
            this.unbindCommands = view.bindController(controller);
            await controller.state();
            this.options.onEntered?.(roomId, node, controller);
            console.info('[CD299] runtime entered', { roomId, playVersion: CD299_PLAY_VERSION });
        } catch (error: unknown) {
            console.error('[CD299] runtime enter failed', { roomId,
                reason: error instanceof Error ? error.message : String(error) });
            this.destroy();
            throw error;
        }
    }

    public destroy(): void {
        const diagnostics = globalThis as typeof globalThis & {
            __CD299_RUNTIME__?: { root: Node; controller: CD299RuntimeController };
        };
        if (diagnostics.__CD299_RUNTIME__?.controller === this.controller) delete diagnostics.__CD299_RUNTIME__;
        this.unbindCommands?.();
        this.unbindCommands = null;
        this.unbindExit?.();
        this.unbindExit = null;
        this.controller?.destroy();
        this.controller = null;
        this.host?.destroy();
        this.host = null;
        this.client?.close();
        this.client = null;
    }

    private prefabPath(handoff?: LegacySubgameTicket): string {
        const rules = handoff?.ruleSnapshot ?? {};
        const portrait = String(rules.viewMode ?? rules.orientation ?? '').toLowerCase() === 'portrait';
        return portrait ? PORTRAIT_PREFAB : LANDSCAPE_PREFAB;
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
        if (!players) throw new Error('[CD299] landscape prefab missing Players');
        const playersWidget = players.getComponent(Widget);
        if (playersWidget) playersWidget.enabled = false;
        players.getComponent(UITransform)?.setContentSize(1280, 720);
        players.setPosition(0, 0, 0);
        players.setScale(1, 1, 1);

        for (let seat = 0; seat < 8; seat += 1) {
            const seatNode = players.getChildByName(String(seat));
            if (!seatNode) throw new Error(`[CD299] landscape prefab missing seat=${seat}`);
            const widget = seatNode.getComponent(Widget);
            if (widget) widget.enabled = false;
            const hitArea = seatNode.getComponent(UITransform) ?? seatNode.addComponent(UITransform);
            hitArea.setContentSize(160, 140);
        }
        console.info('[CD299] landscape layout fixed', {
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
        console.info('[CD299] common room layout fixed', {
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
                ? reject(error ?? new Error(`[CD299] bundle unavailable name=${bundleName}`)) : resolve(loaded));
        });
        if (!bundle) throw new Error(`[CD299] bundle unavailable name=${bundleName}`);
        return new Promise<Prefab>((resolve, reject) => bundle.load(path, Prefab, (error, prefab) =>
            error || !prefab ? reject(error ?? new Error(`[CD299] prefab unavailable path=${path}`)) : resolve(prefab)));
    }
}

export function createCD299GameRuntimeEntry(options: CD299GameRuntimeEntryOptions): GameRuntimeEntry {
    return new CD299GameRuntimeEntry(options);
}
