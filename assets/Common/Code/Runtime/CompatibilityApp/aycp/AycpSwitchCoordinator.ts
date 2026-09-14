import { Node } from 'cc';
import type { AuthenticatedAccount } from '../../../../../Login/Code/Auth/AuthTypes';
import { resolveRuntimeEndpoints } from '../../config/RuntimeEndpoints';
import { ProtocolClient } from '../../network/ProtocolClient';
import { createOwnedGameClient } from '../../network/ConnectionOwnership';
import type { LegacyExternalSubgameHandoff } from '../../subgame/AuthoritativeSubgameHandoff';
import { LegacyRoleGateway } from '../../role/LegacyRoleGateway';
import { AycpSceneBootstrap } from './AycpSceneBootstrap';

/** Consumes hall handoffs for canonical AYCP game 138. */
export class AycpSwitchCoordinator {
    private gameClient: ProtocolClient | null = null; private host: Node | null = null; private bootstrap: AycpSceneBootstrap | null = null; private switching = false; private source: LegacyExternalSubgameHandoff | null = null;
    public constructor(private readonly account: AuthenticatedAccount, private readonly hallClient: ProtocolClient, private readonly lobbyNode: Node, private readonly message: (text: string) => void) {}
    public accepts(handoff: LegacyExternalSubgameHandoff): boolean { return Number(handoff.gameId) === 138 || String(handoff.gameName ?? '').toLowerCase() === 'aycp'; }
    public async enter(handoff: LegacyExternalSubgameHandoff): Promise<void> {
        if (this.switching || this.bootstrap || !this.accepts(handoff)) return; const roomId = Number(handoff.roomId ?? handoff.roomID ?? 0);
        if (!Number.isSafeInteger(roomId) || roomId <= 0) { handoff.cancel(); this.message('AYCP 房间数据无效'); return; }
        this.switching = true; this.source = handoff;
        try { if (!handoff.consume()) throw new Error('AYCP 切服票据已失效'); const gameClient = createOwnedGameClient(); this.gameClient = gameClient;
            const role = await new LegacyRoleGateway(gameClient, handoff.gameServerUrl).resumeWithToken(this.account, handoff.gameToken, 'aycp'); const host = new Node('AYCPNativeSceneHost'); host.layer = this.lobbyNode.layer; (this.lobbyNode.parent ?? this.lobbyNode).addChild(host); this.host = host;
            const bootstrap = host.addComponent(AycpSceneBootstrap); this.bootstrap = bootstrap; await bootstrap.startRoom(gameClient, { roomId, playerId: role.playerId, onRoomReady: () => { this.lobbyNode.active = false; }, onEvent: (event, body) => this.lobbyNode.emit('legacy-aycp-event', { event, body }), onMessage: this.message, onExit: (reason) => { void this.leave(reason); } });
            this.lobbyNode.emit('legacy-aycp-room-ready', { roomId, handoff });
        } catch (error: unknown) { console.error('[AYCP] failed to enter native room', error); this.message(error instanceof Error ? error.message : '进入 AYCP 失败'); await this.recoverHall(); } finally { this.switching = false; }
    }
    public async leave(reason = 'user-exit'): Promise<void> { if (this.switching) return; this.switching = true; try { await this.recoverHall(); const source = this.source; this.source = null; this.lobbyNode.active = true; this.lobbyNode.emit('legacy-subgame-returned', { reason, source, fromClub: Boolean(source?.fromClub) }); } finally { this.switching = false; } }
    public destroy(): void { this.bootstrap?.stopRoom(); this.bootstrap = null; this.host?.destroy(); this.host = null; this.gameClient?.close(); this.gameClient = null; this.source = null; }
    private async recoverHall(): Promise<void> { const game = this.gameClient; this.bootstrap?.stopRoom(); this.bootstrap = null; this.host?.destroy(); this.host = null;
        game?.close(); this.gameClient = null;
        if (!this.hallClient.isConnected()) await this.hallClient.request('gateway.heartbeat', { clientTime: Date.now() }); }
}
