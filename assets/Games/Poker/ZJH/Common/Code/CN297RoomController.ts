import type { Node } from 'cc';
import { CN297ProtocolAdapter } from './CN297Protocol';
import { CN297RoomPresenter } from './CN297RoomPresenter';
import { CN297RoomViewAdapter, type CN297RoomAction, type CN297RoomActionSink } from './CN297RoomViewAdapter';
import type { CN297Snapshot } from './CN297RoomState';

/** Owns CN297 UI actions and accepts only server snapshots as render state. */
export class CN297RoomController implements CN297RoomActionSink {
    private readonly view: CN297RoomViewAdapter;
    private readonly presenter: CN297RoomPresenter;
    private pending = false;
    private snapshot: CN297Snapshot | null = null;
    private settledRound = 0;

    public constructor(private readonly protocol: CN297ProtocolAdapter, root: Node,
        private readonly localPlayerId: number) {
        this.view = new CN297RoomViewAdapter(root, this);
        this.presenter = new CN297RoomPresenter(this.view, localPlayerId);
    }

    public async initialize(): Promise<CN297Snapshot> {
        const snapshot = await this.protocol.state(); this.accept(snapshot); await this.settleIfFinished(snapshot); return snapshot;
    }

    public invoke(action: CN297RoomAction): void {
        if (this.pending) return;
        this.pending = true;
        void this.execute(action).catch((error: unknown) => {
            console.error('[CN297] room action failed', { action, roomId: this.snapshot?.roomId ?? 0,
                playerId: this.localPlayerId, stateVersion: this.snapshot?.stateVersion ?? -1, error });
        }).finally(() => { this.pending = false; });
    }

    public sit(seatId: number): void {
        const snapshot = this.snapshot;
        if (this.pending || !snapshot || snapshot.state !== 'WAITING' || snapshot.viewerRole !== 'SPECTATOR'
            || !Number.isSafeInteger(seatId) || seatId < 0 || seatId >= snapshot.seatLimit
            || snapshot.seats[seatId]) return;
        this.pending = true;
        void this.protocol.sit(seatId).then(value => this.accept(value)).catch((error: unknown) => {
            console.error('[CN297] sit failed', { action: 'sit', roomId: snapshot.roomId,
                playerId: this.localPlayerId, stateVersion: snapshot.stateVersion, seatId, error });
            return this.protocol.state().then(value => this.accept(value));
        }).finally(() => { this.pending = false; });
    }

    public bet(amount: number, queued: boolean): void {
        if (this.pending) return;
        this.pending = true;
        const snapshot = this.snapshot;
        const request = queued ? this.protocol.preBet(amount) : this.protocol.bet(amount);
        void request.then(value => { this.accept(value); return this.settleIfFinished(value); }).catch((error: unknown) => {
            console.error('[CN297] bet failed', { roomId: snapshot?.roomId ?? 0, playerId: this.localPlayerId,
                stateVersion: snapshot?.stateVersion ?? -1, amount, queued, error });
        }).finally(() => { this.pending = false; });
    }

    public compare(targetSeatId: number): void {
        if (this.pending) return;
        this.pending = true;
        const snapshot = this.snapshot;
        void this.protocol.compare(targetSeatId).then(result => {
            console.info('[CN297] compare resolved', { roomId: snapshot?.roomId ?? 0, playerId: this.localPlayerId,
                targetSeatId, loserSeat: result.loserSeat, stateVersion: result.view.stateVersion });
            this.accept(result.view); return this.settleIfFinished(result.view);
        }).catch((error: unknown) => {
            console.error('[CN297] compare failed', { roomId: snapshot?.roomId ?? 0, playerId: this.localPlayerId,
                stateVersion: snapshot?.stateVersion ?? -1, targetSeatId, error });
        }).finally(() => { this.pending = false; });
    }

    public destroy(): void { this.view.dispose(); this.presenter.dispose(); }

    private async execute(action: CN297RoomAction): Promise<void> {
        const snapshot = this.snapshot;
        if (!snapshot || snapshot.viewerRole !== 'SEATED') {
            throw new Error(`[CN297] seated action rejected action=${action} roomId=${snapshot?.roomId ?? 0}`);
        }
        if ((action === 'start' || action === 'continue') && snapshot.ownerPlayerId !== this.localPlayerId) {
            throw new Error(`[CN297] owner action rejected action=${action} roomId=${snapshot.roomId}`);
        }
        if (action === 'continue' && this.settledRound !== snapshot.roundNo) {
            await this.settleIfFinished(snapshot);
            if (this.settledRound !== snapshot.roundNo) throw new Error('[CN297] round settlement is not confirmed');
        }
        const response = await (() => {
            switch (action) {
                case 'start': return this.protocol.start();
                case 'look': return this.protocol.look();
                case 'bet': this.view.showBetOptions(this.betOptions(), false); return null;
                case 'preBet': this.view.showBetOptions(this.betOptions(), true); return null;
                case 'fold': return this.protocol.fold();
                case 'compare': this.view.showCompareTargets(this.compareTargets()); return null;
                case 'continue': return this.protocol.continueRound();
            }
        })();
        if (!response) return;
        this.accept(response);
        await this.settleIfFinished(response);
    }

    private accept(snapshot: CN297Snapshot): void {
        if (this.presenter.applySnapshot(snapshot)) this.snapshot = snapshot;
    }

    private async settleIfFinished(snapshot: CN297Snapshot): Promise<void> {
        if ((snapshot.state !== 'ROUND_FINISHED' && snapshot.state !== 'FINISHED')
            || this.settledRound === snapshot.roundNo) return;
        const settlement = await this.protocol.settle();
        this.settledRound = snapshot.roundNo;
        this.presenter.applySettlement(snapshot.roundNo, settlement);
        console.info('[CN297] round settlement received', { roomId: snapshot.roomId,
            playerId: this.localPlayerId, roundNo: snapshot.roundNo, stateVersion: snapshot.stateVersion,
            winnerSeat: settlement.winnerSeat, entryCount: settlement.entries.length });
    }

    private compareTargets(): number[] {
        const snapshot = this.snapshot;
        if (!snapshot) throw new Error('[CN297] authoritative snapshot is required');
        const localSeat = Number(Object.entries(snapshot.seats)
            .find(([, seat]) => seat.playerId === this.localPlayerId)?.[0] ?? -1);
        const targets = Object.entries(snapshot.seats)
            .filter(([seat, state]) => Number(seat) !== localSeat && state.active)
            .map(([seat]) => Number(seat));
        if (targets.length === 0) throw new Error('[CN297] compare target is unavailable');
        return targets;
    }

    private betOptions(): number[] {
        const local = this.snapshot && Object.values(this.snapshot.seats)
            .find(seat => seat.playerId === this.localPlayerId);
        const baseBet = this.snapshot?.baseBet ?? 1;
        const minimum = this.snapshot?.minimumBet ?? (local?.looked ? baseBet * 2 : baseBet);
        const maximum = this.snapshot?.maximumBet ?? minimum;
        return [minimum, minimum * 2, minimum * 5, maximum]
            .filter((amount, index, values) => amount <= maximum && values.indexOf(amount) === index);
    }
}
