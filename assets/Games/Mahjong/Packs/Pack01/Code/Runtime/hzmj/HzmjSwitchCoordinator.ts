import { Node } from 'cc';
import type { AuthenticatedAccount } from '../../../../../../../Login/Code/Auth/AuthTypes';
import { resolveRuntimeEndpoints } from '../../../../../../../Common/Code/Runtime/config/RuntimeEndpoints';
import { ProtocolClient } from '../../../../../../../Common/Code/Runtime/network/ProtocolClient';
import { createOwnedGameClient } from '../../../../../../../Common/Code/Runtime/network/ConnectionOwnership';
import type { LegacyExternalSubgameHandoff } from '../../../../../../../Common/Code/Runtime/subgame/AuthoritativeSubgameHandoff';
import { LegacyRoleGateway } from '../../../../../../../Common/Code/Runtime/role/LegacyRoleGateway';
import { HzmjSceneBootstrap, type HzmjViewMode } from './HzmjSceneBootstrap';
import { HzmjReplayController } from './HzmjReplayController';

/** Consumes the generic hall handoff for native HZMJ game ID 0. */
export class HzmjSwitchCoordinator {
    private gameClient: ProtocolClient | null = null;
    private host: Node | null = null;
    private bootstrap: HzmjSceneBootstrap | null = null;
    private switching = false;
    private source: LegacyExternalSubgameHandoff | null = null;
    private replay: HzmjReplayController | null = null;
    private generation = 0;
    private destroyed = false;

    public constructor(
        private readonly account: AuthenticatedAccount,
        private readonly hallClient: ProtocolClient,
        private readonly lobbyNode: Node,
        private readonly message: (text: string) => void,
    ) {}

    public accepts(handoff: LegacyExternalSubgameHandoff): boolean {
        return Number(handoff.gameId) === 0 || handoff.gameName.toLowerCase() === 'hzmj';
    }

    public async enter(handoff: LegacyExternalSubgameHandoff, viewMode: HzmjViewMode = '2d'): Promise<void> {
        if (this.destroyed || this.switching || this.bootstrap || !this.accepts(handoff)) return;
        const roomId = Number(handoff.roomId ?? handoff.roomID ?? 0);
        if (!Number.isSafeInteger(roomId) || roomId <= 0) {
            handoff.cancel();
            this.message('红中麻将房间数据无效');
            return;
        }
        this.switching = true;
        const generation = ++this.generation;
        this.source = handoff;
        try {
            if (!handoff.consume()) throw new Error('红中麻将切服票据已失效');
            const gameClient = createOwnedGameClient();
            this.gameClient = gameClient;
            const role = await new LegacyRoleGateway(gameClient, handoff.gameServerUrl)
                .resumeWithToken(this.account, handoff.gameToken, 'hzmj');
            if (this.destroyed || generation !== this.generation) { gameClient.close(); return; }
            const host = new Node('HZMJNativeSceneHost');
            host.layer = this.lobbyNode.layer;
            (this.lobbyNode.parent ?? this.lobbyNode).addChild(host);
            this.host = host;
            const bootstrap = host.addComponent(HzmjSceneBootstrap);
            this.bootstrap = bootstrap;
            await bootstrap.startRoom(gameClient, {
                roomId, playerId: role.playerId, viewMode,
                onRoomReady: () => { this.lobbyNode.active = false; },
                onEvent: (event, body) => this.lobbyNode.emit('legacy-hzmj-event', { event, body }),
                onMessage: this.message,
                onExit: (reason) => { void this.leave(reason); },
            });
            if (this.destroyed || generation !== this.generation) return;
            this.lobbyNode.emit('legacy-hzmj-room-ready', { roomId, handoff, viewMode });
        } catch (error: unknown) {
            console.error('[HZMJ] failed to enter native room', error);
            if (!this.destroyed && generation === this.generation) {
                this.message(error instanceof Error ? error.message : '进入红中麻将失败');
                await this.recoverHall();
            }
        } finally {
            if (generation === this.generation) this.switching = false;
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

    public async enterReplay(handoff: LegacyExternalSubgameHandoff): Promise<void> {
        if (this.destroyed || this.switching || this.bootstrap || this.replay || !this.accepts(handoff)) return;
        const code = String(handoff.playBackCode ?? '').trim();
        if (!code) { handoff.cancel(); this.message('红中麻将回放码无效'); return; }
        this.switching = true;
        const generation = ++this.generation;
        this.source = handoff;
        try {
            if (!handoff.consume()) throw new Error('红中麻将回放切服票据已失效');
            const gameClient = createOwnedGameClient();
            this.gameClient = gameClient;
            await new LegacyRoleGateway(gameClient, handoff.gameServerUrl)
                .resumeWithToken(this.account, handoff.gameToken, 'hzmj');
            if (this.destroyed || generation !== this.generation) { gameClient.close(); return; }
            const host = new Node('HZMJNativeReplayHost');
            host.layer = this.lobbyNode.layer;
            (this.lobbyNode.parent ?? this.lobbyNode).addChild(host);
            this.host = host;
            const replay = new HzmjReplayController(host, gameClient, this.message, () => { void this.leave('replay-exit'); });
            this.replay = replay;
            await replay.open(code);
            if (this.destroyed || generation !== this.generation) return;
            this.lobbyNode.active = false;
        } catch (error: unknown) {
            if (!this.destroyed && generation === this.generation) {
                this.message(error instanceof Error ? error.message : '进入红中麻将回放失败');
                await this.recoverHall();
            }
        } finally {
            if (generation === this.generation) this.switching = false;
        }
    }

    public destroy(): void {
        if (this.destroyed) return;
        this.destroyed = true;
        this.generation += 1;
        this.switching = false;
        this.replay?.destroy();
        this.replay = null;
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
        this.replay?.destroy();
        this.replay = null;
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
