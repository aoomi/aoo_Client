import { assetManager, instantiate, Node, Prefab, UITransform, Widget } from 'cc';
import type { GameRuntimeEntry } from '../../../../Common/Code/Runtime/GameRuntimeEntry';
import type { LegacySubgameTicket } from '../../../../../Common/Code/Runtime/subgame/AuthoritativeSubgameHandoff';
import { createOwnedGameClient } from '../../../../../Common/Code/Runtime/network/ConnectionOwnership';
import type { ProtocolClient } from '../../../../../Common/Code/Runtime/network/ProtocolClient';
import { CD299RuntimeController } from './CD299RuntimeController';
import { CD299RoomViewComponent } from './CD299RoomViewComponent';
import { CD299LandscapeRoomViewComponent } from './CD299LandscapeRoomViewComponent';
import { CD299_PLAY_VERSION } from './CD299Rules';

const BUNDLE = 'poker-cx';
const LANDSCAPE_PREFAB = 'CD299/Prefab/Landscape/CD299RoomLandscape';
const PORTRAIT_PREFAB = 'CD299/Prefab/Portrait/CD299RoomPortrait';
const LANDSCAPE_SEAT_POSITIONS = Object.freeze([
    [-300, -271.18], [450, -100], [450, 100], [280, 280],
    [0, 280], [-280, 280], [-450, 100], [-450, -100],
] as const);

export interface CD299GameRuntimeEntryOptions {
    readonly parent: Node;
    readonly playerId: number;
    readonly requestPrefix?: string;
    readonly onEntered?: (roomId: number, node: Node, controller: CD299RuntimeController) => void;
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

    public constructor(private readonly options: CD299GameRuntimeEntryOptions) {
        if (!Number.isSafeInteger(options.playerId) || options.playerId <= 0) {
            throw new Error('[CD299] runtime playerId invalid');
        }
    }

    public async preload(handoff?: LegacySubgameTicket): Promise<void> {
        await this.loadPrefab(this.prefabPath(handoff));
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
            const node = instantiate(await this.loadPrefab(prefabPath));
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
            if (!portrait) this.configureLandscapeLayout(node);
            this.host = host;
            const prefix = `${this.options.requestPrefix ?? 'cd299'}-${roomId}-${this.options.playerId}`;
            const controller = new CD299RuntimeController(client, view, roomId, this.options.playerId, prefix);
            this.controller = controller;
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
        this.unbindCommands?.();
        this.unbindCommands = null;
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

        LANDSCAPE_SEAT_POSITIONS.forEach(([x, y], seat) => {
            const seatNode = players.getChildByName(String(seat));
            if (!seatNode) throw new Error(`[CD299] landscape prefab missing seat=${seat}`);
            const widget = seatNode.getComponent(Widget);
            if (widget) widget.enabled = false;
            const hitArea = seatNode.getComponent(UITransform) ?? seatNode.addComponent(UITransform);
            hitArea.setContentSize(160, 140);
            seatNode.setPosition(x, y, 0);
            seatNode.setScale(1, 1, 1);
        });
        console.info('[CD299] landscape layout fixed', {
            designWidth: 1280, designHeight: 720, seatCount: LANDSCAPE_SEAT_POSITIONS.length,
        });
    }

    private async loadPrefab(path: string): Promise<Prefab> {
        const bundle = assetManager.getBundle(BUNDLE) ?? await new Promise<ReturnType<typeof assetManager.getBundle>>((resolve, reject) => {
            assetManager.loadBundle(BUNDLE, (error, loaded) => error || !loaded ? reject(error ?? new Error('[CD299] poker-cx bundle unavailable')) : resolve(loaded));
        });
        if (!bundle) throw new Error('[CD299] poker-cx bundle unavailable');
        return new Promise<Prefab>((resolve, reject) => bundle.load(path, Prefab, (error, prefab) =>
            error || !prefab ? reject(error ?? new Error(`[CD299] prefab unavailable path=${path}`)) : resolve(prefab)));
    }
}

export function createCD299GameRuntimeEntry(options: CD299GameRuntimeEntryOptions): GameRuntimeEntry {
    return new CD299GameRuntimeEntry(options);
}
