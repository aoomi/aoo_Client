import type { ProtocolClient } from '../../../../../Common/Code/Runtime/network/ProtocolClient';
import { CN298CommandEnvelope, CN298ProtocolAdapter, CN298Transport } from './CN298Protocol';
import { CN298RoomPresenter, CN298RoomView } from './CN298RoomPresenter';
import { CN298Snapshot } from './CN298RoomState';
import { CN298_PLAY_VERSION } from './CN298Rules';

export const CN298_DISPATCH = 'poker.CN298.dispatch' as const;

/** 将牛牛内部命令封装到公共 V2 权威派发协议，网络连接与鉴权仍由公共层负责。 */
export class CN298ProtocolClientTransport implements CN298Transport {
    public constructor(private readonly client: ProtocolClient, private readonly roundNo: () => number) {}

    public request(command: CN298CommandEnvelope): Promise<CN298Snapshot> {
        const roundNo = this.roundNo();
        if (!Number.isSafeInteger(roundNo) || roundNo < 0) throw new Error('[CN298] invalid round cursor');
        console.info('[CN298] dispatch', { msgId: command.msgId, requestId: command.requestId,
            roomId: command.roomId, stateVersion: command.stateVersion, roundNo });
        return this.client.request<CN298Snapshot>(CN298_DISPATCH, Object.freeze({
            roomId: command.roomId, roundNo, playVersion: CN298_PLAY_VERSION,
            expectedStateVersion: command.stateVersion, operationId: command.requestId,
            action: command.msgId, payload: command.body,
        })).then(snapshot => {
            console.info('[CN298] authoritative result', { msgId: command.msgId,
                requestId: command.requestId, roomId: snapshot.roomId,
                stateVersion: snapshot.stateVersion, phase: snapshot.phase });
            return snapshot;
        }).catch((error: unknown) => {
            console.error('[CN298] dispatch failed', { msgId: command.msgId,
                requestId: command.requestId, roomId: command.roomId,
                stateVersion: command.stateVersion,
                reason: error instanceof Error ? error.message : String(error) });
            throw error;
        });
    }
}

export class CN298RuntimeController {
    private readonly presenter: CN298RoomPresenter;
    private readonly protocol: CN298ProtocolAdapter;
    private snapshot: CN298Snapshot | null = null;
    private pending = false;

    public constructor(client: ProtocolClient, view: CN298RoomView, private readonly roomId: number,
        playerId: number, requestPrefix: string) {
        this.presenter = new CN298RoomPresenter(view, playerId);
        const transport = new CN298ProtocolClientTransport(client, () => this.snapshot?.round ?? 0);
        this.protocol = new CN298ProtocolAdapter(transport, roomId,
            () => this.snapshot?.stateVersion ?? 0, requestPrefix);
    }

    public state(): Promise<boolean> { return this.run('state', () => this.protocol.state()); }
    public sit(seatId: number): Promise<boolean> {
        return this.run(`sit:${seatId}`, () => this.protocol.sit(seatId)).catch(async error => {
            // A concurrent winner may have occupied this seat; refresh before surfacing the stable rejection.
            try { await this.state(); } catch (refreshError: unknown) {
                console.error('[CN298] seat refresh failed', { roomId: this.roomId,
                    stateVersion: this.snapshot?.stateVersion ?? 0,
                    reason: refreshError instanceof Error ? refreshError.message : String(refreshError) });
            }
            throw error;
        });
    }
    public rob(multiplier: number): Promise<boolean> {
        return this.run(`rob:${multiplier}`, () => this.protocol.rob(multiplier));
    }
    public bet(multiplier: number): Promise<boolean> {
        return this.run(`bet:${multiplier}`, () => this.protocol.bet(multiplier));
    }
    public split(cards: readonly number[]): Promise<boolean> {
        return this.run('split', () => this.protocol.split(cards));
    }
    public continueRound(): Promise<boolean> {
        return this.run('continue', () => this.protocol.continueRound());
    }
    public timeout(): Promise<boolean> { return this.run('timeout', () => this.protocol.timeout()); }

    private async run(action: string, request: () => Promise<CN298Snapshot>): Promise<boolean> {
        if (this.pending) throw new Error(`[CN298] operation already pending action=${action} roomId=${this.roomId}`);
        this.pending = true;
        try {
            const incoming = await request();
            const accepted = this.presenter.applySnapshot(incoming);
            if (accepted) this.snapshot = incoming;
            return accepted;
        } finally {
            this.pending = false;
        }
    }
}
