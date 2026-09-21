import { CD299BetAction } from './CD299Protocol';
import { acceptCD299Snapshot, CD299Phase, CD299Snapshot } from './CD299RoomState';

export interface CD299Actions {
    canPreset: boolean;
    canBet: boolean;
    canAddCard: boolean;
    canSplit: boolean;
    canContinue: boolean;
    betActions: readonly CD299BetAction[];
    followAmount: number;
    quickRaiseTargets: readonly number[];
    availableScore: number;
    currentBet: number;
}

export interface CD299RoomView {
    showPhase(phase: CD299Phase, round: number): void;
    showSeat(visualSeat: number, authoritativeSeat: number, playerId: number | null,
        canSit: boolean, seatLimit: number): void;
    showReady(seat: number, ready: boolean): void;
    showHand(seat: number, cards: readonly number[], revealed: boolean): void;
    showCommitted(seat: number, value: number): void;
    showScore(seat: number, value: number): void;
    showDropped(seat: number, dropped: boolean): void;
    showThreeFlower(seat: number, enabled: boolean): void;
    showSplit(seat: number, enabled: boolean): void;
    showSplitDeadline(seat: number, deadlineEpochMillis: number): void;
    setActions(actions: Readonly<CD299Actions>): void;
}

/** 横竖屏共用状态投影；Prefab 仅实现 View，不复制玩法判断。 */
export class CD299RoomPresenter {
    private snapshot: CD299Snapshot | null = null;
    private projectedLocalSeat: number | null = null;

    public constructor(private readonly view: CD299RoomView) {}

    public applySnapshot(incoming: CD299Snapshot): boolean {
        const next = acceptCD299Snapshot(this.snapshot, incoming);
        if (next === this.snapshot) return false;
        this.snapshot = next;
        this.render(next);
        return true;
    }

    private render(snapshot: CD299Snapshot): void {
        this.view.showPhase(snapshot.phase, snapshot.round);
        const localSeat = snapshot.viewerRole === 'SEATED' ? snapshot.viewerSeat : -1;
        if (this.projectedLocalSeat !== localSeat) {
            this.projectedLocalSeat = localSeat;
            console.info('[CD299] seat projection changed', {
                roomId: snapshot.roomId, viewerSeat: snapshot.viewerSeat, localSeat,
                mapping: Array.from({ length: snapshot.rules.maxPlayers }, (_, seat) =>
                    this.visualSeat(seat, localSeat, snapshot.rules.maxPlayers)),
            });
        }

        for (let seat = 0; seat < snapshot.rules.maxPlayers; seat += 1) {
            const visualSeat = this.visualSeat(seat, localSeat, snapshot.rules.maxPlayers);
            const playerId = snapshot.players[seat] ?? null;
            this.view.showSeat(visualSeat, seat, playerId,
                snapshot.viewerRole === 'SPECTATOR' && playerId === null
                    && (snapshot.phase === 'WAITING' || snapshot.phase === 'ROUND_SETTLEMENT'),
                snapshot.rules.maxPlayers);
            const cards = snapshot.hands[seat] ?? [];
            this.view.showReady(visualSeat, snapshot.readySeats.includes(seat));
            this.view.showHand(visualSeat, cards, cards.some(card => card !== 0));
            this.view.showCommitted(visualSeat, snapshot.committed[seat] ?? 0);
            this.view.showScore(visualSeat, snapshot.scores[seat] ?? 0);
            this.view.showDropped(visualSeat, snapshot.droppedSeats.includes(seat));
            this.view.showThreeFlower(visualSeat, snapshot.threeFlowerSeats.includes(seat));
            this.view.showSplit(visualSeat, snapshot.splitSeats.includes(seat));
            this.view.showSplitDeadline(visualSeat, snapshot.splitDeadlineEpochMillis[seat] ?? 0);
        }

        // XQP only exposes the live operation panel to the seat named by the
        // current operation notice.  Checking both fields prevents a stale
        // currentSeat (or an uninitialised prefab) from exposing controls on
        // another client while the authoritative deadline belongs elsewhere.
        const localTurn = snapshot.currentSeat === localSeat
            && snapshot.operationDeadline.seatId === localSeat;
        this.view.setActions(Object.freeze({
            canPreset: snapshot.viewerRole === 'SEATED' && snapshot.phase === 'BETTING' && !localTurn
                && !snapshot.droppedSeats.includes(localSeat) && !snapshot.allInSeats.includes(localSeat),
            canBet: snapshot.viewerRole === 'SEATED' && snapshot.phase === 'BETTING' && localTurn
                && snapshot.allowedBetActions.length > 0,
            canAddCard: false,
            canSplit: snapshot.viewerRole === 'SEATED' && snapshot.phase === 'SPLITTING'
                && !snapshot.splitSeats.includes(localSeat)
                && !snapshot.threeFlowerSeats.includes(localSeat),
            canContinue: snapshot.viewerRole === 'SEATED' && snapshot.phase === 'ROUND_SETTLEMENT'
                && snapshot.players[localSeat] === snapshot.ownerId,
            betActions: Object.freeze([...snapshot.allowedBetActions]),
            followAmount: snapshot.followAmount,
            quickRaiseTargets: Object.freeze([...snapshot.quickRaiseTargets]),
            availableScore: snapshot.viewerAvailableScore,
            currentBet: localSeat < 0 ? 0 : snapshot.bets[localSeat] ?? 0,
        }));
    }

    /** XQP GetSeatIndex equivalent: rotate authoritative seats so the local player is visual seat 0. */
    private visualSeat(authoritativeSeat: number, localSeat: number, seatLimit: number): number {
        return localSeat < 0 ? authoritativeSeat : (authoritativeSeat - localSeat + seatLimit) % seatLimit;
    }
}

export const CD299_TIMING_MS = Object.freeze({
    operationFeedback: 150,
    drop: 300,
    flipHalf: 200,
    chipMove: 200,
    revealAfterAllSplit: 500,
    settlementEnter: 200,
    settlementExit: 200,
    nextRound: 1000,
    finalCountdownSecond: 2,
});
