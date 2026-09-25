import type { ProtocolClient } from '../../../../Common/Code/Runtime/network/ProtocolClient';
import { CD299BetAction, CD299Envelope, CD299ProtocolAdapter, CD299Transport } from './CD299Protocol';
import { CD299RoomPresenter, CD299RoomView, CD299_TIMING_MS } from './CD299RoomPresenter';
import { CD299Snapshot } from './CD299RoomState';
import { CD299_PLAY_VERSION } from './CD299Rules';

export const CD299_DISPATCH = 'poker.CD299.dispatch' as const;
export const CD299_STATE_PUSH = 'poker.CD299.state_push' as const;
export const CD299_COMMON_ROOM_STATE_PUSH = 'common.room.state_push' as const;

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
    private timeoutTimer: ReturnType<typeof setTimeout> | null = null;

    public constructor(client: ProtocolClient, view: CD299RoomView, private readonly roomId: number,
        requestPrefix: string) {
        this.presenter = new CD299RoomPresenter(view);
        const transport = new CD299ProtocolClientTransport(client, () => this.snapshot?.round ?? 0);
        this.protocol = new CD299ProtocolAdapter(transport, roomId,
            () => this.snapshot?.stateVersion ?? 0, requestPrefix);
        client.on(CD299_STATE_PUSH, body => this.applyAuthoritativeSnapshot(body, 'push'));
        client.on(CD299_COMMON_ROOM_STATE_PUSH, body => this.applyAuthoritativeSnapshot(body, 'common-push'));
    }

    public state(): Promise<boolean> { return this.run('state', () => this.protocol.state()); }
    public sit(carryScore: number): Promise<boolean> {
        return this.run('sit', () => this.protocol.sit(carryScore));
    }
    public preset(betType: 0 | 1 | 2, _legacyMango?: number): Promise<boolean> {
        return this.run(`preset:${betType}`, () => this.protocol.preset(betType));
    }
    public bet(action: CD299BetAction, amount = 0): Promise<boolean> {
        const authoritativeAmount = action === 'RAISE' && amount <= 0
            ? Math.max(this.snapshot?.rules.openingBet ?? 1, Math.max(1, this.snapshot?.betTarget ?? 0) * 2)
            : amount;
        return this.run(`bet:${action}`, () => this.protocol.bet(action, authoritativeAmount));
    }
    public addCard(): Promise<boolean> { return this.run('add-card', () => this.protocol.addCard()); }
    public split(cards: readonly number[]): Promise<boolean> {
        return this.run('split', () => this.protocol.split(cards));
    }
    public delaySplit(): Promise<boolean> { return this.run('delay-split', () => this.protocol.delaySplit()); }
    public splitLocalHand(): Promise<boolean> {
        const seat = this.snapshot?.viewerRole === 'SEATED' ? this.snapshot.viewerSeat : -1;
        const cards = this.snapshot?.hands[seat] ?? [];
        if (seat < 0 || cards.length !== 4 || cards.some(card => card === 0)) {
            throw new Error(`[CD299] local split hand unavailable roomId=${this.roomId}`);
        }
        return this.split(cards);
    }
    public continueRound(): Promise<boolean> {
        return this.run('continue', () => this.protocol.continueRound());
    }
    public restart(carryScore: number): Promise<boolean> {
        return this.run('restart', () => this.protocol.restart(carryScore));
    }
    public rebuy(carryScore: number): Promise<boolean> {
        return this.run('rebuy', () => this.protocol.rebuy(carryScore));
    }
    public stand(): Promise<boolean> {
        // A successful terminal stand immediately projects this viewer as a spectator.
        // The settlement panel can be rebound before the browser's synthesized follow-up
        // click arrives, so gate the command by the latest authority identity as well as
        // the generic in-flight guard.
        if (this.snapshot?.viewerRole !== 'SEATED' || this.snapshot.viewerSeat < 0) {
            console.info('[CD299] stand ignored for non-seated viewer', {
                roomId: this.roomId, stateVersion: this.snapshot?.stateVersion ?? 0,
                viewerRole: this.snapshot?.viewerRole ?? 'UNKNOWN',
            });
            return Promise.resolve(false);
        }
        return this.run('stand', () => this.protocol.stand());
    }
    public timeout(): Promise<boolean> { return this.run('timeout', () => this.protocol.timeout()); }
    public isSeated(): boolean { return this.snapshot?.viewerRole === 'SEATED'; }
    public authoritativeSeat(): number {
        return this.snapshot?.viewerRole === 'SEATED' ? this.snapshot.viewerSeat : -1;
    }

    public destroy(): void {
        if (this.timeoutTimer !== null) clearTimeout(this.timeoutTimer);
        this.timeoutTimer = null;
    }

    private async run(action: string, request: () => Promise<CD299Snapshot>): Promise<boolean> {
        // A physical touch may be followed by a browser-synthesized click in
        // Creator Preview. Keep the in-flight authoritative command singular.
        if (this.pending) {
            console.info('[CD299] duplicate UI operation ignored', { action, roomId: this.roomId });
            return false;
        }
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
            ? wrapper.payload : body) as CD299Snapshot;
        if (incoming.gameCode !== 'CD299' || Number(incoming.roomId) !== this.roomId) return false;
        const accepted = this.presenter.applySnapshot(incoming);
        if (!accepted) return false;
        this.snapshot = incoming;
        this.scheduleAuthoritativeTimeout(incoming);
        console.info('[CD299] authoritative snapshot applied', { source, roomId: this.roomId,
            stateVersion: incoming.stateVersion, phase: incoming.phase,
            viewerSeat: incoming.viewerSeat, viewerRole: incoming.viewerRole });
        return true;
    }

    /**
     * XQP lets the seated client submit the expiry command, while the server
     * remains authoritative about both the deadline and the fallback action.
     * Re-check the immutable deadline identity before sending so a late timer
     * can never act on a newer turn.
     */
    private scheduleAuthoritativeTimeout(snapshot: CD299Snapshot): void {
        if (this.timeoutTimer !== null) clearTimeout(this.timeoutTimer);
        this.timeoutTimer = null;
        if (snapshot.viewerRole !== 'SEATED') return;
        const seat = snapshot.viewerSeat;
        const bettingDeadline = snapshot.operationDeadline?.seatId === seat
            && Boolean(snapshot.operationDeadline.operationId)
            ? Number(snapshot.operationDeadline.deadlineEpochMillis) : 0;
        const splitDeadline = snapshot.phase === 'SPLITTING'
            ? Number(snapshot.splitDeadlineEpochMillis?.[seat] ?? 0) : 0;
        const nextRoundDeadline = snapshot.phase === 'ROUND_SETTLEMENT'
            && snapshot.roundSettlementTriggerSeat === seat
            ? Number(snapshot.roundSettlementDeadlineEpochMillis) : 0;
        const seatRetentionDeadline = Number(snapshot.seatRetentionDeadlineEpochMillis?.[seat] ?? 0);
        const candidates = [bettingDeadline, splitDeadline, nextRoundDeadline, seatRetentionDeadline]
            .filter(value => Number.isSafeInteger(value) && value > 0);
        const deadline = candidates.length > 0 ? Math.min(...candidates) : 0;
        if (!Number.isSafeInteger(deadline) || deadline <= 0) return;
        const stateVersion = snapshot.stateVersion;
        const operationId = String(snapshot.operationDeadline?.operationId ?? '');
        const delay = Math.max(0, deadline - Date.now()) + 80;
        this.timeoutTimer = setTimeout(() => {
            this.timeoutTimer = null;
            const current = this.snapshot;
            if (!current || current.stateVersion !== stateVersion || current.viewerSeat !== seat) return;
            const currentBettingId = String(current.operationDeadline?.operationId ?? '');
            const currentSplitDeadline = Number(current.splitDeadlineEpochMillis?.[seat] ?? 0);
            if (bettingDeadline > 0 && currentBettingId !== operationId) return;
            if (splitDeadline > 0 && currentSplitDeadline !== splitDeadline) return;
            console.info('[CD299] authoritative deadline reached', {
                roomId: this.roomId, seatId: seat, stateVersion, operationId,
            });
            void this.timeout().catch((error: unknown) => console.error('[CD299] timeout dispatch failed', {
                roomId: this.roomId, seatId: seat, stateVersion, operationId,
                reason: error instanceof Error ? error.message : String(error),
            }));
        }, delay);
    }

}
