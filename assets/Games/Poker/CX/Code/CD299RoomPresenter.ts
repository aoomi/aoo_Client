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

export interface CD299SettlementChip {
    visualSeat: number;
    authoritativeSeat: number;
    playerId: number;
    wager: number;
    delta: number;
    finalScore: number;
    terminalAction: CD299BetAction | null;
}

export interface CD299RoomView {
    showPhase(phase: CD299Phase, round: number, roundLimit: number, roomEndText?: string): void;
    showSeat(visualSeat: number, authoritativeSeat: number, playerId: number | null,
        canSit: boolean, seatLimit: number, viewerOwnsSeat: boolean): void;
    showReady(seat: number, ready: boolean): void;
    showOpeningCommit(seat: number, base: number, mango: number, round: number): void;
    showHand(seat: number, cards: readonly number[], revealed: boolean, earthNineKing: boolean,
        dealOrder: number, dealCycleSize: number): void;
    showBanker(seat: number, banker: boolean): void;
    showCommitted(seat: number, value: number): void;
    showScore(seat: number, value: number): void;
    showRoundDelta(seat: number, value: number): void;
    showSettlementChips(stateVersion: number, entries: readonly CD299SettlementChip[]): void;
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
    private readonly projectedAvailableScores = new Map<number, number>();
    private readonly projectedWagers = new Map<number, number>();

    public constructor(private readonly view: CD299RoomView) {}

    public applySnapshot(incoming: CD299Snapshot): boolean {
        const previous = this.snapshot;
        const next = acceptCD299Snapshot(previous, incoming);
        if (next === this.snapshot) return false;
        this.snapshot = next;
        this.render(next, previous);
        return true;
    }

    private render(snapshot: CD299Snapshot, previous: CD299Snapshot | null): void {
        const animateSettlement = snapshot.phase === 'ROUND_SETTLEMENT'
            && previous !== null && previous.phase !== 'ROUND_SETTLEMENT' && previous.phase !== 'FINISHED';
        const settlementChips: CD299SettlementChip[] = [];
        const roundLimit = snapshot.rules.roundCount ?? 0;
        const roomEndText = snapshot.rules.roundCount !== undefined
            ? `局数：${snapshot.round}/${snapshot.rules.roundCount}`
            : `时长：${snapshot.rules.roomDurationMinutes}分钟  局数：${snapshot.round}`;
        this.view.showPhase(snapshot.phase, snapshot.round, roundLimit, roomEndText);
        // During a live hand the current mango is still committed by players; after
        // settlement the authority has already moved it into mangoPool.
        const unsettledMango = snapshot.phase === 'ROUND_SETTLEMENT' || snapshot.phase === 'FINISHED'
            ? 0 : Object.values(snapshot.mangos).reduce((sum, value) => sum + value, 0);
        this.view.showTotals(
            snapshot.mangoPool + unsettledMango,
            Object.values(snapshot.bases).reduce((sum, value) => sum + value, 0)
                + Object.values(snapshot.bets).reduce((sum, value) => sum + value, 0),
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
                snapshot.rules.maxPlayers, seat === localSeat);
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
            // XQP's seat BetArea is the visible base plus betting chips. Mango
            // commits travel to the separate central mango pool and must never
            // be folded into the seat's bet label.
            const wager = (snapshot.bases[seat] ?? 0) + (snapshot.bets[seat] ?? 0);
            this.view.showCommitted(visualSeat, wager);
            // `scores` is the authority-owned settled bankroll. During a live
            // hand, `committed` is reserved from it and therefore unavailable;
            // once settlement is authoritative, scores already contains the
            // result and must not be reduced a second time.
            const settled = snapshot.phase === 'ROUND_SETTLEMENT' || snapshot.phase === 'FINISHED';
            const availableScore = settled ? (snapshot.scores[seat] ?? 0)
                : Math.max(0, (snapshot.scores[seat] ?? 0) - (snapshot.committed[seat] ?? 0));
            const previousAvailableScore = this.projectedAvailableScores.get(seat) ?? availableScore;
            this.view.showScore(visualSeat, animateSettlement ? previousAvailableScore : availableScore);
            if (this.projectedWagers.get(seat) !== wager
                || this.projectedAvailableScores.get(seat) !== availableScore) {
                this.projectedWagers.set(seat, wager);
                this.projectedAvailableScores.set(seat, availableScore);
                console.info('[CD299] authoritative wager projection', JSON.stringify({
                    roomId: snapshot.roomId, playerId, stateVersion: snapshot.stateVersion,
                    seat, visualSeat, phase: snapshot.phase, wager,
                    committed: snapshot.committed[seat] ?? 0,
                    settledScore: snapshot.scores[seat] ?? 0, availableScore,
                }));
            }
            const roundDelta = this.deltaForPlayer(snapshot, playerId);
            this.view.showRoundDelta(visualSeat, animateSettlement ? 0 : Math.max(0, roundDelta));
            if (animateSettlement && playerId !== null) {
                settlementChips.push(Object.freeze({
                    visualSeat, authoritativeSeat: seat, playerId, wager, delta: roundDelta,
                    finalScore: availableScore,
                    terminalAction: snapshot.allInSeats.includes(seat) ? 'ALL_IN'
                        : snapshot.lastBetActions[seat] ?? null,
                }));
            }
            // XQP clears transient operation labels between betting passes, but
            // keeps the two terminal decisions visible for the rest of the hand.
            // Derive those persistent labels from authority-owned seat state so
            // reconnects and phase transitions render identically.
            const displayedAction = snapshot.lastBetActions[seat]
                ?? (snapshot.droppedSeats.includes(seat) ? 'DROP'
                    : snapshot.allInSeats.includes(seat) ? 'ALL_IN' : null);
            this.view.showBetAction(visualSeat, displayedAction);
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

        if (animateSettlement) this.view.showSettlementChips(snapshot.stateVersion, settlementChips);

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
