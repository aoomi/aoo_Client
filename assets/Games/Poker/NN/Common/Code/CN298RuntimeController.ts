import type { ProtocolClient } from '../../../../../Common/Code/Runtime/network/ProtocolClient';
import { CN298CommandEnvelope, CN298ProtocolAdapter, CN298Transport } from './CN298Protocol';
import { CN298RoomPresenter, CN298RoomView } from './CN298RoomPresenter';
import { CN298Snapshot } from './CN298RoomState';
import { CN298_PLAY_VERSION } from './CN298Rules';

export const CN298_DISPATCH = 'poker.CN298.dispatch' as const;
export const CN298_STATE_PUSH = 'poker.CN298.state_push' as const;
export const COMMON_ROOM_STATE_PUSH = 'common.room.state_push' as const;

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
        private readonly playerId: number, requestPrefix: string) {
        this.presenter = new CN298RoomPresenter(view, playerId);
        const transport = new CN298ProtocolClientTransport(client, () => this.snapshot?.round ?? 0);
        this.protocol = new CN298ProtocolAdapter(transport, roomId,
            () => this.snapshot?.stateVersion ?? 0, requestPrefix);
        client.on(CN298_STATE_PUSH, body => this.applyAuthoritativeSnapshot(body, 'push'));
        client.on(COMMON_ROOM_STATE_PUSH, body => this.applyAuthoritativeSnapshot(body, 'common-push'));
    }

    public state(): Promise<boolean> { return this.run('state', () => this.protocol.state()); }
    public seatInputContext(): Readonly<{ roomId: number; viewerSeat: number; viewerStatus: string }> {
        return { roomId: this.roomId, viewerSeat: this.snapshot?.viewerSeat ?? -1,
            viewerStatus: this.snapshot?.viewerStatus ?? 'UNKNOWN' };
    }
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
    public start(): Promise<boolean> { return this.run('start', () => this.protocol.start()); }
    public bet(multiplier: number): Promise<boolean> {
        return this.run(`bet:${multiplier}`, () => this.protocol.bet(multiplier));
    }
    public split(cards?: readonly number[]): Promise<boolean> {
        const selected = cards?.length ? cards : this.presenter.splitSelection();
        if (selected.length !== 3) throw new Error(`[CN298] exactly three split cards are required roomId=${this.roomId}`);
        const hand = this.localHand();
        if (new Set(selected).size !== 3 || selected.some(card => !hand.includes(card))) {
            throw new Error(`[CN298] split cards do not belong to local hand roomId=${this.roomId}`);
        }
        return this.run('split', () => this.protocol.split(selected));
    }
    public toggleSplitCard(seat: number, cardIndex: number): void {
        if (this.pending) return;
        this.presenter.toggleSplitCard(seat, cardIndex);
    }
    public continueRound(): Promise<boolean> {
        return this.run('continue', () => this.protocol.continueRound());
    }
    public timeout(): Promise<boolean> { return this.run('timeout', () => this.protocol.timeout()); }

    private localHand(): readonly number[] {
        const snapshot = this.snapshot;
        const seat = snapshot?.viewerStatus === 'SEATED' ? snapshot.viewerSeat : -1;
        const hand = snapshot?.hands[seat];
        if (!hand || hand.length !== 5 || hand.some(card => card <= 0)) {
            throw new Error(`[CN298] local split hand unavailable roomId=${this.roomId}`);
        }
        return hand;
    }

    private async run(action: string, request: () => Promise<CN298Snapshot>): Promise<boolean> {
        if (this.pending) throw new Error(`[CN298] operation already pending action=${action} roomId=${this.roomId}`);
        this.pending = true;
        try {
            const incoming = await request();
            return this.applyAuthoritativeSnapshot(incoming, action);
        } finally {
            this.pending = false;
        }
    }

    private applyAuthoritativeSnapshot(body: unknown, source: string): boolean {
        if (!body || typeof body !== 'object') return false;
        const wrapper = body as { payload?: unknown };
        const incoming = (wrapper.payload && typeof wrapper.payload === 'object'
            ? wrapper.payload : body) as CN298Snapshot;
        if (incoming.gameCode !== 'CN298' || Number(incoming.roomId) !== this.roomId) return false;
        const accepted = this.presenter.applySnapshot(incoming);
        if (!accepted) return false;
        this.snapshot = incoming;
        console.info('[CN298] authoritative snapshot applied', { source, roomId: this.roomId,
            stateVersion: incoming.stateVersion, phase: incoming.phase,
            viewerSeat: incoming.viewerSeat, viewerStatus: incoming.viewerStatus });
        return true;
    }
}
