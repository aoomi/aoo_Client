import { CD299BetAction } from './CD299Protocol';
import { acceptCD299Snapshot, CD299Phase, CD299Snapshot } from './CD299RoomState';

export interface CD299Actions {
    canPreset: boolean;
    canBet: boolean;
    canAddCard: boolean;
    canSplit: boolean;
    canContinue: boolean;
    betActions: readonly CD299BetAction[];
}

export interface CD299RoomView {
    showPhase(phase: CD299Phase, round: number): void;
    showSeat(seat: number, playerId: number | null, canSit: boolean, seatLimit: number): void;
    showHand(seat: number, cards: readonly number[], revealed: boolean): void;
    showCommitted(seat: number, value: number): void;
    showScore(seat: number, value: number): void;
    showDropped(seat: number, dropped: boolean): void;
    showThreeFlower(seat: number, enabled: boolean): void;
    showSplit(seat: number, enabled: boolean): void;
    setActions(actions: Readonly<CD299Actions>): void;
}

/** 横竖屏共用状态投影；Prefab 仅实现 View，不复制玩法判断。 */
export class CD299RoomPresenter {
    private snapshot: CD299Snapshot | null = null;

    public constructor(
        private readonly view: CD299RoomView,
        private readonly playerId: number,
    ) {}

    public applySnapshot(incoming: CD299Snapshot): boolean {
        const next = acceptCD299Snapshot(this.snapshot, incoming);
        if (next === this.snapshot) return false;
        this.snapshot = next;
        this.render(next);
        return true;
    }

    private render(snapshot: CD299Snapshot): void {
        this.view.showPhase(snapshot.phase, snapshot.round);
        const localSeat = Number(Object.entries(snapshot.players)
            .find(([, id]) => id === this.playerId)?.[0] ?? -1);

        for (let seat = 0; seat < snapshot.rules.maxPlayers; seat += 1) {
            const playerId = snapshot.players[seat] ?? null;
            this.view.showSeat(seat, playerId,
                snapshot.viewerRole === 'SPECTATOR' && playerId === null && snapshot.phase === 'WAITING',
                snapshot.rules.maxPlayers);
        }

        for (const key of Object.keys(snapshot.players)) {
            const seat = Number(key);
            const cards = snapshot.hands[seat] ?? [];
            this.view.showHand(seat, cards, cards.some(card => card !== 0));
            this.view.showCommitted(seat, snapshot.committed[seat] ?? 0);
            this.view.showScore(seat, snapshot.scores[seat] ?? 0);
            this.view.showDropped(seat, snapshot.droppedSeats.includes(seat));
            this.view.showThreeFlower(seat, snapshot.threeFlowerSeats.includes(seat));
            this.view.showSplit(seat, snapshot.splitSeats.includes(seat));
        }

        const localTurn = snapshot.currentSeat === localSeat;
        this.view.setActions(Object.freeze({
            canPreset: snapshot.viewerRole === 'SEATED' && snapshot.phase === 'BASE_AND_MANGO' && localTurn,
            canBet: snapshot.viewerRole === 'SEATED' && snapshot.phase === 'BETTING' && localTurn,
            canAddCard: snapshot.viewerRole === 'SEATED' && snapshot.phase === 'ADD_CARD' && localTurn,
            canSplit: snapshot.viewerRole === 'SEATED' && snapshot.phase === 'SPLITTING'
                && !snapshot.splitSeats.includes(localSeat)
                && !snapshot.threeFlowerSeats.includes(localSeat),
            canContinue: snapshot.viewerRole === 'SEATED' && snapshot.phase === 'ROUND_SETTLEMENT',
            betActions: Object.freeze(['DROP', 'FOLLOW', 'REST', 'RAISE', 'ALL_IN'] as CD299BetAction[]),
        }));
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
    nextRound: 2500,
    finalCountdownSecond: 2,
});
