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
    showPhase(phase: CD299Phase, round: number, roundLimit: number): void;
    showSeat(visualSeat: number, authoritativeSeat: number, playerId: number | null,
        canSit: boolean, seatLimit: number): void;
    showReady(seat: number, ready: boolean): void;
    showOpeningCommit(seat: number, base: number, mango: number, round: number): void;
    showHand(seat: number, cards: readonly number[], revealed: boolean, earthNineKing: boolean,
        dealOrder: number, dealCycleSize: number): void;
    showBanker(seat: number, banker: boolean): void;
    showCommitted(seat: number, value: number): void;
    showScore(seat: number, value: number): void;
    showRoundDelta(seat: number, value: number): void;
    showBetAction(seat: number, action: CD299BetAction | null): void;
    showDropped(seat: number, dropped: boolean): void;
    showThreeFlower(seat: number, enabled: boolean): void;
    showSplit(seat: number, enabled: boolean, cards: readonly number[], earthNineKing: boolean): void;
    showSplitDeadline(seat: number, deadlineEpochMillis: number): void;
    showOperationDeadline(seat: number, deadlineEpochMillis: number): void;
    showSeatRetention(seat: number, deadlineEpochMillis: number, local: boolean): void;
    showTotals(mangoTotal: number, betTotal: number): void;
    showFinalSettlement(snapshot: CD299Snapshot): void;
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
        this.view.showPhase(snapshot.phase, snapshot.round,
            Number((snapshot.rules as { roundLimit?: number }).roundLimit ?? 10));
        // During a live hand the current mango is still committed by players; after
        // settlement the authority has already moved it into mangoPool.
        const unsettledMango = snapshot.phase === 'ROUND_SETTLEMENT' || snapshot.phase === 'FINISHED'
            ? 0 : Object.values(snapshot.mangos).reduce((sum, value) => sum + value, 0);
        this.view.showTotals(
            snapshot.mangoPool + unsettledMango,
            Object.values(snapshot.bets).reduce((sum, value) => sum + value, 0),
        );
        this.view.showFinalSettlement(snapshot);
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
            // readySeats is the authoritative admission record and remains populated
            // after a round starts. CommonHead's ready badge is only a waiting-room
            // affordance; projecting the retained value during play obscures XQP's
            // operation feedback beside the avatar.
            this.view.showReady(visualSeat, false);
            // XQP walks clockwise from the seat after the banker and advances
            // its 80 ms cadence only for valid, occupied roles. Empty chair
            // indices must not create visible pauses in a sparse room.
            const occupiedDealOrder = Array.from({ length: snapshot.rules.maxPlayers }, (_, offset) =>
                (Math.max(-1, snapshot.bankerSeat) + 1 + offset) % snapshot.rules.maxPlayers)
                .filter(candidate => snapshot.players[candidate] !== undefined);
            const dealOrder = Math.max(0, occupiedDealOrder.indexOf(seat));
            this.view.showHand(visualSeat, cards, cards.some(card => card !== 0),
                snapshot.rules.earthNineKing, dealOrder, Math.max(1, occupiedDealOrder.length));
            this.view.showBanker(visualSeat, seat === snapshot.bankerSeat);
            this.view.showOpeningCommit(visualSeat, snapshot.bases[seat] ?? 0,
                snapshot.mangos[seat] ?? 0, snapshot.round);
            this.view.showCommitted(visualSeat, snapshot.committed[seat] ?? 0);
            this.view.showScore(visualSeat, snapshot.scores[seat] ?? 0);
            this.view.showRoundDelta(visualSeat, this.deltaForPlayer(snapshot, playerId));
            this.view.showBetAction(visualSeat, snapshot.lastBetActions[seat] ?? null);
            this.view.showDropped(visualSeat, snapshot.droppedSeats.includes(seat));
            this.view.showThreeFlower(visualSeat, snapshot.threeFlowerSeats.includes(seat));
            this.view.showSplit(visualSeat, snapshot.splitSeats.includes(seat), cards,
                snapshot.rules.earthNineKing);
            this.view.showSplitDeadline(visualSeat, snapshot.splitDeadlineEpochMillis[seat] ?? 0);
            this.view.showOperationDeadline(visualSeat,
                snapshot.operationDeadline.seatId === seat ? snapshot.operationDeadline.deadlineEpochMillis : 0);
            this.view.showSeatRetention(visualSeat,
                snapshot.seatRetentionDeadlineEpochMillis[seat] ?? 0, seat === localSeat);
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
            // The authority accepts a next-round request from any authenticated
            // seated player. Keeping this owner-only would deadlock a room whose
            // creator remains a spectator.
            canContinue: false,
            betActions: Object.freeze([...snapshot.allowedBetActions]),
            followAmount: snapshot.followAmount,
            quickRaiseTargets: Object.freeze([...snapshot.quickRaiseTargets]),
            availableScore: snapshot.viewerAvailableScore,
            currentBet: localSeat < 0 ? 0 : snapshot.bets[localSeat] ?? 0,
        }));
    }

    private deltaForPlayer(snapshot: CD299Snapshot, playerId: number | null): number {
        if (snapshot.phase !== 'ROUND_SETTLEMENT' || playerId === null) return 0;
        return snapshot.lastDelta[playerId] ?? 0;
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
    finalCountdownSecond: 2,
});
