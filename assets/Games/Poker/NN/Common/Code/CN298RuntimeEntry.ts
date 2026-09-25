import { assetManager, AssetManager, director, instantiate, Node, Prefab, view } from 'cc';
import type { LegacySubgameTicket } from '../../../../../Common/Code/Runtime/subgame/AuthoritativeSubgameHandoff';
import type { GameRuntimeEntry } from '../../../../Common/Code/Runtime/GameRuntimeEntry';
import { createOwnedGameClient } from '../../../../../Common/Code/Runtime/network/ConnectionOwnership';
import type { ProtocolClient } from '../../../../../Common/Code/Runtime/network/ProtocolClient';
import { CN298RuntimeController } from './CN298RuntimeController';
import { CN298RoomViewComponent } from './CN298RoomViewComponent';
import { CN298_PLAY_VERSION } from './CN298Rules';

const BUNDLE = 'poker-nn';
const PREFAB_PATH = 'Prefab/CN298Room';

export interface CN298RuntimeEntryOptions {
    readonly playerId: number;
    readonly requestPrefix: string;
    readonly host?: () => Node | null;
}

export class CN298GameRuntimeEntry implements GameRuntimeEntry {
    public readonly id = 'cn298';
    public readonly canonicalGameCodes = Object.freeze(['CN298']);
    public readonly families = Object.freeze(['poker-betting']);
    private gameClient: ProtocolClient | null = null;
    private roomNode: Node | null = null;
    private generation = 0;

    public constructor(private readonly options: CN298RuntimeEntryOptions) {
        if (!Number.isSafeInteger(options.playerId) || options.playerId <= 0 || !options.requestPrefix.trim()) {
            throw new Error('[CN298] invalid runtime entry identity');
        }
    }

    public async preload(): Promise<void> {
        const bundle = await this.loadBundle();
        await this.loadPrefab(bundle, this.orientation());
    }

    public async enter(handoff: LegacySubgameTicket): Promise<void> {
        const generation = ++this.generation;
        this.releaseSession();
        const roomId = Number(handoff.roomId ?? handoff.roomID ?? handoff.roomKey);
        const authorityRoute = String(handoff.authorityRoute ?? '').trim();
        const gameTicket = String(handoff.gameTicket ?? '').trim();
        if (!Number.isSafeInteger(roomId) || roomId <= 0 || !authorityRoute || !gameTicket) {
            throw new Error('[CN298] authoritative handoff is incomplete');
        }
        if (handoff.playVersion && handoff.playVersion !== CN298_PLAY_VERSION) {
            throw new Error(`[CN298] unexpected playVersion=${handoff.playVersion}`);
        }
        console.info('[CN298] enter', { roomId, playVersion: CN298_PLAY_VERSION,
            authorityRoute, orientation: this.orientation() });
        const client = createOwnedGameClient();
        this.gameClient = client;
        try {
            client.setWsTicket(gameTicket);
            client.bindRoomAuthority(roomId, CN298_PLAY_VERSION);
            await client.connect(authorityRoute);
            if (generation !== this.generation) return;
            const bundle = await this.loadBundle();
            const prefab = await this.loadPrefab(bundle, this.orientation());
            if (generation !== this.generation) return;
            const host = this.options.host?.() ?? director.getScene()?.getChildByName('Canvas') ?? null;
            if (!host?.isValid) throw new Error('[CN298] room host is unavailable');
            const roomNode = instantiate(prefab);
            host.addChild(roomNode);
            this.roomNode = roomNode;
            const roomView = roomNode.getComponent(CN298RoomViewComponent);
            if (!roomView) throw new Error('[CN298] room prefab is missing CN298RoomViewComponent');
            const controller = new CN298RuntimeController(client, roomView, roomId,
                this.options.playerId, this.options.requestPrefix);
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
            console.info('[CN298] initial state ready', { roomId, playVersion: CN298_PLAY_VERSION });
        } catch (error: unknown) {
            console.error('[CN298] enter failed', { roomId, playVersion: CN298_PLAY_VERSION,
                reason: error instanceof Error ? error.message : String(error) });
            this.releaseSession();
            throw error;
        }
    }

    public destroy(): void {
        this.generation += 1;
        this.releaseSession();
    }

    private orientation(): 'Landscape' | 'Portrait' {
        const size = view.getVisibleSize();
        return size.width >= size.height ? 'Landscape' : 'Portrait';
    }
    private loadBundle(): Promise<AssetManager.Bundle> {
        const loaded = assetManager.getBundle(BUNDLE);
        if (loaded) return Promise.resolve(loaded);
        return new Promise((resolve, reject) => assetManager.loadBundle(BUNDLE,
            (error, bundle) => error || !bundle ? reject(error ?? new Error('[CN298] bundle unavailable')) : resolve(bundle)));
    }
    private loadPrefab(bundle: AssetManager.Bundle,
        orientation: 'Landscape' | 'Portrait'): Promise<Prefab> {
        return new Promise((resolve, reject) => bundle.load(`${PREFAB_PATH}${orientation}`, Prefab,
            (error, prefab) => error || !prefab ? reject(error ?? new Error('[CN298] prefab unavailable')) : resolve(prefab)));
    }
    private releaseSession(): void {
        if (this.roomNode?.isValid) this.roomNode.destroy();
        this.roomNode = null;
        this.gameClient?.close();
        this.gameClient = null;
    }
}

export function createCN298GameRuntimeEntry(options: CN298RuntimeEntryOptions): GameRuntimeEntry {
    return new CN298GameRuntimeEntry(options);
}
