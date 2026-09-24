import { _decorator, assetManager, Button, Component, EventTouch, instantiate, Label, Layout, Node, Prefab, sp, Sprite, SpriteAtlas, SpriteFrame, tween, Tween, UITransform, Vec3, Widget } from 'cc';
import { CommonHeadController } from '../../../../../Common/Code/UI/CommonHeadController';
import { NumpadHandle, NumpadService } from '../../../../../Common/Code/Runtime/ui/NumpadService';
import { COMMON_ASSET_BUNDLE, NUMPAD_ASSET, resolveCommonNumpadAsset } from '../../../../../Common/Code/Runtime/ui/CommonPrefabRegistry';
import { Poker_Card_Face } from '../../../Common/Code/Card/Poker_Card_Presenter';
import { Poker_Card_Factory } from '../../../Common/Code/Card/Poker_Card_Factory';
import { settlementTemplateResolver } from '../../../../Common/Code/Settlement/SettlementTemplateResolver';
import { CD299Actions, CD299RoomView, CD299SettlementChip } from './CD299RoomPresenter';
import { CD299Phase, CD299Snapshot } from './CD299RoomState';
import { cd299PairTypeLabel } from './CD299PairTypeLabels';
import { CD299RoomAudioPresenter } from './CD299RoomAudioPresenter';
import type { CD299RuntimeController } from './CD299RuntimeController';

const { ccclass } = _decorator;
const XQP_ROOM_BACKGROUND = 'CD299/Art/XqpRoomBackground/spriteFrame';
const XQP_CARD_FACES = 'CD299/Art/PokerFront_0Trends';
const XQP_COMMON_STATIC = 'CD299/Art/CxCommonStatic';
const XQP_BANKER_BADGE = 'icon_zhuang';
const XQP_BET_EFFECTS = Object.freeze({
    RAISE: { asset: 'CD299/Spine/Add/add', animation: 'ren_wu_jiangli_tishi_loop', scale: new Vec3(0.6, 0.6, 1), node: 'BetAnim_4' },
    ALL_IN: { asset: 'CD299/Spine/Allin/allin', animation: 'dz_mptx_huo', scale: new Vec3(1, 0.8, 1), node: 'BetAnim_5' },
});
const LANDSCAPE_DESIGN_WIDTH = 1280;
const LANDSCAPE_DESIGN_HEIGHT = 720;
const PHASE_TEXT: Readonly<Record<CD299Phase, string>> = Object.freeze({
    WAITING: '等待玩家坐下', BASE_AND_MANGO: '选择底分和芒数', DEALING: '发牌', BETTING: '下注',
    ADD_CARD: '补牌', SPLITTING: '分牌', REVEAL: '开牌', ROUND_SETTLEMENT: '本局结算', FINISHED: '牌局结束',
});

// The gameplay layer is recreated when a waiting room enters its first live
// round. Preserve that room-level transition across the component recreation;
// a page reload starts a fresh module and therefore does not replay an opening
// animation while recovering into the middle of an existing hand.
let observedRoomRound: Readonly<{ roomId: number; round: number }> | null = null;

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
    private readonly bankerSeats = new Set<number>();
    private readonly sittableSeats = new Set<number>();
    private readonly localCardNodes = new Map<number, Node>();
    private readonly renderedCardCounts = new Map<number, number>();
    private readonly displayedCommitted = new Map<number, number>();
    private readonly selectedSplitCards: number[] = [];
    private readonly splitDeadlines = new Map<number, number>();
    private readonly operationDeadlines = new Map<number, number>();
    private readonly seatRetentionDeadlines = new Map<number, number>();
    private openedRebuyDeadline = 0;
    private readonly displayedBetActions = new Map<number, string>();
    private readonly operationDisplayOrigins = new Map<number, Vec3>();
    private readonly displayedDroppedSeats = new Map<number, boolean>();
    private readonly droppingSeats = new Set<number>();
    private currentRound = 0;
    private currentPhase: CD299Phase = 'WAITING';
    private lastDealSoundRound = -1;
    private localHandCards: readonly number[] = [];
    private earthNineKing: boolean | null = null;
    private commonHeadPrefab: Promise<Prefab> | null = null;
    private cardFaceAtlas: Promise<SpriteAtlas> | null = null;
    private commonStaticAtlas: Promise<SpriteAtlas> | null = null;
    private addCentPrefab: Promise<Prefab> | null = null;
    private addCentWindow: Node | null = null;
    private reservedSeat: number | null = null;
    private seatReservationPending: number | null = null;
    private addCentNumpad: NumpadHandle | null = null;
    private readonly numpadService = new NumpadService();
    private commonRoom: Node | null = null;
    private roomId = 0;
    private controller: CD299RuntimeController | null = null;
    private currentActions: Readonly<CD299Actions> | null = null;
    private finalSettlement: Node | null = null;
    private finalSettlementVersion = -1;
    private terminalExpiryHandled = false;
    private terminalCountdownTimer: ReturnType<typeof setInterval> | null = null;
    private audio: CD299RoomAudioPresenter | null = null;
    private openingAnimationRound = -1;
    private openingAnimationTimer: ReturnType<typeof setTimeout> | null = null;
    private openingAnimationActive = false;
    private openingAnimationEndsAt = 0;
    private pendingActions: Readonly<CD299Actions> | null = null;
    private readonly openingAnimatedSeats = new Set<number>();
    private settlementAnimationGeneration = 0;
    private readonly authoredSplitBackFrames = new WeakMap<Sprite, SpriteFrame | null>();
    private raiseSliderStartY = 0;
    private raiseSliderMaxY = 0;
    private raiseSliderAmount = 0;

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
        this.audio?.destroy();
        this.audio = new CD299RoomAudioPresenter(this.node);
        void this.audio.playMusic();
        this.commonLabel('RoomInfo/Lb_RoomId', `房间号：${roomId}`);
        this.commonVisible('WaitingActions/Btn_Ready', false);
        this.commonVisible('WaitingActions/Btn_Start', false);
        this.commonVisible('RubCard', false);
        this.commonVisible('CardCounter/Bg_CardCounter', false);
        this.commonVisible('CardCounter/HorizontalLine', false);
        this.commonVisible('CardCounter/VerticalLines', false);
        this.commonVisible('CardCounter/RankLabels', false);
        this.commonVisible('CardCounter/CountLabels', false);
        // XQP's 1280x720 common shell owns these exact anchor positions.
        // Reposition only the instantiated CD299 shell; CommonRoom remains
        // untouched for every other game.
        this.commonPosition('RoomInfo', -160, 340);
        this.commonPosition('Btn/Btn_Back', -550, 280);
        this.commonPosition('Btn/Btn_More', -450, 280);
        this.commonPosition('Btn/Btn_SmallSettlement', 450, 280);
        this.commonPosition('Btn/Btn_Gps', 550, 280);
        this.commonPosition('Btn/Btn_Chat', 552, -236);
        this.commonVisible('Btn/Btn_Voice', false);
        this.commonPosition('Btn/RealTimeRecord', -550, -250);
        this.commonPosition('Btn/RubCard', -450, -250);
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
            const rules = this.path('RuleDisplay');
            if (rules) rules.active = !rules.active;
        });
        this.bind(this.path('Actions/PresetOptions/Preset_1'), () => controller.preset(1));
        this.bind(this.path('Actions/PresetOptions/Preset_2'), () => controller.preset(2));
        this.bind(this.path('Actions/BetActions/Btn_Drop'), () => this.submitBet('DROP', 0));
        this.bind(this.path('Actions/BetActions/Btn_FollowOrRest/Btn_Follow'), () => this.submitBet('FOLLOW', 0));
        this.bind(this.path('Actions/BetActions/Btn_FollowOrRest/Btn_Rest'), () => this.submitBet('REST', 0));
        this.bind(this.path('Actions/BetActions/Btn_Raise/Btn_AllIn'), () => this.submitBet('ALL_IN', 0));
        // The authored shortcut's full-size Mask child has its own Button and
        // wins the hit-test; Button.CLICK does not bubble to the parent Button.
        this.bind(this.path('Actions/BetActions/Btn_Raise/RaiseOptions/QuickRaiseOptions/Btn_RaiseOption_1/Btn_Select'), () => this.submitQuickRaise(0));
        this.bind(this.path('Actions/BetActions/Btn_Raise/RaiseOptions/QuickRaiseOptions/Btn_RaiseOption_2/Btn_Select'), () => this.submitQuickRaise(1));
        this.bind(this.path('Actions/BetActions/Btn_Raise/RaiseOptions/QuickRaiseOptions/Btn_RaiseOption_3/Btn_Select'), () => this.submitQuickRaise(2));
        this.bindRaiseSlider();
        this.bind(this.path('Actions/SplitActions/Btn_Confirm'), () => this.submitSplit());
        this.bind(this.path('Actions/SplitActions/Btn_Delay'), () => controller.delaySplit());
        this.commonVisible('WaitingActions/Btn_Start', false);
        return () => this.unbindController();
    }

    public unbindController(): void {
        for (const dispose of this.commandDisposers.splice(0)) dispose();
        this.controller = null;
    }

    protected override onDestroy(): void {
        if (this.terminalCountdownTimer !== null) clearInterval(this.terminalCountdownTimer);
        if (this.openingAnimationTimer !== null) clearTimeout(this.openingAnimationTimer);
        this.closeAddCentWindow();
        this.audio?.destroy();
        this.audio = null;
        this.unbindController();
    }

    public showPhase(phase: CD299Phase, round: number, roundLimit: number, roomEndText?: string): void {
        this.currentPhase = phase;
        const observedRound = observedRoomRound?.roomId === this.roomId ? observedRoomRound.round : undefined;
        const changedRound = round > 0 && observedRound !== undefined && round !== observedRound;
        this.currentRound = round;
        observedRoomRound = { roomId: this.roomId, round };
        const label = this.find('GameState')?.getComponent(Label) ?? this.find('Phase')?.getComponent(Label);
        if (label) label.string = `第${round}局 · ${PHASE_TEXT[phase]}`;
        this.commonLabel('RoomInfo/Lb_Round', roomEndText ?? `局数：${round}/${roundLimit}`);
        if (changedRound) this.beginOpeningAnimation(round);
    }

    private beginOpeningAnimation(round: number): void {
        this.openingAnimationRound = round;
        this.openingAnimatedSeats.clear();
        this.openingAnimationActive = true;
        this.openingAnimationEndsAt = Date.now() + 1500;
        if (this.openingAnimationTimer !== null) clearTimeout(this.openingAnimationTimer);
        for (let seat = 0; seat < 8; seat += 1) {
            const player = this.seat(seat);
            const hand = player.getChildByName('Hand');
            const added = player.getChildByName('AddedCards');
            if (hand) hand.active = false;
            if (added) added.active = false;
            const betArea = player.getChildByName('Bet');
            if (betArea) betArea.active = false;
        }
        this.visible('Center/TotalScores/MangoScore', false);
        this.visible('Center/TotalScores/BetScore', false);
        this.hideAllActions();
        this.openingAnimationTimer = setTimeout(() => {
            this.openingAnimationTimer = null;
            this.openingAnimationActive = false;
            this.openingAnimationEndsAt = 0;
            for (let seat = 0; seat < 8; seat += 1) {
                const player = this.seat(seat);
                const divided = player.getChildByName('Split')?.active ?? false;
                const hand = player.getChildByName('Hand');
                const added = player.getChildByName('AddedCards');
                if (hand) hand.active = !divided;
                if (added) added.active = !divided;
            }
            const actions = this.pendingActions;
            this.pendingActions = null;
            if (actions) this.setActions(actions);
        }, 1500);
    }

    public showFinalSettlement(snapshot: CD299Snapshot): void {
        if (snapshot.phase !== 'FINISHED') {
            if (this.terminalCountdownTimer !== null) clearInterval(this.terminalCountdownTimer);
            this.terminalCountdownTimer = null;
            this.finalSettlementVersion = -1;
            this.terminalExpiryHandled = false;
            this.finalSettlement?.destroy();
            this.finalSettlement = null;
            return;
        }
        if (this.finalSettlementVersion === snapshot.stateVersion) return;
        this.finalSettlementVersion = snapshot.stateVersion;
        void this.mountFinalSettlement(snapshot).catch((error: unknown) => {
            if (this.finalSettlementVersion === snapshot.stateVersion) this.finalSettlementVersion = -1;
            console.error('[CD299] final settlement render failed', {
                roomId: snapshot.roomId, stateVersion: snapshot.stateVersion,
                reason: error instanceof Error ? error.message : String(error),
            });
        });
    }

    private async mountFinalSettlement(snapshot: CD299Snapshot): Promise<void> {
        const { route, prefab } = await settlementTemplateResolver.load({
            gameId: 'CD299', playFamily: 'poker:cd299', settlementType: 'LOOP_BIG',
            playVersion: 'cd299-v1.0.0', traceId: `cd299-${snapshot.roomId}-${snapshot.stateVersion}`,
        });
        if (!this.node.isValid || this.finalSettlementVersion !== snapshot.stateVersion) return;
        this.finalSettlement?.destroy();
        this.terminalExpiryHandled = false;
        const result = instantiate(prefab);
        result.name = 'CD299FinalSettlement';
        this.setLayerRecursively(result, this.node.layer);
        this.node.addChild(result);
        result.setPosition(0, 0, 100);
        this.finalSettlement = result;
        const panel = result.getChildByPath('FinalSettlementPanel');
        const topBar = panel?.getChildByName('TopBar');
        const winner = panel?.getChildByName('BestWinnerPanel');
        const winnerHead = winner?.getChildByName('BestWinnerHead');
        const winnerScore = winner?.getChildByName('BestWinnerScoreLabel');
        const bottomBar = panel?.getChildByName('BottomBar');
        // XQP ChessRoomLoopBigSettlementWindow authors one local-player card at
        // Player(0,30): Head(0,50), Score(0,-30), retention(0,-100), with the
        // two actions at Bottom(0,-190).  The shared poker big-settlement
        // template defaults to a multi-player MVP layout, so project this
        // CD299 instance onto the authoritative loop-settlement geometry.
        topBar?.setPosition(-50, 200);
        winner?.setPosition(-50, 30);
        winnerHead?.setPosition(0, 50);
        winnerScore?.setPosition(0, -30);
        bottomBar?.setPosition(-50, -190);
        const winnerLogo = winner?.getChildByName('WinnerLogo');
        if (winnerLogo) winnerLogo.active = false;
        this.resultLabel(result, 'FinalSettlementPanel/TopBar/RoomIdLabel', '本局成绩');
        const countdownPath = 'FinalSettlementPanel/TopBar/RoundCountLabel';
        const countdown = result.getChildByPath(countdownPath);
        if (countdown && winner) {
            countdown.removeFromParent();
            winner.addChild(countdown);
            countdown.setPosition(0, -100);
            countdown.getComponent(UITransform)?.setContentSize(230, 38);
        }
        const renderCountdown = (): void => {
            const remaining = snapshot.terminalDeadlineEpochMillis - Date.now();
            const label = countdown?.getComponent(Label);
            if (label) label.string = `留座时间：${Math.max(0,
                Math.ceil(remaining / 1000))}秒`;
            if (remaining <= 0) this.handleTerminalExpiry(snapshot);
        };
        if (this.terminalCountdownTimer !== null) clearInterval(this.terminalCountdownTimer);
        this.terminalCountdownTimer = setInterval(renderCountdown, 1000);
        // Arm before the immediate render so an already-expired restored
        // snapshot can clear the interval in handleTerminalExpiry without a
        // new timer being assigned after cleanup.
        renderCountdown();
        this.resultLabel(result, 'FinalSettlementPanel/TopBar/EndTimeLabel', new Date().toLocaleString());
        const seated = Object.entries(snapshot.players)
            .map(([seat, playerId]) => {
                const seatId = Number(seat);
                const score = snapshot.scores[seatId] ?? 0;
                return { seat: seatId, playerId, score, delta: score - (snapshot.carryScores[seatId] ?? 0) };
            })
            .filter(entry => entry.playerId > 0);
        const local = seated.find(entry => entry.seat === snapshot.viewerSeat) ?? null;
        if (local) {
            this.resultLabel(result, 'FinalSettlementPanel/BestWinnerPanel/BestWinnerHead/NickNameBackground/BestWinnerNameLabel', `玩家${local.playerId}`);
            this.resultLabel(result, 'FinalSettlementPanel/BestWinnerPanel/BestWinnerScoreLabel', local.delta >= 0 ? `+${local.delta}` : String(local.delta));
            const sourceAvatar = this.seat(0).getChildByPath(
                'Head/CommonHead/Game/Head/RoundAvatar/Mask/Img_Avatar')?.getComponent(Sprite)
                ?? this.seat(0).getChildByPath(
                    'Head/CommonHead/Game/Head/SquareAvatar/Img_Avatar')?.getComponent(Sprite);
            const targetAvatar = winnerHead?.getChildByPath('AvatarSquare/AvatarMask/AvatarImage')?.getComponent(Sprite);
            if (sourceAvatar?.spriteFrame && targetAvatar) targetAvatar.spriteFrame = sourceAvatar.spriteFrame;
        }
        const content = result.getChildByPath('FinalSettlementPanel/PlayerList/PlayerListView/PlayerListContent');
        const template = content?.getChildByName('PlayerItemTemplate');
        if (content) content.parent!.parent!.active = false;
        const normal = result.getChildByPath('FinalSettlementPanel/BottomBar/NormalActions');
        const finished = result.getChildByPath('FinalSettlementPanel/BottomBar/FinishedActions');
        if (normal) normal.active = true;
        if (finished) finished.active = false;
        const stand = result.getChildByPath('FinalSettlementPanel/BottomBar/NormalActions/Btn_ReturnLobby');
        const continueGame = result.getChildByPath('FinalSettlementPanel/BottomBar/NormalActions/Btn_Continue');
        const share = result.getChildByPath('FinalSettlementPanel/BottomBar/NormalActions/Btn_ShareMore');
        if (share) share.active = false;
        this.resultLabel(result, 'FinalSettlementPanel/BottomBar/NormalActions/Btn_ReturnLobby/ReturnLobbyLabel', '站起离桌');
        this.resultLabel(result, 'FinalSettlementPanel/BottomBar/NormalActions/Btn_Continue/ContinueLabel', '继续游戏');
        // Standing changes the viewer into a spectator of the same room. Exiting is
        // a separate subsequent back action, so a successful stand must not replay
        // the shared back button and immediately remove the spectator from the room.
        this.bindFinalAction(stand, () => this.controller?.stand() ?? Promise.resolve(false), true);
        this.bindFinalAction(continueGame, () => this.openRestartCarryWindow(snapshot.viewerSeat), false);
        console.info('[CD299] final settlement displayed', {
            roomId: snapshot.roomId, stateVersion: snapshot.stateVersion,
            template: `${route.bundleName}/${route.assetPath ?? route.templateId}`,
            playerCount: seated.length, viewerSeat: snapshot.viewerSeat,
            viewerPlayerId: snapshot.players[snapshot.viewerSeat] ?? 0,
            authorityResults: seated,
        });
    }

    private handleTerminalExpiry(snapshot: CD299Snapshot): void {
        if (this.terminalExpiryHandled || this.finalSettlementVersion !== snapshot.stateVersion) return;
        this.terminalExpiryHandled = true;
        if (this.terminalCountdownTimer !== null) clearInterval(this.terminalCountdownTimer);
        this.terminalCountdownTimer = null;
        this.closeAddCentWindow();
        const continueGame = this.finalSettlement?.getChildByPath(
            'FinalSettlementPanel/BottomBar/NormalActions/Btn_Continue')?.getComponent(Button);
        if (continueGame) continueGame.interactable = false;
        console.info('[CD299] terminal retention expired; returning through room exit', {
            roomId: snapshot.roomId, playerId: snapshot.players[snapshot.viewerSeat] ?? 0,
            stateVersion: snapshot.stateVersion,
        });
        this.commonRoom?.getChildByPath('Btn/Btn_Back')?.emit(Button.EventType.CLICK);
    }

    private resultLabel(root: Node, path: string, value: string): void {
        const label = root.getChildByPath(path)?.getComponent(Label);
        if (label) label.string = value;
    }

    private bindFinalAction(node: Node | null, action: () => Promise<boolean | void>,
        keepDisabledOnSuccess: boolean): void {
        if (!node) throw new Error('[CD299] final action button missing');
        const button = node.getComponent(Button) ?? node.addComponent(Button);
        button.interactable = true;
        let started = false;
        const once = (): void => {
            if (started) return;
            started = true;
            button.interactable = false;
            void action().then(result => {
                const succeeded = result !== false;
                if (!keepDisabledOnSuccess || !succeeded) {
                    started = false;
                    if (node.isValid) button.interactable = true;
                }
                console.info('[CD299] final action resolved', {
                    roomId: this.roomId, action: node.name, succeeded,
                });
            }).catch((error: unknown) => {
                started = false;
                if (node.isValid) button.interactable = true;
                console.error('[CD299] final action failed', {
                    roomId: this.roomId, action: node.name,
                    reason: error instanceof Error ? error.message : String(error),
                });
            });
        };
        node.off(Button.EventType.CLICK, undefined, this);
        node.on(Button.EventType.CLICK, once, this);
    }

    private setLayerRecursively(node: Node, layer: number): void {
        node.layer = layer;
        for (const child of node.children) this.setLayerRecursively(child, layer);
    }

    public showSeat(seat: number, authoritativeSeat: number, playerId: number | null,
        canSit: boolean, seatLimit: number, viewerOwnsSeat: boolean): void {
        if (seatLimit !== 8) throw new Error(`[CD299] landscape requires 8 seats, received ${seatLimit}`);
        const seatNode = this.seat(seat);
        const clickTarget = this.requireHeadMount(seatNode);
        if (canSit) this.sittableSeats.add(authoritativeSeat);
        else this.sittableSeats.delete(authoritativeSeat);
        this.bindSeatTarget(clickTarget, authoritativeSeat, canSit);
        // Once authority no longer identifies this viewer as the reserved seat
        // owner, the buy-in form is stale whether the chair is empty, has been
        // taken by another player, or this client reconnected as a spectator.
        if (!viewerOwnsSeat && this.reservedSeat === authoritativeSeat
            && this.addCentWindow?.name === `ChessRoomAddCentWindow_${authoritativeSeat}`) {
            console.info('[CD299] unconfirmed seat released by authority', {
                roomId: this.roomId, seat: authoritativeSeat,
            });
            this.reservedSeat = null;
            this.closeAddCentWindow();
        }
        if (!canSit && this.reservedSeat !== authoritativeSeat
            && this.addCentWindow?.name === `ChessRoomAddCentWindow_${authoritativeSeat}`) {
            this.closeAddCentWindow();
        }
        void this.renderHead(seat, playerId);
    }

    public showReady(seat: number, ready: boolean): void {
        this.readySeats.set(seat, ready);
        // CD299 seats are admitted atomically and XQP has no separate ready
        // affordance. Keep the authority field for reconnect invariants, but
        // never project it into CommonHead's visual ready badge.
        this.headController(seat)?.showReady(false);
    }

    public showHand(seat: number, cards: readonly number[], revealed: boolean,
        earthNineKing: boolean, dealOrder: number, dealCycleSize: number): void {
        const seatNode = this.seat(seat);
        const hand = seatNode.getChildByName('Hand');
        if (!hand) throw new Error(`[CD299] seat=${seat} Hand missing`);
        const parent = hand;
        const addCard = seat === 0 ? null : seatNode.getChildByName('AddedCards');
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
        // Consecutive rounds can replace a two-card hand with another two-card
        // hand without ever projecting an empty intermediate snapshot. Count
        // growth alone therefore misses the next round's deal sound.
        if (seat === 0 && cards.length > 0
            && (cards.length > previousCount || this.currentRound !== this.lastDealSoundRound)) {
            this.lastDealSoundRound = this.currentRound;
            void this.audio?.play('deal');
        }
        const generation = (this.cardGenerations.get(seat) ?? 0) + 1;
        this.cardGenerations.set(seat, generation);
        this.renderedCardCounts.set(seat, cards.length);
        if (seat === 0) {
            this.localHandCards = [...cards];
            this.earthNineKing = earthNineKing;
            this.localCardNodes.clear();
        }
        this.cardFactory.clear(parent);
        const addCardCards = addCard ? this.runtimeCardLayer(addCard) : null;
        if (addCardCards) this.cardFactory.clear(addCardCards);
        void Promise.all(cards.map(async (rawCard, index) => {
            const target = seat !== 0 && index >= 2 ? addCardCards! : parent;
            const cardVisible = revealed && rawCard !== 0;
            const card = await this.createRoomCard(target, rawCard, cardVisible);
            if (this.cardGenerations.get(seat) !== generation || !target.isValid) {
                card.destroy();
                return;
            }
            if (seat === 0) {
                this.scaleCardTo(card, 100, 129);
                // XQP's RESIZE_CONTAINER layout keeps the local hand centred as
                // cards are added. We cannot retain that Layout because Aoo's
                // logical card width differs from its rendered width, so project
                // the same centred geometry explicitly for every hand size.
                const centeredX = (index - (cards.length - 1) / 2) * 96;
                card.setPosition(centeredX, 0, index);
                this.localCardNodes.set(rawCard, card);
                card.active = !this.selectedSplitCards.includes(rawCard);
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
            if (index >= previousCount) this.playDealTween(
                card, seat, dealOrder, dealCycleSize, index - previousCount);
        })).catch(error => console.error('[CD299] landscape card render failed', {
            seat, reason: error instanceof Error ? error.message : String(error),
        }));
    }

    /** XQP uses an 80 ms seat/card cadence and a 200 ms flight from the table world centre. */
    private playDealTween(card: Node, seat: number, dealOrder: number,
        dealCycleSize: number, newCardIndex: number): void {
        if (!this.node.isValid || !card.isValid) return;
        const targetWorld = card.worldPosition.clone();
        const targetScale = card.scale.clone();
        const startWorld = this.node.worldPosition.clone();
        card.setWorldPosition(startWorld);
        card.setScale(targetScale.x * 0.2, targetScale.y * 0.2, targetScale.z);
        const openingDelay = this.openingAnimationActive
            ? Math.max(0, this.openingAnimationEndsAt - Date.now()) / 1000 : 0;
        const cadenceDelay = (newCardIndex * dealCycleSize + dealOrder) * 0.08;
        const delay = openingDelay + cadenceDelay;
        const scheduledAt = Date.now();
        console.info('[CD299] deal tween scheduled', {
            roomId: this.roomId, round: this.currentRound, seat, card: card.name,
            dealOrder, dealCycleSize, newCardIndex, openingDelayMillis: openingDelay * 1000,
            cadenceDelayMillis: cadenceDelay * 1000, delayMillis: delay * 1000,
            startWorld: { x: startWorld.x, y: startWorld.y },
            targetWorld: { x: targetWorld.x, y: targetWorld.y },
        });
        tween(card)
            .delay(delay)
            .call(() => console.info('[CD299] deal tween started', {
                roomId: this.roomId, round: this.currentRound, seat, card: card.name,
                elapsedMillis: Date.now() - scheduledAt,
            }))
            .to(0.2, { worldPosition: targetWorld, scale: targetScale })
            .call(() => {
                if (!card.isValid) return;
                // Avoid accumulated floating-point drift after repeated deals.
                card.setWorldPosition(new Vec3(targetWorld.x, targetWorld.y, targetWorld.z));
                card.setScale(targetScale);
                console.info('[CD299] deal tween completed', {
                    roomId: this.roomId, round: this.currentRound, seat, card: card.name,
                    elapsedMillis: Date.now() - scheduledAt,
                });
            })
            .start();
    }

    public showCommitted(seat: number, value: number): void {
        const player = this.seat(seat);
        const area = player.getChildByName('Bet');
        const label = area?.getChildByName('Label')?.getComponent(Label);
        if (label) label.string = String(value);
        const previous = this.displayedCommitted.get(seat);
        this.displayedCommitted.set(seat, value);
        if (!area) return;
        const increment = previous === undefined ? 0 : value - previous;
        if (increment <= 0 || this.openingAnimationActive) {
            area.active = !this.openingAnimationActive && value > 0;
            return;
        }
        const source = this.path('Chips/Bet');
        const destination = area.getChildByName('Icon') ?? area;
        if (!source || !destination) {
            area.active = value > 0;
            return;
        }
        const chip = instantiate(source);
        chip.name = `RuntimeBetChip_${seat}`;
        chip.layer = this.node.layer;
        player.addChild(chip);
        chip.setPosition(0, 0, 20);
        chip.active = true;
        const chipLabel = chip.getChildByName('Num')?.getComponent(Label);
        if (chipLabel) chipLabel.string = String(increment);
        area.active = false;
        const start = chip.worldPosition.clone();
        const target = destination.worldPosition.clone();
        tween(chip).to(0.2, { worldPosition: target }).call(() => {
            area.active = value > 0;
            if (chip.isValid) chip.destroy();
            console.info('[CD299] wager chip moved', JSON.stringify({
                roomId: this.roomId, seat, increment,
                start: { x: start.x, y: start.y }, target: { x: target.x, y: target.y },
            }));
        }).start();
    }

    public showOpeningCommit(seat: number, base: number, mango: number, round: number): void {
        if (round !== this.openingAnimationRound || this.openingAnimatedSeats.has(seat) || (!base && !mango)) return;
        this.openingAnimatedSeats.add(seat);
        const player = this.seat(seat);
        const betArea = player.getChildByName('Bet');
        if (!betArea) return;
        const animate = (source: Node | null, amount: number, mangoChip: boolean): void => {
            if (!source || amount <= 0) return;
            const chip = instantiate(source);
            chip.name = mangoChip ? 'RuntimeOpeningMango' : 'RuntimeOpeningBase';
            chip.layer = this.node.layer;
            player.addChild(chip);
            chip.setPosition(0, 0, 20);
            chip.active = true;
            const label = chip.getChildByName('Num')?.getComponent(Label);
            if (label) label.string = String(amount);
            const destination = mangoChip ? betArea : betArea.getChildByName('Icon') ?? betArea;
            const first = tween(chip).delay(mangoChip ? 0.05 : 1.25).to(mangoChip ? 0.3 : 0.2,
                { worldPosition: destination.worldPosition.clone() });
            if (mangoChip) {
                const total = this.path('Center/TotalScores/MangoScore')?.worldPosition.clone();
                if (total) first.delay(0.3).to(0.3, { worldPosition: total });
            }
            first.call(() => {
                if (mangoChip) this.visible('Center/TotalScores/MangoScore', true);
                else {
                    betArea.active = true;
                    this.visible('Center/TotalScores/BetScore', true);
                }
                console.info('[CD299] opening commit tween completed', JSON.stringify({
                    roomId: this.roomId, round, seat, kind: mangoChip ? 'MANGO' : 'BASE',
                    initialDelayMillis: mangoChip ? 50 : 1250,
                    flightMillis: mangoChip ? 600 : 200,
                    middlePauseMillis: mangoChip ? 300 : 0,
                }));
                if (chip.isValid) chip.destroy();
            }).start();
        };
        animate(this.path('Chips/Bet'), base, false);
        animate(this.path('Chips/Mango'), mango, true);
    }

    public showScore(seat: number, value: number): void {
        this.scores.set(seat, value);
        const head = this.headController(seat)?.node;
        const score = head?.getChildByPath('Game/Head/PlayerInfo/Lb_PlayerScore')?.getComponent(Label);
        if (score) score.string = String(value);
    }

    public showBanker(seat: number, banker: boolean): void {
        if (banker) this.bankerSeats.add(seat);
        else this.bankerSeats.delete(seat);
        const head = this.headController(seat)?.node;
        if (!head) return;
        this.applyBankerState(head, banker);
    }

    private applyBankerState(head: Node, banker: boolean): void {
        const stack = [head];
        while (stack.length > 0) {
            const node = stack.pop()!;
            if (node.name === 'Icon_Banker') {
                node.active = banker;
                // CommonHead supplies the lifecycle node, but its generic yellow
                // banker art and authored offsets are not the CX running skin.
                // Project only this instantiated CD299 head onto XQP's 30×30 red
                // badge at the avatar's lower-left; Common remains unchanged.
                node.setPosition(-43, -27, node.position.z);
                node.setScale(1, 1, node.scale.z);
                node.getComponent(UITransform)?.setContentSize(30, 30);
                void this.applyXqpBankerBadge(node);
            }
            stack.push(...node.children);
        }
    }

    private async applyXqpBankerBadge(node: Node): Promise<void> {
        try {
            const atlas = await this.loadCommonStaticAtlas();
            if (!node.isValid) return;
            const frame = atlas.getSpriteFrame(XQP_BANKER_BADGE);
            if (!frame) throw new Error(`[CD299] banker badge missing: ${XQP_BANKER_BADGE}`);
            const sprite = node.getComponent(Sprite);
            if (!sprite) throw new Error('[CD299] Icon_Banker missing Sprite');
            sprite.sizeMode = Sprite.SizeMode.CUSTOM;
            sprite.spriteFrame = frame;
        } catch (error: unknown) {
            console.error('[CD299] XQP banker badge failed', {
                roomId: this.roomId, asset: `${XQP_COMMON_STATIC}/${XQP_BANKER_BADGE}`,
                reason: error instanceof Error ? error.message : String(error),
            });
        }
    }

    public showRoundDelta(seat: number, value: number): void {
        const settlement = this.seat(seat).getChildByName('RoundScore');
        const label = settlement?.getChildByName('Label')?.getComponent(Label);
        if (label) label.string = value > 0 ? `+${value}` : String(value);
        if (settlement) settlement.active = value !== 0;
    }

    public showSettlementChips(stateVersion: number, entries: readonly CD299SettlementChip[]): void {
        const generation = ++this.settlementAnimationGeneration;
        const effect = this.path('ActionEffects');
        if (!effect || entries.length === 0) return;
        const centre = this.node.worldPosition.clone();
        let remaining = entries.length;
        const complete = (): void => {
            remaining -= 1;
            if (remaining > 0 || generation !== this.settlementAnimationGeneration) return;
            for (const entry of entries) {
                this.showScore(entry.visualSeat, entry.finalScore);
                this.showRoundDelta(entry.visualSeat, Math.max(0, entry.delta));
            }
            console.info('[CD299] settlement chip sequence completed', JSON.stringify({
                roomId: this.roomId, stateVersion, winners: entries.filter(entry => entry.delta > 0)
                    .map(entry => ({ playerId: entry.playerId, seat: entry.authoritativeSeat,
                        visualSeat: entry.visualSeat, delta: entry.delta, finalScore: entry.finalScore })),
            }));
        };
        for (const entry of entries) {
            const player = this.seat(entry.visualSeat);
            const betArea = player.getChildByName('Bet');
            const icon = betArea?.getChildByName('Icon');
            if (!icon) {
                complete();
                continue;
            }
            const chip = instantiate(icon);
            chip.name = `RuntimeSettlementChip_${entry.authoritativeSeat}`;
            chip.layer = this.node.layer;
            effect.addChild(chip);
            chip.setWorldPosition(icon.worldPosition);
            chip.active = true;
            if (betArea) betArea.active = false;
            const start = chip.worldPosition.clone();
            const target = player.worldPosition.clone();
            console.info('[CD299] settlement chip sequence scheduled', JSON.stringify({
                roomId: this.roomId, stateVersion, playerId: entry.playerId,
                seat: entry.authoritativeSeat, visualSeat: entry.visualSeat,
                wager: entry.wager, delta: entry.delta, finalScore: entry.finalScore,
                terminalAction: entry.terminalAction,
                start: { x: start.x, y: start.y }, centre: { x: centre.x, y: centre.y },
                target: entry.delta > 0 ? { x: target.x, y: target.y } : null,
                collectMillis: 200, winnerDelayMillis: entry.delta > 0 ? 500 : 0,
                awardMillis: entry.delta > 0 ? 200 : 0,
            }));
            const collect = tween(chip).to(0.2, { worldPosition: centre }).call(() => {
                console.info('[CD299] settlement chip collected', JSON.stringify({
                    roomId: this.roomId, stateVersion, playerId: entry.playerId,
                    seat: entry.authoritativeSeat, delta: entry.delta,
                    worldPosition: { x: chip.worldPosition.x, y: chip.worldPosition.y },
                }));
                if (entry.delta <= 0) {
                    if (chip.isValid) chip.destroy();
                    complete();
                }
            });
            if (entry.delta > 0) collect.delay(0.5).to(0.2, { worldPosition: target }).call(() => {
                console.info('[CD299] settlement chip awarded', JSON.stringify({
                    roomId: this.roomId, stateVersion, playerId: entry.playerId,
                    seat: entry.authoritativeSeat, visualSeat: entry.visualSeat,
                    delta: entry.delta, finalScore: entry.finalScore,
                    worldPosition: { x: chip.worldPosition.x, y: chip.worldPosition.y },
                }));
                if (chip.isValid) chip.destroy();
                complete();
            });
            collect.start();
        }
    }

    public showBetAction(seat: number, action: import('./CD299Protocol').CD299BetAction | null): void {
        const root = this.seat(seat).getChildByName('ActionIndicators');
        if (!root) return;
        const actionNode: Readonly<Record<string, string>> = Object.freeze({
            DROP: 'Drop', FOLLOW: 'Follow', REST: 'Rest', RAISE: 'Add', ALL_IN: 'AllIn',
        });
        const next = action ? actionNode[action] ?? '' : '';
        for (const child of root.children) child.active = child.name === next;
        if (!action || !next) {
            this.displayedBetActions.delete(seat);
            return;
        }
        if (this.displayedBetActions.get(seat) === next) return;
        this.displayedBetActions.set(seat, next);
        void this.audio?.play(action);
        // The XQP prefab drives State 0 -> 1 through StatePosition, whose two
        // authored positions are (0, 0) and (0, 70).  Those project components
        // are intentionally absent in Aoo, so reproduce their actual geometry
        // on the operation root rather than substituting a scale pulse.
        const origin = this.operationDisplayOrigins.get(seat) ?? root.position.clone();
        this.operationDisplayOrigins.set(seat, origin);
        root.setPosition(origin);
        tween(root).to(0.15, {
            position: new Vec3(origin.x, origin.y + 70, origin.z),
        }).start();
        console.info('[CD299] operation marker animated', JSON.stringify({
            roomId: this.roomId, seat, action, durationMillis: 150, rise: 70,
        }));
        void this.showBetEffect(seat, action);
    }

    private async showBetEffect(seat: number, action: import('./CD299Protocol').CD299BetAction): Promise<void> {
        const effectRoot = this.seat(seat).getChildByName('BetEffects');
        if (!effectRoot) return;
        // XQP removes a previous “大” effect on the next operation, while its
        // looping “敲” flame remains for the all-in seat until the hand resets.
        effectRoot.children.filter(child => child.name !== 'BetAnim_5').forEach(child => child.destroy());
        const config = action === 'RAISE' ? XQP_BET_EFFECTS.RAISE
            : action === 'ALL_IN' ? XQP_BET_EFFECTS.ALL_IN : null;
        if (!config || effectRoot.getChildByName(config.node)) return;
        try {
            const data = await new Promise<sp.SkeletonData>((resolve, reject) => {
                const load = (bundle: ReturnType<typeof assetManager.getBundle>): void => {
                    if (!bundle) return reject(new Error('[CD299] poker-cx bundle unavailable'));
                    bundle.load(config.asset, sp.SkeletonData, (error, loaded) => error || !loaded
                        ? reject(error ?? new Error(`[CD299] bet effect unavailable: ${config.asset}`))
                        : resolve(loaded));
                };
                const bundle = assetManager.getBundle('poker-cx');
                if (bundle) load(bundle);
                else assetManager.loadBundle('poker-cx', (error, loaded) => error ? reject(error) : load(loaded));
            });
            if (!effectRoot.isValid || effectRoot.getChildByName(config.node)) return;
            const effect = new Node(config.node);
            effect.layer = this.node.layer;
            effect.addComponent(UITransform);
            effect.parent = effectRoot;
            effect.setPosition(Vec3.ZERO);
            effect.setScale(config.scale);
            const skeleton = effect.addComponent(sp.Skeleton);
            skeleton.skeletonData = data;
            skeleton.setAnimation(0, config.animation, true);
            console.info('[CD299] bet effect started', JSON.stringify({
                roomId: this.roomId, seat, action, asset: config.asset, animation: config.animation,
            }));
        } catch (error: unknown) {
            console.error('[CD299] bet effect failed', JSON.stringify({
                roomId: this.roomId, seat, action,
                reason: error instanceof Error ? error.message : String(error),
            }));
        }
    }

    public showDropped(seat: number, dropped: boolean): void {
        const player = this.seat(seat);
        const hand = player.getChildByName('Hand');
        if (!hand) return;
        const previous = this.displayedDroppedSeats.get(seat);
        this.displayedDroppedSeats.set(seat, dropped);
        if (!dropped) {
            this.droppingSeats.delete(seat);
            this.applyDroppedFinalState(seat, false);
            return;
        }
        // An initial/reconnected snapshot renders the authoritative final state
        // immediately.  Only a live false -> true transition flies the hand to
        // the table centre, matching XQP's 300 ms discard sequence.
        if (previous !== false || this.droppingSeats.has(seat)) {
            if (!this.droppingSeats.has(seat)) this.applyDroppedFinalState(seat, true);
            return;
        }
        this.droppingSeats.add(seat);
        this.applyDroppedFinalState(seat, false);
        // XQP's local seat flies two authored card backs; remote seats fly the
        // current hidden hand.  Only player 0 owns the DropCard template.
        const dropTemplate = seat === 0 ? player.getChildByName('Dropped') : null;
        const flyingHand = instantiate(dropTemplate ?? hand);
        if (dropTemplate) {
            const pokers = flyingHand.getChildByName('Cards');
            for (const name of ['Card_0', 'Card_1']) {
                const templateCard = flyingHand.getChildByName(name);
                if (pokers && templateCard) {
                    const card = instantiate(templateCard);
                    card.parent = pokers;
                    card.active = true;
                }
            }
        }
        flyingHand.name = 'Clone_DropCard';
        flyingHand.parent = hand.parent;
        flyingHand.active = true;
        const startWorld = flyingHand.worldPosition.clone();
        const tableCentre = this.node.worldPosition.clone();
        let midpointLogged = false;
        console.info('[CD299] discard flight started', JSON.stringify({
            roomId: this.roomId, seat, durationMillis: 300,
            startWorld: { x: startWorld.x, y: startWorld.y },
            targetWorld: { x: tableCentre.x, y: tableCentre.y },
        }));
        tween(flyingHand).to(0.3, { worldPosition: tableCentre }, {
            onUpdate: (_target, ratio = 0): void => {
                if (midpointLogged || ratio < 0.5) return;
                midpointLogged = true;
                console.info('[CD299] discard flight midpoint', JSON.stringify({
                    roomId: this.roomId, seat, progress: ratio,
                    worldPosition: { x: flyingHand.worldPosition.x, y: flyingHand.worldPosition.y },
                }));
            },
        }).call(() => {
            flyingHand.destroy();
            this.droppingSeats.delete(seat);
            if (this.displayedDroppedSeats.get(seat)) this.applyDroppedFinalState(seat, true);
            console.info('[CD299] discard flight completed', JSON.stringify({ roomId: this.roomId, seat }));
        }).start();
    }

    private applyDroppedFinalState(seat: number, dropped: boolean): void {
        const player = this.seat(seat);
        const revealMasks = (container: Node | null): void => {
            for (const card of container?.children ?? []) {
                if (card.name === 'Clone') continue;
                const mask = card.getChildByName('Mask');
                if (mask) mask.active = dropped;
            }
        };
        if (seat === 0) {
            revealMasks(player.getChildByName('Hand'));
            return;
        }
        revealMasks(player.getChildByName('AddedCards'));
        const pokers = player.getChildByPath('Hand/Cards');
        for (const card of pokers?.children ?? []) {
            const sprite = card.getComponent(Sprite);
            if (sprite) sprite.grayscale = dropped;
        }
    }

    public showThreeFlower(seat: number, enabled: boolean): void {
        const node = this.seat(seat).getChildByPath('Split/ThreeFlower');
        if (node) node.active = enabled;
    }

    public showSplit(seat: number, enabled: boolean, cards: readonly number[], earthNineKing: boolean): void {
        const player = this.seat(seat);
        const node = player.getChildByName('Split');
        if (!node) return;
        node.active = enabled;
        const hand = player.getChildByName('Hand');
        const added = player.getChildByName('AddedCards');
        if (hand) hand.active = !enabled && !this.openingAnimationActive;
        if (added) added.active = !enabled && !this.openingAnimationActive;
        if (enabled) void this.renderSplitResult(node, cards, earthNineKing).catch(error =>
            console.error('[CD299] split result render failed', {
                roomId: this.roomId, seat,
                reason: error instanceof Error ? error.message : String(error),
            }));
    }

    private async renderSplitResult(root: Node, cards: readonly number[], earthNineKing: boolean): Promise<void> {
        if (cards.length !== 4) return;
        const atlas = await this.loadCardFaceAtlas();
        if (!root.isValid) return;
        // The authority canonicalizes cards as [big pair, small pair]. XQP's
        // authored Head/Tail local coordinates are mirrored for some visual
        // seats, so resolve the actual screen-left/right roots instead of
        // assuming a node name always means one horizontal side.
        const pairs = [cards.slice(0, 2), cards.slice(2, 4)] as const;
        const names = (['Head', 'Tail'] as const).slice().sort((left, right) => {
            const leftNode = root.getChildByName(left);
            const rightNode = root.getChildByName(right);
            return (leftNode?.worldPosition.x ?? 0) - (rightNode?.worldPosition.x ?? 0);
        });
        for (let pairIndex = 0; pairIndex < pairs.length; pairIndex += 1) {
            const pairRoot = root.getChildByName(names[pairIndex]);
            const pokerRoot = pairRoot?.getChildByName('Cards');
            if (!pairRoot || !pokerRoot) continue;
            const visibleCards = pairs[pairIndex].filter(card => card !== 0);
            const label = pairRoot.getChildByPath(`Type/Label_${names[pairIndex]}Type`)?.getComponent(Label);
            if (label) label.string = visibleCards.length === 2
                ? cd299PairTypeLabel(visibleCards, earthNineKing) : '';
            pairs[pairIndex].forEach((rawCard, cardIndex) => {
                const cardNode = pokerRoot.getChildByName(`Card_${cardIndex}`);
                if (!cardNode) return;
                const sprite = cardNode.getComponent(Sprite);
                if (!sprite) throw new Error(`[CD299] authored split card sprite missing index=${cardIndex}`);
                if (!this.authoredSplitBackFrames.has(sprite)) {
                    this.authoredSplitBackFrames.set(sprite, sprite.spriteFrame);
                }
                if (rawCard === 0) {
                    sprite.spriteFrame = this.authoredSplitBackFrames.get(sprite) ?? null;
                    return;
                }
                const frame = atlas.getSpriteFrame(String(rawCard));
                if (!frame) throw new Error(`[CD299] split card face missing card=${rawCard}`);
                sprite.spriteFrame = frame;
            });
        }
    }

    public showSplitDeadline(seat: number, deadlineEpochMillis: number): void {
        if (deadlineEpochMillis > 0) this.splitDeadlines.set(seat, deadlineEpochMillis);
        else this.splitDeadlines.delete(seat);
        this.renderSplitDeadline(seat);
    }

    protected override update(): void {
        for (const seat of this.splitDeadlines.keys()) this.renderSplitDeadline(seat);
        for (const seat of this.operationDeadlines.keys()) this.renderOperationDeadline(seat);
        for (const seat of this.seatRetentionDeadlines.keys()) this.renderSeatRetention(seat);
        this.renderReservedSeatPopup();
    }

    public showOperationDeadline(seat: number, deadlineEpochMillis: number): void {
        if (deadlineEpochMillis > 0) this.operationDeadlines.set(seat, deadlineEpochMillis);
        else this.operationDeadlines.delete(seat);
        this.renderOperationDeadline(seat);
    }

    public showSeatRetention(seat: number, deadlineEpochMillis: number, local: boolean): void {
        if (deadlineEpochMillis > 0) this.seatRetentionDeadlines.set(seat, deadlineEpochMillis);
        else this.seatRetentionDeadlines.delete(seat);
        this.renderSeatRetention(seat);
        if (local && this.reservedSeat === seat && deadlineEpochMillis <= 0) {
            console.info('[CD299] unconfirmed seat retention expired', { roomId: this.roomId, seat });
            this.reservedSeat = null;
            this.closeAddCentWindow();
        }
        if (local && this.currentPhase === 'ROUND_SETTLEMENT'
            && deadlineEpochMillis > Date.now() && this.openedRebuyDeadline !== deadlineEpochMillis) {
            this.openedRebuyDeadline = deadlineEpochMillis;
            void this.openRebuyCarryWindow(seat);
        }
    }

    public showTotals(mangoTotal: number, betTotal: number): void {
        const mango = this.path('Center/TotalScores/MangoScore');
        const bet = this.path('Center/TotalScores/BetScore');
        const mangoLabel = mango?.getChildByName('Label_MangoScore')?.getComponent(Label);
        const betLabel = bet?.getChildByName('Label_BetScore')?.getComponent(Label);
        if (mangoLabel) mangoLabel.string = String(mangoTotal);
        if (betLabel) betLabel.string = String(betTotal);
        if (mango) mango.active = !this.openingAnimationActive && mangoTotal > 0;
        if (bet) bet.active = !this.openingAnimationActive && betTotal > 0;
    }

    private renderOperationDeadline(seat: number): void {
        const deadline = this.operationDeadlines.get(seat) ?? 0;
        const seconds = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
        const liveDeadline = Math.max(0, ...this.operationDeadlines.values());
        const liveSeconds = Math.max(0, Math.ceil((liveDeadline - Date.now()) / 1000));
        const clock = this.path('Clock');
        if (clock) clock.active = liveDeadline > 0 && liveSeconds > 0;
        const liveSeat = [...this.operationDeadlines.entries()].find(([, value]) => value === liveDeadline)?.[0] ?? -1;
        const pointer = clock?.getChildByName('Pointer');
        if (pointer && liveSeat >= 0) {
            const target = this.seat(liveSeat).worldPosition;
            const origin = clock!.worldPosition;
            pointer.angle = Math.atan2(target.y - origin.y, target.x - origin.x) * 180 / Math.PI - 90;
        }
        const label = clock?.getChildByName('Label_Time')?.getComponent(Label);
        if (label) label.string = String(liveSeconds);
        const timer = this.seat(seat).getChildByName('SeatTimer');
        if (timer) timer.active = deadline > 0 && seconds > 0;
    }

    private renderSeatRetention(seat: number): void {
        const deadline = this.seatRetentionDeadlines.get(seat) ?? 0;
        const seconds = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
        const timer = this.seat(seat).getChildByName('SeatTimer');
        if (!timer) return;
        timer.active = deadline > 0 && seconds > 0;
        const label = timer.getChildByName('Label')?.getComponent(Label);
        if (label) label.string = String(seconds);
    }

    private renderReservedSeatPopup(): void {
        if (this.reservedSeat === null || !this.addCentWindow?.isValid) return;
        const deadline = this.seatRetentionDeadlines.get(this.reservedSeat) ?? 0;
        const seconds = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
        const label = this.addCentWindow.getChildByPath('Add/CountDown/Num')?.getComponent(Label);
        if (label) label.string = `${seconds}秒`;
    }

    private renderSplitDeadline(seat: number): void {
        const node = this.seat(seat).getChildByName('SplitTimer');
        if (!node) return;
        const deadline = this.splitDeadlines.get(seat) ?? 0;
        const seconds = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
        node.active = deadline > 0 && seconds > 0;
        const label = node.getChildByName('Label')?.getComponent(Label);
        if (label) label.string = String(seconds);
        if (seat === 0) {
            const actionLabel = this.path('Actions/SplitActions/SplitTimer/Label_Time')?.getComponent(Label);
            if (actionLabel) actionLabel.string = `剩余：${seconds}秒`;
        }
    }

    public setActions(actions: Readonly<CD299Actions>): void {
        this.currentActions = actions;
        if (this.openingAnimationActive) {
            this.pendingActions = actions;
            this.hideAllActions();
            return;
        }
        console.info('[CD299] operation visibility applied', JSON.stringify({ roomId: this.roomId, ...actions }));
        // Gate the complete authored operation subtree as well as its groups.
        // This matches XQP's ClearWindow/turn-notice behaviour and prevents
        // authored child active flags from leaking on a non-operating client.
        this.visible('Actions', actions.canPreset || actions.canBet || actions.canSplit);
        this.visible('Actions/PresetOptions', actions.canPreset);
        this.visible('Actions/BetActions', actions.canBet);
        this.visible('Actions/BetActions/Btn_Drop', actions.canBet && actions.betActions.includes('DROP'));
        this.visible('Actions/BetActions/Btn_FollowOrRest', actions.canBet
            && (actions.betActions.includes('FOLLOW') || actions.betActions.includes('REST')));
        // XQP uses one shared Follow/Check slot: Check (休) wins when legal,
        // otherwise the slot displays Follow. Activating both leaves the later
        // sibling on top and turns a visible Follow click into REST.
        const canRest = actions.canBet && actions.betActions.includes('REST');
        this.visible('Actions/BetActions/Btn_FollowOrRest/Btn_Follow', actions.canBet
            && actions.betActions.includes('FOLLOW') && !canRest);
        this.visible('Actions/BetActions/Btn_FollowOrRest/Btn_Rest', canRest);
        const followLabel = this.path('Actions/BetActions/Btn_FollowOrRest/Btn_Follow/Label_Follow')?.getComponent(Label);
        if (followLabel) followLabel.string = String(actions.followAmount);
        this.visible('Actions/BetActions/Btn_Raise', actions.canBet
            && (actions.betActions.includes('RAISE') || actions.betActions.includes('ALL_IN')));
        // XQP gives the raise panel priority. The standalone All-in button is
        // only shown when raising is unavailable; unaffordable quick targets
        // inside the raise panel still submit ALL_IN through submitQuickRaise.
        const canRaise = actions.canBet && actions.betActions.includes('RAISE');
        this.visible('Actions/BetActions/Btn_Raise/Btn_AllIn', actions.canBet
            && actions.betActions.includes('ALL_IN') && !canRaise);
        this.visible('Actions/BetActions/Btn_Raise/RaiseOptions', canRaise);
        this.resetRaiseSlider();
        actions.quickRaiseTargets.forEach((amount, index) => {
            const node = this.path(`Actions/BetActions/Btn_Raise/RaiseOptions/QuickRaiseOptions/Btn_RaiseOption_${index + 1}`);
            const label = node?.getChildByName('Label_Value')?.getComponent(Label);
            if (label) label.string = String(amount);
            if (node) node.active = canRaise;
        });
        this.visible('Actions/SplitActions', actions.canSplit);
        if (!actions.canSplit) this.clearSplitSelection();
        this.splitSelectionEnabled = actions.canSplit;
        // AntiCheatNotice is a status-only label. Dealing is server-authoritative,
        // so it must never become a clickable manual "add card" command.
        this.visible('AntiCheatNotice', false);
        this.commonVisible('WaitingActions/Btn_Start', actions.canContinue);
    }

    private hideAllActions(): void {
        const operateBtn = this.path('Actions');
        if (operateBtn) {
            for (const child of operateBtn.children) child.active = false;
        }
        this.visible('AntiCheatNotice', false);
        this.commonVisible('WaitingActions/Btn_Start', false);
        this.splitSelectionEnabled = false;
        this.clearSplitSelection();
    }

    /** XQP hides the bet panel at click time, before waiting for the reply. */
    private submitBet(action: 'DROP' | 'FOLLOW' | 'REST' | 'ALL_IN' | 'RAISE', amount: number): void {
        this.visible('Actions/BetActions', false);
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

    /** Mirrors XQP's vertical drag: bottom means cancel, top means all-in. */
    private bindRaiseSlider(): void {
        const button = this.path('Actions/BetActions/Btn_Raise/RaiseOptions/RaiseSlider/SliderHandle');
        const slot = this.path('Actions/BetActions/Btn_Raise/RaiseOptions/RaiseSlider/SliderProgress');
        const slotTransform = slot?.getComponent(UITransform);
        if (!button || !slot || !slotTransform) return;
        this.raiseSliderStartY = slot.position.y;
        this.raiseSliderMaxY = this.raiseSliderStartY + slotTransform.height;
        const start = (): void => {
            this.raiseSliderAmount = 0;
            this.updateRaiseSlider(button, this.raiseSliderStartY, 0);
            this.visible('Actions/BetActions/Btn_Raise/RaiseOptions/RaiseSlider/SliderTrackDisplay', true);
        };
        const move = (event: EventTouch): void => {
            const parentTransform = button.parent?.getComponent(UITransform);
            const actions = this.currentActions;
            if (!parentTransform || !actions) return;
            const ui = event.getUILocation();
            const local = parentTransform.convertToNodeSpaceAR(new Vec3(ui.x, ui.y, 0));
            const y = Math.max(this.raiseSliderStartY, Math.min(this.raiseSliderMaxY, local.y));
            const minimum = actions.quickRaiseTargets[0] ?? 0;
            const maximum = actions.currentBet + actions.availableScore;
            const ratio = this.raiseSliderMaxY === this.raiseSliderStartY ? 0
                : (y - this.raiseSliderStartY) / (this.raiseSliderMaxY - this.raiseSliderStartY);
            const amount = y <= this.raiseSliderStartY ? 0
                : Math.floor(minimum + ratio * Math.max(0, maximum - minimum));
            this.raiseSliderAmount = Math.min(maximum, amount);
            this.updateRaiseSlider(button, y, this.raiseSliderAmount);
        };
        const end = (): void => {
            const amount = this.raiseSliderAmount;
            this.resetRaiseSlider();
            if (amount <= 0) return;
            const actions = this.currentActions;
            if (!actions) return;
            const allIn = amount >= actions.currentBet + actions.availableScore;
            this.submitBet(allIn ? 'ALL_IN' : 'RAISE', allIn ? 0 : amount);
        };
        button.on(Node.EventType.TOUCH_START, start, this);
        button.on(Node.EventType.TOUCH_MOVE, move, this);
        button.on(Node.EventType.TOUCH_CANCEL, end, this);
        button.on(Node.EventType.TOUCH_END, end, this);
        this.commandDisposers.push(() => {
            button.off(Node.EventType.TOUCH_START, start, this);
            button.off(Node.EventType.TOUCH_MOVE, move, this);
            button.off(Node.EventType.TOUCH_CANCEL, end, this);
            button.off(Node.EventType.TOUCH_END, end, this);
        });
    }

    private updateRaiseSlider(button: Node, y: number, amount: number): void {
        button.setPosition(button.position.x, y, button.position.z);
        const allIn = this.path('Actions/BetActions/Btn_Raise/RaiseOptions/RaiseSlider/SliderTrackDisplay/AllInMark');
        const sprite = allIn?.getComponent(Sprite);
        const label = allIn?.getChildByName('Label_AllIn')?.getComponent(Label);
        const actions = this.currentActions;
        if (sprite && actions) sprite.grayscale = amount < actions.currentBet + actions.availableScore;
        if (label) label.string = String(amount);
    }

    private resetRaiseSlider(): void {
        const button = this.path('Actions/BetActions/Btn_Raise/RaiseOptions/RaiseSlider/SliderHandle');
        if (button) button.setPosition(button.position.x, this.raiseSliderStartY, button.position.z);
        this.raiseSliderAmount = 0;
        this.visible('Actions/BetActions/Btn_Raise/RaiseOptions/RaiseSlider/SliderTrackDisplay', false);
    }

    private seat(index: number): Node {
        const node = this.path(`Players/Seat_${index}`);
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
    private splitRenderGeneration = 0;

    private toggleSplitCard(rawCard: number): void {
        const selectedIndex = this.selectedSplitCards.indexOf(rawCard);
        const selecting = selectedIndex < 0;
        const source = selecting ? this.localCardNodes.get(rawCard) ?? null
            : this.path(`Actions/SplitActions/CardSelectors/Btn_SplitCard_${selectedIndex}/RuntimeCards`)?.children[0] ?? null;
        const startWorld = source?.worldPosition.clone() ?? null;
        if (selectedIndex >= 0) this.selectedSplitCards.splice(selectedIndex, 1);
        else if (this.selectedSplitCards.length < 2) this.selectedSplitCards.push(rawCard);
        else return;
        void this.audio?.play('select');
        const slotIndex = selecting ? this.selectedSplitCards.indexOf(rawCard) : selectedIndex;
        const destination = selecting
            ? this.runtimeCardLayer(this.path(`Actions/SplitActions/CardSelectors/Btn_SplitCard_${slotIndex}`)!)
            : this.seat(0).getChildByName('Hand');
        if (source && startWorld && destination) {
            // A fast second tap may target a card while the previous centring
            // tween is still changing its local position. That tween must not
            // survive reparenting and compete with the world-space flight.
            Tween.stopAllByTarget(source);
            source.removeFromParent();
            this.node.addChild(source);
            source.setWorldPosition(startWorld);
            source.active = true;
            if (selecting) this.reflowLocalSplitHand(rawCard, true);
            const target = destination.worldPosition.clone();
            tween(source).to(0.2, { worldPosition: target }).call(() => {
                if (!source.isValid || !destination.isValid) return;
                source.removeFromParent();
                destination.addChild(source);
                source.setPosition(selecting ? Vec3.ZERO : new Vec3(0, 0, source.position.z));
                if (!selecting) this.reflowLocalSplitHand(rawCard, false);
                this.renderSplitSelection();
                console.info('[CD299] split card moved', JSON.stringify({
                    roomId: this.roomId, card: rawCard, selecting,
                    start: { x: startWorld.x, y: startWorld.y },
                    target: { x: target.x, y: target.y },
                }));
            }).start();
        } else {
            this.reflowLocalSplitHand(rawCard, selecting);
            this.renderSplitSelection();
        }
    }

    /** Remaining local cards keep one centred horizontal row while selection changes. */
    private reflowLocalSplitHand(movingCard: number, selecting: boolean): void {
        const remaining = this.localHandCards.filter(card => !this.selectedSplitCards.includes(card));
        remaining.forEach((cardValue, index) => {
            const card = this.localCardNodes.get(cardValue);
            if (!card?.isValid) return;
            const x = (index - (remaining.length - 1) / 2) * 96;
            card.active = !(cardValue === movingCard && !selecting);
            Tween.stopAllByTarget(card);
            tween(card).to(0.2, { position: new Vec3(x, 0, card.position.z) }).start();
        });
        for (const cardValue of this.selectedSplitCards) {
            const node = this.localCardNodes.get(cardValue);
            if (!node?.isValid) continue;
            if (node.parent?.name === 'RuntimeCards') node.active = true;
            else node.active = !this.selectedSplitCards.includes(cardValue);
        }
    }

    private renderSplitSelection(): void {
        const cardsRoot = this.path('Actions/SplitActions/CardSelectors');
        if (!cardsRoot) return;
        const generation = ++this.splitRenderGeneration;
        for (let index = 0; index < 2; index += 1) {
            const slot = cardsRoot.getChildByName(`Btn_SplitCard_${index}`);
            if (!slot) continue;
            const runtime = this.runtimeCardLayer(slot);
            const value = this.selectedSplitCards[index];
            for (const child of [...runtime.children]) {
                const represented = [...this.localCardNodes.entries()].find(([, node]) => node === child)?.[0];
                if (represented !== value) child.destroy();
            }
            const card = value === undefined ? null : this.localCardNodes.get(value) ?? null;
            if (card?.isValid) {
                if (generation !== this.splitRenderGeneration) return;
                if (card.parent !== runtime) {
                    const world = card.worldPosition.clone();
                    card.removeFromParent();
                    runtime.addChild(card);
                    card.setWorldPosition(world);
                    tween(card).to(0.2, { position: Vec3.ZERO }).start();
                }
                // XQP moves a selected card from the hand into this slot. The
                // slot itself must return it to the hand on a physical click.
                const returnCard = (): void => {
                    if (!this.splitSelectionEnabled || !this.selectedSplitCards.includes(value)) return;
                    const now = Date.now(), previous = this.lastCardSelectionAt.get(value) ?? 0;
                    if (now - previous < 250) return;
                    this.lastCardSelectionAt.set(value, now);
                    this.toggleSplitCard(value);
                };
                card.off(Node.EventType.MOUSE_UP, undefined, this);
                card.off(Node.EventType.TOUCH_END, undefined, this);
                card.on(Node.EventType.MOUSE_UP, returnCard, this);
                card.on(Node.EventType.TOUCH_END, returnCard, this);
            }
        }
        const complete = this.selectedSplitCards.length === 2 && this.localHandCards.length === 4;
        this.visible('Actions/SplitActions/HeadTypeDisplay', complete);
        this.visible('Actions/SplitActions/TailTypeDisplay', complete);
        if (complete) {
            if (this.earthNineKing === null) {
                throw new Error(`[CD299] split rule unavailable roomId=${this.roomId}`);
            }
            const tail = this.localHandCards.filter(card => !this.selectedSplitCards.includes(card));
            const headLabel = this.path('Actions/SplitActions/HeadTypeDisplay/Label_HeadType')?.getComponent(Label);
            const tailLabel = this.path('Actions/SplitActions/TailTypeDisplay/Label_TailType')?.getComponent(Label);
            if (headLabel) headLabel.string = cd299PairTypeLabel(this.selectedSplitCards, this.earthNineKing);
            if (tailLabel) tailLabel.string = cd299PairTypeLabel(tail, this.earthNineKing);
        }
    }

    private clearSplitSelection(): void {
        if (this.selectedSplitCards.length === 0) return;
        this.selectedSplitCards.length = 0;
        const hand = this.seat(0).getChildByName('Hand');
        this.localHandCards.forEach((cardValue, index) => {
            const node = this.localCardNodes.get(cardValue);
            if (!node?.isValid || !hand) return;
            const world = node.worldPosition.clone();
            if (node.parent !== hand) {
                node.removeFromParent();
                hand.addChild(node);
                node.setWorldPosition(world);
            }
            node.active = true;
            tween(node).to(0.2, { position: new Vec3(
                (index - (this.localHandCards.length - 1) / 2) * 96, 0, node.position.z) }).start();
        });
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

    /** Scale each source card's UITransform to the XQP-authored display size. */
    private scaleCardTo(card: Node, width: number, height: number): void {
        const size = card.getComponent(UITransform)?.contentSize;
        if (!size || size.width <= 0 || size.height <= 0) {
            throw new Error(`[CD299] invalid card source size for ${card.name}`);
        }
        card.setScale(width / size.width, height / size.height, 1);
    }

    /** CD299's deck contains 202, 402 and 506, which are not ordinary Poker_Card codec values. */
    private async createRoomCard(parent: Node, rawCard: number, revealed: boolean): Promise<Node> {
        if (!revealed) return this.cardFactory.create(parent, 103, Poker_Card_Face.Back);
        const atlas = await this.loadCardFaceAtlas();
        const frame = atlas.getSpriteFrame(String(rawCard));
        if (!frame) throw new Error(`[CD299] card face ${rawCard} missing from ${XQP_CARD_FACES}`);
        const card = new Node(`CD299_Card_${rawCard}`);
        card.layer = parent.layer;
        const transform = card.addComponent(UITransform);
        transform.setContentSize(frame.originalSize);
        const sprite = card.addComponent(Sprite);
        sprite.sizeMode = Sprite.SizeMode.CUSTOM;
        sprite.spriteFrame = frame;
        parent.addChild(card);
        return card;
    }

    private loadCardFaceAtlas(): Promise<SpriteAtlas> {
        if (this.cardFaceAtlas) return this.cardFaceAtlas;
        this.cardFaceAtlas = new Promise<SpriteAtlas>((resolve, reject) => {
            const load = (bundle: ReturnType<typeof assetManager.getBundle>): void => {
                if (!bundle) return reject(new Error('[CD299] poker-cx bundle unavailable'));
                bundle.load(XQP_CARD_FACES, SpriteAtlas, (error, atlas) => error || !atlas
                    ? reject(error ?? new Error(`[CD299] card atlas unavailable: ${XQP_CARD_FACES}`))
                    : resolve(atlas));
            };
            const bundle = assetManager.getBundle('poker-cx');
            if (bundle) load(bundle);
            else assetManager.loadBundle('poker-cx', (error, loaded) => error ? reject(error) : load(loaded));
        });
        return this.cardFaceAtlas;
    }

    private loadCommonStaticAtlas(): Promise<SpriteAtlas> {
        if (this.commonStaticAtlas) return this.commonStaticAtlas;
        this.commonStaticAtlas = new Promise<SpriteAtlas>((resolve, reject) => {
            const load = (bundle: ReturnType<typeof assetManager.getBundle>): void => {
                if (!bundle) return reject(new Error('[CD299] poker-cx bundle unavailable'));
                bundle.load(XQP_COMMON_STATIC, SpriteAtlas, (error, atlas) => error || !atlas
                    ? reject(error ?? new Error(`[CD299] common atlas unavailable: ${XQP_COMMON_STATIC}`))
                    : resolve(atlas));
            };
            const bundle = assetManager.getBundle('poker-cx');
            if (bundle) load(bundle);
            else assetManager.loadBundle('poker-cx', (error, loaded) => error ? reject(error) : load(loaded));
        });
        return this.commonStaticAtlas;
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
        this.commandDisposers.push(() => node.off(Button.EventType.CLICK, listener, this));
    }

    private requireHeadMount(seat: Node): Node {
        const mount = seat.getChildByName('Head');
        if (!mount) throw new Error(`[CD299] ${seat.name} missing authored Head mount`);
        return mount;
    }

    private async renderHead(seat: number, playerId: number | null): Promise<void> {
        const occupied = playerId !== null && playerId > 0;
        const generation = (this.headGenerations.get(seat) ?? 0) + 1;
        this.headGenerations.set(seat, generation);
        const mount = this.requireHeadMount(this.seat(seat));
        let head = mount.getChildByName('CommonHead');
        if (!head) {
            const prefab = await this.loadCommonHead();
            if (this.headGenerations.get(seat) !== generation || !mount.isValid) return;
            head = instantiate(prefab);
            mount.addChild(head);
        }
        const controller = head.getComponent(CommonHeadController);
        if (!controller) throw new Error('[CD299] CommonHead missing controller');
        controller.useSkin('XQP_CIRCULAR');
        this.bindSeatTarget(head, seat, this.sittableSeats.has(seat));
        controller.showGamePlayer(occupied);
        controller.showReady(false);
        const name = head.getChildByPath('Game/Head/PlayerInfo/Lb_PlayerName')?.getComponent(Label);
        const score = head.getChildByPath('Game/Head/PlayerInfo/Lb_PlayerScore')?.getComponent(Label);
        if (name) name.string = occupied ? `玩家${playerId}` : '';
        if (score) score.string = occupied ? String(this.scores.get(seat) ?? 0) : '';
        this.applyBankerState(head, occupied && this.bankerSeats.has(seat));
        if (occupied) await controller.showPlayerAvatar(playerId!);
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
        if (this.seatReservationPending !== null || this.reservedSeat !== null) {
            console.info('[CD299] duplicate seat reservation suppressed', {
                roomId: this.roomId, seat, pendingSeat: this.seatReservationPending,
                reservedSeat: this.reservedSeat,
            });
            return;
        }
        this.seatReservationPending = seat;
        this.closeAddCentWindow(true);
        try {
            await this.controller.sit(seat, 0);
            this.seatReservationPending = null;
            this.reservedSeat = seat;
            const prefab = await this.loadAddCentWindow();
            if (this.reservedSeat !== seat || !this.controller || !this.node.isValid) return;
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
            this.bindPopupButton(window.getChildByPath('Popup/Tag/Close'), () => this.closeAddCentWindow(true));
            const scoreInput = window.getChildByPath('Add/Num');
            if (!scoreInput) throw new Error('[CD299] add-cent score input missing');
            scoreInput.on(Node.EventType.TOUCH_END, () => {
                console.info('[CD299] carry score editor requested', { roomId: this.roomId, seat });
                void this.openCarryScoreNumpad(window).catch(error => console.error('[CD299] carry score editor failed', {
                    roomId: this.roomId, seat, reason: error instanceof Error ? error.message : String(error),
                }));
            }, this);
            this.bindPopupButton(window.getChildByPath('Add/Btns/Sure'), () => {
                const carryScore = this.popupCarryScore(window);
                console.info('[CD299] add-cent confirmed', { roomId: this.roomId, seat, carryScore });
                void this.controller?.sit(seat, carryScore).then(() => {
                    this.reservedSeat = null;
                    this.closeAddCentWindow();
                });
            }, true);
            console.info('[CD299] add-cent opened', {
                roomId: this.roomId,
                seat,
                parent: window.parent?.name ?? '',
                localPosition: { x: window.position.x, y: window.position.y, z: window.position.z },
                worldPosition: { x: window.worldPosition.x, y: window.worldPosition.y, z: window.worldPosition.z },
            });
        } catch (error: unknown) {
            this.seatReservationPending = null;
            console.error('[CD299] add-cent open failed', {
                roomId: this.roomId,
                seat,
                reason: error instanceof Error ? error.message : String(error),
            });
            this.closeAddCentWindow(true);
        }
    }

    /** Terminal continue uses the same authored carry-score form, but submits a restart decision for the retained seat. */
    private async openRestartCarryWindow(seat: number): Promise<void> {
        if (seat < 0 || !this.controller) return;
        this.closeAddCentWindow();
        try {
            const prefab = await this.loadAddCentWindow();
            if (!this.controller || !this.node.isValid) return;
            const window = instantiate(prefab);
            window.name = `ChessRoomRestartCentWindow_${seat}`;
            this.node.addChild(window);
            window.setPosition(0, 0, 101);
            this.addCentWindow = window;
            this.configureAddCentWindow(window);
            this.bindPopupButton(window.getChildByPath('Popup/Tag/Close'), () => this.closeAddCentWindow());
            const scoreInput = window.getChildByPath('Add/Num');
            if (!scoreInput) throw new Error('[CD299] restart carry score input missing');
            scoreInput.on(Node.EventType.TOUCH_END, () => { void this.openCarryScoreNumpad(window); }, this);
            this.bindPopupButton(window.getChildByPath('Add/Btns/Sure'), () => {
                const carryScore = this.popupCarryScore(window);
                console.info('[CD299] terminal continue confirmed', { roomId: this.roomId, seat, carryScore });
                void this.controller?.restart(carryScore);
                this.closeAddCentWindow();
            }, true);
        } catch (error: unknown) {
            console.error('[CD299] terminal carry window failed', {
                roomId: this.roomId, seat,
                reason: error instanceof Error ? error.message : String(error),
            });
        }
    }

    /** A depleted seat keeps its identity for 120 seconds and reuses the authored carry-score form. */
    private async openRebuyCarryWindow(seat: number): Promise<void> {
        if (seat < 0 || !this.controller) return;
        this.closeAddCentWindow();
        try {
            const prefab = await this.loadAddCentWindow();
            if (!this.controller || !this.node.isValid) return;
            const window = instantiate(prefab);
            window.name = `ChessRoomRebuyCentWindow_${seat}`;
            this.node.addChild(window);
            window.setPosition(0, 0, 101);
            this.addCentWindow = window;
            this.configureAddCentWindow(window);
            this.bindPopupButton(window.getChildByPath('Popup/Tag/Close'), () => this.closeAddCentWindow());
            const scoreInput = window.getChildByPath('Add/Num');
            if (!scoreInput) throw new Error('[CD299] rebuy carry score input missing');
            scoreInput.on(Node.EventType.TOUCH_END, () => { void this.openCarryScoreNumpad(window); }, this);
            this.bindPopupButton(window.getChildByPath('Add/Btns/Sure'), () => {
                const carryScore = this.popupCarryScore(window);
                console.info('[CD299] depleted seat rebuy confirmed', { roomId: this.roomId, seat, carryScore });
                void this.controller?.rebuy(carryScore);
                this.closeAddCentWindow();
            }, true);
        } catch (error: unknown) {
            console.error('[CD299] depleted seat rebuy window failed', {
                roomId: this.roomId, seat,
                reason: error instanceof Error ? error.message : String(error),
            });
        }
    }

    private closeAddCentWindow(cancelReservation = false): void {
        this.addCentNumpad?.dispose();
        this.addCentNumpad = null;
        if (this.addCentWindow?.isValid) this.addCentWindow.destroy();
        this.addCentWindow = null;
        if (cancelReservation && this.reservedSeat !== null) {
            const seat = this.reservedSeat;
            this.reservedSeat = null;
            console.info('[CD299] unconfirmed seat cancelled', { roomId: this.roomId, seat });
            void this.controller?.stand();
        }
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

    private bindPopupButton(node: Node | null, action: () => void, oneShot = false): void {
        if (!node) throw new Error('[CD299] add-cent prefab button missing');
        const button = node.getComponent(Button) ?? node.addComponent(Button);
        button.interactable = true;
        let started = false;
        node.on(Button.EventType.CLICK, () => {
            if (oneShot && started) return;
            started = true;
            if (oneShot) button.interactable = false;
            action();
        }, this);
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
