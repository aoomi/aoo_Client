import { _decorator, assetManager, Button, Component, EventTouch, instantiate, Label, Node, Prefab, Sprite, SpriteAtlas, SpriteFrame, UITransform, Vec3, Widget } from 'cc';
import { PlayerAvatarService } from '../../../../../Common/Code/UI/PlayerAvatarService';
import { NnActionAvailability, NnRoomView } from './NnRoomPresenter';
import { NnHistoryRecord, NnObserver, NnPhase, NnPlayerStats, NnSnapshot, playerName } from './NnRoomState';
import { NnSnapshotRules } from './NnRules';

const { ccclass, property } = _decorator;

const PHASE_TEXT: Readonly<Record<NnPhase, string>> = Object.freeze({
    WAITING: '等待准备', ROBBING: '抢庄', BETTING: '下注', SPLITTING: '分牌',
    SETTLEMENT: '本局结算', FINISHED: '牌局结束',
});
const NN_BUNDLE = 'poker-nn';
const POKER_ATLAS = 'XQPSource/Dependencies/PokerAtlas/PokerFront_0Trends';

/** 横竖屏共用显示绑定；Prefab 只保存节点位置和资源引用。 */
@ccclass('NnRoomViewComponent')
export class NnRoomViewComponent extends Component implements NnRoomView {
    @property(Label) private phaseLabel: Label | null = null;
    @property([Label]) private handLabels: Label[] = [];
    @property([Label]) private robLabels: Label[] = [];
    @property([Label]) private betLabels: Label[] = [];
    @property([Label]) private scoreLabels: Label[] = [];
    private readonly roomRuleLabels: Partial<Record<keyof NnSnapshotRules, Label>> = {};
    private kanShunDouNode: Node | null = null;
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
    private readonly seatAvatarDefaults = new Map<number, SpriteFrame | null>();
    private settlementView: NnSettlementView | null = null;
    private realTimeRecordView: NnRealTimeRecordView | null = null;
    private commonRoom: Node | null = null;

    protected onLoad(): void {
        this.hydrateLegacyLandscapeBindings();
        const seatInputLayer = this.node.getChildByName('Players-001');
        if (seatInputLayer) seatInputLayer.active = true;
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
                console.info('[NnSeatInput] activate', { ...context, targetSeat: seat,
                    path: this.nodePath(inputNode), active: inputNode.activeInHierarchy,
                    worldRect: this.worldRect(inputNode) });
                if (!this.sitEnabled.has(seat)) return;
                void actions.sit().catch(error => this.logActionFailure(seatNode, error));
            };
            inputNode.on(eventType, listener);
            this.actionDisposers.push(() => this.removeNodeListener(inputNode, eventType, listener));
            console.info('[NnSeatInput] bind', { ...actions.seatContext(), targetSeat: seat,
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

    protected onDestroy(): void {
        this.unbindActions();
        this.settlementView?.destroy();
        this.settlementView = null;
        this.realTimeRecordView?.destroy();
        this.realTimeRecordView = null;
    }

    public attachSettlementPrefabs(smallPrefab: Prefab, bigPrefab: Prefab,
        continueRound: () => Promise<boolean>): void {
        this.settlementView?.destroy();
        this.settlementView = new NnSettlementView(this.node, smallPrefab, bigPrefab, continueRound);
    }

    public attachCommonRoom(commonRoom: Node, roomId: number, realTimeRecordPrefab: Prefab): void {
        this.commonRoom = commonRoom;
        this.realTimeRecordView?.destroy();
        this.realTimeRecordView = new NnRealTimeRecordView(this.node, realTimeRecordPrefab);
        this.commonLabel('RoomInfo/Lb_RoomId', `房间号：${roomId}`);
        this.commonVisible('RubCard', false);
        this.commonVisible('CardCounter/Bg_CardCounter', false);
        this.commonVisible('CardCounter/HorizontalLine', false);
        this.commonVisible('CardCounter/VerticalLines', false);
        this.commonVisible('CardCounter/RankLabels', false);
        this.commonVisible('CardCounter/CountLabels', false);
        this.commonPosition('RoomInfo', -160, 340);
        this.commonPosition('Btn/Btn_Back', -550, 280);
        this.commonPosition('Btn/Btn_More', -450, 280);
        this.commonPosition('Btn/Btn_SmallSettlement', 450, 280);
        this.commonPosition('Btn/Btn_Gps', 550, 280);
        this.commonPosition('Btn/Btn_Chat', 552, -236);
        this.commonPosition('Btn/RealTimeRecord', -550, -250);
        this.commonPosition('Btn/RubCard', -450, -250);
        this.bindCommon('Btn/RealTimeRecord', () => this.realTimeRecordView?.open());
        console.info('[NN] room layers attached', { roomId, commonRoom: commonRoom.name, gameRoom: this.node.name });
    }

    public showSeat(seat: number, playerId: number | null, visible: boolean, canSit: boolean,
        playerName?: string): void {
        const seatNode = this.seatNode(seat);
        if (!seatNode?.isValid) return;
        seatNode.active = visible;
        const name = this.findPath(seatNode, 'Head/NickName/Name')?.getComponent(Label) ?? null;
        if (name) name.string = playerId === null ? '空位' : playerName ?? `玩家${playerId}`;
        const landscapePlayer = this.findPath(this.node, `Players/${seat}`);
        if (landscapePlayer?.isValid) landscapePlayer.active = visible;
        if (canSit) this.sitEnabled.add(seat); else this.sitEnabled.delete(seat);
        this.showSeatAvatar(seat, seatNode, playerId);
    }

    public showRoomRules(rules?: Readonly<NnSnapshotRules>): void {
        if (!rules) return;
        this.setRoomRuleLabel('baseScore', rules.baseScore);
        this.setRoomRuleLabel('enterScore', rules.enterScore);
        this.setRoomRuleLabel('leaveScore', rules.leaveScore);
        this.setRoomRuleLabel('minCarryToRob', rules.minCarryToRob);
        if (rules.kanShunDouEnabled !== undefined && this.kanShunDouNode?.isValid) {
            this.kanShunDouNode.active = rules.kanShunDouEnabled === true;
        }
    }

    public toggleRoomRules(): void {
        const rules = this.findPath(this.node, 'Middle/Rules');
        if (!rules?.isValid) throw new Error('[NN] room rules are unavailable');
        rules.active = !rules.active;
    }

    /** 座位快照单一对应：有人时下发头像，空位时恢复 Prefab 序列化的默认头像帧。 */
    private showSeatAvatar(seat: number, seatNode: Node, playerId: number | null): void {
        const sprite = this.findPath(seatNode, 'Head/Round/Mask/Avatar')?.getComponent(Sprite) ?? null;
        if (!sprite) return;
        if (!this.seatAvatarDefaults.has(seat)) this.seatAvatarDefaults.set(seat, sprite.spriteFrame);
        if (playerId === null) {
            sprite.spriteFrame = this.seatAvatarDefaults.get(seat) ?? null;
            return;
        }
        void PlayerAvatarService.assign(sprite, playerId).catch((error: unknown) => console.error(
            '[NN] seat avatar assignment failed', {
                seat, playerId, reason: error instanceof Error ? error.message : String(error),
            }));
    }

    public showPhase(phase: NnPhase, round: number, roundLimit: number): void {
        if (this.phaseLabel) this.phaseLabel.string = `第${round}/${roundLimit}局 · ${PHASE_TEXT[phase]}`;
        this.commonLabel('RoomInfo/Lb_Round', `局数：${round}/${roundLimit}`);
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
        const rob = this.findPath(this.node, `Players/${seat}/OperationDisplay/RobNode`);
        if (rob) rob.active = true;
    }
    public showBet(seat: number, multiplier: number): void {
        const label = this.betLabels[seat];
        if (label) label.string = multiplier > 0 ? `下注×${multiplier}` : '';
        const bet = this.findPath(this.node, `Players/${seat}/BetArea`);
        if (bet) bet.active = multiplier > 0;
    }
    public showSplitState(seat: number, completed: boolean): void {
        const mark = this.splitMarks[seat];
        if (mark?.isValid) mark.active = completed;
    }
    public showTotalScore(seat: number, score: number, roundDelta: number,
        stats: NnPlayerStats | null, final: boolean): void {
        const label = this.scoreLabels[seat];
        if (!label) return;
        if (final && stats) {
            label.string = `总分 ${score} · ${stats.winRounds}胜${stats.lossRounds}负`;
            return;
        }
        const delta = roundDelta === 0 ? '' : ` (${roundDelta > 0 ? '+' : ''}${roundDelta})`;
        label.string = `总分 ${score}${delta}`;
    }
    public showSettlement(snapshot: NnSnapshot): void {
        this.realTimeRecordView?.render(snapshot);
        if (!this.settlementView) {
            if (snapshot.phase === 'SETTLEMENT' || snapshot.phase === 'FINISHED') {
                console.error('[NN] settlement prefabs are not attached', { phase: snapshot.phase,
                    roomId: snapshot.roomId, stateVersion: snapshot.stateVersion });
            }
            return;
        }
        this.settlementView.render(snapshot);
    }
    public openSettlementHistory(snapshot: NnSnapshot, close: () => void): void {
        if (!this.settlementView) throw new Error('[NN] settlement view is unavailable');
        this.settlementView.openHistory(snapshot, close);
    }
    public closeSettlementHistory(): void { this.settlementView?.close(); }
    public setActions(actions: Readonly<NnActionAvailability>): void {
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
        if (value === undefined) throw new Error(`[NN] unavailable ${action} option index=${index}`);
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
        console.error('[NN] button action failed', { button: node.name,
            reason: error instanceof Error ? error.message : String(error) });
    }
    private unbindActions(): void {
        for (const dispose of this.actionDisposers.splice(0)) dispose();
    }
    private removeNodeListener(node: Node, eventType: string, listener: (...args: never[]) => void): void {
        if (!node.isValid) return;
        node.off(eventType, listener);
    }

    private commonPath(path: string): Node | null { return this.commonRoom?.getChildByPath(path) ?? null; }

    private commonLabel(path: string, value: string): void {
        const label = this.commonPath(path)?.getComponent(Label);
        if (label) label.string = value;
    }

    private commonVisible(path: string, active: boolean): void {
        const node = this.commonPath(path);
        if (node) node.active = active;
    }

    private commonPosition(path: string, x: number, y: number): void {
        const node = this.commonPath(path);
        if (!node) return;
        const widget = node.getComponent(Widget);
        if (widget) widget.enabled = false;
        node.setPosition(x, y, node.position.z);
    }

    private bindCommon(path: string, action: () => void): void {
        const node = this.commonPath(path);
        if (!node) return;
        const button = node.getComponent(Button) ?? node.addComponent(Button);
        const listener = (): void => { if (button.interactable) action(); };
        node.on(Button.EventType.CLICK, listener, this);
        this.actionDisposers.push(() => {
            if (node.isValid) node.off(Button.EventType.CLICK, listener, this);
        });
    }

    /** Bind the preserved XQP landscape hierarchy without serializing legacy gameplay scripts. */
    private hydrateLegacyLandscapeBindings(): void {
        if (!this.phaseLabel) this.phaseLabel = this.findPath(this.node, 'Clock/Time')?.getComponent(Label) ?? null;
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
        const ruleRoot = 'Middle/Rules/Rule';
        this.roomRuleLabels.baseScore = this.findPath(this.node, `${ruleRoot}/Di/Num`)?.getComponent(Label) ?? undefined;
        this.roomRuleLabels.enterScore = this.findPath(this.node, `${ruleRoot}/Min/Num`)?.getComponent(Label) ?? undefined;
        this.roomRuleLabels.leaveScore = this.findPath(this.node, `${ruleRoot}/Leave/Num`)?.getComponent(Label) ?? undefined;
        this.roomRuleLabels.minCarryToRob = this.findPath(this.node, `${ruleRoot}/Rob/Num`)?.getComponent(Label) ?? undefined;
        this.kanShunDouNode = this.findPath(this.node, `${ruleRoot}/KSD`);
        if (this.bankerMarks.length === 0) {
            this.bankerMarks = Array.from({ length: 10 }, (_, seat) =>
                this.findPath(this.node, `Players-001/${seat}/AtateImg/Banker`)).filter((node): node is Node => node !== null);
        }
        if (this.splitMarks.length === 0) {
            this.splitMarks = Array.from({ length: 10 }, (_, seat) =>
                this.findPath(this.node, `Players/${seat}/OperationDisplay/ResultNode`)).filter((node): node is Node => node !== null);
        }
    }

    private seatNode(seat: number): Node | null {
        return this.findPath(this.node, `Players-001/${seat}`);
    }

    private setRoomRuleLabel(key: keyof NnSnapshotRules, value: number | undefined): void {
        const label = this.roomRuleLabels[key];
        if (label && value !== undefined) label.string = String(value);
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

/** Runtime-only wiring for the imported settlement prefabs; no serialized prefab mutation is required. */
class NnSettlementView {
    private readonly small: Node;
    private readonly big: Node;
    private readonly rows: Node[];
    private readonly bigRows: Node[];
    private readonly disposers: Array<() => void> = [];
    private page = 0;
    private snapshot: NnSnapshot | null = null;
    private handTypeGapLogged = false;
    private pokerAtlas: Promise<SpriteAtlas | null> | null = null;
    private smallRenderVersion = 0;
    private historyClose: (() => void) | null = null;

    public constructor(host: Node, smallPrefab: Prefab, bigPrefab: Prefab,
        private readonly continueRound: () => Promise<boolean>) {
        this.small = instantiate(smallPrefab);
        this.big = instantiate(bigPrefab);
        this.small.name = 'NnSmallSettlementRuntime';
        this.big.name = 'NnBigSettlementRuntime';
        host.addChild(this.small);
        host.addChild(this.big);
        this.small.setPosition(Vec3.ZERO);
        this.big.setPosition(Vec3.ZERO);
        this.small.active = false;
        this.big.active = false;
        this.rows = this.createRows(this.small, 'Small/Players/View/Content', 'Clone', 5);
        this.bigRows = this.createRows(this.big,
            'FinalSettlementPanel/PlayerList/PlayerListView/PlayerListContent', 'PlayerItemTemplate', 10);
        this.bindClose(this.small, 'Mask');
        this.bindClose(this.small, 'Popup/Bg');
        this.bindClose(this.big, 'Mask');
        this.bindClose(this.big, 'FinalSettlementPanel/BottomBar/NormalActions/Btn_ReturnLobby');
        this.bindClose(this.big, 'FinalSettlementPanel/BottomBar/FinishedActions/Btn_ReturnLobby');
        this.bindClick(this.small, 'Small/Bottom/PageTurning/LeftArrows', () => this.changePage(-1));
        this.bindClick(this.small, 'Small/Bottom/PageTurning/RightArrows', () => this.changePage(1));
        this.bindClick(this.big, 'FinalSettlementPanel/BottomBar/NormalActions/Btn_Continue', () => {
            void this.continueRound().catch((error: unknown) => console.error(
                '[NN] final settlement continue failed', {
                    reason: error instanceof Error ? error.message : String(error),
                }));
        });
    }

    public render(snapshot: NnSnapshot): void {
        this.snapshot = snapshot;
        if (snapshot.phase === 'SETTLEMENT') {
            this.big.active = false;
            this.small.active = true;
            this.renderSmall(snapshot);
            return;
        }
        if (snapshot.phase === 'FINISHED') {
            this.small.active = false;
            this.big.active = true;
            this.renderBig(snapshot);
            return;
        }
        this.small.active = false;
        this.big.active = false;
    }

    public close(): void {
        this.historyClose = null;
        const continueButton = this.find(this.big,
            'FinalSettlementPanel/BottomBar/NormalActions/Btn_Continue');
        if (continueButton) continueButton.active = true;
        this.small.active = false;
        this.big.active = false;
    }

    public openHistory(snapshot: NnSnapshot, close: () => void): void {
        this.historyClose = close;
        this.render(snapshot);
        const continueButton = this.find(this.big,
            'FinalSettlementPanel/BottomBar/NormalActions/Btn_Continue');
        if (continueButton) continueButton.active = false;
    }

    public destroy(): void {
        for (const dispose of this.disposers.splice(0)) dispose();
        if (this.small.isValid) this.small.destroy();
        if (this.big.isValid) this.big.destroy();
    }

    private renderSmall(snapshot: NnSnapshot): void {
        const renderVersion = ++this.smallRenderVersion;
        const top = this.find(this.small, 'Small/Top');
        if (top) top.active = true;
        this.setLabel(this.small, 'Small/Top/RoomID', `房号:${snapshot.roomId}`);
        this.setLabel(this.small, 'Small/Top/Time', this.timeText(snapshot.roundSettlement.settledAtEpochMillis));
        const seats = Object.keys(snapshot.players).map(Number).sort((a, b) => a - b);
        const pageCount = Math.max(1, Math.ceil(seats.length / this.rows.length));
        this.page = Math.min(this.page, pageCount - 1);
        this.setLabel(this.small, 'Small/Bottom/PageTurning/Num', `${this.page + 1}/${pageCount}`);
        this.rows.forEach((row, index) => {
            const seat = seats[this.page * this.rows.length + index];
            row.active = seat !== undefined;
            if (seat === undefined) return;
            const cards = this.settlementCards(snapshot, seat);
            const playerId = snapshot.players[seat];
            this.setLabel(row, 'Head/NickName/Name', playerName(snapshot, seat) ?? `玩家${playerId}`);
            this.assignAvatar(row, 'Head/Square/Mask/Avatar', playerId);
            const banker = this.find(row, 'Head/Banker');
            if (banker) banker.active = seat === snapshot.roundSettlement.bankerSeat;
            this.setLabel(row, 'Bet/Num', String(snapshot.bets[seat] ?? 0));
            for (let cardIndex = 0; cardIndex < 5; cardIndex++) {
                const cardNode = this.requireNode(row, `SplitPoker/Hand/Pokers/${cardIndex + 1}`);
                cardNode.active = cardIndex < cards.length;
            }
            void this.renderSmallCards(row, seat, cards, renderVersion);
            this.renderResult(row, snapshot, seat);
            const delta = snapshot.roundSettlement.scoreDelta?.[seat] ?? 0;
            this.setLabel(row, 'Score/Win', delta > 0 ? `+${delta}` : '');
            this.setLabel(row, 'Score/Lose', delta < 0 ? String(delta) : '');
        });
    }

    private renderBig(snapshot: NnSnapshot): void {
        this.setLabel(this.big, 'FinalSettlementPanel/TopBar/RoomIdLabel', `房号:${snapshot.roomId}`);
        this.setLabel(this.big, 'FinalSettlementPanel/TopBar/RoundCountLabel',
            `局数:${snapshot.round}/${snapshot.roundLimit}`);
        this.setLabel(this.big, 'FinalSettlementPanel/TopBar/EndTimeLabel',
            this.timeText(snapshot.roundSettlement.settledAtEpochMillis));
        const entries = Object.entries(snapshot.finalSettlement).sort(([a], [b]) => Number(a) - Number(b));
        const winner = entries.reduce<[string, NnPlayerStats] | null>((best, entry) =>
            !best || entry[1].totalScore > best[1].totalScore ? entry : best, null);
        this.setLabel(this.big,
            'FinalSettlementPanel/BestWinnerPanel/BestWinnerHead/NickNameBackground/BestWinnerNameLabel',
            winner ? playerName(snapshot, Number(winner[0])) ?? `玩家${winner[1].playerId}` : '');
        this.setLabel(this.big, 'FinalSettlementPanel/BestWinnerPanel/BestWinnerScoreLabel',
            winner ? this.scoreText(winner[1].totalScore) : '');
        this.bigRows.forEach((row, index) => {
            const entry = entries[index];
            const stats = entry?.[1];
            row.active = Boolean(stats);
            if (!stats) return;
            this.setLabel(row, 'Head/NickNameBackground/PlayerNameLabel',
                entry ? playerName(snapshot, Number(entry[0])) ?? `玩家${stats.playerId}` : `玩家${stats.playerId}`);
            this.assignAvatar(row, 'Head/AvatarSquare/AvatarMask/AvatarImage', stats.playerId);
            this.setLabel(row, 'Statistics/WinCount/WinCountLabel', String(stats.winRounds));
            this.setLabel(row, 'Statistics/LoseCount/LoseCountLabel', String(stats.lossRounds));
            this.requireNode(row, 'TotalScore/TotalWinScoreLabel').active = false;
            this.requireNode(row, 'TotalScore/TotalLoseScoreLabel').active = false;
        });
    }

    private async renderSmallCards(row: Node, seat: number, cards: readonly number[],
        renderVersion: number): Promise<void> {
        const atlas = await this.loadPokerAtlas();
        if (!atlas || renderVersion !== this.smallRenderVersion || !row.isValid) return;
        cards.forEach((card, cardIndex) => {
            const path = `SplitPoker/Hand/Pokers/${cardIndex + 1}/Poker`;
            const sprite = this.requireNode(row, path).getComponent(Sprite);
            if (!sprite) throw new Error(`[NN] settlement card sprite missing path=${path}`);
            const frame = atlas.getSpriteFrame(String(card));
            if (!frame) {
                console.error('[NN] settlement card frame missing', { seat, card, path });
                return;
            }
            sprite.spriteFrame = frame;
        });
    }

    private loadPokerAtlas(): Promise<SpriteAtlas | null> {
        if (this.pokerAtlas) return this.pokerAtlas;
        this.pokerAtlas = new Promise<SpriteAtlas>((resolve, reject) => {
            const load = (bundle: ReturnType<typeof assetManager.getBundle>): void => {
                if (!bundle) return reject(new Error(`[NN] bundle unavailable: ${NN_BUNDLE}`));
                bundle.load(POKER_ATLAS, SpriteAtlas, (error, atlas) => error || !atlas
                    ? reject(error ?? new Error(`[NN] card atlas unavailable: ${POKER_ATLAS}`))
                    : resolve(atlas));
            };
            const bundle = assetManager.getBundle(NN_BUNDLE);
            if (bundle) load(bundle);
            else assetManager.loadBundle(NN_BUNDLE, (error, loaded) => error ? reject(error) : load(loaded));
        }).catch((error: unknown) => {
            console.error('[NN] settlement card atlas load failed', {
                bundle: NN_BUNDLE, path: POKER_ATLAS,
                reason: error instanceof Error ? error.message : String(error),
            });
            return null;
        });
        return this.pokerAtlas;
    }

    private assignAvatar(row: Node, path: string, playerId: number): void {
        const sprite = this.requireNode(row, path).getComponent(Sprite);
        if (!sprite) throw new Error(`[NN] settlement avatar sprite missing path=${path}`);
        void PlayerAvatarService.assign(sprite, playerId).catch((error: unknown) => console.error(
            '[NN] settlement avatar assignment failed', {
                playerId, path, reason: error instanceof Error ? error.message : String(error),
            }));
    }

    /**
     * 结算行五张牌只有一个权威来源：`snapshot.hands`。服务端在 SETTLEMENT/FINISHED 阶段对全桌亮牌，
     * 房间与结算视图因此共用同一份权威数据。`roundSettlement.hands` 是服务端 Hand 记录，
     * 其线上字段名没有经服务端测试断言的客户端契约，禁止在此猜测键名。
     */
    private settlementCards(snapshot: NnSnapshot, seat: number): readonly number[] {
        if (!(seat in snapshot.hands)) {
            console.error('[NN] settlement hand missing from authoritative snapshot', {
                roomId: snapshot.roomId, seat,
            });
            return [];
        }
        return this.validCards(snapshot.hands[seat], seat);
    }

    /**
     * NN 快照不下发牌型与本局倍数：牌型图与倍数标签只能清空，
     * 既不能显示导入预制体的静态占位，也不能在客户端重算服务端牌型规则。
     */
    private renderResult(row: Node, snapshot: NnSnapshot, seat: number): void {
        const handType = snapshot.roundSettlement.handTypes?.[seat];
        const multiplier = snapshot.roundSettlement.multipliers?.[seat];
        const text = handType === undefined || multiplier === undefined ? '' : `牛型${handType} ×${multiplier}`;
        this.setLabel(row, 'SplitPoker/Hand/ResultNode/MultSp', text);
        if (!text && !this.handTypeGapLogged) {
            this.handTypeGapLogged = true;
            console.error('[NN] authoritative settlement type or multiplier is missing', {
                roomId: snapshot.roomId, seat,
            });
        }
    }

    private validCards(values: readonly unknown[], seat: number): readonly number[] {
        const cards = values.filter((value): value is number => Number.isInteger(value) && Number(value) > 0);
        if (cards.length !== 5) console.error('[NN] settlement hand must contain five cards', {
            seat, count: cards.length,
        });
        return cards.slice(0, 5);
    }

    private createRows(root: Node, contentPath: string, templateName: string, count: number): Node[] {
        const content = this.requireNode(root, contentPath);
        const template = this.requireNode(content, templateName);
        const rows = [template];
        for (let index = 1; index < count; index++) {
            const row = instantiate(template);
            row.name = `${templateName}_${index}`;
            content.addChild(row);
            rows.push(row);
        }
        return rows;
    }

    private changePage(delta: number): void {
        const snapshot = this.snapshot;
        if (!snapshot) return;
        const pageCount = Math.max(1, Math.ceil(Object.keys(snapshot.players).length / this.rows.length));
        this.page = Math.min(pageCount - 1, Math.max(0, this.page + delta));
        this.renderSmall(snapshot);
    }

    private bindClose(root: Node, path: string): void {
        this.bindClick(root, path, () => {
            const close = this.historyClose;
            if (close) { this.historyClose = null; close(); }
            else root.active = false;
        });
    }
    private bindClick(root: Node, path: string, listener: () => void): void {
        const node = this.requireNode(root, path);
        if (!node.getComponent(Button)) throw new Error(`[NN] settlement button missing path=${path}`);
        node.on(Button.EventType.CLICK, listener);
        this.disposers.push(() => { if (node.isValid) node.off(Button.EventType.CLICK, listener); });
    }
    private requireNode(root: Node, path: string): Node {
        const node = this.find(root, path);
        if (!node) throw new Error(`[NN] settlement node missing path=${path}`);
        return node;
    }
    private find(root: Node, path: string): Node | null {
        let current: Node | null = root;
        for (const segment of path.split('/')) current = current?.getChildByName(segment) ?? null;
        return current;
    }
    private setLabel(root: Node, path: string, value: string): void {
        const node = this.requireNode(root, path);
        const label = node.getComponent(Label);
        if (!label) throw new Error(`[NN] settlement label missing path=${path}`);
        label.string = value;
    }
    private scoreText(score: number): string { return score > 0 ? `+${score}` : String(score); }
    private timeText(epochMillis: number | undefined): string {
        if (!Number.isFinite(epochMillis) || Number(epochMillis) <= 0) return '';
        return new Date(Number(epochMillis)).toLocaleString('zh-CN', { hour12: false });
    }
}

class NnRealTimeRecordView {
    private readonly root: Node;
    private readonly playerRows: Node[];
    private readonly observerRows: Node[];
    private readonly disposers: Array<() => void> = [];
    private snapshot: NnSnapshot | null = null;

    public constructor(host: Node, prefab: Prefab) {
        this.root = instantiate(prefab);
        this.root.name = 'NnRealTimeRecordRuntime';
        host.addChild(this.root);
        this.root.setPosition(Vec3.ZERO);
        this.root.active = false;
        this.playerRows = this.createRows('Score/Players/View/Content', 'Clone', 10);
        this.observerRows = this.createRows('Score/Observers/View/Content', 'Clone', 10);
        this.bindClose('Mask');
        this.bindClose('Popup/Bg');
    }

    public render(snapshot: NnSnapshot): void {
        this.snapshot = snapshot;
        if (this.root.active) this.renderVisible(snapshot);
    }
    public open(): void {
        if (!this.snapshot) return;
        this.root.active = true;
        this.renderVisible(this.snapshot);
    }
    public destroy(): void {
        for (const dispose of this.disposers.splice(0)) dispose();
        if (this.root.isValid) this.root.destroy();
    }

    private renderVisible(snapshot: NnSnapshot): void {
        this.label('Score/Top/RoomID', `房间号：${snapshot.roomId}`);
        const authorityTime = snapshot.roundSettlement.settledAtEpochMillis;
        this.label('Score/Top/Time', Number(authorityTime) > 0
            ? new Date(Number(authorityTime)).toLocaleString('zh-CN', { hour12: false }) : '');
        const active = Object.entries(snapshot.players).map(([seat, playerId]) => ({
            seat: Number(seat), playerId, nickname: playerName(snapshot, Number(seat)) ?? `玩家${playerId}`,
            totalScore: snapshot.totalScores[Number(seat)] ?? 0,
        }));
        const records: readonly NnHistoryRecord[] = snapshot.historyRecords ?? [];
        this.playerRows.forEach((row, index) => {
            const item = [...active, ...records][index];
            row.active = Boolean(item);
            if (!item) return;
            this.labelIn(row, 'Head/NickName/Name', item.nickname);
            this.labelIn(row, 'Score/Win', item.totalScore > 0 ? `+${item.totalScore}` : '');
            this.labelIn(row, 'Score/Lose', item.totalScore < 0 ? String(item.totalScore) : '');
        });
        const observers: readonly NnObserver[] = snapshot.observers ?? [];
        this.observerRows.forEach((row, index) => {
            const observer = observers[index];
            row.active = Boolean(observer);
            if (observer) this.labelIn(row, 'Head/NickName/Name', observer.nickname);
        });
    }
    private createRows(contentPath: string, templateName: string, count: number): Node[] {
        const content = this.require(contentPath);
        const template = this.require(`${contentPath}/${templateName}`);
        const rows = [template];
        for (let index = 1; index < count; index++) {
            const row = instantiate(template); row.name = `${templateName}_${index}`; content.addChild(row); rows.push(row);
        }
        return rows;
    }
    private bindClose(path: string): void {
        const node = this.require(path);
        const button = node.getComponent(Button) ?? node.addComponent(Button);
        const listener = (): void => { this.root.active = false; };
        node.on(Button.EventType.CLICK, listener);
        this.disposers.push(() => { if (node.isValid) node.off(Button.EventType.CLICK, listener); });
    }
    private label(path: string, value: string): void { this.labelIn(this.root, path, value); }
    private labelIn(root: Node, path: string, value: string): void {
        const label = this.find(root, path)?.getComponent(Label);
        if (label) label.string = value;
    }
    private require(path: string): Node {
        const node = this.find(this.root, path);
        if (!node) throw new Error(`[NN] realtime record node missing path=${path}`);
        return node;
    }
    private find(root: Node, path: string): Node | null {
        let current: Node | null = root;
        for (const segment of path.split('/')) current = current?.getChildByName(segment) ?? null;
        return current;
    }
}
