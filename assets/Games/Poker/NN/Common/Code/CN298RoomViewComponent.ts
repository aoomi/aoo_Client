import { _decorator, Button, Component, EventTouch, Label, Node, UITransform, Vec3 } from 'cc';
import { CN298ActionAvailability, CN298RoomView } from './CN298RoomPresenter';
import { CN298Phase, CN298PlayerStats } from './CN298RoomState';

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
    private robOptions: readonly number[] = [];
    private betOptions: readonly number[] = [];
    private continueIsStart = false;
    private readonly handCardCounts = new Map<number, number>();

    protected onLoad(): void {
        this.hydrateLegacyLandscapeBindings();
    }

    public bindActions(actions: Readonly<{
        sit(): Promise<boolean>; rob(multiplier: number): Promise<boolean>;
        bet(multiplier: number): Promise<boolean>; split(): Promise<boolean>;
        toggleSplitCard(seat: number, cardIndex: number): void;
        start(): Promise<boolean>; continueRound(): Promise<boolean>;
        seatContext(): Readonly<{ roomId: number; viewerSeat: number; viewerStatus: string }>;
    }>): void {
        this.unbindActions();
        for (let seat = 0; seat < 10; seat++) {
            const seatNode = this.seatNode(seat);
            if (!seatNode?.isValid) continue;
            // The preserved landscape skin puts the interactive Button on Head.
            // Binding TOUCH_END to its parent loses the event because Button owns
            // the hit target, while the portrait skin continues to use the root.
            const headButton = seatNode.getChildByName('Head')?.getComponent(Button) ?? null;
            const inputNode = headButton?.node ?? seatNode;
            const eventType = headButton ? Button.EventType.CLICK : Node.EventType.TOUCH_END;
            const listener = (): void => {
                const context = actions.seatContext();
                console.info('[CN298SeatInput] activate', { ...context, targetSeat: seat,
                    path: this.nodePath(inputNode), active: inputNode.activeInHierarchy,
                    worldRect: this.worldRect(inputNode) });
                if (!this.sitEnabled.has(seat)) return;
                void actions.sit().catch(error => this.logActionFailure(seatNode, error));
            };
            inputNode.on(eventType, listener);
            this.actionDisposers.push(() => this.removeNodeListener(inputNode, eventType, listener));
            console.info('[CN298SeatInput] bind', { ...actions.seatContext(), targetSeat: seat,
                path: this.nodePath(inputNode), active: inputNode.activeInHierarchy,
                worldRect: this.worldRect(inputNode), eventType });
        }
        this.robButtons.forEach((button, index) => this.listen(button, () => actions.rob(this.requireOption(this.robOptions, index, 'rob'))));
        this.betButtons.forEach((button, index) =>
            this.listen(button, () => actions.bet(this.requireOption(this.betOptions, index, 'bet'))));
        for (let seat = 0; seat < 10; seat++) {
            // The preserved landscape skin renders cards under HandPoker and has
            // no serialized handLabels. Bind that existing node as the input
            // surface so a real Canvas touch can select the local three cards.
            const handNode = this.handLabels[seat]?.node
                ?? this.findPath(this.node, `Players/${seat}/HandPoker`);
            if (!handNode?.isValid) continue;
            const listener = (event: EventTouch): void => {
                const index = this.cardIndexAt(handNode, event, this.handCardCounts.get(seat) ?? 0);
                if (index >= 0) actions.toggleSplitCard(seat, index);
            };
            handNode.on(Node.EventType.TOUCH_END, listener);
            this.actionDisposers.push(() => this.removeNodeListener(handNode, Node.EventType.TOUCH_END, listener));
        }
        this.listen(this.splitButton, () => actions.split());
        this.listen(this.continueButton, () => this.continueIsStart ? actions.start() : actions.continueRound());
    }

    protected onDestroy(): void { this.unbindActions(); }

    public showSeat(seat: number, playerId: number | null, visible: boolean, canSit: boolean): void {
        const seatNode = this.seatNode(seat);
        if (!seatNode?.isValid) return;
        seatNode.active = visible;
        const name = seatNode.getChildByName('Lb_Name')?.getComponent(Label)
            ?? this.findPath(seatNode, 'Head/NickName/Name')?.getComponent(Label) ?? null;
        if (name) name.string = playerId === null ? '空位' : `玩家${playerId}`;
        const landscapePlayer = this.findPath(this.node, `Middle/Players/${seat}`);
        if (landscapePlayer?.isValid) landscapePlayer.active = visible;
        if (canSit) this.sitEnabled.add(seat); else this.sitEnabled.delete(seat);
    }

    public showPhase(phase: CN298Phase, round: number, roundLimit: number): void {
        if (this.phaseLabel) this.phaseLabel.string = `第${round}/${roundLimit}局 · ${PHASE_TEXT[phase]}`;
    }
    public showBanker(seat: number): void {
        this.bankerMarks.forEach((mark, index) => { if (mark?.isValid) mark.active = index === seat; });
    }
    public showPlayerHand(seat: number, cards: readonly number[], revealed: boolean,
        selectedCards: ReadonlySet<number>): void {
        const label = this.handLabels[seat];
        this.handCardCounts.set(seat, cards.length);
        if (label) label.string = revealed ? cards.map(card => selectedCards.has(card)
            ? `▲${this.formatCard(card)}` : this.formatCard(card)).join('  ')
            : cards.map(() => '🂠').join('  ');
        const hand = this.findPath(this.node, `Players/${seat}/HandPoker`);
        if (hand) {
            const cardNodes = hand.children.filter(child => /^\d+$/.test(child.name));
            cardNodes.forEach((cardNode, index) => {
                cardNode.active = index < cards.length;
                cardNode.setScale(index < cards.length && selectedCards.has(cards[index] ?? -1)
                    ? new Vec3(1.08, 1.08, 1) : Vec3.ONE);
            });
        }
    }
    public showRobResult(seat: number, multiplier: number): void {
        const label = this.robLabels[seat];
        if (label) label.string = multiplier > 0 ? `抢庄×${multiplier}` : '不抢';
        const rob = this.findPath(this.node, `Middle/Players/${seat}/RobNode`)
            ?? this.findPath(this.node, `Middle/Players/${seat}/RobZhuang`);
        if (rob) rob.active = true;
    }
    public showBet(seat: number, multiplier: number): void {
        const label = this.betLabels[seat];
        if (label) label.string = multiplier > 0 ? `下注×${multiplier}` : '';
        const bet = this.findPath(this.node, `Middle/Players/${seat}/BetArea`);
        if (bet) bet.active = multiplier > 0;
    }
    public showSplitState(seat: number, completed: boolean): void {
        const mark = this.splitMarks[seat];
        if (mark?.isValid) mark.active = completed;
    }
    public showTotalScore(seat: number, score: number, roundDelta: number,
        stats: CN298PlayerStats | null, final: boolean): void {
        const label = this.scoreLabels[seat];
        if (!label) return;
        if (final && stats) {
            label.string = `总分 ${score} · ${stats.winRounds}胜${stats.lossRounds}负`;
            return;
        }
        const delta = roundDelta === 0 ? '' : ` (${roundDelta > 0 ? '+' : ''}${roundDelta})`;
        label.string = `总分 ${score}${delta}`;
    }
    public setActions(actions: Readonly<CN298ActionAvailability>): void {
        this.robOptions = actions.robOptions;
        this.betOptions = actions.betOptions;
        this.setButtonGroup(this.robButtons, actions.canRob);
        this.setButtonGroup(this.betButtons, actions.canBet);
        this.robButtons.forEach((button, index) => this.setOptionButton(button,
            actions.canRob, actions.robOptions[index], index === 0 ? '不抢' : undefined));
        this.betButtons.forEach((button, index) => this.setOptionButton(button,
            actions.canBet, actions.betOptions[index]));
        this.setButton(this.splitButton, actions.canSplit);
        this.continueIsStart = actions.canStart;
        this.setButton(this.continueButton, actions.canStart || actions.canContinue);
        const continueLabel = this.continueButton?.node.getComponentInChildren(Label) ?? null;
        if (continueLabel) continueLabel.string = actions.canStart ? '开始游戏' : '继续游戏';
    }
    private setButtonGroup(buttons: readonly Button[], active: boolean): void {
        const parent = buttons[0]?.node.parent;
        if (parent?.isValid) parent.active = active;
    }
    private setOptionButton(button: Button | null, enabled: boolean, value: number | undefined,
        zeroText?: string): void {
        const active = enabled && value !== undefined;
        this.setButton(button, active);
        const label = button?.node.getComponentInChildren(Label) ?? null;
        if (label && value !== undefined) label.string = value === 0 && zeroText ? zeroText : `×${value}`;
    }
    private requireOption(options: readonly number[], index: number, action: string): number {
        const value = options[index];
        if (value === undefined) throw new Error(`[CN298] unavailable ${action} option index=${index}`);
        return value;
    }
    private formatCard(card: number): string {
        const suits = ['', '♠', '♥', '♣', '♦'];
        const rank = card % 100;
        const text = ({ 1: 'A', 11: 'J', 12: 'Q', 13: 'K' } as Readonly<Record<number, string>>)[rank]
            ?? String(rank);
        return `${suits[Math.trunc(card / 100)] ?? '?'}${text}`;
    }
    private cardIndexAt(node: Node, event: EventTouch, cardCount: number): number {
        const transform = node.getComponent(UITransform);
        if (!transform || cardCount <= 0 || transform.contentSize.width <= 0) return -1;
        const point = event.getUILocation();
        const local = transform.convertToNodeSpaceAR(new Vec3(point.x, point.y, 0));
        const normalized = (local.x + transform.contentSize.width * transform.anchorX) / transform.contentSize.width;
        if (normalized < 0 || normalized > 1) return -1;
        return Math.min(cardCount - 1, Math.floor(normalized * cardCount));
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
        const buttonNode = button.node;
        this.actionDisposers.push(() => this.removeNodeListener(buttonNode, Button.EventType.CLICK, listener));
    }
    private logActionFailure(node: Node, error: unknown): void {
        console.error('[CN298] button action failed', { button: node.name,
            reason: error instanceof Error ? error.message : String(error) });
    }
    private unbindActions(): void {
        for (const dispose of this.actionDisposers.splice(0)) dispose();
    }
    private removeNodeListener(node: Node, eventType: string, listener: (...args: never[]) => void): void {
        if (!node.isValid) return;
        try {
            node.off(eventType, listener);
        } catch {
            // Cocos may clear a child node's event processor before the root component receives onDestroy.
        }
    }

    /** Bind the preserved XQP landscape hierarchy without serializing legacy gameplay scripts. */
    private hydrateLegacyLandscapeBindings(): void {
        if (!this.phaseLabel) this.phaseLabel = this.findPath(this.node, 'Middle/Clock/Time')?.getComponent(Label) ?? null;
        if (this.robButtons.length === 0) {
            const rob = this.findPath(this.node, 'OperateBtn/Rob');
            this.robButtons = ['NoRob', '0', '1', '2']
                .map(name => rob?.getChildByName(name)?.getComponent(Button) ?? null)
                .filter((button): button is Button => button !== null);
        }
        if (this.betButtons.length === 0) {
            const bet = this.findPath(this.node, 'OperateBtn/Bet');
            this.betButtons = ['0', '1', '2', '3']
                .map(name => bet?.getChildByName(name)?.getComponent(Button) ?? null)
                .filter((button): button is Button => button !== null);
        }
        if (!this.splitButton) this.splitButton = this.findPath(this.node, 'OperateBtn/ShowCardBtn')?.getComponent(Button) ?? null;
        if (!this.continueButton) this.continueButton = this.node.getChildByName('Auto')?.getComponent(Button) ?? null;
        if (this.scoreLabels.length === 0) {
            this.scoreLabels = Array.from({ length: 10 }, (_, seat) =>
                this.findPath(this.node, `Players-001/${seat}/Head/Cent/Num`)?.getComponent(Label) ?? null)
                .filter((label): label is Label => label !== null);
        }
        if (this.bankerMarks.length === 0) {
            this.bankerMarks = Array.from({ length: 10 }, (_, seat) =>
                this.findPath(this.node, `Players-001/${seat}/State/Banker`)).filter((node): node is Node => node !== null);
        }
        if (this.splitMarks.length === 0) {
            this.splitMarks = Array.from({ length: 10 }, (_, seat) =>
                this.findPath(this.node, `Middle/Players/${seat}/ResultNode`)).filter((node): node is Node => node !== null);
        }
    }

    private seatNode(seat: number): Node | null {
        return this.node.getChildByName(`Seat_${seat}`) ?? this.findPath(this.node, `Players-001/${seat}`);
    }

    private nodePath(node: Node): string {
        const segments: string[] = [];
        for (let current: Node | null = node; current; current = current.parent) segments.unshift(current.name);
        return segments.join('/');
    }

    private worldRect(node: Node): Readonly<{ x: number; y: number; width: number; height: number }> | null {
        const rect = node.getComponent(UITransform)?.getBoundingBoxToWorld();
        return rect ? { x: rect.x, y: rect.y, width: rect.width, height: rect.height } : null;
    }

    private findPath(root: Node, path: string): Node | null {
        let current: Node | null = root;
        for (const segment of path.split('/')) current = current?.getChildByName(segment) ?? null;
        return current;
    }
}
