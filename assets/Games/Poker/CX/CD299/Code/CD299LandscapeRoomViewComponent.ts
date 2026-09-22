import { _decorator, assetManager, Button, Component, instantiate, Label, Layout, Node, Prefab, Sprite, SpriteFrame, tween, UITransform, Vec3 } from 'cc';
import { CommonHeadController } from '../../../../../Common/Code/UI/CommonHeadController';
import { NumpadHandle, NumpadService } from '../../../../../Common/Code/Runtime/ui/NumpadService';
import { COMMON_ASSET_BUNDLE, NUMPAD_ASSET, resolveCommonNumpadAsset } from '../../../../../Common/Code/Runtime/ui/CommonPrefabRegistry';
import { Poker_Card_Face } from '../../../Common/Code/Card/Poker_Card_Presenter';
import { Poker_Card_Factory } from '../../../Common/Code/Card/Poker_Card_Factory';
import { CD299Actions, CD299RoomView } from './CD299RoomPresenter';
import { CD299Phase } from './CD299RoomState';
import type { CD299RuntimeController } from './CD299RuntimeController';

const { ccclass } = _decorator;
const XQP_ROOM_BACKGROUND = 'CD299/Art/XqpRoomBackground/spriteFrame';
const LANDSCAPE_DESIGN_WIDTH = 1280;
const LANDSCAPE_DESIGN_HEIGHT = 720;
const XQP_HEAD_SIZE = 90;
const AOO_COMMON_HEAD_SIZE = 80;
const PHASE_TEXT: Readonly<Record<CD299Phase, string>> = Object.freeze({
    WAITING: '等待玩家坐下', BASE_AND_MANGO: '选择底分和芒数', DEALING: '发牌', BETTING: '下注',
    ADD_CARD: '补牌', SPLITTING: '分牌', REVEAL: '开牌', ROUND_SETTLEMENT: '本局结算', FINISHED: '牌局结束',
});

/** CD299 横屏专用绑定：只驱动 Creator 中固定的 8 席节点，不克隆、不重排座位。 */
@ccclass('CD299LandscapeRoomViewComponent')
export class CD299LandscapeRoomViewComponent extends Component implements CD299RoomView {
    private readonly cardFactory = new Poker_Card_Factory();
    private readonly lastCardSelectionAt = new Map<number, number>();
    private readonly cardGenerations = new Map<number, number>();
    private readonly commandDisposers: Array<() => void> = [];
    private readonly headGenerations = new Map<number, number>();
    private readonly scores = new Map<number, number>();
    private readonly readySeats = new Map<number, boolean>();
    private readonly sittableSeats = new Set<number>();
    private readonly localCardNodes = new Map<number, Node>();
    private readonly renderedCardCounts = new Map<number, number>();
    private readonly selectedSplitCards: number[] = [];
    private readonly splitDeadlines = new Map<number, number>();
    private readonly operationDeadlines = new Map<number, number>();
    private readonly displayedBetActions = new Map<number, string>();
    private localHandCards: readonly number[] = [];
    private commonHeadPrefab: Promise<Prefab> | null = null;
    private addCentPrefab: Promise<Prefab> | null = null;
    private addCentWindow: Node | null = null;
    private addCentNumpad: NumpadHandle | null = null;
    private readonly numpadService = new NumpadService();
    private commonRoom: Node | null = null;
    private roomId = 0;
    private controller: CD299RuntimeController | null = null;
    private currentActions: Readonly<CD299Actions> | null = null;

    protected override onLoad(): void {
        // XQP ChessCxRoomWindow.OnCreat starts with every operation group
        // hidden. They are revealed only after an authoritative operation
        // notice, so the prefab's authored active flags must never leak while
        // the first room snapshot is still in flight.
        this.hideAllActions();
        void this.mountXqpRoomBackground();
    }

    /** XQP composes the 229 landscape room skin behind the game-specific desk prefab. */
    private async mountXqpRoomBackground(): Promise<void> {
        try {
            const spriteFrame = await new Promise<SpriteFrame>((resolve, reject) => {
                const load = (bundle: ReturnType<typeof assetManager.getBundle>): void => {
                    if (!bundle) return reject(new Error('[CD299] poker-cx bundle unavailable'));
                    bundle.load(XQP_ROOM_BACKGROUND, SpriteFrame, (error, frame) => error || !frame
                        ? reject(error ?? new Error('[CD299] XQP room background unavailable'))
                        : resolve(frame));
                };
                const bundle = assetManager.getBundle('poker-cx');
                if (bundle) load(bundle);
                else assetManager.loadBundle('poker-cx', (error, loaded) => error ? reject(error) : load(loaded));
            });
            if (!this.node.isValid) return;
            const background = new Node('XqpRoomBackground');
            background.layer = this.node.layer;
            // XQP's room skin is authored at 1600×720, while its 1280×720
            // gameplay viewport fits that source across the full viewport.
            // Keeping the source pixel width here clips both 160 px extension
            // bands and makes the desk roughly 25% wider than the authoritative
            // running screen even though every gameplay-node coordinate matches.
            background.addComponent(UITransform).setContentSize(
                LANDSCAPE_DESIGN_WIDTH, LANDSCAPE_DESIGN_HEIGHT);
            const sprite = background.addComponent(Sprite);
            sprite.sizeMode = Sprite.SizeMode.CUSTOM;
            sprite.spriteFrame = spriteFrame;
            this.node.addChild(background);
            background.setSiblingIndex(0);
            background.setPosition(0, 0, -1);
            console.info('[CD299] XQP room background mounted', {
                roomId: this.roomId, asset: XQP_ROOM_BACKGROUND,
                width: LANDSCAPE_DESIGN_WIDTH, height: LANDSCAPE_DESIGN_HEIGHT,
            });
        } catch (error: unknown) {
            console.error('[CD299] XQP room background failed', {
                roomId: this.roomId, asset: XQP_ROOM_BACKGROUND,
                reason: error instanceof Error ? error.message : String(error),
            });
        }
    }

    public attachCommonRoom(commonRoom: Node, roomId: number): void {
        this.commonRoom = commonRoom;
        this.roomId = roomId;
        this.commonLabel('RoomInfo/Lb_RoomId', `房间号：${roomId}`);
        this.commonVisible('WaitingActions/Btn_Ready', false);
        this.commonVisible('WaitingActions/Btn_Start', false);
        this.commonVisible('RubCard', false);
        this.commonVisible('CardCounter/Bg_CardCounter', false);
        this.commonVisible('CardCounter/HorizontalLine', false);
        this.commonVisible('CardCounter/VerticalLines', false);
        this.commonVisible('CardCounter/RankLabels', false);
        this.commonVisible('CardCounter/CountLabels', false);
        console.info('[CD299] room layers attached', { roomId, commonRoom: commonRoom.name, gameRoom: this.node.name });
    }

    public bindController(controller: CD299RuntimeController): () => void {
        this.unbindController();
        // Binding happens immediately before the initial authoritative state
        // request. Reset again here because Creator may invoke onLoad while an
        // instantiated prefab is still outside the active scene tree.
        this.hideAllActions();
        this.controller = controller;
        this.bindCommon('Btn/Btn_More', () => {
            const menu = this.commonPath('CardCounter/MoreMenu');
            if (menu) menu.active = !menu.active;
        });
        this.bindCommon('CardCounter/MoreMenu/MoreItems/Btn_RoomRule', () => {
            const rules = this.path('RulePanel');
            if (rules) rules.active = !rules.active;
        });
        this.bind(this.path('OperateBtn/PresetBet/1'), () => controller.preset(1));
        this.bind(this.path('OperateBtn/PresetBet/2'), () => controller.preset(2));
        this.bind(this.path('OperateBtn/Bet/Drop'), () => this.submitBet('DROP', 0));
        this.bind(this.path('OperateBtn/Bet/Follow/Follow'), () => this.submitBet('FOLLOW', 0));
        this.bind(this.path('OperateBtn/Bet/Follow/Check'), () => this.submitBet('REST', 0));
        this.bind(this.path('OperateBtn/Bet/Add/AllIn'), () => this.submitBet('ALL_IN', 0));
        // The authored XQP shortcut has a full-size Btn_Select child. It owns
        // the hit-test, so listen on that leaf rather than the covered card node.
        this.bind(this.path('OperateBtn/Bet/Add/Add/Fast/1'), () => this.submitQuickRaise(0));
        this.bind(this.path('OperateBtn/Bet/Add/Add/Fast/2'), () => this.submitQuickRaise(1));
        this.bind(this.path('OperateBtn/Bet/Add/Add/Fast/3'), () => this.submitQuickRaise(2));
        this.bind(this.path('OperateBtn/SplitPoker/Ensure'), () => this.submitSplit());
        this.bind(this.path('OperateBtn/SplitPoker/Delay'), () => controller.delaySplit());
        this.bindCommon('WaitingActions/Btn_Start', () => { void controller.continueRound(); });
        return () => this.unbindController();
    }

    public unbindController(): void {
        for (const dispose of this.commandDisposers.splice(0)) dispose();
        this.controller = null;
    }

    protected override onDestroy(): void {
        this.closeAddCentWindow();
        this.unbindController();
    }

    public showPhase(phase: CD299Phase, round: number): void {
        const label = this.find('GameState')?.getComponent(Label) ?? this.find('Phase')?.getComponent(Label);
        if (label) label.string = `第${round}局 · ${PHASE_TEXT[phase]}`;
        this.commonLabel('RoomInfo/Lb_Round', `局数：${round}`);
    }

    public showSeat(seat: number, authoritativeSeat: number, playerId: number | null,
        canSit: boolean, seatLimit: number): void {
        if (seatLimit !== 8) throw new Error(`[CD299] landscape requires 8 seats, received ${seatLimit}`);
        const seatNode = this.seat(seat);
        const clickTarget = this.ensureHeadMount(seatNode);
        if (canSit) this.sittableSeats.add(authoritativeSeat);
        else this.sittableSeats.delete(authoritativeSeat);
        this.bindSeatTarget(clickTarget, authoritativeSeat, canSit);
        if (!canSit && this.addCentWindow?.name === `ChessRoomAddCentWindow_${authoritativeSeat}`) {
            this.closeAddCentWindow();
        }
        void this.renderHead(seat, playerId);
    }

    public showReady(seat: number, ready: boolean): void {
        this.readySeats.set(seat, ready);
        this.headController(seat)?.showReady(ready);
    }

    public showHand(seat: number, cards: readonly number[], revealed: boolean): void {
        const seatNode = this.seat(seat);
        const hand = seatNode.getChildByName('HandCard');
        if (!hand) throw new Error(`[CD299] seat=${seat} HandCard missing`);
        const parent = hand;
        const addCard = seat === 0 ? null : seatNode.getChildByName('AddPoker');
        if (!parent || (seat !== 0 && !addCard)) throw new Error(`[CD299] seat=${seat} authored card area missing`);
        // The migrated XQP container has a Layout component sized for XQP's
        // native 98 px card prefab. Aoo's shared card keeps a 169 px logical
        // UITransform and is visually reduced with node scale; Layout ignores
        // that scale and was therefore forcing a 169 px centre gap after our
        // explicit placement. Runtime cards use the authoritative positions
        // below, so the editor Layout must not rewrite them.
        const authoredLayout = parent.getComponent(Layout);
        if (authoredLayout) authoredLayout.enabled = false;
        const previousCount = this.renderedCardCounts.get(seat) ?? 0;
        const generation = (this.cardGenerations.get(seat) ?? 0) + 1;
        this.cardGenerations.set(seat, generation);
        this.renderedCardCounts.set(seat, cards.length);
        if (seat === 0) {
            this.localHandCards = [...cards];
            this.localCardNodes.clear();
        }
        this.cardFactory.clear(parent);
        const addCardCards = addCard ? this.runtimeCardLayer(addCard) : null;
        if (addCardCards) this.cardFactory.clear(addCardCards);
        void Promise.all(cards.map(async (rawCard, index) => {
            const target = seat !== 0 && index >= 2 ? addCardCards! : parent;
            const cardVisible = revealed && rawCard !== 0;
            const card = await this.cardFactory.create(target, cardVisible ? rawCard : 103,
                cardVisible ? Poker_Card_Face.Front : Poker_Card_Face.Back);
            if (this.cardGenerations.get(seat) !== generation || !target.isValid) {
                card.destroy();
                return;
            }
            if (seat === 0) {
                this.scaleCardTo(card, 100, 129);
                card.setPosition(index * 100, 0, index);
                this.localCardNodes.set(rawCard, card);
                // XQP's overlapping hand cards select on the card node itself.
                // Button.CLICK is swallowed by the higher-z neighbour in the
                // 25 px overlap strip and makes the lower card impossible to pick.
                const selectCard = (): void => {
                    if (!this.splitSelectionEnabled) return;
                    const now = Date.now(), previous = this.lastCardSelectionAt.get(rawCard) ?? 0;
                    // Mobile Chrome follows TOUCH_END with a synthesized mouse-up.
                    // Treat that pair as one physical selection without suppressing
                    // deliberate taps on different overlapping cards.
                    if (now - previous < 250) return;
                    this.lastCardSelectionAt.set(rawCard, now);
                    this.toggleSplitCard(rawCard);
                };
                // Creator desktop Preview emits mouse events while mobile Preview
                // emits touch events. Both must drive the same real card hit area.
                card.on(Node.EventType.MOUSE_UP, selectCard, this);
                card.on(Node.EventType.TOUCH_END, selectCard, this);
            } else if (index < 2) {
                this.scaleCardTo(card, 30, 39);
                const overlap = seat >= 5 ? 5 : -5;
                card.setPosition(index === 0 ? 0 : overlap, index === 0 ? 0 : 3, index);
            } else {
                this.scaleCardTo(card, 78, 100);
                card.setPosition((index - 2) * 79, 0, index);
            }
            if (index >= previousCount) this.playDealTween(card, seat, index - previousCount);
        })).catch(error => console.error('[CD299] landscape card render failed', {
            seat, reason: error instanceof Error ? error.message : String(error),
        }));
    }

    /** XQP uses an 80 ms seat/card cadence and a 200 ms flight from DealPos. */
    private playDealTween(card: Node, seat: number, newCardIndex: number): void {
        const deal = this.path('Deal') ?? this.path('DealPos');
        if (!deal?.isValid || !card.isValid) return;
        const targetWorld = card.worldPosition.clone();
        const targetScale = card.scale.clone();
        const startWorld = deal.worldPosition.clone();
        card.setWorldPosition(startWorld);
        card.setScale(targetScale.x * 0.2, targetScale.y * 0.2, targetScale.z);
        const delay = (newCardIndex * 8 + seat) * 0.08;
        tween(card)
            .delay(delay)
            .to(0.2, { worldPosition: targetWorld, scale: targetScale })
            .call(() => {
                if (!card.isValid) return;
                // Avoid accumulated floating-point drift after repeated deals.
                card.setWorldPosition(new Vec3(targetWorld.x, targetWorld.y, targetWorld.z));
                card.setScale(targetScale);
            })
            .start();
    }

    public showCommitted(seat: number, value: number): void {
        const area = this.seat(seat).getChildByName('BetArea');
        if (area) area.active = value > 0;
        const label = area?.getChildByName('Num')?.getComponent(Label);
        if (label) label.string = String(value);
    }

    public showScore(seat: number, value: number): void {
        this.scores.set(seat, value);
        const head = this.headController(seat)?.node;
        const score = head?.getChildByPath('Game/Head/PlayerInfo/Lb_PlayerScore')?.getComponent(Label);
        if (score) score.string = String(value);
    }

    public showRoundDelta(seat: number, value: number): void {
        const settlement = this.seat(seat).getChildByName('SmallSettlementCent');
        const label = settlement?.getChildByName('WinNum')?.getComponent(Label);
        if (label) label.string = value > 0 ? `+${value}` : String(value);
        if (settlement) settlement.active = value !== 0;
    }

    public showBetAction(seat: number, action: import('./CD299Protocol').CD299BetAction | null): void {
        const root = this.seat(seat).getChildByName('OperationDisplay');
        if (!root) return;
        const actionNode: Readonly<Record<string, string>> = Object.freeze({
            DROP: 'Drop', FOLLOW: 'Follow', REST: 'Check', RAISE: 'Add', ALL_IN: 'Allin',
        });
        const next = action ? actionNode[action] ?? '' : '';
        for (const child of root.children) child.active = child.name === next;
        if (!next) {
            this.displayedBetActions.delete(seat);
            return;
        }
        if (this.displayedBetActions.get(seat) === next) return;
        this.displayedBetActions.set(seat, next);
        const node = root.getChildByName(next);
        if (!node) return;
        const target = node.scale.clone();
        node.setScale(target.x * 0.85, target.y * 0.85, target.z);
        tween(node).to(0.15, { scale: target }).start();
    }

    public showDropped(seat: number, dropped: boolean): void {
        const node = this.seat(seat).getChildByName('DropCard');
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

    public showSplitDeadline(seat: number, deadlineEpochMillis: number): void {
        if (deadlineEpochMillis > 0) this.splitDeadlines.set(seat, deadlineEpochMillis);
        else this.splitDeadlines.delete(seat);
        this.renderSplitDeadline(seat);
    }

    protected override update(): void {
        for (const seat of this.splitDeadlines.keys()) this.renderSplitDeadline(seat);
        for (const seat of this.operationDeadlines.keys()) this.renderOperationDeadline(seat);
    }

    public showOperationDeadline(seat: number, deadlineEpochMillis: number): void {
        if (deadlineEpochMillis > 0) this.operationDeadlines.set(seat, deadlineEpochMillis);
        else this.operationDeadlines.delete(seat);
        this.renderOperationDeadline(seat);
    }

    public showTotals(mangoTotal: number, betTotal: number): void {
        const mango = this.path('Middle/TotalCent/MangoNum');
        const bet = this.path('Middle/TotalCent/BetNum');
        const mangoLabel = mango?.getChildByName('Num')?.getComponent(Label);
        const betLabel = bet?.getChildByName('Num')?.getComponent(Label);
        if (mangoLabel) mangoLabel.string = String(mangoTotal);
        if (betLabel) betLabel.string = String(betTotal);
        if (mango) mango.active = mangoTotal > 0;
        if (bet) bet.active = betTotal > 0;
    }

    private renderOperationDeadline(seat: number): void {
        const deadline = this.operationDeadlines.get(seat) ?? 0;
        const seconds = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
        const liveDeadline = Math.max(0, ...this.operationDeadlines.values());
        const liveSeconds = Math.max(0, Math.ceil((liveDeadline - Date.now()) / 1000));
        const clock = this.path('Clock');
        if (clock) clock.active = liveDeadline > 0 && liveSeconds > 0;
        const label = clock?.getChildByName('Time')?.getComponent(Label);
        if (label) label.string = String(liveSeconds);
        const timer = this.seat(seat).getChildByName('CountDown');
        if (timer) timer.active = deadline > 0 && seconds > 0;
    }

    private renderSplitDeadline(seat: number): void {
        const node = this.seat(seat).getChildByName('FpCountDown');
        if (!node) return;
        const deadline = this.splitDeadlines.get(seat) ?? 0;
        const seconds = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
        node.active = deadline > 0 && seconds > 0;
        const label = node.getComponent(Label) ?? node.getChildByName('Time')?.getComponent(Label);
        if (label) label.string = String(seconds);
    }

    public setActions(actions: Readonly<CD299Actions>): void {
        this.currentActions = actions;
        console.info('[CD299] operation visibility applied', JSON.stringify({ roomId: this.roomId, ...actions }));
        // Gate the complete authored operation subtree as well as its groups.
        // This matches XQP's ClearWindow/turn-notice behaviour and prevents
        // authored child active flags from leaking on a non-operating client.
        this.visible('OperateBtn', actions.canPreset || actions.canBet || actions.canSplit);
        this.visible('OperateBtn/PresetBet', actions.canPreset);
        this.visible('OperateBtn/Bet', actions.canBet);
        this.visible('OperateBtn/Bet/Drop', actions.canBet && actions.betActions.includes('DROP'));
        this.visible('OperateBtn/Bet/Follow', actions.canBet
            && (actions.betActions.includes('FOLLOW') || actions.betActions.includes('REST')));
        // XQP uses one shared Follow/Check slot: Check (休) wins when legal,
        // otherwise the slot displays Follow. Activating both leaves the later
        // sibling on top and turns a visible Follow click into REST.
        const canRest = actions.canBet && actions.betActions.includes('REST');
        this.visible('OperateBtn/Bet/Follow/Follow', actions.canBet
            && actions.betActions.includes('FOLLOW') && !canRest);
        this.visible('OperateBtn/Bet/Follow/Check', canRest);
        const followLabel = this.path('OperateBtn/Bet/Follow/Follow/Num')?.getComponent(Label);
        if (followLabel) followLabel.string = String(actions.followAmount);
        this.visible('OperateBtn/Bet/Add', actions.canBet
            && (actions.betActions.includes('RAISE') || actions.betActions.includes('ALL_IN')));
        // XQP gives the raise panel priority. The standalone All-in button is
        // only shown when raising is unavailable; unaffordable quick targets
        // inside the raise panel still submit ALL_IN through submitQuickRaise.
        const canRaise = actions.canBet && actions.betActions.includes('RAISE');
        this.visible('OperateBtn/Bet/Add/AllIn', actions.canBet
            && actions.betActions.includes('ALL_IN') && !canRaise);
        this.visible('OperateBtn/Bet/Add/Add', canRaise);
        actions.quickRaiseTargets.forEach((amount, index) => {
            const node = this.path(`OperateBtn/Bet/Add/Add/Fast/${index + 1}`);
            const label = node?.getChildByName('Num')?.getComponent(Label);
            if (label) label.string = String(amount);
            if (node) node.active = canRaise;
        });
        this.visible('OperateBtn/SplitPoker', actions.canSplit);
        if (!actions.canSplit) this.clearSplitSelection();
        this.splitSelectionEnabled = actions.canSplit;
        // FangHuoPai is an XQP status marker. Dealing is server-authoritative,
        // so it must never become a clickable manual "add card" command.
        this.visible('FangHuoPai', false);
        this.commonVisible('WaitingActions/Btn_Start', actions.canContinue);
    }

    private hideAllActions(): void {
        const operateBtn = this.path('OperateBtn');
        if (operateBtn) {
            for (const child of operateBtn.children) child.active = false;
        }
        this.visible('FangHuoPai', false);
        this.commonVisible('WaitingActions/Btn_Start', false);
        this.splitSelectionEnabled = false;
        this.clearSplitSelection();
    }

    /** XQP hides the bet panel at click time, before waiting for the reply. */
    private submitBet(action: 'DROP' | 'FOLLOW' | 'REST' | 'ALL_IN' | 'RAISE', amount: number): void {
        this.visible('OperateBtn/Bet', false);
        this.controller?.bet(action, amount);
    }

    /** XQP quick raises display a target total; an unaffordable target becomes 敲. */
    private submitQuickRaise(index: number): Promise<boolean> {
        const actions = this.currentActions;
        const target = actions?.quickRaiseTargets[index];
        if (!actions || target === undefined) return Promise.resolve(false);
        const action = target - actions.currentBet > actions.availableScore ? 'ALL_IN' : 'RAISE';
        this.submitBet(action, action === 'RAISE' ? target : 0);
        return Promise.resolve(true);
    }

    private seat(index: number): Node {
        const node = this.path(`Players/${index}`);
        if (!node) throw new Error(`[CD299] fixed landscape seat=${index} missing`);
        return node;
    }

    private runtimeCardLayer(parent: Node): Node {
        const existing = parent.getChildByName('RuntimeCards');
        if (existing) return existing;
        const layer = new Node('RuntimeCards');
        layer.layer = parent.layer;
        layer.addComponent(UITransform).setContentSize(160, 100);
        parent.addChild(layer);
        return layer;
    }

    private splitSelectionEnabled = false;

    private toggleSplitCard(rawCard: number): void {
        const selectedIndex = this.selectedSplitCards.indexOf(rawCard);
        if (selectedIndex >= 0) this.selectedSplitCards.splice(selectedIndex, 1);
        else if (this.selectedSplitCards.length < 2) this.selectedSplitCards.push(rawCard);
        else return;
        for (const [cardValue, node] of this.localCardNodes) {
            this.cardFactory.setSelected(node, this.selectedSplitCards.includes(cardValue));
        }
        this.renderSplitSelection();
    }

    private renderSplitSelection(): void {
        const cardsRoot = this.path('OperateBtn/SplitPoker/Pokers');
        if (!cardsRoot) return;
        for (let index = 0; index < 2; index += 1) {
            const slot = cardsRoot.getChildByName(String(index));
            if (!slot) continue;
            const runtime = this.runtimeCardLayer(slot);
            this.cardFactory.clear(runtime);
            const value = this.selectedSplitCards[index];
            if (value === undefined) continue;
            void this.cardFactory.create(runtime, value, Poker_Card_Face.Front).then(card => {
                this.scaleCardTo(card, 100, 129);
            }).catch(error => console.error('[CD299] split card render failed', {
                roomId: this.roomId, card: value,
                reason: error instanceof Error ? error.message : String(error),
            }));
        }
        const headLabel = this.path('OperateBtn/SplitPoker/TopType/Name')?.getComponent(Label);
        if (headLabel) headLabel.string = this.selectedSplitCards.length === 2 ? '头道已选' : `请选择${2 - this.selectedSplitCards.length}张`;
    }

    private clearSplitSelection(): void {
        if (this.selectedSplitCards.length === 0) return;
        this.selectedSplitCards.length = 0;
        for (const node of this.localCardNodes.values()) {
            if (node.isValid) this.cardFactory.setSelected(node, false);
        }
        this.renderSplitSelection();
    }

    private submitSplit(): Promise<boolean> {
        if (!this.controller || this.selectedSplitCards.length !== 2) {
            console.warn('[CD299] split submit rejected: exactly two head cards required', {
                roomId: this.roomId, selectedCount: this.selectedSplitCards.length,
            });
            return Promise.resolve(false);
        }
        // The authoritative hand is the protocol source of truth. Rendering may
        // legitimately lag or fail for a skin-only special card (for example
        // XQP's 506 earth-nine king); it must never truncate a split request.
        const localCards = [...this.localHandCards];
        const selected = [...this.selectedSplitCards];
        const ordered = [...selected, ...localCards.filter(card => !selected.includes(card))];
        return this.controller.split(ordered);
    }

    /** Poker_Card 的子 Sprite 使用 169×233 原始尺寸，必须缩放整棵节点才能得到 XQP 的真实视觉尺寸。 */
    private scaleCardTo(card: Node, width: number, height: number): void {
        const size = card.getComponent(UITransform)?.contentSize;
        if (!size || size.width <= 0 || size.height <= 0) {
            throw new Error(`[CD299] invalid Poker_Card source size for ${card.name}`);
        }
        card.setScale(width / size.width, height / size.height, 1);
    }

    private bind(node: Node | null, action: () => unknown): void {
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

    private commonPath(path: string): Node | null { return this.commonRoom?.getChildByPath(path) ?? null; }

    private commonVisible(path: string, active: boolean): void {
        const node = this.commonPath(path);
        if (node) node.active = active;
    }

    private commonLabel(path: string, value: string): void {
        const label = this.commonPath(path)?.getComponent(Label);
        if (label) label.string = value;
    }

    private bindCommon(path: string, action: () => void): void {
        const node = this.commonPath(path);
        if (!node) return;
        const button = node.getComponent(Button) ?? node.addComponent(Button);
        const listener = (): void => { if (button.interactable) action(); };
        node.on(Button.EventType.CLICK, listener, this);
        this.commandDisposers.push(() => node.off(Button.EventType.CLICK, listener, this));
    }

    private ensureHeadMount(seat: Node): Node {
        const existing = seat.getChildByName('Head');
        if (existing) return existing;
        const mount = new Node('Head');
        mount.layer = seat.layer;
        mount.addComponent(UITransform).setContentSize(112, 112);
        seat.addChild(mount);
        mount.setPosition(0, 0, 10);
        return mount;
    }

    private async renderHead(seat: number, playerId: number | null): Promise<void> {
        const generation = (this.headGenerations.get(seat) ?? 0) + 1;
        this.headGenerations.set(seat, generation);
        const mount = this.ensureHeadMount(this.seat(seat));
        let head = mount.getChildByName('CommonHead');
        if (!head) {
            const prefab = await this.loadCommonHead();
            if (this.headGenerations.get(seat) !== generation || !mount.isValid) return;
            head = instantiate(prefab);
            mount.addChild(head);
            // CommonHead's root UITransform is intentionally 0×0; measuring
            // that root cannot size the visible avatar. XQP's authoritative
            // eight-seat shell uses a 90×90 head, while Aoo CommonHead authors
            // its visible Head at 80 px. Scale from those authored values so
            // avatar, name and score retain one coherent geometry.
            const scale = XQP_HEAD_SIZE / AOO_COMMON_HEAD_SIZE;
            head.setScale(scale, scale, 1);
        }
        const controller = head.getComponent(CommonHeadController);
        if (!controller) throw new Error('[CD299] CommonHead missing controller');
        this.bindSeatTarget(head, seat, this.sittableSeats.has(seat));
        controller.showGamePlayer(playerId !== null);
        controller.showReady(Boolean(this.readySeats.get(seat)));
        const name = head.getChildByPath('Game/Head/PlayerInfo/Lb_PlayerName')?.getComponent(Label);
        const score = head.getChildByPath('Game/Head/PlayerInfo/Lb_PlayerScore')?.getComponent(Label);
        if (name) name.string = playerId === null ? '' : `玩家${playerId}`;
        if (score) score.string = playerId === null ? '' : String(this.scores.get(seat) ?? 0);
        if (playerId !== null) await controller.showPlayerAvatar(playerId);
    }

    private headController(seat: number): CommonHeadController | null {
        return this.seat(seat).getChildByPath('Head/CommonHead')?.getComponent(CommonHeadController) ?? null;
    }

    private bindSeatTarget(target: Node, seat: number, canSit: boolean): void {
        const button = target.getComponent(Button) ?? target.addComponent(Button);
        target.off(Button.EventType.CLICK, undefined, this);
        target.off(Node.EventType.TOUCH_END, undefined, this);
        button.interactable = canSit;
        if (!canSit) return;
        target.on(Node.EventType.TOUCH_END, () => {
            console.info('[CD299] seat click', { roomId: this.roomId, seat });
            void this.openAddCentWindow(seat);
        }, this);
    }

    private async openAddCentWindow(seat: number): Promise<void> {
        if (!this.sittableSeats.has(seat) || !this.controller) return;
        this.closeAddCentWindow();
        try {
            const prefab = await this.loadAddCentWindow();
            if (!this.sittableSeats.has(seat) || !this.controller || !this.node.isValid) return;
            const window = instantiate(prefab);
            window.name = `ChessRoomAddCentWindow_${seat}`;
            // Mount inside the authored 1280×720 room root. The form container's
            // origin is not the game-screen centre, so mounting as its sibling
            // shifts a nominal (0, 0) popup toward the upper-right in browsers.
            this.node.addChild(window);
            window.setPosition(0, 0, 100);
            window.setScale(1, 1, 1);
            this.addCentWindow = window;
            this.configureAddCentWindow(window);
            this.bindPopupButton(window.getChildByPath('Popup/Tag/Close'), () => this.closeAddCentWindow());
            const scoreInput = window.getChildByPath('Add/Num');
            if (!scoreInput) throw new Error('[CD299] add-cent score input missing');
            scoreInput.on(Node.EventType.TOUCH_END, () => {
                console.info('[CD299] carry score editor requested', { roomId: this.roomId, seat });
                void this.openCarryScoreNumpad(window).catch(error => console.error('[CD299] carry score editor failed', {
                    roomId: this.roomId, seat, reason: error instanceof Error ? error.message : String(error),
                }));
            }, this);
            this.bindPopupButton(window.getChildByPath('Add/Btns/Sure'), () => {
                if (!this.sittableSeats.has(seat)) return this.closeAddCentWindow();
                const carryScore = this.popupCarryScore(window);
                console.info('[CD299] add-cent confirmed', { roomId: this.roomId, seat, carryScore });
                void this.controller?.sit(seat, carryScore);
                this.closeAddCentWindow();
            });
            console.info('[CD299] add-cent opened', {
                roomId: this.roomId,
                seat,
                parent: window.parent?.name ?? '',
                localPosition: { x: window.position.x, y: window.position.y, z: window.position.z },
                worldPosition: { x: window.worldPosition.x, y: window.worldPosition.y, z: window.worldPosition.z },
            });
        } catch (error: unknown) {
            console.error('[CD299] add-cent open failed', {
                roomId: this.roomId,
                seat,
                reason: error instanceof Error ? error.message : String(error),
            });
        }
    }

    private closeAddCentWindow(): void {
        this.addCentNumpad?.dispose();
        this.addCentNumpad = null;
        if (this.addCentWindow?.isValid) this.addCentWindow.destroy();
        this.addCentWindow = null;
    }

    /** Reproduces XQP's runtime-generated carry presets without changing the shared prefab. */
    private configureAddCentWindow(window: Node): void {
        const add = window.getChildByName('Add');
        const template = add?.getChildByPath('Clone/Btn') ?? null;
        const label = add?.getChildByPath('Num/Num')?.getComponent(Label) ?? null;
        if (!add || !template || !label) throw new Error('[CD299] add-cent preset template unavailable');
        label.string = '100';
        template.active = false;
        const origin = template.position.clone();
        const presets = [100, 200, 300, 400, 500] as const;
        presets.forEach((amount, index) => {
            const button = instantiate(template);
            button.name = String(amount);
            button.setPosition(new Vec3(origin.x + (index % 3) * 160,
                origin.y - Math.floor(index / 3) * 85 - 70, origin.z));
            const value = button.getChildByName('Num')?.getComponent(Label);
            if (value) value.string = String(amount);
            button.active = true;
            add.addChild(button);
            this.bindPopupButton(button, () => {
                const current = this.popupCarryScore(window);
                label.string = String(Math.min(1_000_000_000, current + amount));
            });
        });
        const reset = instantiate(template);
        reset.name = 'ResetAddNum';
        reset.setPosition(new Vec3(origin.x + 2 * 160, origin.y - 85 - 70, origin.z));
        const resetLabel = reset.getChildByName('Num')?.getComponent(Label);
        if (resetLabel) resetLabel.string = '重置';
        reset.active = true;
        add.addChild(reset);
        this.bindPopupButton(reset, () => { label.string = '100'; });
        this.bindPopupButton(add.getChildByPath('Btns/Max'), () => { label.string = '10000000'; });
        const countDown = add.getChildByPath('CountDown');
        if (countDown) countDown.active = true;
        const countDownLabel = countDown?.getChildByName('Num')?.getComponent(Label);
        if (countDownLabel) countDownLabel.string = '120秒';
    }

    private async openCarryScoreNumpad(window: Node): Promise<void> {
        const label = window.getChildByPath('Add/Num/Num')?.getComponent(Label);
        if (!label || !window.isValid) throw new Error('[CD299] carry score label unavailable');
        this.addCentNumpad?.dispose();
        let value = label.string.replace(/[^0-9]/g, '');
        const close = (): void => { this.addCentNumpad?.dispose(); this.addCentNumpad = null; };
        const handle = await this.numpadService.open(window, () => this.loadNumpad(), { close, confirm: close }, {
            digitCount: 10, maxDigits: 10, value: () => value,
            setValue: next => { value = next; label.string = next || '0'; },
        }, { title: '携带积分' });
        if (!handle) throw new Error('[CD299] carry score numpad unavailable');
        this.addCentNumpad = handle;
        console.info('[CD299] carry score editor opened', { roomId: this.roomId });
    }

    private loadNumpad(): Promise<Prefab | null> {
        const asset = resolveCommonNumpadAsset(NUMPAD_ASSET);
        if (!asset) throw new Error('[CD299] common numpad asset unresolved');
        return new Promise((resolve, reject) => {
            const load = (bundle: ReturnType<typeof assetManager.getBundle>): void => {
                if (!bundle) return reject(new Error('[CD299] common numpad bundle unavailable'));
                bundle.load(asset, Prefab, (error, prefab) => error ? reject(error) : resolve(prefab ?? null));
            };
            const bundle = assetManager.getBundle(COMMON_ASSET_BUNDLE);
            if (bundle) load(bundle);
            else assetManager.loadBundle(COMMON_ASSET_BUNDLE, (error, loaded) => error ? reject(error) : load(loaded));
        });
    }

    private popupCarryScore(window: Node): number {
        const text = window.getChildByPath('Add/Num/Num')?.getComponent(Label)?.string.trim() ?? '';
        const carryScore = Number(text.replace(/[^0-9]/g, ''));
        if (!Number.isSafeInteger(carryScore) || carryScore < 0 || carryScore > 1_000_000_000) {
            throw new Error(`[CD299] invalid popup carry score roomId=${this.roomId} value=${text}`);
        }
        return carryScore;
    }

    private bindPopupButton(node: Node | null, action: () => void): void {
        if (!node) throw new Error('[CD299] add-cent prefab button missing');
        const button = node.getComponent(Button) ?? node.addComponent(Button);
        button.interactable = true;
        node.on(Button.EventType.CLICK, action, this);
    }

    private loadCommonHead(): Promise<Prefab> {
        if (this.commonHeadPrefab) return this.commonHeadPrefab;
        this.commonHeadPrefab = new Promise((resolve, reject) => {
            const load = (bundle: ReturnType<typeof assetManager.getBundle>): void => {
                if (!bundle) return reject(new Error('[CD299] common bundle unavailable'));
                bundle.load('Prefab/CommonHead', Prefab, (error, prefab) => error || !prefab
                    ? reject(error ?? new Error('[CD299] CommonHead unavailable')) : resolve(prefab));
            };
            const bundle = assetManager.getBundle('common');
            if (bundle) load(bundle);
            else assetManager.loadBundle('common', (error, loaded) => error ? reject(error) : load(loaded));
        });
        return this.commonHeadPrefab;
    }

    private loadAddCentWindow(): Promise<Prefab> {
        if (this.addCentPrefab) return this.addCentPrefab;
        this.addCentPrefab = new Promise((resolve, reject) => {
            const load = (bundle: ReturnType<typeof assetManager.getBundle>): void => {
                if (!bundle) return reject(new Error('[CD299] poker-cx bundle unavailable'));
                bundle.load('Common/Prefab/ChessRoomAddCentWindow', Prefab, (error, prefab) =>
                    error || !prefab
                        ? reject(error ?? new Error('[CD299] ChessRoomAddCentWindow unavailable'))
                        : resolve(prefab));
            };
            const bundle = assetManager.getBundle('poker-cx');
            if (bundle) load(bundle);
            else assetManager.loadBundle('poker-cx', (error, loaded) => error ? reject(error) : load(loaded));
        });
        return this.addCentPrefab;
    }

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
