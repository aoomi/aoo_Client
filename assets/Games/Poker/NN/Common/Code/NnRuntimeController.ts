import type { ProtocolClient } from '../../../../../Common/Code/Runtime/network/ProtocolClient';
import { NnCommandEnvelope, NnProtocolAdapter, NnTransport } from './NnProtocol';
import { NnRoomPresenter, NnRoomView } from './NnRoomPresenter';
import { NnSnapshot } from './NnRoomState';
import { NN_PLAY_VERSION } from './NnRules';

export const NN_DISPATCH = 'poker.quanguo2998.dispatch' as const;
export const NN_STATE_PUSH = 'poker.quanguo2998.state_push' as const;
export const COMMON_ROOM_STATE_PUSH = 'common.room.state_push' as const;

/** 将牛牛内部命令封装到公共 V2 权威派发协议，网络连接与鉴权仍由公共层负责。 */
export class NnProtocolClientTransport implements NnTransport {
    public constructor(private readonly client: ProtocolClient, private readonly roundNo: () => number) {}

    public request(command: NnCommandEnvelope): Promise<NnSnapshot> {
        const roundNo = this.roundNo();
        if (!Number.isSafeInteger(roundNo) || roundNo < 0) throw new Error('[NN] invalid round cursor');
        console.info('[NN] dispatch', { msgId: command.msgId, requestId: command.requestId,
            roomId: command.roomId, stateVersion: command.stateVersion, roundNo });
        return this.client.request<NnSnapshot>(NN_DISPATCH, Object.freeze({
            roomId: command.roomId, roundNo, playVersion: NN_PLAY_VERSION,
            expectedStateVersion: command.stateVersion, operationId: command.requestId,
            action: command.msgId, payload: command.body,
        })).then(snapshot => {
            console.info('[NN] authoritative result', { msgId: command.msgId,
                requestId: command.requestId, roomId: snapshot.roomId,
                stateVersion: snapshot.stateVersion, phase: snapshot.phase });
            return snapshot;
        }).catch((error: unknown) => {
            console.error('[NN] dispatch failed', { msgId: command.msgId,
                requestId: command.requestId, roomId: command.roomId,
                stateVersion: command.stateVersion,
                reason: error instanceof Error ? error.message : String(error) });
            throw error;
        });
    }
}

export class NnRuntimeController {
    private readonly presenter: NnRoomPresenter;
    private readonly protocol: NnProtocolAdapter;
    private snapshot: NnSnapshot | null = null;
    private pending = false;

    public constructor(client: ProtocolClient, view: NnRoomView, private readonly roomId: number,
        private readonly playerId: number, requestPrefix: string,
        private readonly onSnapshot?: (snapshot: NnSnapshot) => void) {
        this.presenter = new NnRoomPresenter(view, playerId);
        const transport = new NnProtocolClientTransport(client, () => this.snapshot?.round ?? 0);
        this.protocol = new NnProtocolAdapter(transport, roomId,
            () => this.snapshot?.stateVersion ?? 0, requestPrefix);
        client.on(NN_STATE_PUSH, body => this.applyAuthoritativeSnapshot(body, 'push'));
        client.on(COMMON_ROOM_STATE_PUSH, body => this.applyAuthoritativeSnapshot(body, 'common-push'));
    }

    public state(): Promise<boolean> { return this.run('state', () => this.protocol.state()); }
    public seatInputContext(): Readonly<{ roomId: number; viewerSeat: number; viewerStatus: string }> {
        return { roomId: this.roomId, viewerSeat: this.snapshot?.viewerSeat ?? -1,
            viewerStatus: this.snapshot?.viewerStatus ?? 'UNKNOWN' };
    }
    public sit(): Promise<boolean> {
        return this.run('sit', () => this.protocol.sit());
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
        if (selected.length !== 3) throw new Error(`[NN] exactly three split cards are required roomId=${this.roomId}`);
        const hand = this.localHand();
        if (new Set(selected).size !== 3 || selected.some(card => !hand.includes(card))) {
            throw new Error(`[NN] split cards do not belong to local hand roomId=${this.roomId}`);
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
            throw new Error(`[NN] local split hand unavailable roomId=${this.roomId}`);
        }
        return hand;
    }

    private async run(action: string, request: () => Promise<NnSnapshot>): Promise<boolean> {
        if (this.pending) throw new Error(`[NN] operation already pending action=${action} roomId=${this.roomId}`);
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
            ? wrapper.payload : body) as NnSnapshot;
        if (incoming.gameCode !== 'quanguo2998' || Number(incoming.roomId) !== this.roomId) return false;
        const accepted = this.presenter.applySnapshot(incoming);
        if (!accepted) return false;
        this.snapshot = incoming;
        this.onSnapshot?.(incoming);
        console.info('[NN] authoritative snapshot applied', { source, roomId: this.roomId,
            stateVersion: incoming.stateVersion, phase: incoming.phase,
            viewerSeat: incoming.viewerSeat, viewerStatus: incoming.viewerStatus });
        return true;
    }
}
