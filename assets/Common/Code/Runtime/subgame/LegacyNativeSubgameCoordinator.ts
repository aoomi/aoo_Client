import { Component, Node } from 'cc';
import type { AuthenticatedAccount } from '../../../../Login/Code/Auth/AuthTypes';
import { resolveRuntimeEndpoints } from '../config/RuntimeEndpoints';
import { ProtocolClient } from '../network/ProtocolClient';
import { createOwnedGameClient } from '../network/ConnectionOwnership';
import type { LegacyExternalSubgameHandoff } from './AuthoritativeSubgameHandoff';
import { LegacyRoleGateway } from '../role/LegacyRoleGateway';

export interface LegacyNativeRoomBootstrap<ViewMode> extends Component {
    startRoom(client: ProtocolClient, options: {
        roomId: number;
        playerId: number;
        viewMode?: ViewMode;
        onRoomReady: () => void;
        onEvent: (event: string, body: unknown) => void;
        onMessage: (message: string) => void;
        onExit: (reason: string) => void;
    }): Promise<void>;
    stopRoom(): void;
}

export interface LegacyNativeSubgameDefinition<ViewMode> {
    gameId: number;
    gameName: string;
    displayName: string;
    hostName: string;
    bootstrap: new (...args: any[]) => LegacyNativeRoomBootstrap<ViewMode>;
}

/** Shared Creator 3.8.8 implementation of the Creator 2.2.2 game-server handoff lifecycle. */
export class LegacyNativeSubgameCoordinator<ViewMode = never> {
    private gameClient: ProtocolClient | null = null;
    private host: Node | null = null;
    private bootstrap: LegacyNativeRoomBootstrap<ViewMode> | null = null;
    private switching = false;
    private source: LegacyExternalSubgameHandoff | null = null;

    public constructor(
        private readonly account: AuthenticatedAccount,
        private readonly hallClient: ProtocolClient,
        private readonly lobbyNode: Node,
        private readonly message: (text: string) => void,
        private readonly definition: LegacyNativeSubgameDefinition<ViewMode>,
    ) {}

    public accepts(handoff: LegacyExternalSubgameHandoff): boolean {
        return Number(handoff.gameId) === this.definition.gameId
            || String(handoff.gameName ?? '').toLowerCase() === this.definition.gameName;
    }

    public async enter(handoff: LegacyExternalSubgameHandoff, viewMode?: ViewMode): Promise<void> {
        if (this.switching || this.bootstrap || !this.accepts(handoff)) return;
        const roomId = Number(handoff.roomId ?? handoff.roomID ?? 0);
        if (!Number.isSafeInteger(roomId) || roomId <= 0) {
            handoff.cancel();
            this.message(`${this.definition.displayName}房间数据无效`);
            return;
        }
        this.switching = true;
        this.source = handoff;
        try {
            if (!handoff.consume()) throw new Error(`${this.definition.displayName}切服票据已失效`);
            const gameClient = createOwnedGameClient();
            this.gameClient = gameClient;
            const role = await new LegacyRoleGateway(gameClient, handoff.gameServerUrl)
                .resumeWithToken(this.account, handoff.gameToken, this.definition.gameName);
            const host = new Node(this.definition.hostName);
            host.layer = this.lobbyNode.layer;
            (this.lobbyNode.parent ?? this.lobbyNode).addChild(host);
            this.host = host;
            const bootstrap = host.addComponent(this.definition.bootstrap);
            this.bootstrap = bootstrap;
            await bootstrap.startRoom(gameClient, {
                roomId,
                playerId: role.playerId,
                viewMode,
                onRoomReady: () => { this.lobbyNode.active = false; },
                onEvent: (event, body) => this.lobbyNode.emit(`legacy-${this.definition.gameName}-event`, { event, body }),
                onMessage: this.message,
                onExit: (reason) => { void this.leave(reason); },
            });
            this.lobbyNode.emit(`legacy-${this.definition.gameName}-room-ready`, { roomId, handoff, viewMode });
        } catch (error: unknown) {
            this.message(error instanceof Error ? error.message : `进入${this.definition.displayName}失败`);
            await this.recoverHall();
        } finally {
            this.switching = false;
        }
    }

    public async leave(reason = 'user-exit'): Promise<void> {
        if (this.switching) return;
        this.switching = true;
        try {
            await this.recoverHall();
            const source = this.source;
            this.source = null;
            this.lobbyNode.active = true;
            this.lobbyNode.emit('subgame-returned', { reason, source, fromClub: Boolean(source?.fromClub) });
        } finally {
            this.switching = false;
        }
    }

    public destroy(): void {
        this.bootstrap?.stopRoom();
        this.bootstrap = null;
        this.host?.destroy();
        this.host = null;
        this.gameClient?.close();
        this.gameClient = null;
        this.source = null;
    }

    private async recoverHall(): Promise<void> {
        const gameClient = this.gameClient;
        this.bootstrap?.stopRoom();
        this.bootstrap = null;
        this.host?.destroy();
        this.host = null;
        gameClient?.close();
        this.gameClient = null;
        if (!this.hallClient.isConnected()) {
            await this.hallClient.request('gateway.heartbeat', { clientTime: Date.now() });
        }
    }
}
