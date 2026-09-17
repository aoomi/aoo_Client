import { acceptCN298Snapshot, CN298Phase, CN298Snapshot } from './CN298RoomState';

export interface CN298RoomView {
    showSeat(seat: number, playerId: number | null, visible: boolean, canSit: boolean): void;
    showPhase(phase: CN298Phase, round: number, roundLimit: number): void;
    showBanker(seat: number): void;
    showPlayerHand(seat: number, cards: readonly number[], revealed: boolean): void;
    showRobResult(seat: number, multiplier: number): void;
    showBet(seat: number, multiplier: number): void;
    showSplitState(seat: number, completed: boolean): void;
    showTotalScore(seat: number, score: number): void;
    setActions(actions: Readonly<CN298ActionAvailability>): void;
}

export interface CN298ActionAvailability {
    canRob: boolean;
    canBet: boolean;
    canSplit: boolean;
    canContinue: boolean;
}

/**
 * 横竖屏共用的纯状态 Presenter。布局节点和素材由各自 Prefab 提供，玩法阶段与按钮可用性只维护一份。
 */
export class CN298RoomPresenter {
    private snapshot: CN298Snapshot | null = null;

    constructor(private readonly view: CN298RoomView, private readonly localPlayerId: number) {}

    applySnapshot(incoming: CN298Snapshot): boolean {
        const accepted = acceptCN298Snapshot(this.snapshot, incoming);
        if (accepted === this.snapshot) return false;
        this.snapshot = accepted;
        this.render(accepted);
        return true;
    }

    private render(snapshot: CN298Snapshot): void {
        this.view.showPhase(snapshot.phase, snapshot.round, snapshot.roundLimit);
        this.view.showBanker(snapshot.bankerSeat);
        const localSeat = Number(Object.entries(snapshot.players)
            .find(([, playerId]) => playerId === this.localPlayerId)?.[0] ?? -1);
        for (let seat = 0; seat < 10; seat++) {
            const playerId = snapshot.players[seat] ?? null;
            this.view.showSeat(seat, playerId, seat < snapshot.maxPlayers, seat < snapshot.maxPlayers && playerId === null
                && snapshot.viewerStatus === 'SPECTATOR' && snapshot.phase === 'WAITING');
        }
        for (const [seatText, cards] of Object.entries(snapshot.hands)) {
            const seat = Number(seatText);
            this.view.showPlayerHand(seat, cards, cards.some(card => card !== 0));
        }
        for (const [seat, multiplier] of Object.entries(snapshot.robs)) {
            this.view.showRobResult(Number(seat), multiplier);
        }
        for (const [seat, multiplier] of Object.entries(snapshot.bets)) {
            this.view.showBet(Number(seat), multiplier);
        }
        for (const seat of Object.keys(snapshot.players).map(Number)) {
            this.view.showSplitState(seat, snapshot.splitSeats.includes(seat));
            this.view.showTotalScore(seat, snapshot.totalScores[seat] ?? 0);
        }
        this.view.setActions(Object.freeze({
            canRob: snapshot.viewerStatus === 'SEATED' && snapshot.phase === 'ROBBING'
                && snapshot.robs[localSeat] === undefined,
            canBet: snapshot.viewerStatus === 'SEATED' && snapshot.phase === 'BETTING' && localSeat !== snapshot.bankerSeat
                && snapshot.bets[localSeat] === undefined,
            canSplit: snapshot.viewerStatus === 'SEATED' && snapshot.phase === 'SPLITTING'
                && !snapshot.splitSeats.includes(localSeat),
            canContinue: snapshot.viewerStatus === 'SEATED' && snapshot.phase === 'SETTLEMENT',
        }));
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
