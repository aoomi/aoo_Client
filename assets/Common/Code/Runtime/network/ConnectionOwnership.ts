import { ProtocolClient } from './ProtocolClient';
import { ReconnectCoordinator } from './ReconnectCoordinator';
import { StableTransportFacade } from './StableTransportFacade';

/** Process-wide owner of the one Lobby slot and one Game slot. Hall is retained only as a wire/compatibility alias. */
class ConnectionOwnership {
    public readonly coordinator = new ReconnectCoordinator<ProtocolClient, ProtocolClient>();
    public readonly hall = new StableTransportFacade(this.coordinator.hall);
    /** Canonical internal Lobby transport; `hall` remains source-compatible for legacy callers. */
    public readonly lobby = this.hall;
    public readonly game = new StableTransportFacade(this.coordinator.game);
    private gameReconnectRecipe: ((client: ProtocolClient) => Promise<void>) | null = null;
    private gameReconnect: Promise<void> | null = null;
    private readonly gameCloseDisposer: () => void;

    public constructor() {
        this.coordinator.hall.setDisposer((client) => client.close());
        this.coordinator.game.setDisposer((client) => client.close());
        this.gameCloseDisposer = this.game.onClose(() => this.handleGameClose());
    }

    public adoptGame(client: ProtocolClient): ProtocolClient {
        this.coordinator.game.adopt(client);
        return this.game as unknown as ProtocolClient;
    }

    public setGameReconnectRecipe(recipe: ((client: ProtocolClient) => Promise<void>) | null): void {
        this.gameReconnectRecipe = recipe;
    }

    /** Canonical Lobby reconnect cancellation/ownership surface. */
    public cancelLobby(): void {
        this.coordinator.cancelLobby();
    }

    public dispose(): void {
        this.coordinator.logout();
        this.gameCloseDisposer();
        this.hall.dispose();
        this.game.dispose();
    }

    private handleGameClose(): void {
        if (this.gameReconnect || !this.gameReconnectRecipe) {
            if (!this.gameReconnectRecipe) this.coordinator.game.disconnect('TERMINAL');
            return;
        }
        const pending = this.reconnectGame();
        this.gameReconnect = pending;
        void pending.then(() => this.clearGameReconnect(pending), () => this.clearGameReconnect(pending));
    }

    private async reconnectGame(): Promise<void> {
        await this.coordinator.retry(this.coordinator.game, async (reconnecting) => {
            const recipe = this.gameReconnectRecipe;
            if (!recipe) throw new Error('GAME_RECONNECT_RECIPE_MISSING');
            const client = new ProtocolClient('game');
            try {
                return await this.coordinator.game.establish(({ signal, generation }) => ({
                    signal,
                    generation,
                    reconnecting,
                    authenticate: async () => { if (signal.aborted) throw new Error('GAME_RECONNECT_CANCELLED'); },
                    connect: async () => {
                        await recipe(client);
                        return client;
                    },
                    recover: async () => this.game.recoverGeneration(generation),
                }), reconnecting);
            } catch (error) {
                client.close();
                throw error;
            }
        });
    }

    private clearGameReconnect(pending: Promise<void>): void {
        if (this.gameReconnect === pending) this.gameReconnect = null;
    }
}

export const connectionOwnership = new ConnectionOwnership();

export function createOwnedGameClient(): ProtocolClient {
    return connectionOwnership.adoptGame(new ProtocolClient('game'));
}

export function setGameReconnectRecipe(recipe: ((client: ProtocolClient) => Promise<void>) | null): void {
    connectionOwnership.setGameReconnectRecipe(recipe);
}

/**
 * Room presentation owners subscribe here instead of reaching into a socket.
 * The callback runs only after the replacement game connection has recovered,
 * so every registered gameplay entry receives one consistent restore boundary.
 */
export function onGameReconnect(listener: () => void | Promise<void>): () => void {
    return connectionOwnership.game.onReconnect(listener);
}

export function setGameRoomReconnectRecipe(roomId: number, playVersion: string,
    refresh: (roomId: number) => Promise<{ authorityRoute: string; gameTicket: string }>): void {
    if (!Number.isSafeInteger(roomId) || roomId <= 0 || !playVersion.trim()) {
        connectionOwnership.setGameReconnectRecipe(null);
        return;
    }
    connectionOwnership.setGameReconnectRecipe(async (client) => {
        const ticket = await refresh(roomId);
        client.setWsTicket(ticket.gameTicket);
        client.bindRoomAuthority(roomId, playVersion);
        await client.connect(ticket.authorityRoute);
    });
}
