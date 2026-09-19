import { Layers, RenderRoot2D, type Node } from 'cc';
import type { LegacySubgameTicket } from '../../../../../Common/Code/Runtime/subgame/AuthoritativeSubgameHandoff';
import type { GameRuntimeEntry } from '../../../../Common/Code/Runtime/GameRuntimeEntry';
import { createOwnedGameClient } from '../../../../../Common/Code/Runtime/network/ConnectionOwnership';
import type { ProtocolClient } from '../../../../../Common/Code/Runtime/network/ProtocolClient';
import { CN297ProtocolAdapter, CN297ProtocolClientTransport } from './CN297Protocol';
import { CN297_PLAY_VERSION } from './CN297Rules';
import { CN297RoomController } from './CN297RoomController';

export const CN297_ROOM_PREFABS = Object.freeze({
    landscape: 'Prefab/CN297RoomLandscape', portrait: 'Prefab/CN297RoomPortrait',
});

export interface CN297RuntimeIdentity { readonly playerId: number }
export interface CN297RuntimeHost {
    isPortrait(): boolean;
    loadAndMountPrefab(assetPath: string, bundleName?: string): Promise<Node>;
    unmount(node: Node): void;
}

/** Feature-owned entry; registry composition remains the Hall/bootstrap owner's responsibility. */
export class CN297GameRuntimeEntry implements GameRuntimeEntry {
    public readonly id = 'cn297-zjh';
    public readonly canonicalGameCodes = Object.freeze(['CN297']);
    public readonly families = Object.freeze(['poker-compare-hand']);
    private gameClient: ProtocolClient | null = null;
    private controller: CN297RoomController | null = null;
    private root: Node | null = null;
    private generation = 0;

    public constructor(private readonly host: CN297RuntimeHost,
        private readonly identity: () => CN297RuntimeIdentity) {}

    public async enter(handoff: LegacySubgameTicket): Promise<void> {
        this.destroy();
        const generation = ++this.generation;
        const roomId = Number(handoff.roomId ?? handoff.roomID ?? 0);
        const authorityRoute = String(handoff.authorityRoute ?? '').trim();
        const gameTicket = String(handoff.gameTicket ?? '').trim();
        if (!Number.isSafeInteger(roomId) || roomId <= 0 || !authorityRoute || !gameTicket
            || (handoff.playVersion && handoff.playVersion !== CN297_PLAY_VERSION)) {
            throw new Error('[CN297] authoritative handoff is invalid');
        }
        const identity = this.identity();
        if (!Number.isSafeInteger(identity.playerId) || identity.playerId <= 0) {
            throw new Error('[CN297] runtime player identity is invalid');
        }
        const gameClient = createOwnedGameClient();
        this.gameClient = gameClient;
        try {
            gameClient.setWsTicket(gameTicket);
            gameClient.bindRoomAuthority(roomId, CN297_PLAY_VERSION);
            await gameClient.connect(authorityRoute);
            this.assertCurrent(generation);
            const prefabPath = this.host.isPortrait() ? CN297_ROOM_PREFABS.portrait : CN297_ROOM_PREFABS.landscape;
            const root = await this.host.loadAndMountPrefab(prefabPath, handoff.bundleName);
            this.assertCurrent(generation);
            this.applyUiLayer(root);
            this.root = root;
            const trace = handoff as LegacySubgameTicket & { stateVersion?: unknown; roundNo?: unknown };
            let stateVersion = this.nonNegativeInteger(trace.stateVersion); let roundNo = this.nonNegativeInteger(trace.roundNo);
            const protocol = new CN297ProtocolAdapter(new CN297ProtocolClientTransport(gameClient), roomId,
                () => stateVersion, () => roundNo, `CN297-${roomId}`);
            const controller = new CN297RoomController(protocol, root, identity.playerId);
            this.controller = controller;
            const initial = await controller.initialize();
            this.assertCurrent(generation);
            stateVersion = initial.stateVersion; roundNo = initial.roundNo;
            console.info('[CN297GameRuntimeEntry]', { action: 'entered', roomId, playVersion: CN297_PLAY_VERSION,
                stateVersion, roundNo, prefabPath, layer: root.layer });
        } catch (error) {
            if (generation === this.generation) this.destroy();
            throw error;
        }
    }

    public destroy(): void {
        this.generation += 1;
        this.controller?.destroy(); this.controller = null;
        if (this.root) this.host.unmount(this.root);
        this.root = null;
        this.gameClient?.close(); this.gameClient = null;
    }

    private assertCurrent(generation: number): void {
        if (generation !== this.generation) throw new Error('[CN297] runtime entry superseded');
    }
    private nonNegativeInteger(value: unknown): number {
        const parsed = Number(value ?? 0);
        return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : 0;
    }

    /** Dynamically mounted bundle prefabs do not inherit the scene Canvas layer automatically. */
    private applyUiLayer(root: Node): void {
        const layer = root.parent?.layer === Layers.Enum.UI_2D ? root.parent.layer : Layers.Enum.UI_2D;
        const visit = (node: Node): void => { node.layer = layer; node.children.forEach(visit); };
        visit(root);
        // The production host mounts the room beside the lobby Canvas. Merely assigning UI_2D
        // does not register that sibling subtree with the 2D batcher, so give the feature root
        // its own render boundary while continuing to use the scene's UI camera.
        if (!root.getComponent(RenderRoot2D)) root.addComponent(RenderRoot2D);
    }
}

export function createCN297GameRuntimeEntry(host: CN297RuntimeHost,
    identity: () => CN297RuntimeIdentity): GameRuntimeEntry {
    return new CN297GameRuntimeEntry(host, identity);
}
