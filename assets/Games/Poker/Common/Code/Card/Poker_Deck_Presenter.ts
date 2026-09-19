import {
    _decorator, BlockInputEvents, Button, Color, Component, EventMouse, EventTouch,
    Graphics, instantiate, Node, UITransform, Vec3,
} from 'cc';
import { Poker_Card_Presenter, Poker_Card_Suit } from './Poker_Card_Presenter';

const { ccclass } = _decorator;
const PROTOCOL_RANKS = Object.freeze([3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]);
const PROTOCOL_SUITS = Object.freeze([1, 2, 3, 4]);
const CARD_SCALE = 0.567;
const RANK_GROUP_WIDTH = 220;
const RANK_GROUP_HEIGHT = 150;
const RANK_GROUP_GAP = 24;

export interface PokerDeckSelection {
    readonly gameCode: string;
    readonly card: number;
    readonly selected: boolean;
}

export type PokerDealFlow = 'DEAL_ONCE' | 'DEAL_DURING_GAME';
export type PokerDealStage = 'INITIAL' | 'CURRENT_ROUND' | 'NEXT_ROUND';

export interface PokerDeckSelectionContext {
    readonly gameCode: string;
    readonly targetPlayerId: number;
    readonly targetSeat: number;
    readonly dealFlow: PokerDealFlow;
    readonly deckCards: readonly number[];
}

export interface PokerDeckSelectionSubmit extends PokerDeckSelectionContext {
    readonly dealStage: PokerDealStage;
    readonly cards: readonly number[];
}

/**
 * 按权威 deckCards 展示完整玩法牌堆。
 * 每个点数独占一个容器；只创建权威牌堆实际包含的花色牌。
 * 整个点数都不存在时（例如凉山跑得快的 2）隐藏该点数容器。
 */
@ccclass('Poker_Deck_Presenter')
export class Poker_Deck_Presenter extends Component {
    private content: Node | null = null;
    private selectedContent: Node | null = null;
    private cardTemplate: Node | null = null;
    private gameCode = '';
    private context: PokerDeckSelectionContext | null = null;
    private dealStage: PokerDealStage = 'INITIAL';
    private generation = 0;
    private lastControlPointerAt = 0;
    private readonly selectedCards = new Set<number>();

    public present(gameCode: string, deckCards: readonly number[]): void {
        if (!gameCode.trim()) throw new Error('Poker deck gameCode is required');
        const deck = this.validateDeck(deckCards);
        this.gameCode = gameCode.trim().toUpperCase();
        this.selectedCards.clear();
        this.generation += 1;
        this.prepareRoot();
        this.rebuild(deck);
    }

    /** Configure one target player before showing the shared selector. */
    public configure(context: PokerDeckSelectionContext): void {
        if (!Number.isSafeInteger(context.targetPlayerId) || context.targetPlayerId <= 0) {
            throw new Error('Poker card-selection targetPlayerId is invalid');
        }
        if (!Number.isInteger(context.targetSeat) || context.targetSeat < 0) {
            throw new Error('Poker card-selection targetSeat is invalid');
        }
        this.context = Object.freeze({ ...context, deckCards: Object.freeze([...context.deckCards]) });
        this.dealStage = 'INITIAL';
        this.present(context.gameCode, context.deckCards);
        this.ensureModalMask();
        this.bindAuthoredControls();
    }

    public presentFromRules(gameCode: string, ruleOptions: Readonly<Record<string, unknown>>): void {
        const deckCards = ruleOptions.deckCards;
        if (!Array.isArray(deckCards)) throw new Error(`${gameCode} authoritative deckCards are missing`);
        this.present(gameCode, deckCards.map(Number));
    }

    public selected(): readonly number[] {
        return [...this.selectedCards].sort((left, right) => left - right);
    }

    private prepareRoot(): void {
        this.cardTemplate ??= this.createCardTemplate();
        // PokerTest still contains the original single-card visual as its cloning
        // template. Hide only those template layers; authored action controls must
        // survive when the generated deck is rebuilt.
        const templateLayers = new Set(['Card_Front', 'Card_Back', 'Selected_Mask', 'Disabled_Mask']);
        for (const child of [...this.node.children]) {
            if (templateLayers.has(child.name)) child.active = false;
        }
        const cardPresenter = this.node.getComponent(Poker_Card_Presenter);
        if (cardPresenter) cardPresenter.enabled = false;
        const transform = this.node.getComponent(UITransform) ?? this.node.addComponent(UITransform);
        transform.setContentSize(1280, 720);
        if (!this.node.getComponent(BlockInputEvents)) this.node.addComponent(BlockInputEvents);
        let content = this.node.getChildByName('DeckContent');
        if (!content) {
            content = new Node('DeckContent');
            content.layer = this.node.layer;
            content.addComponent(UITransform).setContentSize(1280, 720);
            this.node.addChild(content);
        }
        if (!content.getComponent(BlockInputEvents)) content.addComponent(BlockInputEvents);
        content.active = true;
        this.content = content;
        const selected = this.node.getChildByName('Selected');
        if (!selected) throw new Error('PokerTest is missing the authored Selected container');
        selected.active = true;
        selected.removeAllChildren();
        this.selectedContent = selected;
    }

    /** PokerTest 自己持有全屏遮罩，放在所有牌和操作按钮后面。 */
    private ensureModalMask(): void {
        let mask = this.node.getChildByName('CardSelectionModalMask');
        if (!mask) {
            mask = new Node('CardSelectionModalMask');
            mask.layer = this.node.layer;
            mask.addComponent(UITransform).setContentSize(1280, 720);
            mask.addComponent(BlockInputEvents);
            const graphics = mask.addComponent(Graphics);
            graphics.fillColor = new Color(0, 0, 0, 70);
            graphics.rect(-640, -360, 1280, 720);
            graphics.fill();
            this.node.addChild(mask);
        }
        mask.setPosition(0, 0, 0);
        mask.setSiblingIndex(0);
        this.content?.setSiblingIndex(1);
        this.bindPointerBlocker(mask);
        mask.active = true;
    }

    private rebuild(deck: ReadonlySet<number>): void {
        if (!this.content || !this.cardTemplate) return;
        this.content.removeAllChildren();
        let visibleIndex = 0;
        for (const rank of PROTOCOL_RANKS) {
            const rankCards = PROTOCOL_SUITS.map(suit => suit * 100 + rank);
            if (!rankCards.some(card => deck.has(card))) continue;
            const group = this.createRankGroup(rank, visibleIndex++);
            rankCards.filter(card => deck.has(card))
                .forEach((card, availableIndex) => this.createCard(group, card, availableIndex));
        }
    }

    private createRankGroup(rank: number, visibleIndex: number): Node {
        const group = new Node(`Rank_${rank === 15 ? '2' : rank}`);
        group.layer = this.node.layer;
        group.addComponent(UITransform).setContentSize(RANK_GROUP_WIDTH, RANK_GROUP_HEIGHT);
        const column = visibleIndex % 5;
        const row = Math.floor(visibleIndex / 5);
        group.setPosition(
            -488 + column * (RANK_GROUP_WIDTH + RANK_GROUP_GAP),
            150 - row * (RANK_GROUP_HEIGHT + RANK_GROUP_GAP),
            0,
        );
        this.content!.addChild(group);
        return group;
    }

    private createCard(group: Node, rawCard: number, availableIndex: number): void {
        const card = instantiate(this.cardTemplate!);
        card.name = `Card_${rawCard}`;
        card.active = true;
        // Keep every four-card rank readable while leaving equal spacing between
        // the fixed-size rank containers. CARD_SCALE is 90% of the prior 0.63.
        card.setScale(new Vec3(CARD_SCALE, CARD_SCALE, 1));
        card.setPosition(-57 + availableIndex * 38, 0, availableIndex);
        const presenter = card.getComponent(Poker_Card_Presenter);
        if (!presenter) throw new Error('PokerTest card template is missing Poker_Card_Presenter');
        const protocolSuit = Math.floor(rawCard / 100);
        const protocolRank = rawCard % 100;
        const suits = [Poker_Card_Suit.Diamond, Poker_Card_Suit.Club, Poker_Card_Suit.Heart, Poker_Card_Suit.Spade] as const;
        presenter.present(protocolRank === 15 ? 2 : protocolRank, suits[protocolSuit - 1], undefined, false, false);
        const button = card.getComponent(Button) ?? card.addComponent(Button);
        button.interactable = true;
        let lastActivationAt = 0;
        const activate = (event?: EventMouse | EventTouch): void => {
            if (event) event.propagationStopped = true;
            const now = Date.now();
            if (now - lastActivationAt < 180) return;
            lastActivationAt = now;
            this.toggleCard(card, rawCard, presenter);
        };
        card.on(Button.EventType.CLICK, activate, this);
        card.on(Node.EventType.TOUCH_END, activate, this);
        card.on(Node.EventType.MOUSE_UP, activate, this);
        group.addChild(card);
    }

    /**
     * PokerTest itself owns the fully bound single-card view. CardTest is the old
     * authored whole-deck layout and must never be instantiated as one card.
     * Capture the card view before DeckContent is created, then strip selector
     * controls and the deck controller from the detached template.
     */
    private createCardTemplate(): Node {
        const template = instantiate(this.node);
        template.name = 'PokerCardTemplate';
        template.active = false;
        for (const child of [...template.children]) {
            if (child.name === 'CurrentRound' || child.name === 'NextRound' || child.name === 'SelectCard'
                || child.name === 'Confirm' || child.name === 'Close'
                || child.name === 'Selected'
                || child.name === 'DeckContent') {
                // destroy() is deferred until the end of the frame. Detach first,
                // otherwise cards instantiated immediately below inherit the whole
                // selector UI and its full-screen hit areas.
                child.removeFromParent();
                child.destroy();
            }
        }
        const deckPresenter = template.getComponent(Poker_Deck_Presenter);
        if (deckPresenter) {
            template.removeComponent(deckPresenter);
            deckPresenter.destroy();
        }
        if (!template.getComponent(Poker_Card_Presenter)) {
            template.destroy();
            throw new Error('PokerTest root is missing Poker_Card_Presenter');
        }
        return template;
    }

    private toggleCard(cardNode: Node, rawCard: number, presenter: Poker_Card_Presenter): void {
        if (!cardNode.isValid) return;
        const selected = !this.selectedCards.has(rawCard);
        if (selected) this.selectedCards.add(rawCard);
        else this.selectedCards.delete(rawCard);
        presenter.setSelected(selected);
        this.refreshSelectedContent();
        const detail: PokerDeckSelection = { gameCode: this.gameCode, card: rawCard, selected };
        this.node.emit('poker-card-selected', detail);
    }

    /** Mirrors the current selection into the authored PokerTest/Selected tray. */
    private refreshSelectedContent(): void {
        if (!this.selectedContent || !this.cardTemplate) return;
        this.selectedContent.removeAllChildren();
        this.selected().forEach((rawCard, index) => {
            const card = instantiate(this.cardTemplate!);
            card.name = `Selected_${rawCard}`;
            card.active = true;
            card.setScale(new Vec3(CARD_SCALE, CARD_SCALE, 1));
            card.setPosition((index - (this.selectedCards.size - 1) / 2) * 43.2, 0, index);
            const presenter = card.getComponent(Poker_Card_Presenter);
            if (!presenter) throw new Error('PokerTest selected card is missing Poker_Card_Presenter');
            const protocolSuit = Math.floor(rawCard / 100);
            const protocolRank = rawCard % 100;
            const suits = [Poker_Card_Suit.Diamond, Poker_Card_Suit.Club, Poker_Card_Suit.Heart, Poker_Card_Suit.Spade] as const;
            presenter.present(protocolRank === 15 ? 2 : protocolRank, suits[protocolSuit - 1]);
            this.selectedContent!.addChild(card);
        });
    }

    private bindAuthoredControls(): void {
        const currentRound = this.findDescendant('CurrentRound');
        const nextRound = this.findDescendant('NextRound');
        const stagedDeal = this.context?.dealFlow === 'DEAL_DURING_GAME';
        if (currentRound) currentRound.active = stagedDeal;
        if (nextRound) nextRound.active = stagedDeal;
        if (currentRound) this.bindButton(currentRound, () => {
            this.dealStage = 'CURRENT_ROUND';
            this.submit();
        });
        if (nextRound) this.bindButton(nextRound, () => {
            this.dealStage = 'NEXT_ROUND';
            this.submit();
        });
        const confirm = this.findDescendant('Confirm');
        if (confirm) {
            confirm.active = !stagedDeal;
            this.bindButton(confirm, () => this.submit());
        }
        const close = this.findDescendant('Close');
        if (close) this.bindButton(close, () => this.node.emit('poker-card-selection-close'));
        const submit = this.findDescendant('SelectCard');
        if (submit) this.bindButton(submit, () => this.submit());
    }

    private bindButton(node: Node, handler: () => void): void {
        const button = node.getComponent(Button) ?? node.addComponent(Button);
        node.targetOff(this);
        node.on(Button.EventType.CLICK, () => this.activateControl(handler), this);
        const pointerEnd = (event: EventMouse | EventTouch): void => {
            event.propagationStopped = true;
            this.activateControl(handler);
        };
        node.on(Node.EventType.TOUCH_END, pointerEnd, this);
        node.on(Node.EventType.MOUSE_UP, pointerEnd, this);
        button.interactable = true;
    }

    private activateControl(handler: () => void): void {
        const now = Date.now();
        if (now - this.lastControlPointerAt < 180) return;
        this.lastControlPointerAt = now;
        handler();
    }

    private bindPointerBlocker(node: Node): void {
        node.targetOff(this);
        const stop = (event: EventMouse | EventTouch): void => {
            event.propagationStopped = true;
        };
        node.on(Node.EventType.TOUCH_START, stop, this);
        node.on(Node.EventType.TOUCH_MOVE, stop, this);
        node.on(Node.EventType.TOUCH_END, stop, this);
        node.on(Node.EventType.MOUSE_DOWN, stop, this);
        node.on(Node.EventType.MOUSE_MOVE, stop, this);
        node.on(Node.EventType.MOUSE_UP, stop, this);
    }

    private submit(): void {
        if (!this.context) throw new Error('Poker card-selection context is missing');
        const detail: PokerDeckSelectionSubmit = Object.freeze({
            ...this.context,
            dealStage: this.context.dealFlow === 'DEAL_ONCE' ? 'INITIAL' : this.dealStage,
            cards: Object.freeze([...this.selected()]),
        });
        this.node.emit('poker-card-selection-submit', detail);
    }

    private findDescendant(name: string): Node | null {
        const pending = [...this.node.children];
        while (pending.length > 0) {
            const candidate = pending.shift()!;
            if (candidate.name === name) return candidate;
            pending.push(...candidate.children);
        }
        return null;
    }

    private validateDeck(deckCards: readonly number[]): ReadonlySet<number> {
        if (!Array.isArray(deckCards) || deckCards.length === 0) throw new Error('Poker deckCards are required');
        const deck = new Set<number>();
        for (const card of deckCards) {
            const suit = Math.floor(Number(card) / 100);
            const rank = Number(card) % 100;
            if (!Number.isInteger(card) || suit < 1 || suit > 4 || rank < 3 || rank > 15) {
                throw new Error(`Unsupported poker deck card: ${String(card)}`);
            }
            if (deck.has(card)) throw new Error(`Duplicate poker deck card: ${card}`);
            deck.add(card);
        }
        return deck;
    }
}
