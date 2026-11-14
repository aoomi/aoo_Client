import type { Node } from 'cc';
import type { ProtocolClient } from '../../../../../Common/Code/Runtime/network/ProtocolClient';
import { ZjhProtocolAdapter } from './ZjhProtocol';
import { ZjhRoomPresenter } from './ZjhRoomPresenter';
import { ZjhRoomViewAdapter, type ZjhRoomAction, type ZjhRoomActionSink } from './ZjhRoomViewAdapter';
import type { ZjhSnapshot } from './ZjhRoomState';

export type ZjhSettlementObserver = (roundNo: number,
    settlement: Readonly<import('./ZjhProtocol').ZjhSettlementResult>) => void;

/** Owns ZJH UI actions and accepts only server snapshots as render state. */
export class ZjhRoomController implements ZjhRoomActionSink {
    private readonly view: ZjhRoomViewAdapter;
    private readonly presenter: ZjhRoomPresenter;
    private pending = false;
    private snapshot: ZjhSnapshot | null = null;
    private settledRound = 0;
    private readonly pushDisposers: Array<() => void> = [];

    public constructor(private readonly protocol: ZjhProtocolAdapter, gameClient: ProtocolClient, root: Node,
        private readonly localPlayerId: number,
        private readonly snapshotObserver?: (snapshot: ZjhSnapshot) => void,
        private readonly settlementObserver?: ZjhSettlementObserver) {
        this.view = new ZjhRoomViewAdapter(root, this);
        this.presenter = new ZjhRoomPresenter(this.view, localPlayerId);
        for (const event of ['poker.quanguo2997.state_push', 'common.room.state_push']) {
            this.pushDisposers.push(gameClient.on(event, body => this.acceptPush(body)));
        }
    }

    public async initialize(): Promise<ZjhSnapshot> {
        const snapshot = await this.protocol.state(); this.accept(snapshot); await this.settleIfFinished(snapshot); return snapshot;
    }

    public async restoreAfterReconnect(): Promise<void> {
        const snapshot = await this.protocol.state();
        this.accept(snapshot);
        await this.settleIfFinished(snapshot);
    }

    public invoke(action: ZjhRoomAction): void {
        if (this.pending) return;
        this.pending = true;
        void this.execute(action).catch((error: unknown) => {
            console.error('[ZJH] room action failed', { action, roomId: this.snapshot?.roomId ?? 0,
                playerId: this.localPlayerId, stateVersion: this.snapshot?.stateVersion ?? -1, error });
        }).finally(() => { this.pending = false; });
    }

    public sit(seatId: number): void {
        const snapshot = this.snapshot;
        if (this.pending || !snapshot || snapshot.state !== 'WAITING' || snapshot.viewerRole !== 'SPECTATOR'
            || Object.keys(snapshot.seats).length >= snapshot.seatLimit) return;
        this.pending = true;
        if (!Number.isSafeInteger(seatId) || seatId < 0 || seatId >= snapshot.seatLimit || snapshot.seats[seatId]) return;
        void this.protocol.sit(seatId).then(value => this.accept(value)).catch((error: unknown) => {
            console.error('[ZJH] sit failed', { action: 'sit', roomId: snapshot.roomId,
                playerId: this.localPlayerId, stateVersion: snapshot.stateVersion, error });
            return this.protocol.state().then(value => this.accept(value));
        }).finally(() => { this.pending = false; });
    }

    public bet(amount: number, queued: boolean): void {
        if (this.pending) return;
        this.pending = true;
        const snapshot = this.snapshot;
        const request = queued ? this.protocol.preBet(amount) : this.protocol.bet(amount);
        void request.then(value => { this.accept(value); return this.settleIfFinished(value); }).catch((error: unknown) => {
            console.error('[ZJH] bet failed', { roomId: snapshot?.roomId ?? 0, playerId: this.localPlayerId,
                stateVersion: snapshot?.stateVersion ?? -1, amount, queued, error });
        }).finally(() => { this.pending = false; });
    }

    public compare(targetSeatId: number): void {
        if (this.pending) return;
        this.pending = true;
        const snapshot = this.snapshot;
        void this.protocol.compare(targetSeatId).then(result => {
            console.info('[ZJH] compare resolved', { roomId: snapshot?.roomId ?? 0, playerId: this.localPlayerId,
                targetSeatId, loserSeat: result.loserSeat, stateVersion: result.view.stateVersion });
            this.accept(result.view); return this.settleIfFinished(result.view);
        }).catch((error: unknown) => {
            console.error('[ZJH] compare failed', { roomId: snapshot?.roomId ?? 0, playerId: this.localPlayerId,
                stateVersion: snapshot?.stateVersion ?? -1, targetSeatId, error });
        }).finally(() => { this.pending = false; });
    }

    public destroy(): void {
        for (const dispose of this.pushDisposers.splice(0)) dispose();
        this.view.dispose(); this.presenter.dispose();
    }

    private acceptPush(body: unknown): void {
        if (!body || typeof body !== 'object') return;
        const snapshot = body as ZjhSnapshot;
        if (snapshot.roomId !== this.snapshot?.roomId) return;
        this.accept(snapshot);
        void this.settleIfFinished(snapshot).catch((error: unknown) => console.error('[ZJH] push settlement failed', {
            roomId: snapshot.roomId, stateVersion: snapshot.stateVersion,
            reason: error instanceof Error ? error.message : String(error),
        }));
    }

    private async execute(action: ZjhRoomAction): Promise<void> {
        const snapshot = this.snapshot;
        if (!snapshot || snapshot.viewerRole !== 'SEATED') {
            throw new Error(`[ZJH] seated action rejected action=${action} roomId=${snapshot?.roomId ?? 0}`);
        }
        if ((action === 'start' || action === 'continue') && snapshot.ownerPlayerId !== this.localPlayerId) {
            throw new Error(`[ZJH] owner action rejected action=${action} roomId=${snapshot.roomId}`);
        }
        if (action === 'continue' && this.settledRound !== snapshot.roundNo) {
            await this.settleIfFinished(snapshot);
            if (this.settledRound !== snapshot.roundNo) throw new Error('[ZJH] round settlement is not confirmed');
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

    private accept(snapshot: ZjhSnapshot): void {
        if (!this.presenter.applySnapshot(snapshot)) return;
        this.snapshot = snapshot;
        this.snapshotObserver?.(snapshot);
        this.protocol.observe(snapshot);
    }

    private async settleIfFinished(snapshot: ZjhSnapshot): Promise<void> {
        if ((snapshot.state !== 'ROUND_FINISHED' && snapshot.state !== 'FINISHED')
            || this.settledRound === snapshot.roundNo) return;
        const settlement = await this.protocol.settle();
        this.settledRound = snapshot.roundNo;
        this.presenter.applySettlement(snapshot.roundNo, settlement);
        this.settlementObserver?.(snapshot.roundNo, settlement);
        console.info('[ZJH] round settlement received', { roomId: snapshot.roomId,
            playerId: this.localPlayerId, roundNo: snapshot.roundNo, stateVersion: snapshot.stateVersion,
            winnerSeat: settlement.winnerSeat, entryCount: settlement.entries.length });
    }

    private compareTargets(): number[] {
        const snapshot = this.snapshot;
        if (!snapshot) throw new Error('[ZJH] authoritative snapshot is required');
        const localSeat = Number(Object.entries(snapshot.seats)
            .find(([, seat]) => seat.playerId === this.localPlayerId)?.[0] ?? -1);
        const targets = Object.entries(snapshot.seats)
            .filter(([seat, state]) => Number(seat) !== localSeat && state.active)
            .map(([seat]) => Number(seat));
        if (targets.length === 0) throw new Error('[ZJH] compare target is unavailable');
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
