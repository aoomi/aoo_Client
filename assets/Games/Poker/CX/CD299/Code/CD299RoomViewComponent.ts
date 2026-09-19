import { _decorator, Button, Component, instantiate, Label, Node, UITransform, Vec3 } from 'cc';
import { CD299Actions, CD299RoomView } from './CD299RoomPresenter';
import { CD299Phase } from './CD299RoomState';
import type { CD299RuntimeController } from './CD299RuntimeController';

const { ccclass, property } = _decorator;

const PHASE_TEXT: Readonly<Record<CD299Phase, string>> = Object.freeze({
    WAITING: '等待玩家坐下',
    BASE_AND_MANGO: '选择底分和芒数',
    DEALING: '发牌',
    BETTING: '下注',
    ADD_CARD: '补牌',
    SPLITTING: '分牌',
    REVEAL: '开牌',
    ROUND_SETTLEMENT: '本局结算',
    FINISHED: '牌局结束',
});

/**
 * CD299 的纯显示绑定。横竖屏 Prefab 复用本组件，仅节点坐标不同；
 * 玩法判断和协议请求分别留在 Presenter、ProtocolAdapter 中。
 */
@ccclass('CD299RoomViewComponent')
export class CD299RoomViewComponent extends Component implements CD299RoomView {
    @property(Label) private phaseLabel: Label | null = null;
    @property([Label]) private handLabels: Label[] = [];
    @property([Label]) private committedLabels: Label[] = [];
    @property([Label]) private scoreLabels: Label[] = [];
    @property([Node]) private droppedMarks: Node[] = [];
    @property([Node]) private threeFlowerMarks: Node[] = [];
    @property([Node]) private splitMarks: Node[] = [];
    @property(Button) private presetButton: Button | null = null;
    @property([Button]) private betButtons: Button[] = [];
    @property(Button) private addCardButton: Button | null = null;
    @property(Button) private splitButton: Button | null = null;
    @property(Button) private continueButton: Button | null = null;
    private commandDisposers: Array<() => void> = [];
    private controller: CD299RuntimeController | null = null;
    private seatNodes: Node[] = [];

    /** Runtime-only command binding; serialized Prefab remains presentation-owned. */
    public bindController(controller: CD299RuntimeController): () => void {
        this.unbindController();
        this.controller = controller;
        const removedReady = this.node.getChildByPath('Actions/Ready');
        if (removedReady?.isValid) removedReady.active = false;
        const bind = (button: Button | null, action: () => Promise<unknown>): void => {
            if (!button?.node.isValid) return;
            const listener = (): void => { void action(); };
            button.node.on(Button.EventType.CLICK, listener, this);
            this.commandDisposers.push(() => button.node.off(Button.EventType.CLICK, listener, this));
        };
        bind(this.presetButton, () => controller.preset(1, 3));
        const bets = [
            () => controller.bet('DROP', 0), () => controller.bet('FOLLOW', 0),
            () => controller.bet('REST', 0), () => controller.bet('RAISE', 0),
            () => controller.bet('ALL_IN', 3),
        ];
        this.betButtons.forEach((button, index) => bind(button, bets[index]));
        bind(this.addCardButton, () => controller.addCard());
        bind(this.splitButton, () => controller.splitLocalHand());
        bind(this.continueButton, () => controller.continueRound());
        return () => this.unbindController();
    }

    public unbindController(): void {
        for (const dispose of this.commandDisposers.splice(0)) dispose();
        this.controller = null;
    }

    protected override onDestroy(): void { this.unbindController(); }

    public showPhase(phase: CD299Phase, round: number): void {
        if (!this.phaseLabel) return;
        this.phaseLabel.string = `第${round}局 · ${PHASE_TEXT[phase]}`;
    }

    public showSeat(seat: number, playerId: number | null, canSit: boolean, seatLimit: number): void {
        const seatNode = this.ensureSeatNode(seat, seatLimit);
        const name = seatNode.getChildByName('Name')?.getComponent(Label);
        if (name) name.string = playerId === null ? '空位' : `玩家${playerId}`;
        const button = seatNode.getComponent(Button) ?? seatNode.addComponent(Button);
        button.interactable = canSit;
        seatNode.off(Button.EventType.CLICK, undefined, this);
        if (canSit) seatNode.on(Button.EventType.CLICK, () => { void this.controller?.sit(seat); }, this, false);
    }

    public showHand(seat: number, cards: readonly number[], revealed: boolean): void {
        const label = this.handLabels[seat];
        if (!label) return;
        // 未公开的牌只显示牌背数量，避免旁观席位从客户端状态中泄露牌值。
        label.string = revealed ? cards.map(card => String(card)).join('  ') : cards.map(() => '■').join('  ');
    }

    public showCommitted(seat: number, value: number): void {
        const label = this.committedLabels[seat];
        if (label) label.string = value > 0 ? `下注 ${value}` : '';
    }

    public showScore(seat: number, value: number): void {
        const label = this.scoreLabels[seat];
        if (label) label.string = String(value);
    }

    public showDropped(seat: number, dropped: boolean): void {
        this.setMark(this.droppedMarks, seat, dropped);
    }

    public showThreeFlower(seat: number, enabled: boolean): void {
        this.setMark(this.threeFlowerMarks, seat, enabled);
    }

    public showSplit(seat: number, enabled: boolean): void {
        this.setMark(this.splitMarks, seat, enabled);
    }

    public setActions(actions: Readonly<CD299Actions>): void {
        this.setButton(this.presetButton, actions.canPreset);
        this.betButtons.forEach((button, index) => this.setButton(button,
            actions.canBet && actions.betActions.includes((['DROP', 'FOLLOW', 'REST', 'RAISE', 'ALL_IN'] as const)[index])));
        this.setButton(this.addCardButton, actions.canAddCard);
        this.setButton(this.splitButton, actions.canSplit);
        this.setButton(this.continueButton, actions.canContinue);
    }

    private setMark(marks: readonly Node[], seat: number, active: boolean): void {
        const mark = marks[seat];
        if (mark?.isValid) mark.active = active;
    }

    private setButton(button: Button | null, active: boolean): void {
        if (!button?.node.isValid) return;
        button.node.active = active;
        button.interactable = active;
    }

    private ensureSeatNode(seat: number, seatLimit: number): Node {
        const parent = this.node.getChildByName('Players');
        if (!parent) throw new Error('[CD299] Players node missing');
        if (this.seatNodes.length === 0) this.seatNodes = parent.children.slice();
        const template = this.seatNodes[0];
        if (!template) throw new Error('[CD299] seat template missing');
        while (this.seatNodes.length < seatLimit) {
            const clone = instantiate(template);
            parent.addChild(clone);
            this.seatNodes.push(clone);
            const label = (name: string): Label => {
                const value = clone.getChildByName(name)?.getComponent(Label);
                if (!value) throw new Error(`[CD299] cloned seat ${name} label missing`);
                return value;
            };
            const mark = (name: string): Node => {
                const value = clone.getChildByName(name);
                if (!value) throw new Error(`[CD299] cloned seat ${name} mark missing`);
                return value;
            };
            this.handLabels.push(label('Hand'));
            this.committedLabels.push(label('Committed'));
            this.scoreLabels.push(label('Score'));
            this.droppedMarks.push(mark('Dropped'));
            this.threeFlowerMarks.push(mark('ThreeFlower'));
            this.splitMarks.push(mark('Split'));
        }
        const node = this.seatNodes[seat];
        const width = this.node.getComponent(UITransform)?.width ?? 1280;
        const angle = -Math.PI / 2 + (Math.PI * 2 * seat / seatLimit);
        node.setPosition(new Vec3(Math.cos(angle) * (width > 800 ? 520 : 300), Math.sin(angle) * 250, 0));
        return node;
    }
}
