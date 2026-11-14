import type { AuthenticatedAccount } from '../Auth/AuthTypes';
import { ProtocolClient } from '../../../Common/Code/Runtime/network/ProtocolClient';
import { LobbyHeartbeatService } from '../../../Common/Code/Runtime/network/HallHeartbeatService';
import { LegacyRoleGateway } from '../../../Common/Code/Runtime/role/LegacyRoleGateway';
import type { RoleSession } from '../../../Common/Code/Runtime/role/RoleTypes';
import { resolveRuntimeEndpoints } from '../../../Common/Code/Runtime/config/RuntimeEndpoints';
import { bootstrapRuntime } from '../../../Common/Code/Runtime/bootstrap/BootstrapRuntime';
import { sessionLifecycle } from '../../../Common/Code/Runtime/network/LegacyWebSocketClient';
import type { ConnectionSlotSnapshot } from '../../../Common/Code/Runtime/network/ReconnectCoordinator';
import { connectionOwnership } from '../../../Common/Code/Runtime/network/ConnectionOwnership';

export type SessionReplacementListener = () => void;

/** Owns the Lobby socket, ticket, reconnect policy and heartbeat. Hall names remain protocol aliases. */
export class NetworkRuntime {
    private readonly connections = connectionOwnership.coordinator;
    private readonly lobbyTransport = connectionOwnership.lobby;
    private client: ProtocolClient | null = null;
    private heartbeat: LobbyHeartbeatService | null = null;
    private activeAccount: AuthenticatedAccount | null = null;
    private transportEpoch = 0;
    private started = false;
    private disposed = false;
    private lobbyReconnect: Promise<void> | null = null;
    private readonly lobbyCloseDisposer: () => void;

    public constructor() {
        this.lobbyCloseDisposer = this.lobbyTransport.onClose(() => this.handleLobbyUnhealthy(this.transportEpoch));
    }

    public start(): void {
        if (this.disposed) throw new Error('NetworkRuntime has been disposed');
        if (this.started) return;
        this.started = true;
    }

    public async loginToLobby(account: AuthenticatedAccount): Promise<RoleSession> {
        this.assertStarted();
        const epoch = ++this.transportEpoch;
        this.disposeTransport();
        this.connections.cancelLobby();
        const selected = bootstrapRuntime.selectedServer();
        if (!selected) throw new Error('启动目录未选出可用区服');
        const endpoints = resolveRuntimeEndpoints();
        const client = new ProtocolClient('hall');
        const heartbeat = new LobbyHeartbeatService(this.lobbyTransport, () => this.handleLobbyUnhealthy(epoch));
        this.client = client;
        this.heartbeat = heartbeat;
        this.activeAccount = this.withSingleFlightTicket(account);
        const active = () => this.started && !this.disposed && this.transportEpoch === epoch && this.client === client;
        try {
            let role: RoleSession | null = null;
            await this.connections.lobby.establish(({ signal, generation }) => ({
                signal,
                generation,
                reconnecting: false,
                authenticate: async () => { if (signal.aborted) throw new Error('登录会话已取消'); },
                connect: async () => {
                    role = await new LegacyRoleGateway(client, endpoints.hallWebSocketUrl,
                        selected.id, endpoints.clientVersion, active).login(this.activeAccount!);
                    return client;
                },
                recover: async () => undefined,
            }));
            if (!active()) throw new Error('登录会话已取消');
            heartbeat.start();
            if (!role) throw new Error('大厅登录未返回角色会话');
            return role;
        } catch (error) {
            if (this.client === client) this.disposeTransport();
            this.connections.cancelLobby();
            throw error;
        }
    }

    /** Compatibility alias for the historical Hall-named caller surface. */
    public loginToHall(account: AuthenticatedAccount): Promise<RoleSession> {
        return this.loginToLobby(account);
    }

    public get protocol(): ProtocolClient {
        this.assertStarted();
        if (!this.connections.lobby.current()) throw new Error('NetworkRuntime transport is unavailable');
        return this.lobbyTransport as unknown as ProtocolClient;
    }

    public reset(): void {
        this.assertStarted();
        this.transportEpoch += 1;
        this.disposeTransport();
        this.connections.cancelLobby();
        this.connections.cancelGame();
    }

    /** Leaves the authenticated Lobby session intact while replacing or abandoning a room socket. */
    public resetGame(): void {
        this.assertStarted();
        this.connections.cancelGame();
    }

    public onSessionReplaced(listener: SessionReplacementListener): () => void {
        return sessionLifecycle.onReplacement(listener);
    }

    public suspendSession(): void {
        this.assertStarted();
        this.transportEpoch += 1;
        this.disposeTransport();
        this.connections.cancelLobby();
        this.connections.cancelGame();
    }

    public stop(): void {
        if (!this.started) return;
        this.started = false;
        this.transportEpoch += 1;
        this.disposeTransport();
        this.connections.logout();
    }

    public dispose(): void {
        if (this.disposed) return;
        this.stop();
        this.disposed = true;
        this.lobbyCloseDisposer();
    }

    private disposeTransport(): void {
        this.activeAccount?.cancelWsTicketRequest?.();
        this.activeAccount = null;
        this.heartbeat?.stop();
        this.client?.close();
        this.heartbeat = null;
        this.client = null;
    }

    public onLobbyConnectionState(listener: (snapshot: ConnectionSlotSnapshot) => void): () => void {
        return this.connections.lobby.onState(listener);
    }

    /** Compatibility alias for the historical Hall-named observer surface. */
    public onHallConnectionState(listener: (snapshot: ConnectionSlotSnapshot) => void): () => void {
        return this.onLobbyConnectionState(listener);
    }

    private handleLobbyUnhealthy(epoch: number): void {
        if (!this.started || this.disposed || epoch !== this.transportEpoch) return;
        if (this.lobbyReconnect) return;
        const pending = this.reconnectLobby(epoch);
        this.lobbyReconnect = pending;
        void pending.then(() => this.clearLobbyReconnect(pending), () => this.clearLobbyReconnect(pending));
    }

    private async reconnectLobby(epoch: number): Promise<void> {
        const account = this.activeAccount;
        const selected = bootstrapRuntime.selectedServer();
        if (!account || !selected) throw new Error('大厅重连上下文不存在');
        const endpoints = resolveRuntimeEndpoints();
        await this.connections.retry(this.connections.lobby, async (reconnecting) => {
            if (!this.started || this.disposed || epoch !== this.transportEpoch) throw new Error('登录会话已取消');
            const client = new ProtocolClient('hall');
            this.client = client;
            const active = () => this.started && !this.disposed && epoch === this.transportEpoch && this.client === client;
            try {
                return await this.connections.lobby.establish(({ signal, generation }) => ({
                    signal,
                    generation,
                    reconnecting,
                    authenticate: async () => { if (signal.aborted) throw new Error('登录会话已取消'); },
                    connect: async () => {
                        await new LegacyRoleGateway(client, endpoints.hallWebSocketUrl,
                            selected.id, endpoints.clientVersion, active).login(account);
                        return client;
                    },
                    recover: async () => this.lobbyTransport.recoverGeneration(generation),
                }), reconnecting);
            } catch (error) {
                client.close();
                throw error;
            }
        });
    }

    private clearLobbyReconnect(pending: Promise<void>): void {
        if (this.lobbyReconnect === pending) this.lobbyReconnect = null;
    }

    private withSingleFlightTicket(account: AuthenticatedAccount): AuthenticatedAccount {
        if (!account.refreshWsTicket) return account;
        return { ...account, refreshWsTicket: () => this.connections.singleFlightTicket(account.refreshWsTicket!) };
    }

    private assertStarted(): void {
        if (!this.started || this.disposed) throw new Error('NetworkRuntime is not started');
    }
}
