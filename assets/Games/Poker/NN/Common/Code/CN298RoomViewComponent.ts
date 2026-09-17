import { _decorator, Button, Component, Label, Node } from 'cc';
import { CN298ActionAvailability, CN298RoomView } from './CN298RoomPresenter';
import { CN298Phase } from './CN298RoomState';

const { ccclass, property } = _decorator;

const PHASE_TEXT: Readonly<Record<CN298Phase, string>> = Object.freeze({
    WAITING: '等待准备', ROBBING: '抢庄', BETTING: '下注', SPLITTING: '分牌',
    SETTLEMENT: '本局结算', FINISHED: '牌局结束',
});

/** 横竖屏共用显示绑定；Prefab 只保存节点位置和资源引用。 */
@ccclass('CN298RoomViewComponent')
export class CN298RoomViewComponent extends Component implements CN298RoomView {
    @property(Label) private phaseLabel: Label | null = null;
    @property([Label]) private handLabels: Label[] = [];
    @property([Label]) private robLabels: Label[] = [];
    @property([Label]) private betLabels: Label[] = [];
    @property([Label]) private scoreLabels: Label[] = [];
    @property([Node]) private bankerMarks: Node[] = [];
    @property([Node]) private splitMarks: Node[] = [];
    @property([Button]) private robButtons: Button[] = [];
    @property([Button]) private betButtons: Button[] = [];
    @property(Button) private splitButton: Button | null = null;
    @property(Button) private continueButton: Button | null = null;
    private actionDisposers: Array<() => void> = [];
    private readonly sitEnabled = new Set<number>();

    public bindActions(actions: Readonly<{
        sit(seatId: number): Promise<boolean>; rob(multiplier: number): Promise<boolean>;
        bet(multiplier: number): Promise<boolean>; split(): Promise<boolean>;
        continueRound(): Promise<boolean>;
    }>): void {
        this.unbindActions();
        for (let seat = 0; seat < 10; seat++) {
            const seatNode = this.node.getChildByName(`Seat_${seat}`);
            if (!seatNode?.isValid) continue;
            const listener = (): void => {
                if (!this.sitEnabled.has(seat)) return;
                void actions.sit(seat).catch(error => this.logActionFailure(seatNode, error));
            };
            seatNode.on(Node.EventType.TOUCH_END, listener);
            this.actionDisposers.push(() => seatNode.off(Node.EventType.TOUCH_END, listener));
        }
        this.robButtons.forEach((button, index) => this.listen(button, () => actions.rob(index)));
        [1, 2, 3, 5, 10].forEach((multiplier, index) =>
            this.listen(this.betButtons[index] ?? null, () => actions.bet(multiplier)));
        this.listen(this.splitButton, () => actions.split());
        this.listen(this.continueButton, () => actions.continueRound());
    }

    protected onDestroy(): void { this.unbindActions(); }

    public showSeat(seat: number, playerId: number | null, visible: boolean, canSit: boolean): void {
        const seatNode = this.node.getChildByName(`Seat_${seat}`);
        if (!seatNode?.isValid) return;
        seatNode.active = visible;
        const name = seatNode.getChildByName('Lb_Name')?.getComponent(Label) ?? null;
        if (name) name.string = playerId === null ? '空位' : `玩家${playerId}`;
        if (canSit) this.sitEnabled.add(seat); else this.sitEnabled.delete(seat);
    }

    public showPhase(phase: CN298Phase, round: number, roundLimit: number): void {
        if (this.phaseLabel) this.phaseLabel.string = `第${round}/${roundLimit}局 · ${PHASE_TEXT[phase]}`;
    }
    public showBanker(seat: number): void {
        this.bankerMarks.forEach((mark, index) => { if (mark?.isValid) mark.active = index === seat; });
    }
    public showPlayerHand(seat: number, cards: readonly number[], revealed: boolean): void {
        const label = this.handLabels[seat];
        if (label) label.string = revealed ? cards.join('  ') : cards.map(() => '■').join('  ');
    }
    public showRobResult(seat: number, multiplier: number): void {
        const label = this.robLabels[seat];
        if (label) label.string = multiplier > 0 ? `抢庄×${multiplier}` : '不抢';
    }
    public showBet(seat: number, multiplier: number): void {
        const label = this.betLabels[seat];
        if (label) label.string = multiplier > 0 ? `下注×${multiplier}` : '';
    }
    public showSplitState(seat: number, completed: boolean): void {
        const mark = this.splitMarks[seat];
        if (mark?.isValid) mark.active = completed;
    }
    public showTotalScore(seat: number, score: number): void {
        const label = this.scoreLabels[seat];
        if (label) label.string = String(score);
    }
    public setActions(actions: Readonly<CN298ActionAvailability>): void {
        this.robButtons.forEach(button => this.setButton(button, actions.canRob));
        this.betButtons.forEach(button => this.setButton(button, actions.canBet));
        this.setButton(this.splitButton, actions.canSplit);
        this.setButton(this.continueButton, actions.canContinue);
    }
    private setButton(button: Button | null, active: boolean): void {
        if (!button?.node.isValid) return;
        button.node.active = active;
        button.interactable = active;
    }
    private listen(button: Button | null, action: () => Promise<boolean>): void {
        if (!button?.node.isValid) return;
        const listener = (): void => { void action().catch((error: unknown) => this.logActionFailure(button.node, error)); };
        button.node.on(Button.EventType.CLICK, listener);
        this.actionDisposers.push(() => button.node.off(Button.EventType.CLICK, listener));
    }
    private logActionFailure(node: Node, error: unknown): void {
        console.error('[CN298] button action failed', { button: node.name,
            reason: error instanceof Error ? error.message : String(error) });
    }
    private unbindActions(): void {
        for (const dispose of this.actionDisposers.splice(0)) dispose();
    }
}
