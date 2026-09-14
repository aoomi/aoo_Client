import { Node } from 'cc';
import type { AuthenticatedAccount } from '../../../../../Login/Code/Auth/AuthTypes';
import { resolveRuntimeEndpoints } from '../../config/RuntimeEndpoints';
import { ProtocolClient } from '../../network/ProtocolClient';
import { createOwnedGameClient } from '../../network/ConnectionOwnership';
import { LegacyRoleGateway } from '../../role/LegacyRoleGateway';
import type { LegacyExternalSubgameHandoff } from '../../subgame/AuthoritativeSubgameHandoff';
import { ScjymjSceneBootstrap } from './ScjymjSceneBootstrap';

/** Consumes the generic hall handoff only for native SCJYMJ game ID 628. */
export class ScjymjSwitchCoordinator {
    private gameClient: ProtocolClient | null = null;
    private host: Node | null = null;
    private bootstrap: ScjymjSceneBootstrap | null = null;
    private switching = false;
    private source: LegacyExternalSubgameHandoff | null = null;

    public constructor(
        private readonly account: AuthenticatedAccount,
        private readonly hallClient: ProtocolClient,
        private readonly lobbyNode: Node,
        private readonly message: (text: string) => void,
    ) {}

    public accepts(handoff: LegacyExternalSubgameHandoff): boolean {
        return Number(handoff.gameId) === 628 || handoff.gameName.toLowerCase() === 'scjymj';
    }

    public async enter(handoff: LegacyExternalSubgameHandoff): Promise<void> {
        if (this.switching || this.bootstrap || !this.accepts(handoff)) return;
        const roomId = Number(handoff.roomId ?? handoff.roomID ?? 0);
        if (!Number.isSafeInteger(roomId) || roomId <= 0) {
            handoff.cancel();
            this.message('简阳麻将房间数据无效');
            return;
        }
        this.switching = true;
        this.source = handoff;
        try {
            if (!handoff.consume()) throw new Error('简阳麻将切服票据已失效');
            const gameClient = createOwnedGameClient();
            this.gameClient = gameClient;
            const role = await new LegacyRoleGateway(gameClient, handoff.gameServerUrl)
                .resumeWithToken(this.account, handoff.gameToken, 'scjymj');
            const host = new Node('SCJYMJNativeSceneHost');
            host.layer = this.lobbyNode.layer;
            (this.lobbyNode.parent ?? this.lobbyNode).addChild(host);
            this.host = host;
            const bootstrap = host.addComponent(ScjymjSceneBootstrap);
            this.bootstrap = bootstrap;
            await bootstrap.startRoom(gameClient, {
                roomId,
                playerId: role.playerId,
                viewMode: '2d',
                onRoomReady: () => { this.lobbyNode.active = false; },
                onEvent: (event, body) => this.lobbyNode.emit('legacy-scjymj-event', { event, body }),
                onMessage: this.message,
                onExit: (reason) => { void this.leave(reason); },
            });
            this.lobbyNode.emit('legacy-scjymj-room-ready', { roomId, handoff });
        } catch (error: unknown) {
            console.error('[SCJYMJ] failed to enter native room', error);
            this.message(error instanceof Error ? error.message : '进入简阳麻将失败');
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
            this.lobbyNode.emit('subgame-returned', {
                reason,
                source,
                fromClub: Boolean(source?.fromClub),
            });
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
        const game = this.gameClient;
        this.bootstrap?.stopRoom();
        this.bootstrap = null;
        this.host?.destroy();
        this.host = null;
        game?.close();
        this.gameClient = null;
        if (!this.hallClient.isConnected()) await this.hallClient.request('gateway.heartbeat', { clientTime: Date.now() });
    }
}
