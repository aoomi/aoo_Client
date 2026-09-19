import { _decorator, Button, Component, Label, Node, Vec3 } from 'cc';
import { Poker_Card_Face } from '../../../Common/Code/Card/Poker_Card_Presenter';
import { Poker_Card_Factory } from '../../../Common/Code/Card/Poker_Card_Factory';
import { CD299Actions, CD299RoomView } from './CD299RoomPresenter';
import { CD299Phase } from './CD299RoomState';
import type { CD299RuntimeController } from './CD299RuntimeController';

const { ccclass } = _decorator;
const PHASE_TEXT: Readonly<Record<CD299Phase, string>> = Object.freeze({
    WAITING: '等待玩家坐下', BASE_AND_MANGO: '选择底分和芒数', DEALING: '发牌', BETTING: '下注',
    ADD_CARD: '补牌', SPLITTING: '分牌', REVEAL: '开牌', ROUND_SETTLEMENT: '本局结算', FINISHED: '牌局结束',
});

/** CD299 横屏专用绑定：只驱动 Creator 中固定的 8 席节点，不克隆、不重排座位。 */
@ccclass('CD299LandscapeRoomViewComponent')
export class CD299LandscapeRoomViewComponent extends Component implements CD299RoomView {
    private readonly cardFactory = new Poker_Card_Factory();
    private readonly cardGenerations = new Map<number, number>();
    private readonly commandDisposers: Array<() => void> = [];
    private controller: CD299RuntimeController | null = null;

    public bindController(controller: CD299RuntimeController): () => void {
        this.unbindController();
        this.controller = controller;
        this.bind(this.path('OperateBtn/PresetBet/1'), () => controller.preset(1, 3));
        this.bind(this.path('OperateBtn/PresetBet/2'), () => controller.preset(2, 3));
        this.bind(this.path('OperateBtn/Bet/Drop'), () => controller.bet('DROP', 0));
        this.bind(this.path('OperateBtn/Bet/Follow'), () => controller.bet('FOLLOW', 0));
        this.bind(this.path('OperateBtn/Bet/Add/AllIn'), () => controller.bet('ALL_IN', 3));
        this.bind(this.path('OperateBtn/Bet/Add/Add/Fast/1'), () => controller.bet('RAISE', 1));
        this.bind(this.path('OperateBtn/Bet/Add/Add/Fast/2'), () => controller.bet('RAISE', 2));
        this.bind(this.path('OperateBtn/Bet/Add/Add/Fast/3'), () => controller.bet('RAISE', 3));
        this.bind(this.path('OperateBtn/SplitPoker/Ensure'), () => controller.splitLocalHand());
        this.bind(this.find('FangHuoPai'), () => controller.addCard());
        this.bind(this.find('Continue'), () => controller.continueRound());
        return () => this.unbindController();
    }

    public unbindController(): void {
        for (const dispose of this.commandDisposers.splice(0)) dispose();
        this.controller = null;
    }

    protected override onDestroy(): void { this.unbindController(); }

    public showPhase(phase: CD299Phase, round: number): void {
        const label = this.find('GameState')?.getComponent(Label) ?? this.find('Phase')?.getComponent(Label);
        if (label) label.string = `第${round}局 · ${PHASE_TEXT[phase]}`;
    }

    public showSeat(seat: number, playerId: number | null, canSit: boolean, seatLimit: number): void {
        if (seatLimit !== 8) throw new Error(`[CD299] landscape requires 8 seats, received ${seatLimit}`);
        const seatNode = this.seat(seat);
        const name = this.descendant(seatNode, 'Name')?.getComponent(Label);
        if (name) name.string = playerId === null ? '空位' : `玩家${playerId}`;
        // The migrated desk exposes Head as the visible/clickable seat surface.
        // Binding only the 100x100 seat container makes real Canvas clicks land
        // on its child hierarchy without reliably activating the parent Button.
        const clickTarget = seatNode.getChildByName('Head') ?? seatNode;
        const button = clickTarget.getComponent(Button) ?? clickTarget.addComponent(Button);
        clickTarget.off(Button.EventType.CLICK, undefined, this);
        seatNode.off(Node.EventType.TOUCH_END, undefined, this);
        button.interactable = canSit;
        if (canSit) {
            const sit = (): void => { void this.controller?.sit(seat); };
            // Child sprites are the visible seat surface in the XQP hierarchy;
            // their touch event bubbles here even when Button click synthesis
            // does not target the 100x100 seat container itself.
            seatNode.on(Node.EventType.TOUCH_END, sit, this);
        }
    }

    public showHand(seat: number, cards: readonly number[], revealed: boolean): void {
        const parent = this.seat(seat).getChildByName('HandCard');
        if (!parent) throw new Error(`[CD299] seat=${seat} HandCard missing`);
        const generation = (this.cardGenerations.get(seat) ?? 0) + 1;
        this.cardGenerations.set(seat, generation);
        this.cardFactory.clear(parent);
        void Promise.all(cards.map(async (rawCard, index) => {
            const card = await this.cardFactory.create(parent, revealed ? rawCard : 103,
                revealed ? Poker_Card_Face.Front : Poker_Card_Face.Back);
            if (this.cardGenerations.get(seat) !== generation || !parent.isValid) {
                card.destroy();
                return;
            }
            card.setScale(new Vec3(0.55, 0.55, 1));
            card.setPosition(index * 42, 0, index);
        })).catch(error => console.error('[CD299] landscape card render failed', {
            seat, reason: error instanceof Error ? error.message : String(error),
        }));
    }

    public showCommitted(seat: number, value: number): void {
        const area = this.seat(seat).getChildByName('BetArea');
        if (area) area.active = value > 0;
        const label = area?.getChildByName('Num')?.getComponent(Label);
        if (label) label.string = String(value);
    }

    public showScore(seat: number, value: number): void {
        const settlement = this.seat(seat).getChildByName('SmallSettlementCent');
        const label = settlement?.getChildByName('WinNum')?.getComponent(Label);
        if (label) label.string = value > 0 ? `+${value}` : String(value);
        if (settlement) settlement.active = value !== 0;
    }

    public showDropped(seat: number, dropped: boolean): void {
        const node = this.seat(seat).getChildByName('DropCard') ?? this.descendant(this.seat(seat), 'Drop');
        if (node) node.active = dropped;
    }

    public showThreeFlower(seat: number, enabled: boolean): void {
        const node = this.seat(seat).getChildByPath('DividePoker/SanHua');
        if (node) node.active = enabled;
    }

    public showSplit(seat: number, enabled: boolean): void {
        const node = this.seat(seat).getChildByName('DividePoker');
        if (node) node.active = enabled;
    }

    public setActions(actions: Readonly<CD299Actions>): void {
        this.visible('OperateBtn/PresetBet', actions.canPreset);
        this.visible('OperateBtn/Bet', actions.canBet);
        this.visible('OperateBtn/Bet/Drop', actions.canBet && actions.betActions.includes('DROP'));
        this.visible('OperateBtn/Bet/Follow', actions.canBet
            && (actions.betActions.includes('FOLLOW') || actions.betActions.includes('REST')));
        this.visible('OperateBtn/Bet/Add', actions.canBet
            && (actions.betActions.includes('RAISE') || actions.betActions.includes('ALL_IN')));
        this.visible('OperateBtn/Bet/Add/AllIn', actions.canBet && actions.betActions.includes('ALL_IN'));
        this.visible('OperateBtn/SplitPoker', actions.canSplit);
        const addCard = this.find('FangHuoPai');
        if (addCard) addCard.active = actions.canAddCard;
        const continueNode = this.find('Continue');
        if (continueNode) continueNode.active = actions.canContinue;
    }

    private seat(index: number): Node {
        const node = this.path(`Players/${index}`);
        if (!node) throw new Error(`[CD299] fixed landscape seat=${index} missing`);
        return node;
    }

    private bind(node: Node | null, action: () => Promise<unknown>): void {
        if (!node) return;
        const button = node.getComponent(Button) ?? node.addComponent(Button);
        const listener = (): void => { if (button.interactable) void action(); };
        node.on(Button.EventType.CLICK, listener, this);
        this.commandDisposers.push(() => node.off(Button.EventType.CLICK, listener, this));
    }

    private visible(path: string, active: boolean): void {
        const node = this.path(path);
        if (!node) return;
        node.active = active;
        const button = node.getComponent(Button);
        if (button) button.interactable = active;
    }

    private path(path: string): Node | null { return this.node.getChildByPath(path); }

    private find(name: string): Node | null { return this.descendant(this.node, name); }

    private descendant(parent: Node, name: string): Node | null {
        if (parent.name === name) return parent;
        for (const child of parent.children) {
            const found = this.descendant(child, name);
            if (found) return found;
        }
        return null;
    }
}
