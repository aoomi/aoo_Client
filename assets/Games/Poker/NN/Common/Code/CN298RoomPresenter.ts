import { acceptCN298Snapshot, CN298Phase, CN298PlayerStats, CN298Snapshot } from './CN298RoomState';

export interface CN298RoomView {
    showSeat(seat: number, playerId: number | null, visible: boolean, canSit: boolean): void;
    showPhase(phase: CN298Phase, round: number, roundLimit: number): void;
    showBanker(seat: number): void;
    showPlayerHand(seat: number, cards: readonly number[], revealed: boolean,
        selectedCards: ReadonlySet<number>): void;
    showRobResult(seat: number, multiplier: number): void;
    showBet(seat: number, multiplier: number): void;
    showSplitState(seat: number, completed: boolean): void;
    showTotalScore(seat: number, score: number, roundDelta: number,
        stats: CN298PlayerStats | null, final: boolean): void;
    setActions(actions: Readonly<CN298ActionAvailability>): void;
}

export interface CN298ActionAvailability {
    canRob: boolean;
    canBet: boolean;
    canSplit: boolean;
    canContinue: boolean;
    canStart: boolean;
    robOptions: readonly number[];
    betOptions: readonly number[];
}

/**
 * 横竖屏共用的纯状态 Presenter。布局节点和素材由各自 Prefab 提供，玩法阶段与按钮可用性只维护一份。
 */
export class CN298RoomPresenter {
    private snapshot: CN298Snapshot | null = null;
    private readonly selectedSplitCards = new Set<number>();

    constructor(private readonly view: CN298RoomView, private readonly localPlayerId: number) {}

    applySnapshot(incoming: CN298Snapshot): boolean {
        const accepted = acceptCN298Snapshot(this.snapshot, incoming);
        if (accepted === this.snapshot) return false;
        // Any authoritative advance invalidates a local, not-yet-submitted card selection.
        this.selectedSplitCards.clear();
        this.snapshot = accepted;
        this.render(accepted);
        return true;
    }

    public toggleSplitCard(seat: number, cardIndex: number): void {
        const snapshot = this.snapshot;
        if (!snapshot) return;
        const localSeat = this.localSeat(snapshot);
        const hand = snapshot.hands[localSeat];
        if (seat !== localSeat || snapshot.phase !== 'SPLITTING'
            || !snapshot.pendingSeats.includes(localSeat) || !hand || cardIndex < 0 || cardIndex >= hand.length) return;
        const card = hand[cardIndex];
        if (!Number.isInteger(card) || card <= 0) return;
        if (this.selectedSplitCards.delete(card)) {
            this.renderLocalSplitState(snapshot, localSeat, hand);
            return;
        }
        if (this.selectedSplitCards.size === 3) {
            const oldest = this.selectedSplitCards.values().next().value;
            if (oldest !== undefined) this.selectedSplitCards.delete(oldest);
        }
        this.selectedSplitCards.add(card);
        this.renderLocalSplitState(snapshot, localSeat, hand);
    }

    public splitSelection(): readonly number[] {
        return this.selectedSplitCards.size === 3 ? Object.freeze([...this.selectedSplitCards]) : Object.freeze([]);
    }

    private render(snapshot: CN298Snapshot): void {
        this.view.showPhase(snapshot.phase, snapshot.round, snapshot.roundLimit);
        this.view.showBanker(snapshot.bankerSeat);
        const localSeat = this.localSeat(snapshot);
        for (let seat = 0; seat < 10; seat++) {
            const playerId = snapshot.players[seat] ?? null;
            this.view.showSeat(seat, playerId, seat < snapshot.maxPlayers, seat < snapshot.maxPlayers && playerId === null
                && snapshot.viewerStatus === 'SPECTATOR' && snapshot.phase === 'WAITING');
        }
        for (const [seatText, cards] of Object.entries(snapshot.hands)) {
            const seat = Number(seatText);
            this.view.showPlayerHand(seat, cards, cards.some(card => card !== 0),
                seat === localSeat ? this.selectedSplitCards : new Set<number>());
        }
        for (const [seat, multiplier] of Object.entries(snapshot.robs)) {
            this.view.showRobResult(Number(seat), multiplier);
        }
        for (const [seat, multiplier] of Object.entries(snapshot.bets)) {
            this.view.showBet(Number(seat), multiplier);
        }
        for (const seat of Object.keys(snapshot.players).map(Number)) {
            this.view.showSplitState(seat, snapshot.splitSeats.includes(seat));
            const delta = snapshot.roundSettlement.scoreDelta?.[seat] ?? 0;
            this.view.showTotalScore(seat, snapshot.totalScores[seat] ?? 0, delta,
                snapshot.playerStats[seat] ?? null, snapshot.phase === 'FINISHED');
        }
        this.view.setActions(this.actions(snapshot, localSeat));
    }

    private renderLocalSplitState(snapshot: CN298Snapshot, localSeat: number, hand: readonly number[]): void {
        this.view.showPlayerHand(localSeat, hand, true, this.selectedSplitCards);
        this.view.setActions(this.actions(snapshot, localSeat));
    }

    private actions(snapshot: CN298Snapshot, localSeat: number): Readonly<CN298ActionAvailability> {
        const splitPending = snapshot.viewerStatus === 'SEATED' && snapshot.phase === 'SPLITTING'
            && snapshot.pendingSeats.includes(localSeat);
        return Object.freeze({
            canRob: snapshot.viewerStatus === 'SEATED' && snapshot.phase === 'ROBBING'
                && snapshot.pendingSeats.includes(localSeat),
            canBet: snapshot.viewerStatus === 'SEATED' && snapshot.phase === 'BETTING' && localSeat !== snapshot.bankerSeat
                && snapshot.pendingSeats.includes(localSeat),
            canSplit: splitPending && this.selectedSplitCards.size === 3,
            canContinue: snapshot.viewerStatus === 'SEATED' && snapshot.phase === 'SETTLEMENT'
                && snapshot.pendingSeats.includes(localSeat),
            canStart: snapshot.phase === 'WAITING' && snapshot.players[localSeat] === snapshot.ownerPlayerId
                && Object.keys(snapshot.players).length >= snapshot.startPlayers,
            robOptions: snapshot.robOptions,
            betOptions: snapshot.betOptions,
        });
    }

    private localSeat(snapshot: CN298Snapshot): number {
        if (snapshot.viewerStatus === 'SEATED' && Number.isInteger(snapshot.viewerSeat)) {
            return snapshot.viewerSeat;
        }
        return Number(Object.entries(snapshot.players)
            .find(([, playerId]) => playerId === this.localPlayerId)?.[0] ?? -1);
    }
}

/** XQP 真人流程的展示节奏基线；网络状态始终优先，动画不得阻塞权威状态推进。 */
export const CN298_ANIMATION_TIMING_MS = Object.freeze({
    startToDeal: 100,
    dealToRob: 1000,
    chooseBanker: 500,
    bankerToBet: 2000,
    betToAddCard: 500,
    addCardToSplit: 300,
    splitToReveal: 100,
    revealToSettlement: 500,
    settlementToNextRound: 2500,
});
