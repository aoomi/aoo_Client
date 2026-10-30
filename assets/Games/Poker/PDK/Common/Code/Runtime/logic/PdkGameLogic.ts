// Common PDK hand/selection state only.
// Card recognition, decomposition, hint generation and ordering live in
// PdkCleanHintRanker. This class deliberately contains no play-rule logic.

export interface PdkRoomPolicy {
    GetRoomConfig?(): { ruleOptions?: Record<string, unknown> };
}

export interface PdkRoomSetSource {
    GetHandCard(): number[];
}

export interface PdkGameLogicOptions {
    room?: PdkRoomPolicy;
    roomSet?: PdkRoomSetSource;
    onEvent?: (event: string) => void;
}

const cardRankForDisplay = (raw: number): number => {
    const value = Number(raw) > 500 ? Number(raw) - 500 : Number(raw);
    return value >= 100 ? value % 100 : value & 0x0f;
};

const cardSuitForDisplay = (raw: number): number => {
    const value = Number(raw) > 500 ? Number(raw) - 500 : Number(raw);
    return value >= 100 ? Math.floor(value / 100) : ((value & 0xf0) >> 4);
};

/** UI hand order only; this is not a play or prompt comparator. */
const compareCardForDisplay = (left: number, right: number): number =>
    cardRankForDisplay(left) - cardRankForDisplay(right)
    || cardSuitForDisplay(left) - cardSuitForDisplay(right)
    || Number(left) - Number(right);

export class PdkGameLogic {
    public handCardList: number[] = [];
    public selectCardList: number[] = [];
    public lastCardType = 0;
    public lastCardList: number[] = [];

    public readonly Room: PdkRoomPolicy;
    public readonly RoomSet: PdkRoomSetSource;
    private readonly onEvent: (event: string) => void;

    public constructor(options: PdkGameLogicOptions = {}) {
        this.Room = options.room ?? {};
        this.RoomSet = options.roomSet ?? { GetHandCard: () => [] };
        this.onEvent = options.onEvent ?? (() => undefined);
    }

    public InitHandCard(): void {
        this.handCardList = [];
        this.selectCardList = [];
        this.lastCardType = 0;
        this.lastCardList = [];
        const hand = this.RoomSet.GetHandCard();
        if (!Array.isArray(hand)) throw new Error('PDK 权威手牌必须是数组');
        this.handCardList = hand.map(Number);
        this.SortCardByMax(this.handCardList);
    }

    /** Keep the legacy UI refresh operation as state synchronization only. */
    public OutPokerCard(privateCard: number[]): void {
        if (!Array.isArray(privateCard)) throw new Error('PDK 手牌必须是数组');
        this.selectCardList = [];
        this.handCardList = privateCard.map(Number);
        this.SortCardByMax(this.handCardList);
        this.onEvent('HandCard');
    }

    public SortCardByMax(cards: number[]): void {
        cards.sort((left, right) => compareCardForDisplay(right, left));
    }

    public GetHandCard(): number[] {
        return this.handCardList;
    }

    public GetSelectCard(): number[] {
        return this.selectCardList;
    }

    public ChangeSelectCard(cards: number[]): void {
        this.selectCardList = Array.isArray(cards) ? [...cards].map(Number) : [];
    }

    public SetCardSelected(cardIndex: number): void {
        const card = this.handCardList[Number(cardIndex) - 1];
        if (card === undefined) return;
        this.selectCardList.push(card);
    }

    public DeleteCardSelected(cardIndex: number): void {
        const card = this.handCardList[Number(cardIndex) - 1];
        const index = this.selectCardList.indexOf(card);
        if (index >= 0) this.selectCardList.splice(index, 1);
    }

    public CheckSelected(card: number): boolean {
        return this.selectCardList.includes(card);
    }

    public SetCardData(opCardType: number, cards: number[]): void {
        if (Number(opCardType) === 1) return;
        if (!Array.isArray(cards)) throw new Error('PDK 出牌协议缺少牌列表');
        if (cards.length === 0) return;
        this.lastCardType = Number(opCardType);
        this.lastCardList = cards.map(Number);
    }

    public ClearCardData(): void {
        this.lastCardType = 0;
        this.lastCardList = [];
    }

    public GetLastCardType(): number {
        return this.lastCardType;
    }
}
