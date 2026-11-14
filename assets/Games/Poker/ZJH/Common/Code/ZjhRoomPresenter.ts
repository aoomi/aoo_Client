import { acceptZjhSnapshot, ZjhSeatState, ZjhSnapshot } from './ZjhRoomState';
import type { ZjhSettlementResult } from './ZjhProtocol';

export interface ZjhActions { canStart: boolean; canLook: boolean; canBet: boolean;
    canPreBet: boolean; canFold: boolean; canCompare: boolean; canContinue: boolean; }
export interface ZjhRoomView {
    configureLayout(seatLimit: 8 | 10, localSeat: number): void;
    showRound(round: number): void; showPot(value: number): void; showOperator(seat: number, deadline: number): void;
    showSeat(seat: number, state: Readonly<ZjhSeatState>, phase: ZjhSnapshot['state']): void;
    showEmptySeat(seat: number, canSit: boolean): void;
    hideSeat(seat: number): void; showWinner(seat: number): void;
    showSettlement(roundNo: number, settlement: Readonly<ZjhSettlementResult>): void;
    setActions(actions: Readonly<ZjhActions>): void; clearTransientEffects(): void;
}

/** 横竖屏共享权威状态 Presenter；Prefab 只实现布局与动效，不拥有玩法状态。 */
export class ZjhRoomPresenter {
    private snapshot: ZjhSnapshot | null = null;
    constructor(private readonly view: ZjhRoomView, private readonly localPlayerId: number) {}
    applySnapshot(incoming: ZjhSnapshot): boolean {
        const accepted = acceptZjhSnapshot(this.snapshot, incoming);
        if (accepted === this.snapshot) return false;
        if (this.snapshot && this.snapshot.state !== accepted.state) this.view.clearTransientEffects();
        this.snapshot = accepted; this.render(accepted); return true;
    }
    dispose(): void { this.snapshot = null; this.view.clearTransientEffects(); }
    applySettlement(roundNo: number, settlement: Readonly<ZjhSettlementResult>): void {
        if (!this.snapshot || this.snapshot.roundNo !== roundNo
            || (this.snapshot.state !== 'ROUND_FINISHED' && this.snapshot.state !== 'FINISHED')) return;
        this.view.showSettlement(roundNo, settlement);
    }
    private render(snapshot: ZjhSnapshot): void {
        const localSeat = Number(Object.entries(snapshot.seats).find(([, seat]) => seat.playerId === this.localPlayerId)?.[0] ?? -1);
        this.view.configureLayout(snapshot.seatLimit, localSeat);
        const ownTurn = snapshot.state === 'PLAYING' && snapshot.operatorSeat === localSeat;
        const local = snapshot.seats[localSeat];
        const activeOpponentCount = Object.entries(snapshot.seats)
            .filter(([seat, state]) => Number(seat) !== localSeat && state.active).length;
        this.view.showRound(snapshot.roundNo); this.view.showPot(snapshot.pot);
        this.view.showOperator(snapshot.operatorSeat, snapshot.operationDeadlineEpochMillis);
        for (let seat = 0; seat < 10; seat++) {
            const state = snapshot.seats[seat];
            if (state) this.view.showSeat(seat, state, snapshot.state);
            else if (seat < snapshot.seatLimit) this.view.showEmptySeat(seat,
                snapshot.state === 'WAITING' && snapshot.viewerRole === 'SPECTATOR');
            else this.view.hideSeat(seat);
        }
        if (snapshot.winnerSeat >= 0) this.view.showWinner(snapshot.winnerSeat);
        this.view.setActions(Object.freeze({
            canStart: snapshot.state === 'WAITING' && snapshot.viewerRole === 'SEATED'
                && this.localPlayerId === snapshot.ownerPlayerId
                && Object.keys(snapshot.seats).length >= snapshot.minimumPlayers,
            canLook: ownTurn && !!local?.active && !local.looked
                && snapshot.bettingRound > snapshot.mustBlindRounds,
            canBet: ownTurn && !!local?.active,
            canPreBet: snapshot.state === 'PLAYING' && !!local?.active && !ownTurn,
            canFold: ownTurn && !!local?.active,
            canCompare: ownTurn && !!local?.active && activeOpponentCount > 0
                && snapshot.bettingRound >= snapshot.compareStartRound,
            canContinue: snapshot.state === 'ROUND_FINISHED' && snapshot.viewerRole === 'SEATED'
                && this.localPlayerId === snapshot.ownerPlayerId,
        }));
    }
}

export const ZJH_ANIMATION_TIMING_MS = Object.freeze({
    dealNotice: 1000, compareReveal: 3000, showToSettlement: 500,
    settlementToNextRound: 2000, chipRecycle: 500, payoutDelay: 200, payoutTween: 800,
});
