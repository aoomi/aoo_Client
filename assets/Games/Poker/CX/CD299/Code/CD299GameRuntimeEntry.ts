import { assetManager, instantiate, Node, Prefab } from 'cc';
import type { GameRuntimeEntry } from '../../../../Common/Code/Runtime/GameRuntimeEntry';
import type { LegacySubgameTicket } from '../../../../../Common/Code/Runtime/subgame/AuthoritativeSubgameHandoff';
import { createOwnedGameClient } from '../../../../../Common/Code/Runtime/network/ConnectionOwnership';
import type { ProtocolClient } from '../../../../../Common/Code/Runtime/network/ProtocolClient';
import { CD299RuntimeController } from './CD299RuntimeController';
import { CD299RoomViewComponent } from './CD299RoomViewComponent';
import { CD299_PLAY_VERSION } from './CD299Rules';

const BUNDLE = 'poker-cx';
const LANDSCAPE_PREFAB = 'CD299/Prefab/Landscape/CD299RoomLandscape';
const PORTRAIT_PREFAB = 'CD299/Prefab/Portrait/CD299RoomPortrait';

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
            const node = instantiate(await this.loadPrefab(this.prefabPath(handoff)));
            const view = node.getComponent(CD299RoomViewComponent);
            if (!view) throw new Error('[CD299] room prefab missing CD299RoomViewComponent');
            const host = new Node('CD299RuntimeHost');
            host.layer = this.options.parent.layer;
            this.options.parent.addChild(host);
            host.addChild(node);
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
