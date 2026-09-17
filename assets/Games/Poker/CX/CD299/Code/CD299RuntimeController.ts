import type { ProtocolClient } from '../../../../../Common/Code/Runtime/network/ProtocolClient';
import { CD299BetAction, CD299Envelope, CD299ProtocolAdapter, CD299Transport } from './CD299Protocol';
import { CD299RoomPresenter, CD299RoomView } from './CD299RoomPresenter';
import { CD299Snapshot } from './CD299RoomState';
import { CD299_PLAY_VERSION } from './CD299Rules';

export const CD299_DISPATCH = 'poker.CD299.dispatch' as const;

/** Keeps the CD299-specific inner command on the shared V2 authority dispatch envelope. */
export class CD299ProtocolClientTransport implements CD299Transport {
    public constructor(private readonly client: ProtocolClient, private readonly roundNo: () => number) {}

    public request(command: CD299Envelope): Promise<CD299Snapshot> {
        const roundNo = this.roundNo();
        if (!Number.isSafeInteger(roundNo) || roundNo < 0) throw new Error('[CD299] invalid round cursor');
        console.info('[CD299] dispatch', { msgId: command.msgId, requestId: command.requestId,
            roomId: command.roomId, stateVersion: command.stateVersion, roundNo });
        return this.client.request<CD299Snapshot>(CD299_DISPATCH, Object.freeze({
            roomId: command.roomId, roundNo, playVersion: CD299_PLAY_VERSION,
            expectedStateVersion: command.stateVersion, operationId: command.requestId,
            action: command.msgId, payload: command.body,
        })).then(snapshot => {
            console.info('[CD299] authoritative result', { msgId: command.msgId,
                requestId: command.requestId, roomId: snapshot.roomId,
                stateVersion: snapshot.stateVersion, phase: snapshot.phase });
            return snapshot;
        }).catch((error: unknown) => {
            console.error('[CD299] dispatch failed', { msgId: command.msgId,
                requestId: command.requestId, roomId: command.roomId,
                stateVersion: command.stateVersion,
                reason: error instanceof Error ? error.message : String(error) });
            throw error;
        });
    }
}

/** Pure production controller; Creator binding is deferred to the exclusive editor window. */
export class CD299RuntimeController {
    private readonly presenter: CD299RoomPresenter;
    private readonly protocol: CD299ProtocolAdapter;
    private snapshot: CD299Snapshot | null = null;
    private pending = false;

    public constructor(client: ProtocolClient, view: CD299RoomView, private readonly roomId: number,
        private readonly playerId: number, requestPrefix: string) {
        this.presenter = new CD299RoomPresenter(view, playerId);
        const transport = new CD299ProtocolClientTransport(client, () => this.snapshot?.round ?? 0);
        this.protocol = new CD299ProtocolAdapter(transport, roomId,
            () => this.snapshot?.stateVersion ?? 0, requestPrefix);
    }

    public state(): Promise<boolean> { return this.run('state', () => this.protocol.state()); }
    public sit(seat: number): Promise<boolean> { return this.run('sit', () => this.protocol.sit(seat)); }
    public preset(base: number, mango: number): Promise<boolean> {
        return this.run('preset', () => this.protocol.preset(base, mango));
    }
    public bet(action: CD299BetAction, amount = 0): Promise<boolean> {
        return this.run(`bet:${action}`, () => this.protocol.bet(action, amount));
    }
    public addCard(): Promise<boolean> { return this.run('add-card', () => this.protocol.addCard()); }
    public split(cards: readonly number[]): Promise<boolean> {
        return this.run('split', () => this.protocol.split(cards));
    }
    public splitLocalHand(): Promise<boolean> {
        const seat = Number(Object.entries(this.snapshot?.players ?? {}).find(([, id]) => id === this.playerId)?.[0] ?? -1);
        const cards = this.snapshot?.hands[seat] ?? [];
        if (seat < 0 || cards.length !== 4 || cards.some(card => card === 0)) {
            throw new Error(`[CD299] local split hand unavailable roomId=${this.roomId}`);
        }
        return this.split(cards);
    }
    public continueRound(): Promise<boolean> {
        return this.run('continue', () => this.protocol.continueRound());
    }
    public timeout(): Promise<boolean> { return this.run('timeout', () => this.protocol.timeout()); }

    private async run(action: string, request: () => Promise<CD299Snapshot>): Promise<boolean> {
        if (this.pending) throw new Error(`[CD299] operation already pending action=${action} roomId=${this.roomId}`);
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
