import { Node } from 'cc';
import { ProtocolClient } from '../../Common/Code/Runtime/network/ProtocolClient';

export interface LegacyCurrentRoom {
    roomID: number;
    practiceId: number;
    gameType: string;
    roomKey: number;
}

export interface LegacyLobbyBootstrapState {
    currentRoom: LegacyCurrentRoom;
}

export class LobbySessionService {
    private readonly disposers: Array<() => void> = [];
    private epoch = 0;
    private disposed = false;

    public constructor(
        private readonly client: ProtocolClient,
        private readonly lobbyNode: Node,
    ) {}

    public async start(): Promise<LegacyLobbyBootstrapState> {
        this.disposed = false;
        this.stop();
        const epoch = ++this.epoch;
        const safe = (fn: () => void): void => {
            if (this.disposed || epoch !== this.epoch) return;
            fn();
        };
        this.disposers.push(
            this.client.on('SRoom_ContinueRoomInfo', (body) => safe(() => this.lobbyNode.emit('legacy-continue-room', body))),
            this.client.on('SBase_RoomCrammed', (body) => safe(() => this.lobbyNode.emit('legacy-room-crammed', body))),
            this.client.on('MqResponseBo', (body) => safe(() => this.handleRoomResponse(body, epoch))),
            this.client.on('playerchanged', (body) => safe(() => this.lobbyNode.emit('legacy-player-changed', body))),
        );
        // Only current-room recovery belongs to lobby startup. The removed
        // invitation/union responses had no consumers and their transport-level
        // failures surfaced as global errors during screen entry and exit.
        const currentRoom = await this.client.request<LegacyCurrentRoom>('game.C1101GetRoomID', {});
        if (this.disposed || epoch !== this.epoch) {
            return { currentRoom: { roomID: 0, practiceId: 0, gameType: 'NOT', roomKey: 0 } };
        }
        const state = { currentRoom };
        this.lobbyNode.emit('legacy-lobby-bootstrap', state);
        if (Number(currentRoom.roomID) > 0) this.lobbyNode.emit('legacy-current-room', currentRoom);
        return state;
    }

    public stop(): void {
        for (const dispose of this.disposers.splice(0)) dispose();
        this.epoch += 1;
    }

    private handleRoomResponse(body: unknown, epoch: number): void {
        if (this.disposed || epoch !== this.epoch) return;
        this.lobbyNode.emit('legacy-room-create-result', body);
        if (!body || typeof body !== 'object') return;
        const result = (body as { result?: unknown }).result;
        if (!result || typeof result !== 'object') return;
        const packet = result as { code?: unknown; data?: unknown; msg?: unknown };
        if (Number(packet.code) !== 0) {
            this.lobbyNode.emit('legacy-room-operation-failed', packet);
            return;
        }
        if (!packet.data || typeof packet.data !== 'object') return;
        const data = packet.data as Record<string, unknown>;
        this.lobbyNode.emit('open-authoritative-subgame', {
            gameId: Number(data.gameType ?? 0),
            gameName: Number(data.gameType) === 629
                ? 'pdk'
                : Number(data.gameType) === 628 ? 'scjymj'
                    : Number(data.gameType) === 0 ? 'hzmj' : '',
            roomId: Number(data.roomID ?? 0),
            roomKey: data.roomKey,
        });
    }

    public destroy(): void {
        this.disposed = true;
        this.stop();
    }
}
