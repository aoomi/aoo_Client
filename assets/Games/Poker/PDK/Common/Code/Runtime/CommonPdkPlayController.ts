import { Button, EventMouse, EventTouch, game, instantiate, Label, Layout, Node, tween, Tween, UITransform, Vec2, Vec3, view, Widget } from 'cc';
import type { LegacyForm } from '../../../../../../Common/Code/Runtime/ui/LegacyFormManager';
import { AnimationPresenter } from './Room/AnimationPresenter';
import { CardPresenter } from './Room/CardPresenter';
import { OperationPresenter } from './Room/OperationPresenter';
import { RoomLifecycleController } from './Room/RoomLifecycleController';
import { RoomBubblePresenter } from './Room/RoomBubblePresenter';
import { RoomViewBindings } from './Room/RoomViewBindings';
import { createSeatEntries, PdkPlayerCount, SeatPresenter } from './Room/SeatPresenter';
import { EmojiExpressionPresenter, MagicExpressionPresenter } from './Room/MagicExpressionPresenter';
import { PdkGameAudioPresenter, pdkVoiceGender } from './Room/PdkGameAudioPresenter';
import { PdkRoomAudioPresenter } from './Room/PdkRoomAudioPresenter';
import type { CommonPdkSocialController } from './CommonPdkSocialController';
import type { GameCapabilities } from '../../../../../Common/Code/Catalog/FamilyRuntimeRegistry';
import { CommonPdkGameLogic } from './logic/CommonPdkGameLogic';
import { isPdkResponseShape, isRegionalMaximumPdkCombination, isStrictlyHigherPdkSingle, largestLegalPdkSubsets, pdkSelectionMask, pdkSingleResponseCandidates, rankCleanPdkHints } from './logic/PdkCleanHintRanker';
import type { CommonPdkRuntime } from './CommonPdkRuntime';
import { canLeaveRoom } from '../../../../../Common/Code/Room/RoomController';
import { CommonRoomNodePath, PdkRoomNodePath } from './Room/PdkRoomNodePaths';
import { formatPdkRuleSummary } from '../Rules/PdkRuleSummaryFormatter';
import { Poker_Card_Presenter } from '../../../../Common/Code/Card/Poker_Card_Presenter';
import { PokerDealNodeAnim } from '../../../../Common/Spine/PokerDealNodeAnim';
import {
    layoutPdkRetainedHand,
    layoutPdkRetainedHands,
    type PdkRetainedPlayedCardFlow,
} from './Room/PdkRetainedPlayedCardFlow';
import { PdkCurrentPlayArrowPresenter } from './Room/PdkCurrentPlayArrowPresenter';

const DRAG_THRESHOLD_PX = 8;
const CLICK_SUPPRESS_MS = 250;
const AUTO_PLAY_SELECTION_DELAY_MS = 600;
const HAND_COMPACT_DURATION_SECONDS = 0.35;
const OWN_CARD_FLIGHT_DURATION_SECONDS = 0.32;
// Every successful play owns its temporary Out_Card slot for at least two
// seconds, including an unbeatable lead that immediately receives the turn
// again. Table_Cards is an independent round archive and never shortens this.
const COMPLETED_TRICK_HOLD_MS = 2000;
const OUT_CARD_FALLBACK_WIDTH = 80;

type HandPointerSource = 'mouse' | 'touch' | 'pen';

interface HandPointerSample {
    pointerId: number;
    source: HandPointerSource;
    raw: { x: number; y: number };
    client: { x: number; y: number };
    canvas: { x: number; y: number };
    screen: { x: number; y: number };
    ui: { x: number; y: number };
    handLocal: { x: number; y: number } | null;
    cardLocal: { x: number; y: number } | null;
    targetPath: string;
    windowId: number;
    index: number;
    domPointer: boolean;
}

/** 将既有协议事件投影到公共房间层与跑得快专属牌桌层；此处不得判断地区玩法。 */
export class CommonPdkPlayController {
    private view: RoomViewBindings | null = null;
    private commonView: RoomViewBindings | null = null;
    private seats: SeatPresenter | null = null;
    private operations: OperationPresenter | null = null;
    private animations: AnimationPresenter | null = null;
    private bubble: RoomBubblePresenter | null = null;
    private emojiExpressions: EmojiExpressionPresenter | null = null;
    private magicExpressions: MagicExpressionPresenter | null = null;
    private gameAudio: PdkGameAudioPresenter | null = null;
    private roomAudio: PdkRoomAudioPresenter | null = null;
    private currentPlayArrow: PdkCurrentPlayArrowPresenter | null = null;
    private currentPlayArrowIndex = 0;
    private currentPlayArrowOperationId = '';
    private readonly cards = new CardPresenter();
    private readonly lifecycle: RoomLifecycleController;
    private readonly logic: CommonPdkGameLogic;
    private readonly bound = new Set<Node>();
    private readonly commonBound = new Set<Node>();
    private readonly cardNodes: Node[] = [];
    private readonly cardValues: number[] = [];
    private readonly remainingCards = new Map<number, number>();
    private clockTimer = 0;
    private activeOpPos = -1;
    private tipIndex = 0;
    private promptCycleKey = '';
    private dragStartIndex = -1;
    private dragLastIndex = -1;
    private dragStartUi = new Vec3();
    private dragActive = false;
    private dragMoved = false;
    private readonly dragIndices = new Set<number>();
    private gestureSurface: Node | null = null;
    private handTransform: UITransform | null = null;
    private handVisibleWidth = 0;
    private gestureCanvas: HTMLCanvasElement | null = null;
    private bridgedButton: Node | null = null;
    private capturedPointerId: number | null = null;
    private lastPointerSample: HandPointerSample | null = null;
    private suppressClickUntil = 0;
    private autoPassInFlight = false;
    private autoPlayTurnKey = '';
    private autoPlayInFlight = false;
    private autoPlayTimer = 0;
    /** A rejected automatic whole-hand request must fall back to manual controls for that turn. */
    private autoPlayRejectedTurnKey = '';
    private autoHintTurnKey = '';
    private hintCacheKey = '';
    private hintCache: number[][] = [];
    private playInFlight = false;
    private handCompaction: Promise<void> = Promise.resolve();
    private ownCardFlight: Promise<void> = Promise.resolve();
    private ownCardFlightActive = false;
    private ownLandingCards: Node[] = [];
    private readonly publicCardShownAt = new Map<number, number>();
    private readonly publicSeatOperationIds = new Map<number, string>();
    private readonly publicCardClearTimers = new Map<number, number>();
    private continueReadyClearTimer = 0;
    private continueReadyHiddenRoundKey = '';
    private completedRoundVisualsCleared = false;
    private playRequestScope: { roomId: number; stateVersion: number; trickId: number; operationId: string } | null = null;
    private selectionAuthorityKey = '';
    private presentationGeneration = 0;
    private publicProjectionGeneration = 0;
    private readonly publicSeatRenderRevisions = new Map<number, number>();
    private handRenderGeneration = 0;
    private flyingOverlay: Node | null = null;
    private readonly pendingPresentations = new Set<Promise<unknown>>();
    private readonly presentationCancellations = new Map<Promise<unknown>, () => void>();
    private readonly seenOperationIds = new Set<string>();
    private readonly renderedActionIds = new Map<number, string>();
    private readonly tableActionIds = new Set<string>();
    /** One physical Liangshan Out_Card -> Table_Cards transfer per authority action. */
    private readonly tableActionPresentations = new Map<string, Promise<void>>();
    private authorityActionsInitialized = false;
    private lastDealAnimationKey = '';
    private lastMoreToggleAt = 0;
    private commonMoreItems: Node | null = null;
    private commonMoreButton: Node | null = null;
    private commonMoreMenuParent: Node | null = null;
    private commonMoreMenuPosition: Vec3 | null = null;
    private commonMoreMenuScale: Vec3 | null = null;
    private readonly commonMoreWidgetStates = new Map<Widget, boolean>();
    private renderedTrickId = -1;
    private competeDealerPhase = false;
    private readonly warnedOperationIds = new Set<string>();
    private lastCountdownSound = '';
    private readonly pendingSocialEffects: Array<() => void> = [];
    private readonly emojiSequences = new Map<number, number>();
    private readonly emojiHideTimers = new Map<number, number>();

    public constructor(
        private readonly runtime: CommonPdkRuntime,
        private readonly requestLeave: (reason: string) => void,
        private readonly showMessage: (message: string) => void,
        private readonly openChat: () => void = () => undefined,
        private readonly social?: CommonPdkSocialController,
        private readonly openVoice: () => void = () => undefined,
        private readonly finishVoice: () => void = () => undefined,
        private readonly openSettings: () => void = () => undefined,
        private readonly openMagicExpression: (targetSeat: number) => void = () => undefined,
        private readonly openSmallSettlement: () => void = () => undefined,
        private readonly capabilities?: GameCapabilities,
        /** Only alliance rooms expose the top club-credit balance. */
        private readonly isUnionRoom = false,
        private readonly roomRuleSnapshot?: unknown,
        private readonly roomRuleFields?: unknown,
        private readonly syncAutoPlay: (active: boolean) => void = () => undefined,
        private readonly openCardSelection: (targetSeat: number) => void = () => undefined,
        private readonly retainedPlayedCardFlow?: PdkRetainedPlayedCardFlow,
    ) {
        this.lifecycle = new RoomLifecycleController(runtime);
        this.logic = new CommonPdkGameLogic({ room: runtime.getRoom(), roomSet: runtime.getRoomSet() });
    }

    public onCreateCommonRoom(form: LegacyForm): void {
        if (this.commonView?.root === form.node) return;
        this.commonView = new RoomViewBindings(form.node);
        // PDK owns its operation buttons in PDK_CommonRoom. The common prefab's
        // generic turn-operation group must stay hidden to avoid duplicate UI.
        this.commonView.visible(CommonRoomNodePath.turnActions, false);
        this.commonView.visible(CommonRoomNodePath.clubCent, this.isUnionRoom);
        this.commonMoreItems = this.commonView.find(CommonRoomNodePath.moreItems);
        this.commonMoreButton = this.commonView.find(CommonRoomNodePath.moreButton);
        this.commonMoreMenuParent = this.commonMoreItems?.parent ?? null;
        this.commonMoreMenuPosition = this.commonMoreItems?.position.clone() ?? null;
        this.commonMoreMenuScale = this.commonMoreItems?.scale.clone() ?? null;
        this.bindCommonRoomControls();
        this.syncCommonButtonLayout();
        view.on('canvas-resize', this.syncCommonButtonLayout, this);
    }

    public onCreate(form: LegacyForm): void {
        const diagnostics = globalThis as typeof globalThis & {
            __PDK_E2E_LOGS__?: unknown[];
            __PDK_PLAY_CONTROLLER__?: CommonPdkPlayController;
        };
        if (this.view?.root === form.node) return;
        if (Array.isArray(diagnostics.__PDK_E2E_LOGS__)) diagnostics.__PDK_PLAY_CONTROLLER__ = this;
        this.view = new RoomViewBindings(form.node);
        this.seats = new SeatPresenter(form.node, (targetSeat) => this.openMagicExpression(targetSeat));
        this.emojiExpressions = new EmojiExpressionPresenter(form.node, (dataSeat) => this.seats?.head(dataSeat) ?? null);
        this.magicExpressions = new MagicExpressionPresenter(form.node, (dataSeat) => this.seats?.head(dataSeat) ?? null);
        this.gameAudio = new PdkGameAudioPresenter(form.node);
        this.roomAudio = new PdkRoomAudioPresenter(form.node);
        this.currentPlayArrow = new PdkCurrentPlayArrowPresenter(form.node);
        this.operations = new OperationPresenter(this.view);
        this.animations = new AnimationPresenter((path) => this.view?.find(path) ?? null);
        this.bubble = new RoomBubblePresenter(form.node);
        this.configureArrangementArea();
        this.bind(PdkRoomNodePath.passButton, () => this.runUserAction('不出', () => this.pass()));
        this.bind(PdkRoomNodePath.hintButton, () => this.tip());
        this.bind(PdkRoomNodePath.playButton, () => this.runUserAction('出牌', () => this.outCard()));
        this.bindCompeteDealerButtons();
        // Keep every operation variant visible and centred while authoring the
        // prefab; runtime enables only the buttons owned by the current phase.
        this.view.visible(PdkRoomNodePath.keepRoomOpenButton, false);
        this.view.visible(PdkRoomNodePath.closeRoomButton, false);
        this.view.visible(PdkRoomNodePath.noGrabButton, false);
        this.view.visible(PdkRoomNodePath.grabDealerButton, false);
        for (let physicalSlot = 0; physicalSlot < 4; physicalSlot += 1) {
            this.bind(`Players/Play_${physicalSlot}/CardSelection`, () => {
                const target = createSeatEntries(this.authoritativePlayerCount(), this.clientSeat())
                    .find((entry) => entry.physicalSlot === physicalSlot);
                if (target) this.openCardSelection(target.dataSeat);
            });
        }
        this.bindGestureSurface(this.view.find('Players/Play_0/Card/Hand_TouchArea'));
        view.on('canvas-resize', this.syncHandTouchArea, this);
        view.on('canvas-resize', this.syncOperationButtonLayout, this);
        // Capture at the room root so child overlays cannot swallow an outside-hand
        // release. Card and button hits are explicitly ignored by the handler.
        form.node.on(Node.EventType.TOUCH_END, this.onRoomTouchEnd, this, true);
        form.node.on(Node.EventType.MOUSE_UP, this.onRoomMouseUp, this, true);
        this.bound.add(form.node);
        this.operations.hide();
    }

    /**
     * Table_Cards exists once in the shared prefab, but is a Liangshan-only
     * feature. Disable the complete node group before any authority projection
     * so other regional variants cannot lay out, populate, or restore it.
     */
    private configureArrangementArea(): void {
        if (!this.view) return;
        const enabled = this.runtime.arrangementEnabled();
        for (let slot = 0; slot < 4; slot += 1) {
            const path = `Players/Play_${slot}/Card/Table_Cards`;
            const table = this.view.find(path);
            if (!table) continue;
            this.cards.clear(table);
            table.active = enabled;
        }
    }

    /** Keep room controls anchored by their full-screen groups after any viewport change. */
    private syncCommonButtonLayout(): void {
        if (!this.commonView) return;
        // The prefab is the layout authority. Only request an immediate alignment
        // pass after mounting/resizing; never overwrite authored button positions.
        const aligned = ['Btn', 'WaitingActions', 'CardCounter', 'CardCounter/MoreMenu'];
        for (const path of aligned) {
            const widget = this.commonView.find(path)?.getComponent(Widget);
            if (widget?.enabled) widget.updateAlignment();
        }
    }

    private syncOperationButtonLayout(): void {
        this.operations?.syncLayout();
    }

    private bindCommonRoomControls(): void {
        this.bindCommon(CommonRoomNodePath.readyButton, () => this.runUserAction('准备', () => this.ready()));
        if (this.runtime.supportsManualStart()) {
            this.bindCommon(CommonRoomNodePath.startButton, () => this.runUserAction('开始游戏', () => this.runtime.manualStart()));
        }
        this.bindCommonCapability(CommonRoomNodePath.chatButton, this.capabilities?.supportsChat === true, this.openChat);
        this.bindVoiceHoldControl();
        this.bindCommon(CommonRoomNodePath.smallSettlementButton, this.openSmallSettlement);
        this.bindCommon(CommonRoomNodePath.moreButton, () => this.toggleMoreMenu());
        if (this.commonView?.find(CommonRoomNodePath.roomRuleButton)) {
            this.bindCommon(CommonRoomNodePath.roomRuleButton, () => this.showCurrentRoomRules());
        }
        this.bindCommonCapability(CommonRoomNodePath.settingsButton, this.capabilities?.supportsSettings === true, () => {
            this.hideMoreMenu();
            this.openSettings();
        });
        this.bindCommon(CommonRoomNodePath.backButton, () => this.exitRoom());
    }

    private bindCommonCapability(path: string, enabled: boolean, listener: () => void): void {
        const entry = this.commonView?.find(path);
        if (!entry) return;
        entry.active = enabled;
        if (enabled) this.bindCommon(path, listener);
    }

    private bindVoiceHoldControl(): void {
        const entry = this.commonView?.find(CommonRoomNodePath.voiceButton);
        if (!entry) return;
        const enabled = this.capabilities?.supportsVoice === true;
        entry.active = enabled;
        if (!enabled || this.commonBound.has(entry)) return;
        entry.on(Node.EventType.TOUCH_START, this.openVoice, this);
        entry.on(Node.EventType.TOUCH_END, this.finishVoice, this);
        entry.on(Node.EventType.TOUCH_CANCEL, this.finishVoice, this);
        entry.on(Node.EventType.MOUSE_DOWN, this.openVoice, this);
        entry.on(Node.EventType.MOUSE_UP, this.finishVoice, this);
        this.commonBound.add(entry);
    }

    public onShow(): void {
        // Forms may be mounted after onCreate. Resolve the hand again once the room
        // is in the live scene so its hit area follows the current visible Canvas.
        if (this.view) this.bindGestureSurface(this.view.find('Players/Play_0/Card/Hand_TouchArea'));
        this.refresh();
        void this.roomAudio?.playMusic();
        this.renderCompeteDealerControls();
        this.logic.InitHandCard();
        const snapshot = this.runtime.getRoomSet().GetRoomSetInfo() ?? {};
        this.competeDealerPhase = String(snapshot.authorityPhase ?? '').toUpperCase() === 'COMPETE_DEALER';
        const formalCardPlayPhase = this.isFormalCardPlayPhase(snapshot);
        const roomPlaying = Number(this.runtime.getRoom().GetRoomProperty('state') ?? 0) === 1;
        const completedRound = snapshot.setEnd ?? this.runtime.getRoomSet().GetRoomSetProperty('setEnd');
        const localPlayer = this.runtime.getRoomPosManager().GetRoomAllPlayerInfo()?.[this.clientSeat()];
        const waitingForContinue = !roomPlaying && Boolean(completedRound) && !Boolean(localPlayer?.isContinue);
        this.completedRoundVisualsCleared = !roomPlaying && Boolean(localPlayer?.isContinue);
        this.activeOpPos = Number(snapshot.opPos ?? -1);
        if (this.completedRoundVisualsCleared) {
            this.resetRoundPresentation();
            this.clearHandVisuals('ON_SHOW_COMPLETED_ROUND');
            this.trackPresentation(this.renderHeads()
                .catch((error: unknown) => this.report(error, '头像加载失败')));
            this.refresh();
            return;
        }
        // A reconnect during dealer competition can still carry the completed
        // round's operation ledger for settlement continuity. That ledger is not
        // part of the new round's card-play projection and must never be restored.
        if (this.competeDealerPhase) this.resetRoundPresentation();
        this.trackPresentation(this.renderHand()
            .then(() => this.autoHintForAuthoritativeTurn(snapshot))
            .catch((error: unknown) => this.report(error, '手牌加载失败')));
        this.trackPresentation(this.renderHeads()
            .catch((error: unknown) => this.report(error, '头像加载失败')));
        if (formalCardPlayPhase || waitingForContinue) {
            this.trackPresentation(this.reconcileAuthorityPublicCards(snapshot));
            // Retained-table presentation is an explicit variant capability. Card
            // cleanup and dealing remain owned by this common lifecycle controller.
            if (this.runtime.arrangementEnabled()) {
                this.trackPresentation(this.restoreTableCards(snapshot));
            }
        }
        this.startClockFromSetInfo(snapshot);
        this.refresh();
    }

    public onEvent(event: string, body: unknown): void {
        const packet = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
        if (event === 'CommonPdk_AuthoritativeState') {
            // V2 Authority 每次提交后推送完整视图，不再额外伪造旧版 CommonPdkSetStart。
            // RoomRuntime 在发出本事件前已经把权威视图写入 RoomSet，因此这里必须以
            // RoomSet 为唯一牌面来源重新投影；否则服务端虽已发牌，公共 Poker_Card
            // 工厂永远不会被调用，画面会错误停留在空牌桌。
            // A committed authority version is the atomic boundary for turn-owned
            // interaction state. Selection from an older hint/play must never
            // survive into the next turn or the next trick.
            const setInfo = this.runtime.getRoomSet().GetRoomSetInfo() ?? {};
            this.competeDealerPhase = String(packet.phase ?? setInfo.authorityPhase ?? '').toUpperCase() === 'COMPETE_DEALER';
            const formalCardPlayPhase = this.isFormalCardPlayPhase(setInfo);
            this.applyAuthoritativeTurnBoundary(setInfo);
            this.logic.InitHandCard();
            // Capture the private hand at the same authority boundary as the
            // public operation ledger. Rendering is asynchronous (and Liangshan
            // retains each play for two seconds), so reading GameLogic again
            // inside renderHand could otherwise mix a later authority version
            // into this projection.
            const authorityHand = [...(this.logic.GetHandCard() ?? [])].map(Number);
            const playing = Number(this.runtime.getRoom().GetRoomProperty('state') ?? 0) === 1;
            const localPlayer = this.runtime.getRoomPosManager().GetRoomAllPlayerInfo()?.[this.clientSeat()];
            const completedRound = setInfo.setEnd ?? this.runtime.getRoomSet().GetRoomSetProperty('setEnd');
            const waitingForContinue = !playing && Boolean(completedRound) && !Boolean(localPlayer?.isContinue);
            // COMPETE_DEALER owns the next round. A finished round, however,
            // continues owning its cards until this client explicitly continues.
            if (this.competeDealerPhase) this.resetRoundPresentation();
            // A Continue acknowledgement is the completed round's visual death
            // boundary for that client. Its snapshot legitimately still carries
            // the old operation ledger for settlement/replay, but the live table
            // must never restore those cards after the player has continued.
            if (!playing && Boolean(localPlayer?.isContinue) && !this.completedRoundVisualsCleared) {
                this.completedRoundVisualsCleared = true;
                console.info('[CommonRoomContinueVisualClear]', {
                    roomId: this.roomId(),
                    playerId: this.runtime.getPlayerId(),
                    stateVersion: Number(this.runtime.getRoom().GetRoomProperty('stateVersion') ?? -1),
                    roundNo: Number(setInfo.roundNo ?? setInfo.setID
                        ?? this.runtime.getRoom().GetRoomProperty('setID') ?? 0),
                    tableOperationCount: Array.isArray(setInfo.tableOperations) ? setInfo.tableOperations.length : 0,
                });
            }
            if (playing) this.initializeRemainingCards();
            if (!playing && this.completedRoundVisualsCleared) {
                this.resetRoundPresentation();
                this.clearHandVisuals('AUTHORITY_COMPLETED_ROUND');
                this.activeOpPos = -1;
                this.trackPresentation(this.renderHeadsThenScheduleContinueClear(setInfo)
                    .catch((error: unknown) => this.report(error, '头像加载失败')));
                this.refresh();
                this.renderCompeteDealerControls();
                return;
            }
            this.activeOpPos = Number(setInfo.opPos ?? -1);
            // A local play starts its hand-compaction tween before the authority
            // response arrives. Do not destroy and rebuild those nodes mid-tween.
            // A normal authority refresh is never a deal boundary. Deal movement
            // is driven only by the explicit round/phase transition events below.
            const handRender = this.handCompaction.then(() => this.renderHand(false, authorityHand))
                .catch((error: unknown) => {
                    this.reportPresentationError(error, 'HAND_RENDER', setInfo);
                    throw error;
                });
            this.trackPresentation(this.renderHeadsThenScheduleContinueClear(setInfo)
                .catch((error: unknown) => this.report(error, '头像加载失败')));
            const projectRoundCards = formalCardPlayPhase || waitingForContinue;
            const publicPresentation = !projectRoundCards
                ? Promise.resolve()
                : this.runtime.arrangementEnabled()
                    ? formalCardPlayPhase
                        ? this.presentLatestAuthorityAction(setInfo)
                        // lastActions may be coalesced to only the newest operation.
                        // Reconcile from every seat's authoritative ordered cards so
                        // an intermediate play (notably a played A) cannot disappear.
                        .then(() => this.restoreTableCards(setInfo))
                        : this.restoreTableCards(setInfo)
                    : this.reconcileAuthorityPublicCards(setInfo);
            // Bind cleanup to the flight that existed for this exact authority
            // snapshot. A preceding retained-card presentation can finish after
            // the player has already started the next lead; reading the mutable
            // this.ownCardFlight in finally would then destroy the newer flight
            // before renderPublicOperation can adopt it into Out_Card.
            const snapshotOwnCardFlight = this.ownCardFlight;
            // Every committed snapshot is also the lifetime boundary for local
            // flight copies. Some coalesced authority packets do not identify the
            // local action as the latest entry, so renderPublicOperation cannot be
            // the only place that removes those temporary nodes.
            const settledPublicPresentation = publicPresentation.catch((error: unknown) => {
                // Out_Card/Count and public-table presentation are subordinate to
                // the local hand. A malformed optional badge must never reject the
                // combined turn pipeline and suppress hand interaction.
                this.reportPresentationError(error, 'PUBLIC_RENDER', setInfo);
            }).finally(async () => {
                await snapshotOwnCardFlight;
                if (this.ownCardFlight === snapshotOwnCardFlight) this.clearOwnLandingCards();
            });
            // Liangshan's retained-table animation deliberately continues for
            // more than two seconds. Hinting belongs to the committed turn, not
            // to that animation: raise the response as soon as the local hand is
            // ready. Ordinary PDK still waits for both projections because its
            // public-card reconciliation owns prompt-cycle reset/cleanup.
            const hintReady = this.runtime.arrangementEnabled()
                ? handRender
                : Promise.all([handRender, settledPublicPresentation]);
            if (this.runtime.arrangementEnabled()) this.trackPresentation(settledPublicPresentation);
            const turnPresentation = hintReady
                .then(() => this.autoHintForAuthoritativeTurn(setInfo))
                .catch((error: unknown) => this.report(error, '牌面与自动提示加载失败'));
            this.trackPresentation(turnPresentation);
            this.startClockFromSetInfo(setInfo);
        } else if (event === 'CommonPdkSetStart') {
            this.completedRoundVisualsCleared = false;
            void this.roomAudio?.play('xipai');
            void this.roomAudio?.play('zhuang', 350);
            void this.roomAudio?.play('fapai', 700);
            this.resetRoundPresentation();
            this.logic.InitHandCard();
            this.initializeRemainingCards();
            const setInfo = this.record(packet.setInfo) ?? packet;
            this.activeOpPos = Number(setInfo.opPos ?? -1);
            void this.renderHand(this.shouldAnimateDeal(setInfo));
            this.startClockFromSetInfo(setInfo);
        } else if (event === 'OpCard') {
            // The V2 snapshot is the only public-card and hand writer. Legacy
            // OpCard has no stateVersion and is deliberately ignored so a late or
            // duplicate packet cannot replay sound, remove cards, or replace a
            // newer authoritative combination.
        } else if (event === 'ChangeStatus') {
            this.activeOpPos = Number(packet.opPos ?? -1);
            // Turn-only compatibility events do not own table presentation.
            this.startClockFromSetInfo(packet);
        } else if (event === 'CommonPdk_AuthoritativePhaseChanged') {
            const to = String(packet.to ?? '').toUpperCase();
            if (to === 'COMPETE_DEALER') {
                // Some rule snapshots deal before dealer competition. This is
                // already the next round's visual lifetime even though PLAYING
                // has not started. Old-round cleanup must not erase the new hand.
                this.completedRoundVisualsCleared = false;
                // COMPETE_DEALER is also a hard round boundary. Clear the old
                // Out_Card/Table_Cards archive before projecting the new deal.
                this.resetRoundPresentation();
                const setInfo = this.runtime.getRoomSet().GetRoomSetInfo() ?? {};
                console.info('[CommonRoomRoundStart]', {
                    roomId: this.roomId(),
                    stateVersion: Number(this.runtime.getRoom().GetRoomProperty('stateVersion') ?? -1),
                    operationId: String(this.record(setInfo.operationDeadline)?.operationId ?? ''),
                    roundNo: Number(setInfo.roundNo ?? setInfo.setID ?? this.runtime.getRoom().GetRoomProperty('setID') ?? 0),
                    handCount: Number(this.logic.GetHandCard()?.length ?? 0),
                    phase: to,
                    previousCleanupCancelled: true,
                });
                void this.roomAudio?.play('xipai');
                // Drive the shared deal-node animation from this explicit phase
                // boundary; ordinary authority refreshes must never replay it.
                this.logic.InitHandCard();
                this.initializeRemainingCards();
                this.trackPresentation(this.renderHand(this.shouldAnimateDeal(setInfo)));
            }
            if (to === 'PLAYING') {
                // The previous round owns a delayed visual cleanup so its last
                // play remains visible for two seconds. Authority can start the
                // next round before that timer expires. Cancel and invalidate the
                // old round before projecting the newly dealt hand; otherwise the
                // stale callback clears valid second-round cards until refresh.
                this.completedRoundVisualsCleared = false;
                this.resetRoundPresentation();
                void this.roomAudio?.play('zhuang');
                void this.roomAudio?.play('fapai', 350);
                const setInfo = this.runtime.getRoomSet().GetRoomSetInfo() ?? {};
                this.logic.InitHandCard();
                this.initializeRemainingCards();
                console.info('[CommonRoomRoundStart]', {
                    roomId: this.roomId(),
                    stateVersion: Number(this.runtime.getRoom().GetRoomProperty('stateVersion') ?? -1),
                    operationId: String(this.record(setInfo.operationDeadline)?.operationId ?? ''),
                    roundNo: Number(setInfo.roundNo ?? setInfo.setID ?? this.runtime.getRoom().GetRoomProperty('setID') ?? 0),
                    handCount: Number(this.logic.GetHandCard()?.length ?? 0),
                    previousCleanupCancelled: true,
                });
                this.trackPresentation(this.renderHand(this.shouldAnimateDeal(setInfo)));
            }
        } else if (event === 'CommonPdk_PosUpdate') {
            if (Number(this.record(packet.posInfo)?.pid ?? 0) > 0) void this.roomAudio?.play('zuoxia');
        } else if (event === 'CommonPdkSetEnd') {
            const points = packet.pointList;
            const seat = this.clientSeat();
            const point = Number(Array.isArray(points) ? points[seat] : this.record(points)?.[seat] ?? 0);
            void this.roomAudio?.play(point > 0 ? 'win' : 'lose');
        } else if (event === 'ChatMessage') {
            this.social?.receiveLegacyChat(body);
        }
        const folderKey = String(packet.animationFolderKey ?? '').trim();
        if (folderKey) void this.animations?.play(folderKey).catch((error: unknown) => this.report(error, '动画加载失败'));
        this.refresh();
        this.renderCompeteDealerControls();
    }

    private bindCompeteDealerButtons(): void {
        this.bind(PdkRoomNodePath.noGrabButton, () =>
            this.runUserAction('不抢', () => this.runtime.competeDealer(false)));
        this.bind(PdkRoomNodePath.grabDealerButton, () =>
            this.runUserAction('抢庄', () => this.runtime.competeDealer(true)));
    }

    private renderCompeteDealerControls(): void {
        if (!this.view) return;
        const setInfo = this.runtime.getRoomSet().GetRoomSetInfo() ?? {};
        const localTurn = this.competeDealerPhase && Number(setInfo.opPos ?? -1) === this.clientSeat();
        if (!this.competeDealerPhase) {
            this.view.visible(PdkRoomNodePath.noGrabButton, false);
            this.view.visible(PdkRoomNodePath.grabDealerButton, false);
            this.centerOperationButtons();
            return;
        }
        this.view.visible(PdkRoomNodePath.operationButtons, localTurn);
        this.view.visible(PdkRoomNodePath.passButton, false);
        this.view.visible(PdkRoomNodePath.hintButton, false);
        this.view.visible(PdkRoomNodePath.playButton, false);
        this.view.visible(PdkRoomNodePath.noGrabButton, localTurn);
        this.view.visible(PdkRoomNodePath.grabDealerButton, localTurn);
        this.centerOperationButtons();
    }

    public showQuickText(seatId: number, text: string, durationMs: number): void {
        if (!text) return;
        if (!this.seats?.head(seatId)) {
            this.queueSocialEffect(() => this.showQuickText(seatId, text, durationMs));
            return;
        }
        this.seats.showQuickText(seatId, text);
        globalThis.setTimeout(() => this.seats?.hideQuickText(seatId), Math.max(800, durationMs));
    }
    public showEmoji(seatId: number, emojiId: number, durationMs: number): void {
        if (emojiId < 1 || emojiId > 20) return;
        if (!this.seats?.head(seatId) || !this.emojiExpressions) {
            this.queueSocialEffect(() => this.showEmoji(seatId, emojiId, durationMs));
            return;
        }
        const sequence = (this.emojiSequences.get(seatId) ?? 0) + 1;
        this.emojiSequences.set(seatId, sequence);
        const previousTimer = this.emojiHideTimers.get(seatId);
        if (previousTimer !== undefined) globalThis.clearTimeout(previousTimer);
        this.emojiHideTimers.delete(seatId);
        void this.emojiExpressions.play(seatId, emojiId).then(() => {
            if (this.emojiSequences.get(seatId) !== sequence || !this.seats?.head(seatId)) return;
            const timer = globalThis.setTimeout(() => {
                if (this.emojiSequences.get(seatId) !== sequence) return;
                this.emojiExpressions?.hide(seatId);
                this.emojiHideTimers.delete(seatId);
            }, Math.max(800, durationMs));
            this.emojiHideTimers.set(seatId, timer);
        }).catch((error: unknown) => {
            if (this.emojiSequences.get(seatId) === sequence) {
                this.showMessage(error instanceof Error ? error.message : '表情加载失败');
            }
        });
    }
    public showVoice(seatId: number, durationMs: number): void {
        if (!this.seats?.head(seatId)) {
            this.queueSocialEffect(() => this.showVoice(seatId, durationMs));
            return;
        }
        this.seats.showVoice(seatId);
    }
    public hideVoice(seatId: number): void { this.seats?.hideVoice(seatId); }
    public playMagicExpression(source: number, target: number, expressionId: number): void {
        if (expressionId < 1 || expressionId > 15) return;
        if (!this.seats?.head(source) || !this.seats.head(target) || !this.magicExpressions) {
            this.queueSocialEffect(() => this.playMagicExpression(source, target, expressionId));
            return;
        }
        void this.magicExpressions?.play(source, target, expressionId).catch((error: unknown) => {
            this.showMessage(error instanceof Error ? error.message : '魔法表情播放失败');
        });
    }

    public destroy(): void {
        const diagnostics = globalThis as typeof globalThis & { __PDK_PLAY_CONTROLLER__?: CommonPdkPlayController };
        if (diagnostics.__PDK_PLAY_CONTROLLER__ === this) delete diagnostics.__PDK_PLAY_CONTROLLER__;
        this.presentationGeneration += 1;
        this.handRenderGeneration += 1;
        this.playInFlight = false;
        this.playRequestScope = null;
        this.autoPlayRejectedTurnKey = '';
        this.selectionAuthorityKey = '';
        this.seenOperationIds.clear();
        this.renderedActionIds.clear();
        this.tableActionIds.clear();
        this.tableActionPresentations.clear();
        this.authorityActionsInitialized = false;
        this.stopClock();
        this.cards.stopAll(true);
        this.animations?.destroy();
        this.currentPlayArrow?.destroy();
        this.currentPlayArrow = null;
        this.magicExpressions?.clear();
        this.magicExpressions = null;
        this.gameAudio?.destroy();
        this.gameAudio = null;
        this.roomAudio?.destroy();
        this.roomAudio = null;
        this.bubble?.destroy();
        if (this.gestureSurface) {
            this.gestureSurface.off(Node.EventType.TOUCH_START, this.onHandTouchStart, this, true);
            this.gestureSurface.off(Node.EventType.TOUCH_MOVE, this.onHandTouchMove, this, true);
            this.gestureSurface.off(Node.EventType.TOUCH_CANCEL, this.onHandTouchCancel, this, true);
            this.gestureSurface.off(Node.EventType.TOUCH_END, this.onHandTouchEnd, this, true);
            this.gestureSurface.off(Node.EventType.MOUSE_DOWN, this.onHandMouseDown, this, true);
            this.gestureSurface.off(Node.EventType.MOUSE_MOVE, this.onHandMouseMove, this, true);
            this.gestureSurface.off(Node.EventType.MOUSE_UP, this.onHandMouseUp, this, true);
            this.gestureSurface.off(Node.EventType.MOUSE_LEAVE, this.onHandMouseCancel, this, true);
        }
        this.view?.root.off(Node.EventType.TOUCH_END, this.onRoomTouchEnd, this, true);
        this.view?.root.off(Node.EventType.MOUSE_UP, this.onRoomMouseUp, this, true);
        this.view?.unbind(this.bound);
        this.commonView?.unbind(this.commonBound);
        this.seats?.clear();
        this.view = null;
        const moreItems = this.commonMoreItems;
        if (moreItems?.isValid && this.commonMoreMenuParent?.isValid) {
            moreItems.parent = this.commonMoreMenuParent;
            if (this.commonMoreMenuPosition) moreItems.setPosition(this.commonMoreMenuPosition);
            if (this.commonMoreMenuScale) moreItems.setScale(this.commonMoreMenuScale);
            for (const [widget, enabled] of this.commonMoreWidgetStates) {
                if (widget.isValid) widget.enabled = enabled;
            }
        }
        this.commonMoreWidgetStates.clear();
        this.commonView = null;
        this.commonMoreItems = null;
        this.commonMoreButton = null;
        this.commonMoreMenuParent = null;
        this.commonMoreMenuPosition = null;
        this.commonMoreMenuScale = null;
        this.seats = null;
        this.operations = null;
        this.animations = null;
        this.bubble = null;
        this.emojiExpressions?.clear();
        this.emojiExpressions = null;
        this.cardNodes.length = 0;
        this.cardValues.length = 0;
        if (this.flyingOverlay?.isValid) this.flyingOverlay.destroy();
        this.flyingOverlay = null;
        this.cancelPendingPresentations();
        this.remainingCards.clear();
        this.warnedOperationIds.clear();
        this.cancelPublicCardClearTimers();
        this.publicCardShownAt.clear();
        this.pendingSocialEffects.length = 0;
        for (const timer of this.emojiHideTimers.values()) globalThis.clearTimeout(timer);
        this.emojiHideTimers.clear();
        this.emojiSequences.clear();
        if (this.continueReadyClearTimer) globalThis.clearTimeout(this.continueReadyClearTimer);
        this.continueReadyClearTimer = 0;
        this.clearDragSelection();
        this.autoPassInFlight = false;
        this.cancelAutoPlay();
        this.autoPlayTurnKey = '';
        this.autoHintTurnKey = '';
        view.off('canvas-resize', this.syncHandTouchArea, this);
        view.off('canvas-resize', this.syncCommonButtonLayout, this);
        view.off('canvas-resize', this.syncOperationButtonLayout, this);
        this.restoreHandHitTest();
        this.unbindDomPointerBridge();
        this.gestureSurface = null;
    }

    private refresh(): void {
        if (!this.view || !this.seats || !this.operations) return;
        const room = this.runtime.getRoom();
        const positions = this.runtime.getRoomPosManager();
        const config = room.GetRoomConfig() ?? {};
        const playerCount = this.playerCount(config.playerCount ?? config.playerNum ?? config.seatLimit);
        positions.SetAuthoritativePlayerCount(playerCount);
        const players = positions.GetRoomAllPlayerInfo() ?? {};
        const entries = this.seats.apply(playerCount, positions.GetClientPos(), players);
        const state = Number(room.GetRoomProperty('state') ?? 0);
        // V2 Authority 的 WAITING 投影到旧模型后是 3（Waiting），重连过渡态是 4
        //（WaitingEx）；0 仅代表尚未开局的 Init。三者都必须允许准备，否则公共
        // Prefab 中真实存在的按钮会被控制器永久隐藏。
        const waiting = state === 0 || state === 3 || state === 4;
        this.commonView?.label(CommonRoomNodePath.roomIdLabel, `房间号：${room.GetRoomProperty('key') ?? ''}`);
        this.commonView?.label(CommonRoomNodePath.roundLabel, `局数：${Number(room.GetRoomProperty('setID') ?? 0)}/${Number(config.setCount ?? 0)}`);
        const local = players[positions.GetClientPos()];
        this.syncAutoPlay(Boolean(local?.trusteeship));
        this.commonView?.visible(CommonRoomNodePath.clubCent, this.isUnionRoom);
        if (this.isUnionRoom) {
            this.commonView?.label(CommonRoomNodePath.clubCent, `积分：${local?.clubCent ?? 0}`);
        }
        const localSeated = Number(local?.pid) > 0;
        const cardSelectionAvailable = localSeated
            && Number(room.GetRoomProperty('ownerID') ?? 0) === Number(local?.pid ?? 0);
        const activeSlots = new Set(entries.map((entry) => entry.physicalSlot));
        for (let physicalSlot = 0; physicalSlot < 4; physicalSlot += 1) {
            const entry = entries.find((candidate) => candidate.physicalSlot === physicalSlot);
            const occupied = entry !== undefined && Number(players[entry.dataSeat]?.pid ?? 0) > 0;
            this.view.visible(`Players/Play_${physicalSlot}/CardSelection`,
                cardSelectionAvailable && activeSlots.has(physicalSlot) && occupied);
        }
        this.commonView?.visible(CommonRoomNodePath.readyButton, waiting && localSeated && !Boolean(local?.roomReady));
        // 跑得快公共房间由服务端在“座位已满且全部 ready”时幂等自动开局。
        // 旧版房主开始按钮必须在运行态隐藏，避免客户端额外发送开始房间指令造成竞态。
        const manualStart = waiting && localSeated
            && Number(room.GetRoomProperty('ownerID') ?? 0) === Number(local?.pid ?? 0)
            && this.runtime.supportsManualStart();
        this.commonView?.visible(CommonRoomNodePath.startButton, manualStart);
        const setInfo = this.runtime.getRoomSet().GetRoomSetInfo() ?? {};
        const localTurn = state === 1 && this.activeOpPos === positions.GetClientPos();
        if (state !== 1) this.hideClocks();
        const ruleOptions = this.record(config.ruleOptions) ?? {};
        const canPass = localTurn && !Boolean(setInfo.isFirstOp)
            && setInfo.mustBeatWhenPossible === false
            && ruleOptions.allowPassByRoomRule === true;
        const automaticWholeHand = this.isAutomaticWholeHand(setInfo, localTurn);
        this.operations.render({
            isLocalTurn: localTurn,
            canPass,
            // A legal whole-hand play is submitted automatically. Keep both
            // manual actions hidden for the complete delay/request lifecycle;
            // authority refreshes must not make them flash back into view.
            canTip: localTurn && !this.autoPlayInFlight && !automaticWholeHand,
            canPlay: localTurn && !this.autoPlayInFlight && !automaticWholeHand,
            isCompeteDealer: this.competeDealerPhase,
        });
        this.centerOperationButtons();
        for (const entry of entries) {
            const player = players[entry.dataSeat];
            const count = this.remainingCards.get(entry.dataSeat)
                ?? Number(player?.cardCount ?? player?.cardNum ?? player?.handCardCount ?? 0);
            this.setRemainingCardCount(entry.physicalSlot, count);
        }
        if (!localTurn) this.cancelAutoPlay();
    }

    private centerOperationButtons(): void {
        const container = this.view?.find(PdkRoomNodePath.operationButtons);
        if (!container) return;
        if (container.parent) container.setSiblingIndex(container.parent.children.length - 1);
        this.operations?.syncLayout();
    }

    private setRemainingCardCount(physicalSlot: number, count: number): void {
        const path = `Players/Play_${physicalSlot}/Head/RemainingCount`;
        const node = this.view?.find(path);
        if (!node) return;
        const label = node.getComponent(Label)
            ?? node.getChildByName('Count')?.getComponent(Label)
            ?? node.getChildByName('Label')?.getComponent(Label);
        if (label) label.string = count > 0 ? `${count}张` : '';
        node.active = count > 0;
    }

    private async renderHeads(): Promise<void> {
        const seats = this.seats;
        if (!seats) return;
        const positions = this.runtime.getRoomPosManager();
        const players = positions.GetRoomAllPlayerInfo() ?? {};
        const count = this.authoritativePlayerCount();
        const roundKey = this.continueReadyRoundKey(this.runtime.getRoomSet().GetRoomSetInfo() ?? {});
        const showReady = Number(this.runtime.getRoom().GetRoomProperty('state') ?? 0) !== 1
            && this.continueReadyHiddenRoundKey !== roundKey;
        for (const entry of createSeatEntries(count, positions.GetClientPos())) {
            const player = players[entry.dataSeat] ?? {};
            await seats.renderHead(entry.dataSeat, entry.physicalSlot, player, {
                ownerId: Number(this.runtime.getRoom().GetRoomProperty('ownerID') ?? 0),
                showReady,
            });
            if (seats !== this.seats) return;
        }
        const pending = this.pendingSocialEffects.splice(0);
        for (const effect of pending) effect();
    }

    /**
     * The last player's badge must complete its actual head render before the
     * one-second all-ready hold begins. Starting the timer from packet receipt
     * can expire while asynchronous avatar/head rendering is still in flight,
     * making the last continuer appear to have never shown a badge.
     */
    private async renderHeadsThenScheduleContinueClear(setInfo: Record<string, unknown>): Promise<void> {
        await this.renderHeads();
        this.scheduleContinueReadyClear(setInfo);
    }

    private queueSocialEffect(effect: () => void): void {
        // Social pushes can arrive immediately after the authority join response,
        // while cached room forms and CommonHead prefabs are still loading.
        if (this.pendingSocialEffects.length >= 64) this.pendingSocialEffects.shift();
        this.pendingSocialEffects.push(effect);
    }

    private async renderHand(animateDeal = false, authorityHand?: readonly number[]): Promise<void> {
        const parent = this.view?.find('Players/Play_0/Card/Hand_Cards');
        if (!parent) return;
        const generation = ++this.handRenderGeneration;
        const hand = [...(authorityHand ?? this.logic.GetHandCard() ?? [])].map(Number);
        const visibleNodes: Node[] = [];
        const visibleValues: number[] = [];
        for (let index = 0; index < this.cardNodes.length; index += 1) {
            const card = this.cardNodes[index];
            if (!card?.isValid || !card.active) continue;
            visibleNodes.push(card);
            visibleValues.push(this.cardValues[index]);
        }
        // Authority is allowed to return the same remaining cards in a different
        // order. Match them by value and reuse their physical nodes; rebuilding
        // the whole hand would replace the running compaction tween with a flash.
        const nodeQueues = new Map<number, Node[]>();
        visibleNodes.forEach((node, index) => {
            const value = visibleValues[index];
            const queue = nodeQueues.get(value) ?? [];
            queue.push(node);
            nodeQueues.set(value, queue);
        });
        const reconciledNodes = hand.flatMap((value) => nodeQueues.get(value)?.shift() ?? []);
        if (!animateDeal && reconciledNodes.length === hand.length
            && [...nodeQueues.values()].every((queue) => queue.length === 0)) {
            for (const card of this.cardNodes) {
                if (!card.isValid || card.active) continue;
                card.removeFromParent();
                card.destroy();
            }
            reconciledNodes.forEach((card, index) => card.setSiblingIndex(index));
            this.cardNodes.splice(0, this.cardNodes.length, ...reconciledNodes);
            this.cardValues.splice(0, this.cardValues.length, ...hand);
            this.clearDragSelection();
            this.resetPromptCycle();
            const handLayout = parent.getComponent(Layout);
            if (handLayout) {
                // The matching-hand fast path can run after selected nodes were
                // detached. Reflow the surviving physical nodes instead of
                // accepting their old positions with gaps between them.
                handLayout.enabled = true;
                handLayout.updateLayout();
                handLayout.enabled = false;
            }
            this.cards.synchronizeLayout(this.cardNodes);
            this.syncHandTouchArea();
            this.assertHandNodeInvariant(parent, hand.length);
            this.bindGestureSurface(this.view?.find('Players/Play_0/Card/Hand_TouchArea') ?? null);
            this.prepareHintCache();
            return;
        }
        this.cards.stopAll(true);
        this.cards.clear(parent);
        this.cardNodes.length = 0;
        this.cardValues.length = 0;
        this.clearDragSelection();
        this.resetPromptCycle();
        for (let index = 0; index < hand.length; index += 1) {
            const card = await this.cards.create(parent, Number(hand[index]), false);
            if (generation !== this.handRenderGeneration || !parent.isValid) {
                if (card.isValid) card.destroy();
                return;
            }
            const legacyHitTargets = [card];
            while (legacyHitTargets.length > 0) {
                const target = legacyHitTargets.pop()!;
                const legacyButton = target.getComponent(Button);
                if (legacyButton) legacyButton.enabled = false;
                const cardTransform = target.getComponent(UITransform);
                if (cardTransform) cardTransform.hitTest = () => false;
                legacyHitTargets.push(...target.children);
            }
            this.cardNodes.push(card);
            this.cardValues.push(Number(hand[index]));
        }
        if (generation !== this.handRenderGeneration) return;
        const handLayout = parent.getComponent(Layout);
        if (handLayout) {
            // Hand_Cards owns visual arrangement only. Let Layout settle the cards,
            // then freeze it so selection tweens can raise cards without Layout
            // writing their Y positions back. Hand_TouchArea owns all hit testing.
            handLayout.enabled = true;
            handLayout.updateLayout();
        }
        this.cards.synchronizeLayout(this.cardNodes);
        if (handLayout) handLayout.enabled = false;
        if (animateDeal && this.cardNodes.length > 0) {
            const overlay = this.flyingCardOverlay();
            if (overlay && this.view) {
                const origin = new Node('PdkDealOrigin');
                overlay.addChild(origin);
                origin.setWorldPosition(this.view.root.worldPosition);
                await PokerDealNodeAnim.play(this.cardNodes, [origin]);
                if (origin.isValid) origin.destroy();
                if (generation !== this.handRenderGeneration || !parent.isValid) return;
            }
        }
        this.syncHandTouchArea();
        this.assertHandNodeInvariant(parent, hand.length);
        this.bindGestureSurface(this.view?.find('Players/Play_0/Card/Hand_TouchArea') ?? null);
        this.prepareHintCache();
    }

    private shouldAnimateDeal(setInfo: Record<string, unknown>): boolean {
        const phase = String(setInfo.authorityPhase ?? setInfo.phase ?? '').toUpperCase();
        const hand = this.logic.GetHandCard() ?? [];
        const actions = Array.isArray(setInfo.tableOperations) ? setInfo.tableOperations : [];
        const playHistory = Array.isArray(setInfo.playHistory) ? setInfo.playHistory : [];
        const playedCardList = Array.isArray(setInfo.playedCardList) ? setInfo.playedCardList : [];
        const hasPlayedCards = playedCardList.some((cards) => Array.isArray(cards) && cards.length > 0);
        // A completed trick also returns to an empty-table/first-operation state.
        // Only a genuinely untouched round may run the deal animation; otherwise
        // receiving a later play can make an existing hand look dealt a second time.
        if ((phase && phase !== 'PLAYING' && phase !== 'COMPETE_DEALER') || hand.length === 0 || actions.length > 0
            || playHistory.length > 0 || hasPlayedCards) return false;
        const roundNo = Number(setInfo.roundNo ?? setInfo.setID ?? this.runtime.getRoom().GetRoomProperty('setID') ?? 0);
        const key = `${this.roomId()}:${roundNo}`;
        if (this.lastDealAnimationKey === key) return false;
        this.lastDealAnimationKey = key;
        return true;
    }

    public async waitForRoundEndPresentation(): Promise<void> {
        const deadline = Date.now() + 2500;
        let quietFrames = 0;
        while (quietFrames < 4 && Date.now() < deadline) {
            if (this.playInFlight || this.pendingPresentations.size > 0) {
                quietFrames = 0;
                if (this.pendingPresentations.size > 0) {
                    await Promise.race([
                        Promise.allSettled([...this.pendingPresentations]),
                        new Promise<void>((resolve) => globalThis.setTimeout(resolve, 100)),
                    ]);
                } else {
                    await new Promise<void>((resolve) => globalThis.setTimeout(resolve, 16));
                }
                continue;
            }
            quietFrames += 1;
            await new Promise<void>((resolve) => globalThis.setTimeout(resolve, 16));
        }
    }

    /** 房间首帧必须包含权威头像和牌面，避免重连时先暴露空场景或黑色底帧。 */
    public async waitForInitialPresentation(): Promise<void> {
        const initial = [...this.pendingPresentations];
        if (initial.length === 0) return;
        await Promise.allSettled(initial);
    }

    private trackPresentation<T>(promise: Promise<T>): Promise<T> {
        let cancel = (): void => undefined;
        const tracked = new Promise<T>((resolve, reject) => {
            let settled = false;
            const finish = (callback: () => void): void => {
                if (settled) return;
                settled = true;
                callback();
            };
            cancel = () => finish(() => resolve(undefined as T));
            promise.then(
                (value) => finish(() => resolve(value)),
                (error) => finish(() => reject(error)),
            );
        });
        this.pendingPresentations.add(tracked);
        this.presentationCancellations.set(tracked, cancel);
        const cleanup = (): void => {
            this.pendingPresentations.delete(tracked);
            this.presentationCancellations.delete(tracked);
        };
        void tracked.then(cleanup, cleanup);
        return tracked;
    }

    private cancelPendingPresentations(): void {
        for (const cancel of [...this.presentationCancellations.values()]) cancel();
        this.presentationCancellations.clear();
        this.pendingPresentations.clear();
    }

    private assertHandNodeInvariant(parent: Node, expected: number): void {
        const tracked = this.cardNodes.filter((child) => child.isValid && child.parent === parent).length;
        if (tracked === expected) return;
        // Keep protocol/node diagnostics in the developer console. This error is
        // caught by report(), which presents only a player-readable fallback.
        throw new Error(`手牌节点数量失配: authoritative=${expected}, tracked=${tracked}`);
    }

    private async toggleCardAt(index: number, capturedPointer = false): Promise<void> {
        if (!capturedPointer && Date.now() < this.suppressClickUntil) return;
        if (index < 0 || index >= this.cardNodes.length) return;
        const before = [...(this.logic.GetSelectCard() ?? [])].map(Number).sort((a, b) => a - b).join(',');
        // Selecting cards is presentation only. Authority validates the chosen
        // play after the user presses Play, so no rank/type filter belongs here.
        if (this.logic.CheckSelected(this.logic.GetHandCard()[index])) this.logic.DeleteCardSelected(index + 1);
        else this.logic.SetCardSelected(index + 1);
        this.resetPromptCycle();
        this.updateSelection();
        this.refresh();
        const after = [...(this.logic.GetSelectCard() ?? [])].map(Number).sort((a, b) => a - b).join(',');
        if (before !== after) void this.roomAudio?.play('xuanpai');
    }

    private async toggleSingleResponseCard(index: number): Promise<void> {
        const hand = (this.logic.GetHandCard() ?? []).map(Number);
        const clicked = hand[index];
        const selected = [...(this.logic.GetSelectCard() ?? [])].map(Number);
        // A plain higher single is locally deterministic. Raise it in the click frame while
        // the authoritative candidates are fetched for regional bomb handling.
        const lastSingle = Number(this.logic.lastCardList?.[0] ?? 0);
        const locallyLegalSingle = this.cardRank(clicked) > this.cardRank(lastSingle)
            && (!this.nextPlayerReportedSingle() || this.cardRank(clicked) === this.highestHandRank());
        if (!selected.includes(clicked) && locallyLegalSingle) {
            this.logic.ChangeSelectCard([clicked]);
            this.updateSelection();
        }
        const candidates = this.sortedLegalTipCandidates(this.logic.GetTipCard(), false);
        const singleCards = new Set(candidates.filter((cards) => cards.length === 1).map((cards) => cards[0]));
        const bombs = candidates.filter((cards) => cards.length > 1);
        const containingBombs = bombs.filter((bomb) => bomb.includes(clicked));
        let next: number[] = [];
        if (selected.includes(clicked)) {
            const removed = selected.filter((card) => card !== clicked);
            next = this.validPartialBomb(removed, bombs) || (removed.length === 1 && singleCards.has(removed[0])) ? removed : [];
        } else {
            const combined = [...selected, clicked];
            if (selected.length > 0 && this.validPartialBomb(combined, containingBombs)) next = combined;
            else if (singleCards.has(clicked)) next = [clicked];
            else if (containingBombs.length > 0) next = [clicked];
            else return;
        }
        this.logic.ChangeSelectCard(this.cardsInHandOrder(next));
        this.resetPromptCycle();
        this.updateSelection();
        this.refresh();
    }

    private validPartialBomb(cards: readonly number[], bombs: readonly number[][]): boolean {
        if (cards.length === 0) return false;
        return bombs.some((bomb) => cards.every((card) => bomb.includes(card)));
    }

    private updateSelection(): void {
        const selectedSlots = pdkSelectionMask(
            (this.logic.GetHandCard() ?? []).map(Number),
            (this.logic.GetSelectCard() ?? []).map(Number),
        );
        this.cardNodes.forEach((node, index) => this.cards.select(node, selectedSlots[index] === true));
    }

    private onRoomTouchEnd(event: EventTouch): void {
        const target = event.target instanceof Node ? event.target : null;
        const location = event.getUILocation();
        // CommonRoom is rendered below the full-screen PDK form. Forward the
        // visible More button's hit through this top layer when it owns the touch.
        const more = this.commonView?.find(CommonRoomNodePath.moreButton);
        const moreBounds = more?.getComponent(UITransform)?.getBoundingBoxToWorld();
        if (moreBounds && location.x >= moreBounds.x && location.x <= moreBounds.x + moreBounds.width
            && location.y >= moreBounds.y && location.y <= moreBounds.y + moreBounds.height) {
            this.toggleMoreMenu();
            return;
        }
        const screen = event.getLocation();
        const windowId = Number((event as EventTouch & { windowId?: number }).windowId ?? 0);
        this.clearSelectionOutsideCards(target, screen.x, screen.y, windowId, location.x, location.y);
    }

    private onRoomMouseUp(event: EventMouse): void {
        if (event.getButton() !== EventMouse.BUTTON_LEFT) return;
        const target = event.target instanceof Node ? event.target : null;
        const location = event.getLocation();
        const uiLocation = event.getUILocation();
        const windowId = Number((event as EventMouse & { windowId?: number }).windowId ?? 0);
        this.clearSelectionOutsideCards(target, location.x, location.y, windowId, uiLocation.x, uiLocation.y);
    }

    private clearSelectionOutsideCards(
        target: Node | null,
        screenX: number,
        screenY: number,
        windowId: number,
        uiX: number,
        uiY: number,
    ): void {
        if ((this.logic.GetSelectCard() ?? []).length === 0) return;
        // Browser PointerEvent owns this physical release. Cocos can dispatch a
        // second room-level mouse/touch up with a differently scaled position;
        // it must never reinterpret the same card tap as an outside-hand clear.
        if (this.capturedPointerId !== null || Date.now() < this.suppressClickUntil) return;
        if (this.hasInteractiveButtonAncestor(target)) return;
        // The visible cards, rather than the oversized gesture surface, define
        // "inside the hand". UI and screen coordinates come from different
        // Creator event paths; either exact hit proves that the release is on a
        // real card and therefore cannot clear the complete selection.
        if (this.cardIndexAtUi(uiX, uiY) >= 0
            || this.cardIndexAtScreen(screenX, screenY, windowId) >= 0) return;
        this.logic.ChangeSelectCard([]);
        this.resetPromptCycle();
        this.cards.stopAll(false);
        this.updateSelection();
    }

    private hasInteractiveButtonAncestor(start: Node | null): boolean {
        let current = start;
        while (current) {
            const button = current.getComponent(Button);
            if (button?.interactable && current.activeInHierarchy) return true;
            if (current === this.view?.root) break;
            current = current.parent;
        }
        return false;
    }

    private onHandTouchStart(event: EventTouch): void {
        if (this.capturedPointerId !== null || this.dragActive) return;
        const sample = this.sampleFromTouch(event);
        event.propagationStopped = true;
        const location = sample.ui;
        this.dragActive = true;
        this.dragMoved = false;
        this.dragStartIndex = sample.index;
        // Keep taps strict (an empty-area tap must do nothing), but remember the
        // nearest hand slot as the drag anchor. Once movement starts, every
        // horizontal path inside the bottom hand band participates even when it
        // begins before the first card or ends after the last card.
        this.dragLastIndex = this.dragIndexAtUi(sample.ui.x, sample.ui.y);
        this.dragStartUi.set(location.x, location.y, 0);
        this.dragIndices.clear();
        if (sample.index >= 0) {
            this.dragIndices.add(sample.index);
            this.previewDragSelection();
        }
        this.lastPointerSample = sample;
        this.traceGesture('bridge-start', sample.index, [], sample);
    }

    private bindGestureSurface(surface: Node | null): void {
        // Native Cocos events remain the input path for packaged clients. Browser
        // Preview additionally captures the Canvas pointer so sibling UI nodes
        // cannot interrupt a swipe that begins in empty bottom-band space.
        if (!surface) return;
        this.installHandHitTest(surface);
        this.syncHandTouchArea();
        if (surface === this.gestureSurface) return;
        if (this.gestureSurface) {
            this.gestureSurface.off(Node.EventType.TOUCH_START, this.onHandTouchStart, this, true);
            this.gestureSurface.off(Node.EventType.TOUCH_MOVE, this.onHandTouchMove, this, true);
            this.gestureSurface.off(Node.EventType.TOUCH_CANCEL, this.onHandTouchCancel, this, true);
            this.gestureSurface.off(Node.EventType.TOUCH_END, this.onHandTouchEnd, this, true);
            this.gestureSurface.off(Node.EventType.MOUSE_DOWN, this.onHandMouseDown, this, true);
            this.gestureSurface.off(Node.EventType.MOUSE_MOVE, this.onHandMouseMove, this, true);
            this.gestureSurface.off(Node.EventType.MOUSE_UP, this.onHandMouseUp, this, true);
            this.gestureSurface.off(Node.EventType.MOUSE_LEAVE, this.onHandMouseCancel, this, true);
            this.bound.delete(this.gestureSurface);
        }
        surface.on(Node.EventType.TOUCH_START, this.onHandTouchStart, this, true);
        surface.on(Node.EventType.TOUCH_MOVE, this.onHandTouchMove, this, true);
        surface.on(Node.EventType.TOUCH_CANCEL, this.onHandTouchCancel, this, true);
        surface.on(Node.EventType.TOUCH_END, this.onHandTouchEnd, this, true);
        surface.on(Node.EventType.MOUSE_DOWN, this.onHandMouseDown, this, true);
        surface.on(Node.EventType.MOUSE_MOVE, this.onHandMouseMove, this, true);
        surface.on(Node.EventType.MOUSE_UP, this.onHandMouseUp, this, true);
        surface.on(Node.EventType.MOUSE_LEAVE, this.onHandMouseCancel, this, true);
        this.gestureSurface = surface;
        this.bound.add(surface);
        this.bindDomPointerBridge();
    }

    private installHandHitTest(hand: Node): void {
        const transform = hand.getComponent(UITransform);
        if (!transform || transform === this.handTransform) return;
        this.restoreHandHitTest();
        this.handTransform = transform;
    }

    private restoreHandHitTest(): void {
        this.handTransform = null;
        this.handVisibleWidth = 0;
    }

    private syncHandTouchArea(): void {
        const hand = this.view?.find('Players/Play_0/Card/Hand_TouchArea');
        const transform = hand?.getComponent(UITransform);
        if (!hand || !transform) return;
        const worldScaleX = Math.abs(hand.worldScale.x) || 1;
        const worldScaleY = Math.abs(hand.worldScale.y) || 1;
        const visibleWidth = view.getVisibleSize().width / worldScaleX;
        const bottomSelectionHeight = view.getVisibleSize().height * 0.5 / worldScaleY;
        if (!Number.isFinite(visibleWidth) || visibleWidth <= 0
            || !Number.isFinite(bottomSelectionHeight) || bottomSelectionHeight <= 0) return;
        const sizeAlreadyApplied = Math.abs(transform.width - visibleWidth) < 0.01
            && Math.abs(transform.height - bottomSelectionHeight) < 0.01;
        if (sizeAlreadyApplied && Math.abs(visibleWidth - this.handVisibleWidth) < 0.01) return;
        this.handVisibleWidth = visibleWidth;
        // Only the dedicated invisible interaction surface follows the live Canvas.
        // Hand_Cards keeps its authored Layout width/scale and is never used as a hit area.
        transform.setContentSize(visibleWidth, bottomSelectionHeight);
    }

    private isHandInteractionEnabled(): boolean {
        return this.cardNodes.length > 0
            && !this.competeDealerPhase
            && Number(this.runtime.getRoom().GetRoomProperty('state') ?? 0) === 1;
    }

    private bindDomPointerBridge(): void {
        const canvas = typeof HTMLCanvasElement !== 'undefined' && game.canvas instanceof HTMLCanvasElement
            ? game.canvas : null;
        if (canvas === this.gestureCanvas) return;
        this.unbindDomPointerBridge();
        if (!canvas) return;
        this.gestureCanvas = canvas;
        canvas.style.touchAction = 'none';
        // Creator Preview places simulator/debug DOM layers above the actual
        // canvas. Capture on document so those layers cannot swallow a hand
        // swipe before it reaches the canvas; coordinates are still normalized
        // against the real canvas bounds in sampleFromPointer.
        document.addEventListener('pointerdown', this.onDomPointerDown, true);
        document.addEventListener('pointermove', this.onDomPointerMove, true);
        document.addEventListener('pointerup', this.onDomPointerUp, true);
        document.addEventListener('pointercancel', this.onDomPointerCancel, true);
    }

    private unbindDomPointerBridge(): void {
        const canvas = this.gestureCanvas;
        if (!canvas) return;
        document.removeEventListener('pointerdown', this.onDomPointerDown, true);
        document.removeEventListener('pointermove', this.onDomPointerMove, true);
        document.removeEventListener('pointerup', this.onDomPointerUp, true);
        document.removeEventListener('pointercancel', this.onDomPointerCancel, true);
        this.gestureCanvas = null;
        this.capturedPointerId = null;
        this.bridgedButton = null;
    }

    private readonly onDomPointerDown = (event: PointerEvent): void => {
        if (!event.isPrimary || (event.pointerType === 'mouse' && event.button !== 0)) return;
        // A fresh primary down means the browser has already ended the previous
        // physical gesture. Safari can omit pointerup/pointercancel while the
        // Canvas is resized or loses focus; recover here so operation buttons do
        // not remain permanently locked by the stale captured pointer.
        if (this.capturedPointerId !== null) {
            try { this.gestureCanvas?.releasePointerCapture(this.capturedPointerId); } catch { /* capture already lost */ }
            this.capturedPointerId = null;
            this.bridgedButton = null;
            this.cancelDragSelection();
        }
        const sample = this.sampleFromPointer(event);
        this.traceDomPointer('down', sample);
        const interactiveButton = this.interactiveButtonAtUi(sample.ui.x, sample.ui.y);
        if (interactiveButton) {
            event.preventDefault();
            event.stopImmediatePropagation();
            this.capturedPointerId = event.pointerId;
            this.bridgedButton = interactiveButton;
            try { this.gestureCanvas?.setPointerCapture(event.pointerId); } catch { /* detached Canvas */ }
            return;
        }
        const dragIndex = this.dragIndexAtUi(sample.ui.x, sample.ui.y);
        if (!this.isHandInteractionEnabled() || dragIndex < 0) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        this.capturedPointerId = event.pointerId;
        this.dragActive = true;
        this.dragMoved = false;
        this.dragStartIndex = sample.index;
        this.dragLastIndex = dragIndex;
        this.dragStartUi.set(sample.ui.x, sample.ui.y, 0);
        this.dragIndices.clear();
        if (sample.index >= 0) {
            this.dragIndices.add(sample.index);
            this.previewDragSelection();
        }
        this.lastPointerSample = sample;
        try { this.gestureCanvas?.setPointerCapture(event.pointerId); } catch { /* detached Canvas */ }
        this.traceGesture('dom-start', sample.index, [], sample);
    };

    private readonly onDomPointerMove = (event: PointerEvent): void => {
        if (event.pointerId !== this.capturedPointerId) return;
        if (this.bridgedButton) {
            event.preventDefault();
            event.stopImmediatePropagation();
            return;
        }
        if (!this.dragActive) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        const sample = this.sampleFromPointer(event);
        this.traceDomPointer('move', sample);
        this.lastPointerSample = sample;
        if (Math.abs(sample.ui.x - this.dragStartUi.x) + Math.abs(sample.ui.y - this.dragStartUi.y) >= DRAG_THRESHOLD_PX) {
            this.dragMoved = true;
        }
        const index = this.dragIndexAtUi(sample.ui.x, sample.ui.y);
        if (index >= 0) {
            if (this.dragLastIndex >= 0) {
                for (const item of this.coveredDragIndices(this.dragLastIndex, index)) this.dragIndices.add(item);
            } else {
                this.dragIndices.add(index);
            }
            this.dragLastIndex = index;
            if (this.dragIndices.size > 1) this.dragMoved = true;
            this.previewDragSelection();
        }
        this.traceGesture('move', sample.index, [], sample);
    };

    private readonly onDomPointerUp = (event: PointerEvent): void => {
        if (event.pointerId !== this.capturedPointerId) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        const sample = this.sampleFromPointer(event);
        this.traceDomPointer('up', sample);
        try { this.gestureCanvas?.releasePointerCapture(event.pointerId); } catch { /* already released */ }
        this.capturedPointerId = null;
        const bridgedButton = this.bridgedButton;
        this.bridgedButton = null;
        if (bridgedButton) {
            if (bridgedButton === this.interactiveButtonAtUi(sample.ui.x, sample.ui.y)) {
                bridgedButton.emit(Button.EventType.CLICK, bridgedButton);
            }
            return;
        }
        if (!this.dragActive) return;
        this.suppressClickUntil = Date.now() + CLICK_SUPPRESS_MS;
        if (this.dragMoved) {
            if (this.dragIndices.size > 0) this.commitSmartDragSelection(sample);
            else {
                this.traceGesture('cancel', -1, [], sample);
                this.cancelDragSelection();
            }
            return;
        }
        const index = this.dragStartIndex;
        this.cancelDragSelection();
        this.traceGesture('tap', index, [], sample);
        if (index >= 0) void this.toggleCardAt(index, true).catch((error: unknown) => this.report(error, '选牌失败'));
    };

    private readonly onDomPointerCancel = (event: PointerEvent): void => {
        if (event.pointerId !== this.capturedPointerId) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        const sample = this.sampleFromPointer(event);
        this.traceDomPointer('cancel', sample);
        try { this.gestureCanvas?.releasePointerCapture(event.pointerId); } catch { /* already released */ }
        this.capturedPointerId = null;
        if (this.bridgedButton) {
            this.bridgedButton = null;
            return;
        }
        this.traceGesture('cancel', -1, [], sample);
        this.cancelDragSelection();
    };

    private interactiveButtonAtUi(uiX: number, uiY: number): Node | null {
        const root = this.view?.root;
        if (!root) return null;
        const world = new Vec3(uiX, uiY, 0);
        const buttons = root.getComponentsInChildren(Button);
        for (let index = buttons.length - 1; index >= 0; index -= 1) {
            const button = buttons[index];
            const candidate = button.node;
            const transform = candidate.getComponent(UITransform);
            if (!candidate.activeInHierarchy || !button.enabled || !button.interactable || !transform) continue;
            const local = transform.convertToNodeSpaceAR(world);
            const left = -transform.anchorPoint.x * transform.width;
            const right = (1 - transform.anchorPoint.x) * transform.width;
            const bottom = -transform.anchorPoint.y * transform.height;
            const top = (1 - transform.anchorPoint.y) * transform.height;
            if (local.x >= left && local.x <= right && local.y >= bottom && local.y <= top) return candidate;
        }
        return null;
    }

    private sampleFromPointer(event: PointerEvent): HandPointerSample {
        const canvas = this.gestureCanvas;
        const bounds = canvas?.getBoundingClientRect();
        const visibleOrigin = view.getVisibleOrigin();
        const visibleSize = view.getVisibleSize();
        // PointerEvent and getBoundingClientRect are guaranteed to share CSS-pixel
        // coordinates. Convert by the pointer's normalized position inside the
        // visible Canvas, not by DPR or backing-store dimensions: Creator Preview
        // shells and Safari can report a device DPR that differs from the Canvas
        // render DPR, which otherwise shifts every card hit horizontally.
        const canvasX = bounds ? event.clientX - bounds.left : event.clientX;
        const canvasY = bounds ? event.clientY - bounds.top : event.clientY;
        const normalizedX = bounds?.width ? canvasX / bounds.width : 0;
        const normalizedY = bounds?.height ? canvasY / bounds.height : 0;
        const uiX = visibleOrigin.x + normalizedX * visibleSize.width;
        const uiY = visibleOrigin.y + (1 - normalizedY) * visibleSize.height;
        return this.buildPointerSample({
            pointerId: event.pointerId,
            source: this.pointerSource(event.pointerType),
            raw: { x: event.pageX, y: event.pageY },
            client: { x: event.clientX, y: event.clientY },
            canvas: { x: canvasX, y: canvasY },
            screen: { x: uiX, y: uiY },
            ui: { x: uiX, y: uiY },
            targetPath: this.domTargetPath(event.target),
            windowId: 0,
            domPointer: true,
        });
    }

    private sampleFromTouch(event: EventTouch): HandPointerSample {
        const ui = event.getUILocation();
        const screen = event.getLocation();
        const canvas = this.gestureCanvas;
        const bounds = canvas?.getBoundingClientRect();
        const visibleOrigin = view.getVisibleOrigin();
        const visibleSize = view.getVisibleSize();
        const normalizedX = visibleSize.width ? (ui.x - visibleOrigin.x) / visibleSize.width : 0;
        const normalizedY = visibleSize.height ? (ui.y - visibleOrigin.y) / visibleSize.height : 0;
        const canvasX = bounds ? normalizedX * bounds.width : ui.x;
        const canvasY = bounds ? (1 - normalizedY) * bounds.height : ui.y;
        const clientX = bounds ? bounds.left + canvasX : ui.x;
        const clientY = bounds ? bounds.top + canvasY : ui.y;
        const windowId = Number((event as EventTouch & { windowId?: number }).windowId ?? 0);
        return this.buildPointerSample({
            pointerId: Number(event.getID?.() ?? 0),
            source: 'touch',
            raw: { x: clientX, y: clientY },
            client: { x: clientX, y: clientY },
            canvas: { x: canvasX, y: canvasY },
            screen: { x: screen.x, y: screen.y },
            ui: { x: ui.x, y: ui.y },
            targetPath: this.nodeTargetPath(event.target instanceof Node ? event.target : null),
            windowId,
            domPointer: false,
        });
    }

    private sampleFromMouse(event: EventMouse): HandPointerSample {
        const ui = event.getUILocation();
        const location = event.getLocation();
        return this.buildPointerSample({
            pointerId: -2,
            source: 'mouse',
            raw: { x: location.x, y: location.y },
            client: { x: location.x, y: location.y },
            canvas: { x: location.x, y: location.y },
            screen: { x: location.x, y: location.y },
            ui: { x: ui.x, y: ui.y },
            targetPath: this.nodeTargetPath(event.target instanceof Node ? event.target : null),
            windowId: Number((event as EventMouse & { windowId?: number }).windowId ?? 0),
            domPointer: false,
        });
    }

    private buildPointerSample(base: Omit<HandPointerSample, 'handLocal' | 'cardLocal' | 'index'>): HandPointerSample {
        const index = base.domPointer
            ? this.cardIndexAtUi(base.ui.x, base.ui.y)
            : this.cardIndexAtScreen(base.screen.x, base.screen.y, base.windowId);
        const world = new Vec3(base.ui.x, base.ui.y, 0);
        const handTransform = this.view?.find('Players/Play_0/Card/Hand_TouchArea')?.getComponent(UITransform);
        const handPoint = handTransform?.convertToNodeSpaceAR(world);
        const indexedCard = index >= 0 ? this.cardNodes[index] : null;
        const cardPoint = indexedCard?.isValid
            ? indexedCard.getComponent(UITransform)?.convertToNodeSpaceAR(world) : null;
        return {
            ...base,
            handLocal: handPoint ? { x: handPoint.x, y: handPoint.y } : null,
            cardLocal: cardPoint ? { x: cardPoint.x, y: cardPoint.y } : null,
            index,
        };
    }

    private pointerSource(value: string): HandPointerSource {
        return value === 'touch' || value === 'pen' ? value : 'mouse';
    }

    private domTargetPath(target: EventTarget | null): string {
        if (!(target instanceof Element)) return '';
        const parts: string[] = [];
        let current: Element | null = target;
        while (current && parts.length < 8) {
            const id = current.id ? `#${current.id}` : '';
            parts.unshift(`${current.tagName.toLowerCase()}${id}`);
            current = current.parentElement;
        }
        return parts.join('>');
    }

    private nodeTargetPath(target: Node | null): string {
        const parts: string[] = [];
        let current = target;
        while (current) {
            parts.unshift(current.name);
            current = current.parent;
        }
        return parts.join('/');
    }

    private traceDomPointer(stage: string, sample: HandPointerSample): void {
        const host = globalThis as typeof globalThis & { __PDK_DOM_POINTER_TRACE__?: unknown[] };
        const trace = host.__PDK_DOM_POINTER_TRACE__ ?? [];
        trace.push({ stage, ...sample, at: Date.now() });
        if (trace.length > 200) trace.splice(0, trace.length - 200);
        host.__PDK_DOM_POINTER_TRACE__ = trace;
    }

    private onHandTouchMove(event: EventTouch): void {
        if (!this.dragActive || this.capturedPointerId !== null) return;
        event.propagationStopped = true;
        const sample = this.sampleFromTouch(event);
        const index = this.dragIndexAtUi(sample.ui.x, sample.ui.y);
        const location = sample.ui;
        if (Math.abs(location.x - this.dragStartUi.x) + Math.abs(location.y - this.dragStartUi.y) >= DRAG_THRESHOLD_PX) {
            this.dragMoved = true;
        }
        if (index < 0) return;
        if (this.dragLastIndex >= 0) {
            for (const item of this.coveredDragIndices(this.dragLastIndex, index)) this.dragIndices.add(item);
        } else {
            this.dragIndices.add(index);
        }
        this.dragLastIndex = index;
        if (this.dragIndices.size > 1) this.dragMoved = true;
        this.previewDragSelection();
        this.lastPointerSample = sample;
        this.traceGesture('bridge-move', index, [], sample);
    }

    private onHandTouchCancel(event: EventTouch): void {
        if (this.capturedPointerId !== null) return;
        event.propagationStopped = true;
        this.traceGesture('cancel', -1, [], this.lastPointerSample);
        this.cancelDragSelection();
    }

    private onHandTouchEnd(event: EventTouch): void {
        if (!this.dragActive || this.capturedPointerId !== null) return;
        event.propagationStopped = true;
        if (this.dragMoved) {
            const sample = this.lastPointerSample;
            if (!sample) { this.cancelDragSelection(); return; }
            this.suppressClickUntil = Date.now() + CLICK_SUPPRESS_MS;
            this.commitSmartDragSelection(sample);
            return;
        }
        const index = this.dragStartIndex;
        const sample = this.lastPointerSample;
        this.cancelDragSelection();
        this.suppressClickUntil = Date.now() + CLICK_SUPPRESS_MS;
        this.traceGesture('bridge-tap', index, [], sample);
        void this.toggleCardAt(index, true).catch((error: unknown) => this.report(error, '选牌失败'));
    }

    private onHandMouseDown(event: EventMouse): void {
        if (event.getButton() !== EventMouse.BUTTON_LEFT || this.capturedPointerId !== null || this.dragActive) return;
        event.propagationStopped = true;
        const sample = this.sampleFromMouse(event);
        this.dragActive = true;
        this.dragMoved = false;
        this.dragStartIndex = sample.index;
        this.dragLastIndex = this.dragIndexAtUi(sample.ui.x, sample.ui.y);
        this.dragStartUi.set(sample.ui.x, sample.ui.y, 0);
        this.dragIndices.clear();
        if (sample.index >= 0) {
            this.dragIndices.add(sample.index);
            this.previewDragSelection();
        }
        this.lastPointerSample = sample;
        this.traceGesture('mouse-start', sample.index, [], sample);
    }

    private onHandMouseMove(event: EventMouse): void {
        if (!this.dragActive || this.capturedPointerId !== null) return;
        event.propagationStopped = true;
        const sample = this.sampleFromMouse(event);
        if (Math.abs(sample.ui.x - this.dragStartUi.x) + Math.abs(sample.ui.y - this.dragStartUi.y) >= DRAG_THRESHOLD_PX) {
            this.dragMoved = true;
        }
        const index = this.dragIndexAtUi(sample.ui.x, sample.ui.y);
        if (index >= 0) {
            if (this.dragLastIndex >= 0) {
                for (const item of this.coveredDragIndices(this.dragLastIndex, index)) this.dragIndices.add(item);
            } else {
                this.dragIndices.add(index);
            }
            this.dragLastIndex = index;
            if (this.dragIndices.size > 1) this.dragMoved = true;
            this.previewDragSelection();
        }
        this.lastPointerSample = sample;
        this.traceGesture('mouse-move', sample.index, [], sample);
    }

    private onHandMouseUp(event: EventMouse): void {
        if (!this.dragActive || this.capturedPointerId !== null) return;
        event.propagationStopped = true;
        const sample = this.sampleFromMouse(event);
        this.lastPointerSample = sample;
        if (this.dragMoved) {
            if (this.dragIndices.size > 0) this.commitSmartDragSelection(sample);
            else this.cancelDragSelection();
            return;
        }
        const index = this.dragStartIndex;
        this.cancelDragSelection();
        this.traceGesture('mouse-tap', index, [], sample);
        void this.toggleCardAt(index, true).catch((error: unknown) => this.report(error, '选牌失败'));
    }

    private onHandMouseCancel(event: EventMouse): void {
        if (!this.dragActive || this.capturedPointerId !== null) return;
        event.propagationStopped = true;
        this.traceGesture('mouse-cancel', -1, [], this.sampleFromMouse(event));
        this.cancelDragSelection();
    }

    private cardIndexAtScreen(screenX: number, screenY: number, windowId: number): number {
        const screenPoint = new Vec2(screenX, screenY);
        // Use Creator's camera-aware screen-space hit test as the single source of
        // truth. Comparing Event UI coordinates with world AABBs drifts when the
        // Preview device shell, Retina DPR and Canvas scaling are all active.
        // Cards are rendered from left to right, so the last matching sibling is
        // visually on top in the overlap region.
        for (let index = this.cardNodes.length - 1; index >= 0; index -= 1) {
            const card = this.cardNodes[index];
            if (!card?.isValid) continue;
            const transform = card.getComponent(UITransform);
            if (!transform) continue;
            if (UITransform.prototype.hitTest.call(transform, screenPoint, windowId)) return index;
        }
        // Plain taps remain card-exact so empty-space clicks cannot select a
        // nearby card. Moving swipes use dragIndexAtUi separately.
        return -1;
    }

    /** Exact visible-card hit test for browser PointerEvent coordinates. */
    private cardIndexAtUi(uiX: number, uiY: number): number {
        const world = new Vec3(uiX, uiY, 0);
        for (let index = this.cardNodes.length - 1; index >= 0; index -= 1) {
            const card = this.cardNodes[index];
            const transform = card?.isValid ? card.getComponent(UITransform) : null;
            if (!card?.activeInHierarchy || !transform) continue;
            const local = transform.convertToNodeSpaceAR(world);
            const left = -transform.anchorPoint.x * transform.width;
            const right = (1 - transform.anchorPoint.x) * transform.width;
            const bottom = -transform.anchorPoint.y * transform.height;
            const top = (1 - transform.anchorPoint.y) * transform.height;
            if (local.x >= left && local.x <= right && local.y >= bottom && local.y <= top) return index;
        }
        return -1;
    }

    private dragIndexAtUi(uiX: number, uiY: number): number {
        if (this.cardNodes.length === 0) return -1;
        const surface = this.gestureSurface?.getComponent(UITransform);
        if (!surface) return -1;
        const local = surface.convertToNodeSpaceAR(new Vec3(uiX, uiY, 0));
        const left = -surface.anchorPoint.x * surface.width;
        const right = (1 - surface.anchorPoint.x) * surface.width;
        const bottom = -surface.anchorPoint.y * surface.height;
        const top = (1 - surface.anchorPoint.y) * surface.height;
        if (local.x < left || local.x > right || local.y < bottom || local.y > top) return -1;
        let nearestIndex = -1;
        let nearestDistance = Number.POSITIVE_INFINITY;
        for (let index = 0; index < this.cardNodes.length; index += 1) {
            const card = this.cardNodes[index];
            if (!card?.isValid || !card.activeInHierarchy) continue;
            const distance = Math.abs(card.worldPosition.x - uiX);
            if (distance < nearestDistance) {
                nearestDistance = distance;
                nearestIndex = index;
            }
        }
        return nearestIndex;
    }

    private previewDragSelection(): void {
        this.cardNodes.forEach((node, index) => {
            this.cards.preview(node, this.dragIndices.has(index));
        });
    }

    private commitSmartDragSelection(sample: HandPointerSample): void {
        const hand = (this.logic.GetHandCard() ?? []).map(Number);
        const touched = this.sortedDragIndices().map((index) => hand[index]);
        const required = this.isAuthoritativeLeadingTurn() ? this.activeRequiredFirstCard() : 0;
        if (required > 0 && !touched.includes(required)) {
            this.traceGesture('required-card-missing', this.dragLastIndex, [], sample);
            this.cardNodes.forEach((node) => this.cards.preview(node, false));
            this.clearDragSelection();
            this.showMessage(`必包含${this.cardDisplayName(required)}`);
            return;
        }
        // A swipe is a complete selection action. Its candidate pool is exactly
        // the physical cards crossed by this gesture: do not retain cards from a
        // previous tap and do not inject a required lead card from outside the
        // swipe. Search by descending subset size and select the largest legal
        // regional shape contained wholly inside that pool.
        const selected = this.largestLegalDragCandidates(touched)[0] ?? [];
        this.traceGesture('commit', this.dragLastIndex, selected, sample);
        this.cardNodes.forEach((node) => this.cards.preview(node, false));
        this.logic.ChangeSelectCard(selected);
        this.clearDragSelection();
        this.resetPromptCycle();
        this.updateSelection();
        this.refresh();
    }

    private largestLegalDragCandidates(touched: readonly number[]): number[][] {
        const required = this.isAuthoritativeLeadingTurn() ? this.activeRequiredFirstCard() : 0;
        // Three crossed cards are an intentional partial selection. In regional
        // rules where a triple must carry attachments, classifying this gesture
        // immediately would reduce it to the locally legal pair and make it
        // impossible to keep the complete triple raised while adding kickers.
        // Selection itself is unrestricted; Authority validates only on Play.
        if (touched.length === 3 && (required <= 0 || touched.includes(required))) {
            return [[...touched]];
        }
        return largestLegalPdkSubsets(touched, (subsets) => {
            const candidates = required > 0 ? subsets.filter((cards) => cards.includes(required)) : [...subsets];
            return this.sortedLegalTipCandidates(candidates, true);
        });
    }

    private cancelDragSelection(): void {
        this.cardNodes.forEach((node) => this.cards.preview(node, false));
        this.clearDragSelection();
        this.updateSelection();
    }

    private clearDragSelection(): void {
        this.dragActive = false;
        this.dragMoved = false;
        this.dragStartIndex = -1;
        this.dragLastIndex = -1;
        this.dragIndices.clear();
    }

    private coveredDragIndices(startIndex: number, endIndex: number): number[] {
        const start = Math.min(startIndex, endIndex);
        const end = Math.max(startIndex, endIndex);
        const values: number[] = [];
        for (let item = start; item <= end; item += 1) values.push(item);
        return values;
    }

    private sortedDragIndices(): number[] {
        return [...this.dragIndices].sort((left, right) => left - right);
    }

    private traceGesture(stage: string, index: number, finalCards: readonly number[] = [], sample: HandPointerSample | null = null): void {
        const host = globalThis as typeof globalThis & { __PDK_GESTURE_TRACE__?: unknown[] };
        const trace = host.__PDK_GESTURE_TRACE__ ?? [];
        trace.push({ stage, index, coveredIndexes: this.sortedDragIndices(), finalCards: [...finalCards], ...sample, at: Date.now() });
        if (trace.length > 100) trace.splice(0, trace.length - 100);
        host.__PDK_GESTURE_TRACE__ = trace;
    }

    private async renderPublicOperation(
        packet: Record<string, unknown>,
        expectedProjectionGeneration?: number,
    ): Promise<void> {
        if (!this.view) return;
        const generation = this.presentationGeneration;
        const dataSeat = Number(packet.pos ?? packet.opPos ?? -1);
        const entry = createSeatEntries(this.authoritativePlayerCount(), this.clientSeat()).find((item) => item.dataSeat === dataSeat);
        if (!entry) return;
        if (expectedProjectionGeneration !== undefined
            && expectedProjectionGeneration !== this.publicProjectionGeneration) return;
        // Claim the seat before the mandatory two-second hold. Any newer
        // authority projection or operation for this seat invalidates this
        // renderer, so an old single-card task can never overwrite a newer
        // compound play after its wait finishes.
        const seatRevision = this.claimPublicSeatRender(dataSeat);
        const values = Array.isArray(packet.cardList) ? packet.cardList.map(Number) : [];
        const outCardPath = `Players/Play_${entry.physicalSlot}/Card/Out_Card`;
        const parent = this.view.find(outCardPath);
        if (this.runtime.arrangementEnabled()) {
            // Liangshan moves the preceding physical nodes into Table_Cards.
            // Never clear/replace Out_Card until that transfer has stopped.
            await this.retainedPlayedCardFlow?.waitForPendingTransfers();
        } else {
            await this.waitForPublicCardHold(dataSeat);
        }
        if (!this.isPublicSeatRenderCurrent(dataSeat, seatRevision, generation, expectedProjectionGeneration)) return;
        let destinationCleared = false;
        // The authority acknowledgement can arrive before the local flight
        // finishes. Clear and hide the destination before waiting, otherwise a
        // stale card is visible underneath the one physical card that is moving.
        if (dataSeat === this.clientSeat() && this.ownLandingCards.length > 0) {
            await this.clearActionSlot(parent);
            if (!this.isPublicSeatRenderCurrent(dataSeat, seatRevision, generation, expectedProjectionGeneration)) return;
            destinationCleared = true;
            this.setOutCardVisible(outCardPath, false);
            await this.ownCardFlight;
            if (!this.isPublicSeatRenderCurrent(dataSeat, seatRevision, generation, expectedProjectionGeneration)) return;
        }
        if (!destinationCleared) await this.clearActionSlot(parent);
        if (!this.isPublicSeatRenderCurrent(dataSeat, seatRevision, generation, expectedProjectionGeneration)) return;
        // The flying cards themselves become the final Out_Card nodes. This is
        // one physical presentation moving and stopping, never two card copies.
        this.setOutCardVisible(outCardPath, false);
        const landed = dataSeat === this.clientSeat() && parent
            && this.ownLandingCards.filter((card) => card.isValid).length === values.length
            ? [...this.ownLandingCards] : [];
        const landedFromOwnFlight = landed.length > 0;
        if (landed.length > 0 && parent) {
            // These physical nodes already reached the exact prefab-authored
            // Out_Card destinations. Freeze Layout before reparenting so neither
            // the engine nor updateActionCardLayout applies a second ~3px snap.
            const layout = parent.getComponent(Layout);
            if (layout) layout.enabled = false;
            for (const card of landed) {
                const worldPosition = card.worldPosition.clone();
                card.parent = parent;
                card.setWorldPosition(worldPosition);
                // The flight already ends at the authored Out_Card world scale.
                // Once reparented, a unit local scale is that exact final size;
                // preserving a transient world scale here lets a following Layout
                // pass apply the parent scale again and produces a visible grow.
                card.setScale(Vec3.ONE);
            }
            this.ownLandingCards.length = 0;
        } else if (parent && values.length > 0) for (const value of values) {
            const card = await this.cards.create(parent, value);
            if (!parent.isValid
                || !this.isPublicSeatRenderCurrent(dataSeat, seatRevision, generation, expectedProjectionGeneration)) {
                if (card.isValid) card.destroy();
                return;
            }
        }
        // Layout skips inactive nodes. Activate the complete authoritative hand
        // first, then arrange it in the same frame; otherwise every card keeps
        // the prefab origin and only the last (topmost) card is visible remotely.
        this.setOutCardVisible(outCardPath, values.length > 0);
        if (!landedFromOwnFlight) {
            this.updateActionCardLayout(parent, {
                dataSeat,
                physicalSlot: entry.physicalSlot,
                operationId: String(packet.operationId ?? packet.actionId ?? ''),
                cardValues: values,
            });
        }
        this.clearOutCardPlayCount(parent);
        if (parent && values.length > 0) this.showCurrentPlayArrow(parent, packet, true);
        if (!this.isPublicSeatRenderCurrent(dataSeat, seatRevision, generation, expectedProjectionGeneration)) return;
        this.view.visible(`Players/Play_${entry.physicalSlot}/Tip/Pass`, values.length === 0);
        if (values.length > 0) {
            this.publicSeatOperationIds.set(dataSeat, String(packet.operationId ?? packet.actionId ?? ''));
            this.markPublicCardsShown(dataSeat);
            // Authority can skip every unbeatable responder and return the turn
            // to the player before that player's flight has landed. The turn
            // boundary then runs before a shown timestamp exists. Re-arm the
            // seat-owned clear after landing so the winning lead is visible for
            // the full hold and disappears before the player acts again.
            if (dataSeat === this.activeOpPos && !this.runtime.arrangementEnabled()) {
                this.clearPublicCardsForTurn(dataSeat);
            }
        } else {
            this.publicCardShownAt.delete(dataSeat);
        }
    }

    private async presentPublicOperation(packet: Record<string, unknown>): Promise<void> {
        await this.renderPublicOperation(packet);
        if (!this.view || !this.runtime.arrangementEnabled()) return;
        const generation = this.presentationGeneration;
        const dataSeat = Number(packet.pos ?? packet.opPos ?? -1);
        const entry = createSeatEntries(this.authoritativePlayerCount(), this.clientSeat())
            .find((item) => item.dataSeat === dataSeat);
        const operationId = String(packet.operationId ?? packet.actionId ?? '');
        if (!entry || !operationId) return;
        const outCard = this.view.find(`Players/Play_${entry.physicalSlot}/Card/Out_Card`);
        const tableCards = this.view.find(`Players/Play_${entry.physicalSlot}/Card/Table_Cards`);
        if (!outCard || !tableCards) return;
        this.traceOutCards('liangshan-arrangement-hold-start', {
            operationId, dataSeat, physicalSlot: entry.physicalSlot, holdMs: 2000,
        });
        const moved = await this.retainedPlayedCardFlow?.moveAfterLiveHold({
            outCard,
            tableCards,
            playCountTemplate: this.view.find('PlayCount'),
            operationId,
            playIndex: Number(packet.playIndex ?? 0),
            isCurrent: () => generation === this.presentationGeneration && Boolean(this.view),
        });
        this.traceOutCards('liangshan-arrangement-move-finish', {
            operationId, dataSeat, physicalSlot: entry.physicalSlot, moved: Boolean(moved),
        });
        if (moved) {
            const retainedHand = tableCards.getChildByName(`Play_${operationId}`);
            if (retainedHand) this.showCurrentPlayArrow(retainedHand, packet, false);
        }
        if (generation !== this.presentationGeneration || !this.view || moved) return;
        // A live Liangshan action is never reconstructed directly in Table_Cards.
        // If its presentation was superseded, the newer authority action owns the
        // screen; reconnect history is restored separately by restoreTableCards.
        this.traceOutCards('liangshan-arrangement-move-superseded', {
            operationId, dataSeat, physicalSlot: entry.physicalSlot,
        });
    }

    private async presentLatestAuthorityAction(setInfo: Record<string, unknown>): Promise<void> {
        const actions = Array.isArray(setInfo.tableOperations) ? setInfo.tableOperations : [];
        if (actions.length === 0) {
            await this.reconcileAuthorityPublicCards(setInfo);
            return;
        }
        if (!this.authorityActionsInitialized) {
            for (const value of actions) {
                const restored = this.record(value);
                if (restored) this.tableActionIds.add(this.authorityActionKey(restored));
            }
            // Reconnect restores two independent projections from authority:
            // seatPlayStates owns the live trick Out_Card slots, while the full
            // operation ledger owns the persistent Table_Cards archive.
            await this.reconcileAuthorityPublicCards(setInfo);
            return;
        }
        // Live authority packets can coalesce several committed operations. A
        // latest-only renderer lets every intermediate play fall through to
        // restoreTableCards, where it appears directly in the archive without
        // Hand/Out/Table movement. Present every unseen ledger entry in order;
        // direct history reconstruction remains exclusive to initial/reconnect.
        for (const value of actions) {
            const action = this.record(value);
            if (!action) continue;
            const actionKey = this.authorityActionKey(action);
            const existingPresentation = this.tableActionPresentations.get(actionKey);
            if (existingPresentation) {
                await existingPresentation;
                continue;
            }
            if (this.tableActionIds.has(actionKey)) continue;
            this.tableActionIds.add(actionKey);
            const presentation = this.presentNewAuthorityAction(action);
            this.tableActionPresentations.set(actionKey, presentation);
            try {
                await presentation;
            } finally {
                if (this.tableActionPresentations.get(actionKey) === presentation) {
                    this.tableActionPresentations.delete(actionKey);
                }
            }
        }
    }

    private async presentNewAuthorityAction(latest: Record<string, unknown>): Promise<void> {
        const dataSeat = Number(latest.seat ?? latest.pos ?? latest.opPos ?? -1);
        const physicalSlot = createSeatEntries(this.authoritativePlayerCount(), this.clientSeat())
            .find((entry) => entry.dataSeat === dataSeat)?.physicalSlot ?? 0;
        const operationId = String(latest.operationId ?? '');
        const action = String(latest.action ?? '').toLowerCase();
        const cards = Array.isArray(latest.cards) ? latest.cards.map(Number) : [];
        const actionType = action === 'pass' || cards.length === 0 ? 1
            : this.gameAudioOperationType(latest.opCardType ?? latest.opType ?? latest.cardType ?? latest.type);
        // Retained-table authority updates do not emit the legacy OpCard event.
        // Announce the newly committed operation here so every client hears the
        // responding player's card pattern exactly once.
        this.playGameOperation(dataSeat, actionType, cards);
        const operationAnimation = this.animations?.playOperation(actionType, physicalSlot)
            .catch((error: unknown) => this.report(error, '牌型动画加载失败'));
        if (operationAnimation) this.trackPresentation(operationAnimation);
        if (actionType !== 1) void this.roomAudio?.play('chupai');
        if (action === 'pass' || cards.length === 0) {
            await this.renderPublicOperation({ pos: dataSeat, cardList: [] });
            return;
        }
        await this.presentPublicOperation({
            pos: dataSeat,
            cardList: cards,
            operationId,
            playIndex: Number(latest.playIndex ?? 0),
        });
    }

    private clearPublicCards(): void {
        this.currentPlayArrow?.hide();
        this.currentPlayArrowIndex = 0;
        this.currentPlayArrowOperationId = '';
        this.cancelPublicCardClearTimers();
        this.publicCardShownAt.clear();
        this.publicSeatOperationIds.clear();
        this.cancelPendingPresentations();
        this.presentationGeneration += 1;
        this.publicProjectionGeneration += 1;
        this.publicSeatRenderRevisions.clear();
        this.renderedActionIds.clear();
        if (!this.view) return;
        for (let slot = 0; slot < 4; slot += 1) {
            this.cards.clear(this.view.find(`Players/Play_${slot}/Card/Out_Card`));
            this.view.visible(`Players/Play_${slot}/Card/Out_Card`, false);
            this.view.visible(`Players/Play_${slot}/Tip/Pass`, false);
        }
    }

    /** Hide every continue/ready badge exactly one second after the last continue. */
    private scheduleContinueReadyClear(setInfo: Record<string, unknown>): void {
        if (this.continueReadyClearTimer) return;
        const players = this.runtime.getRoomPosManager().GetRoomAllPlayerInfo() ?? {};
        const count = this.authoritativePlayerCount();
        const occupied = Array.from({ length: count }, (_value, seat) => players[seat] ?? {})
            .filter((player) => Number(player.pid ?? 0) > 0);
        if (occupied.length !== count || !occupied.every((player) => Boolean(player.isContinue))) return;
        const roundKey = this.continueReadyRoundKey(setInfo);
        this.continueReadyClearTimer = globalThis.setTimeout(() => {
            this.continueReadyClearTimer = 0;
            this.continueReadyHiddenRoundKey = roundKey;
            this.seats?.hideReadyStates();
            console.info('[CommonRoomContinueReadyClear]', {
                roomId: this.roomId(), roundKey, delayMs: 1000,
            });
        }, 1000) as unknown as number;
    }

    private continueReadyRoundKey(setInfo: Record<string, unknown>): string {
        return `${this.roomId()}:${Number(setInfo.roundNo ?? setInfo.setID
            ?? this.runtime.getRoom().GetRoomProperty('setID') ?? 0)}`;
    }

    private clearTableCards(): void {
        this.currentPlayArrow?.hide();
        if (!this.view || !this.runtime.arrangementEnabled()) return;
        for (let slot = 0; slot < 4; slot += 1) {
            const path = `Players/Play_${slot}/Card/Table_Cards`;
            const table = this.view.find(path);
            this.cards.clear(table);
            this.view.visible(path, false);
        }
    }

    private async appendTableCards(
        packet: Record<string, unknown>,
        expectedGeneration: number,
    ): Promise<void> {
        if (!this.view || !this.runtime.arrangementEnabled()) return;
        if (expectedGeneration !== this.presentationGeneration) return;
        const dataSeat = Number(packet.pos ?? packet.opPos ?? -1);
        const entry = createSeatEntries(this.authoritativePlayerCount(), this.clientSeat())
            .find((item) => item.dataSeat === dataSeat);
        const values = Array.isArray(packet.cardList) ? packet.cardList.map(Number) : [];
        if (!entry || values.length === 0) return;
        const path = `Players/Play_${entry.physicalSlot}/Card/Table_Cards`;
        const parent = this.view.find(path);
        if (!parent) return;
        this.view.visible(path, true);
        const outerLayout = parent.getComponent(Layout) ?? parent.addComponent(Layout);
        outerLayout.enabled = false;

        // Table_Cards lays out complete plays, not individual cards. Its authored
        // Spacing X is the gap between hands; cards inside one hand continue to
        // use the sibling Out_Card spacing.
        const operationId = String(packet.operationId ?? packet.actionId ?? '');
        if (!operationId) return;
        const nodeName = `Play_${operationId}`;
        // Authority pushes, reconnect recovery and the local presentation task can
        // all converge on the same committed operation. Creating the group before
        // the first awaited card load makes this check an atomic idempotency gate.
        const existingHand = parent.getChildByName(nodeName);
        if (existingHand) {
            // Authority recovery and the live Out_Card -> Table_Cards transfer
            // can converge on the same operation. The hand container is the
            // idempotency key, but an existing container is not proof that its
            // post-flight PlayCount step already ran. Reconcile the complete
            // hand instead of returning with a permanently missing ordinal.
            this.retainedPlayedCardFlow?.addStoppedPlayCount(
                existingHand,
                this.view.find('PlayCount'),
                Number(packet.playIndex ?? 0),
            );
            layoutPdkRetainedHands(parent);
            return;
        }
        const hand = new Node(nodeName);
        hand.parent = parent;
        hand.addComponent(UITransform).setContentSize(0, 0);
        for (const value of values) {
            const card = await this.cards.create(hand, value);
            if (expectedGeneration !== this.presentationGeneration || !parent.isValid || !hand.isValid) {
                if (card.isValid) card.destroy();
                if (hand.isValid) hand.destroy();
                return;
            }
        }
        const retainedCards = hand.children.filter((child) => !child.name.startsWith('PlayCount'));
        const cardSpacing = parent.parent?.getChildByName('Out_Card')?.getComponent(Layout)?.spacingX ?? 0;
        layoutPdkRetainedHand(hand, retainedCards, cardSpacing);
        this.retainedPlayedCardFlow?.addStoppedPlayCount(
            hand,
            this.view.find('PlayCount'),
            Number(packet.playIndex ?? 0),
        );
        layoutPdkRetainedHands(parent);
    }

    private async restoreTableCards(packet: Record<string, unknown>): Promise<void> {
        if (!this.view || !this.runtime.arrangementEnabled()) return;
        const generation = this.presentationGeneration;
        const operations = Array.isArray(packet.tableOperations) ? packet.tableOperations : [];
        // A retained table is reconstructed exclusively from the ordered
        // authoritative operation ledger. playedCardList is a per-seat flattened
        // compatibility field: using it here loses hand boundaries and lets the
        // newest operation be drawn a second time on the next authority refresh.
        // Do not clear and rebuild here: authority pushes can overlap while card
        // assets load. Operation-id reconciliation preserves already committed
        // groups and appends only the missing hands in server order.
        for (const value of operations) {
            if (generation !== this.presentationGeneration || !this.view) return;
            const operation = this.record(value);
            if (!operation || String(operation.action).toLowerCase() !== 'play') continue;
            const actionKey = this.authorityActionKey(operation);
            // RoomSet snapshots are mutable runtime projections. While an older
            // two-second presentation is awaiting completion, the same object can
            // already contain the next committed play. That live play belongs to
            // presentPublicOperation (Hand_Cards -> Out_Card -> Table_Cards), so
            // history recovery must not manufacture it directly in Table_Cards.
            if (this.tableActionPresentations.has(actionKey)) {
                this.traceOutCards('liangshan-history-skip-live-presentation', {
                    operationId: String(operation.operationId ?? ''),
                    dataSeat: Number(operation.seat ?? operation.pos ?? operation.opPos ?? -1),
                });
                continue;
            }
            const cards = Array.isArray(operation.cards) ? operation.cards.map(Number) : [];
            if (cards.length === 0) continue;
            await this.appendTableCards({
                pos: Number(operation.seat ?? operation.pos ?? operation.opPos ?? -1),
                cardList: cards,
                operationId: String(operation.operationId ?? ''),
                playIndex: Number(operation.playIndex ?? 0),
            }, generation);
        }
        if (generation !== this.presentationGeneration || !this.view) return;
        // Pass operations do not take ownership of the arrow. On reconnect the
        // ledger can end in one or more passes, so locate the last actual play
        // instead of assuming the final ledger entry contains cards.
        const latest = [...operations].reverse()
            .map((value) => this.record(value))
            .find((operation) => operation && String(operation.action).toLowerCase() === 'play');
        if (latest) {
            const dataSeat = Number(latest.seat ?? latest.pos ?? latest.opPos ?? -1);
            const slot = createSeatEntries(this.authoritativePlayerCount(), this.clientSeat())
                .find((entry) => entry.dataSeat === dataSeat)?.physicalSlot;
            const operationId = String(latest.operationId ?? '');
            const hand = slot === undefined || !operationId ? null
                : this.view.find(`Players/Play_${slot}/Card/Table_Cards/Play_${operationId}`);
            if (hand) this.showCurrentPlayArrow(hand, latest, true);
        }
    }

    /** Only the newest committed play may own the single table arrow. */
    private showCurrentPlayArrow(target: Node, packet: Record<string, unknown>, claimLatest: boolean): void {
        const operationId = String(packet.operationId ?? packet.actionId ?? '');
        const playIndex = Number(packet.playIndex ?? 0);
        if (!operationId) return;
        if (claimLatest) {
            if (Number.isSafeInteger(playIndex) && playIndex > 0) {
                if (playIndex < this.currentPlayArrowIndex) return;
                this.currentPlayArrowIndex = playIndex;
            }
            this.currentPlayArrowOperationId = operationId;
        } else if (operationId !== this.currentPlayArrowOperationId) {
            return;
        }
        void this.currentPlayArrow?.showOver(target)
            .catch((error: unknown) => this.reportPresentationError(error, 'CURRENT_PLAY_ARROW', packet));
    }

    private async clearActionSlot(parent: Node | null): Promise<void> {
        if (!parent || parent.children.length === 0) return;
        // Authority reconciliation can replace a seat's action in the same frame.
        // Fading the old cards exposed the empty parent and produced a flash.
        for (const child of parent.children) Tween.stopAllByTarget(child);
        this.cards.clear(parent);
    }

    /** Out_Card and Table_Cards are sibling presentation areas in the prefab. */
    private setOutCardVisible(path: string, visible: boolean): void {
        const outCard = this.view?.find(path);
        if (!outCard) return;
        outCard.active = visible;
    }

    /** PlayCount belongs only to a completed hand in Table_Cards. */
    private clearOutCardPlayCount(parent: Node | null): void {
        if (!parent) return;
        for (const card of parent.children) {
            for (const child of [...card.children]) {
                if (child.name === 'PlayCount' || child.name.startsWith('PlayCount_')) child.destroy();
            }
        }
    }

    private resetRoundPresentation(): void {
        this.lastDealAnimationKey = '';
        this.clearPublicCards();
        this.animations?.clear();
        if (this.flyingOverlay?.isValid) this.flyingOverlay.destroy();
        this.flyingOverlay = null;
        this.ownCardFlightActive = false;
        this.ownCardFlight = Promise.resolve();
        this.clearOwnLandingCards();
        this.clearTableCards();
        this.tableActionIds.clear();
        this.tableActionPresentations.clear();
        this.remainingCards.clear();
        this.logic.ClearCardData();
        this.operations?.hide();
        this.hideClocks();
        this.clearDragSelection();
        this.resetPromptCycle();
        this.autoPassInFlight = false;
        this.cancelAutoPlay();
        this.autoPlayTurnKey = '';
        this.autoHintTurnKey = '';
        this.playInFlight = false;
        this.playRequestScope = null;
        this.selectionAuthorityKey = '';
    }

    private clearHandVisuals(reason: string): void {
        const current = this.runtime.getRoomSet().GetRoomSetInfo() ?? {};
        const diagnostic = {
            roomId: this.roomId(),
            stateVersion: Number(this.runtime.getRoom().GetRoomProperty('stateVersion') ?? -1),
            operationId: String(this.record(current.operationDeadline)?.operationId ?? ''),
            roundNo: Number(current.roundNo ?? current.setID ?? this.runtime.getRoom().GetRoomProperty('setID') ?? 0),
            phase: String(current.authorityPhase ?? ''),
            reason,
            authoritativeHandCount: Number(this.logic.GetHandCard()?.length ?? 0),
            visualHandCount: this.cardNodes.filter((card) => card.isValid && card.active).length,
        };
        console.info('[CommonRoomHandClear]', diagnostic);
        const host = globalThis as typeof globalThis & { __PDK_LAST_HAND_CLEAR__?: unknown };
        host.__PDK_LAST_HAND_CLEAR__ = diagnostic;
        this.handRenderGeneration += 1;
        const parent = this.view?.find('Players/Play_0/Card/Hand_Cards');
        this.cards.stopAll(true);
        if (parent) this.cards.clear(parent);
        this.cardNodes.length = 0;
        this.cardValues.length = 0;
        this.clearDragSelection();
        this.syncHandTouchArea();
    }

    /** Clear every visual owned by the completed round at the Continue boundary. */
    public clearCompletedRound(): void {
        this.completedRoundVisualsCleared = true;
        this.resetRoundPresentation();
        this.clearHandVisuals('CONTINUE');
        this.competeDealerPhase = false;
        this.renderCompeteDealerControls();
        void this.renderHeads().catch((error: unknown) => this.report(error, '玩家状态刷新失败'));
        this.refresh();
    }

    private applyAuthoritativeTurnBoundary(setInfo: Record<string, unknown>): void {
        const roomId = this.roomId();
        const stateVersion = Number(this.runtime.getRoom().GetRoomProperty('stateVersion') ?? -1);
        const trickId = Number(setInfo.trickId ?? -1);
        const deadline = this.record(setInfo.operationDeadline);
        const operationId = String(deadline?.operationId ?? '');
        const turnSeat = Number(setInfo.opPos ?? deadline?.seatId ?? -1);
        const selectionKey = `${roomId}:${trickId}:${turnSeat}:${operationId}`;
        const trickReset = Boolean(setInfo.trickReset) || Boolean(setInfo.isFirstOp)
            || !Array.isArray(setInfo.cardList) || setInfo.cardList.length === 0;
        if (selectionKey !== this.selectionAuthorityKey) {
            this.selectionAuthorityKey = selectionKey;
            this.logic.ChangeSelectCard([]);
            this.clearDragSelection();
            this.resetPromptCycle();
            // The user may preselect while another seat is acting. The following
            // hand reconciliation synchronizes Layout immediately, so an animated
            // deselect would be stopped halfway and its raised Y cached as the new
            // base. Reset synchronously before the new automatic hint is applied.
            this.cards.clearSelectionImmediately(this.cardNodes);
        }
        this.autoPassInFlight = false;
        if (trickReset) {
            this.logic.ClearCardData();
        }
        const submitted = this.playRequestScope;
        if (submitted && (submitted.roomId !== roomId || stateVersion > submitted.stateVersion
            || trickId !== submitted.trickId || operationId !== submitted.operationId)) {
            this.playInFlight = false;
            this.playRequestScope = null;
        }
        console.info('[CommonRoomTurnState]', {
            roomId, stateVersion, trickId, operationId,
            turnSeat,
            trickReset, tableOperationCount: Array.isArray(setInfo.tableOperations) ? setInfo.tableOperations.length : 0,
            targetCards: [...(this.logic.lastCardList ?? [])].map(Number),
            selectedCards: [...(this.logic.GetSelectCard() ?? [])].map(Number),
            hintCount: this.hintCache.length,
            playInFlight: this.playInFlight,
        });
    }

    /**
     * The sole writer for ordinary Out_Card presentation.
     *
     * It consumes one complete authority snapshot, derives the comparison target
     * and per-seat latest actions, then commits them through revision-guarded seat
     * renderers. Legacy events may update sound, rules and turn ownership but may
     * not create or replace public card nodes.
     */
    private reconcileAuthorityPublicCards(packet: Record<string, unknown>): Promise<void> {
        const projectionGeneration = ++this.publicProjectionGeneration;
        const comparison = this.record(packet.comparisonState) ?? {};
        const seatPlays = Array.isArray(packet.seatPlayStates) ? packet.seatPlayStates : [];
        const trickId = Number(comparison.trickId ?? packet.trickId ?? -1);
        if (trickId >= 0) this.renderedTrickId = trickId;
        const cardList = Array.isArray(comparison.cards) ? comparison.cards.map(Number) : [];
        const dataSeat = Number(comparison.leadSeat ?? -1);
        // Reconnect and live authority packets are allowed to carry either the
        // canonical string shape (for example TRIPLE_WITH_PAIR) or its legacy
        // numeric projection. Normalise at this single comparison boundary;
        // Number('TRIPLE_WITH_PAIR') is NaN and previously made Hint treat the
        // responding turn as a fresh lead while the table still showed five cards.
        const opType = this.legacyOperationType(comparison.cardType ?? comparison.type);
        const trickReset = cardList.length === 0 || opType <= 0 || dataSeat < 0;
        console.info('[PdkTableTransition]', {
            roomId: this.roomId(),
            playerId: this.runtime.getPlayerId(),
            operationId: String(comparison.operationId ?? this.record(packet.operationDeadline)?.operationId ?? ''),
            stateVersion: Number(comparison.stateVersion ?? this.runtime.getRoom().GetRoomProperty('stateVersion') ?? -1),
            trickId,
            turnSeat: Number(packet.opPos ?? -1),
            leadSeat: dataSeat,
            cardCount: cardList.length,
            transition: trickReset ? 'TRICK_END' : this.runtime.arrangementEnabled() ? 'HISTORY_APPEND' : 'LAST_REPLACE',
        });
        if (trickReset) this.logic.ClearCardData();
        else this.logic.SetCardData(opType, cardList);
        this.resetPromptCycle();
        this.authorityActionsInitialized = true;
        if (!this.runtime.arrangementEnabled()) {
            if (trickReset) {
                // Authority may skip every responder and open the next trick in
                // the same snapshot. comparisonState is then empty, but its
                // ordered ledger still contains the winning lead. Project that
                // committed play first and start the two-second hold only after
                // all cards (including the local flight) have actually landed.
                const operations = Array.isArray(packet.tableOperations) ? packet.tableOperations : [];
                const latestPlay = [...operations].reverse().map((value) => this.record(value)).find((operation) =>
                    operation && String(operation.action).toLowerCase() === 'play'
                    && Array.isArray(operation.cards) && operation.cards.length > 0);
                const turnSeat = Number(packet.opPos ?? -1);
                const winningSeat = Number(latestPlay?.seat ?? latestPlay?.pos ?? latestPlay?.opPos ?? -1);
                if (latestPlay && winningSeat === turnSeat) {
                    const winningOperationId = String(latestPlay.operationId ?? '');
                    if (winningOperationId
                        && this.publicSeatOperationIds.get(winningSeat) === winningOperationId) {
                        this.clearCompletedTrickAfterHold(winningSeat);
                        return Promise.resolve();
                    }
                    return this.renderPublicOperation({
                        pos: winningSeat,
                        cardList: latestPlay.cards,
                        operationId: winningOperationId,
                        playIndex: Number(latestPlay.playIndex ?? 0),
                    }, projectionGeneration).then(() => this.clearCompletedTrickAfterHold(winningSeat))
                        .catch((error: unknown) => this.report(error, '胜出牌停留显示失败'));
                }
                this.clearLatestPublicCards();
            } else {
                // Each seat owns one live Out_Card slot for the current trick.
                // A response replaces only that same seat's previous slot; plays
                // from the other seats remain until the trick-level clear.
                return this.renderPublicOperation({
                    pos: dataSeat,
                    cardList,
                    operationId: String(comparison.operationId ?? ''),
                    playIndex: Number(comparison.playIndex ?? 0),
                }, projectionGeneration).catch((error: unknown) => this.report(error, '桌面牌恢复失败'));
            }
            return Promise.resolve();
        }
        return this.restoreSeatPlayStates(seatPlays, projectionGeneration)
            .then(async () => {
                if (trickReset || projectionGeneration !== this.publicProjectionGeneration) return;
                // When an unbeatable play immediately returns ownership to its
                // author, the seat projection is intentionally skipped until its
                // two-second hold finishes. The comparison hand still owns the
                // exact visible group during that interval.
                const rendered = this.renderedActionIds.get(dataSeat);
                const matching = seatPlays.map((value) => this.record(value)).find((play) =>
                    Boolean(play) && Number(play?.seat) === dataSeat && Array.isArray(play?.cards)
                    && play?.cards.map(Number).join(',') === cardList.join(','));
                if (!matching || rendered !== this.authorityActionKey(matching)) {
                    await this.renderPublicOperation({
                        pos: dataSeat,
                        cardList,
                        operationId: String(matching?.operationId ?? ''),
                        playIndex: Number(matching?.playIndex ?? 0),
                    }, projectionGeneration);
                }
            })
            .catch((error: unknown) => this.report(error, '桌面牌恢复失败'));
    }

    private async restoreSeatPlayStates(raw: unknown[], projectionGeneration: number): Promise<void> {
        if (!this.view) return;
        const generation = this.presentationGeneration;
        const incomingSeats = new Set<number>();
        // The server contract already contains exactly one complete play per seat.
        // Keep a defensive map so malformed duplicates cannot create two groups.
        const latestBySeat = new Map<number, unknown>();
        for (const value of raw) {
            const action = this.record(value);
            const seat = Number(action?.seat ?? -1);
            if (action && seat >= 0) latestBySeat.set(seat, value);
        }
        for (const value of latestBySeat.values()) {
            if (projectionGeneration !== this.publicProjectionGeneration) return;
            const action = this.record(value);
            if (!action) continue;
            const entry = createSeatEntries(this.authoritativePlayerCount(), this.clientSeat())
                .find((item) => item.dataSeat === Number(action.seat));
            if (!entry) continue;
            incomingSeats.add(entry.dataSeat);
            const operationId = String(action.operationId ?? '');
            const actionKey = this.authorityActionKey(action);
            if (entry.dataSeat === this.activeOpPos) {
                // lastActions may retain this seat's previous hand after its next
                // turn starts. Operation ownership wins over stale history.
                continue;
            }
            if (this.renderedActionIds.get(entry.dataSeat) === actionKey) continue;
            const seatRevision = this.claimPublicSeatRender(entry.dataSeat);
            // Do not publish renderedActionIds until the guarded presentation
            // has actually landed; a canceled restore must never suppress its successor.
            const animate = this.authorityActionsInitialized && !this.seenOperationIds.has(actionKey);
            this.seenOperationIds.add(actionKey);
            const path = `Players/Play_${entry.physicalSlot}/Card/Out_Card`;
            await this.waitForPublicCardHold(entry.dataSeat);
            if (!this.isPublicSeatRenderCurrent(
                entry.dataSeat, seatRevision, generation, projectionGeneration,
            )) return;
            await this.clearActionSlot(this.view.find(path));
            if (!this.isPublicSeatRenderCurrent(
                entry.dataSeat, seatRevision, generation, projectionGeneration,
            )) return;
            this.view.visible(`Players/Play_${entry.physicalSlot}/Tip/Pass`, false);
            const values = Array.isArray(action.cards) ? action.cards.map(Number) : [];
            if (animate) {
                const actionType = String(action.action) === 'pass' ? 1
                    : this.gameAudioOperationType(action.opCardType ?? action.opType ?? action.cardType ?? action.type);
                this.playGameOperation(entry.dataSeat, actionType, values);
                const operationAnimation = this.animations?.playOperation(actionType, entry.physicalSlot)
                    .catch((error: unknown) => this.report(error, '牌型动画加载失败'));
                if (operationAnimation) this.trackPresentation(operationAnimation);
                if (actionType !== 1) void this.roomAudio?.play('chupai');
                const remaining = this.remainingCards.get(entry.dataSeat);
                if (operationId && remaining !== undefined && remaining > 0 && remaining <= 2
                    && !this.warnedOperationIds.has(operationId)) {
                    this.warnedOperationIds.add(operationId);
                    void this.roomAudio?.play('baojing', 250);
                }
            }
            if (String(action.action) === 'pass') {
                this.publicCardShownAt.delete(entry.dataSeat);
                this.view.visible(`Players/Play_${entry.physicalSlot}/Tip/Pass`, true);
                this.renderedActionIds.set(entry.dataSeat, actionKey);
                continue;
            }
            const parent = this.view.find(path);
            // A remote play is one moving presentation too. Do not build the
            // destination copy underneath the flight or a large play appears twice.
            if (animate && entry.dataSeat !== this.clientSeat() && values.length > 0) {
                this.setOutCardVisible(path, false);
                await this.flyRemoteCards(entry.physicalSlot, values);
                if (!this.isPublicSeatRenderCurrent(
                    entry.dataSeat, seatRevision, generation, projectionGeneration,
                )) return;
            }
            this.setOutCardVisible(path, values.length > 0);
            if (parent) for (const value of values) {
                const card = await this.cards.create(parent, value);
                if (!parent.isValid || !this.isPublicSeatRenderCurrent(
                    entry.dataSeat, seatRevision, generation, projectionGeneration,
                )) {
                    if (card.isValid) card.destroy();
                    return;
                }
            }
            this.updateActionCardLayout(parent, {
                dataSeat: entry.dataSeat,
                physicalSlot: entry.physicalSlot,
                operationId,
                cardValues: values,
            });
            this.clearOutCardPlayCount(parent);
            if (!this.isPublicSeatRenderCurrent(
                entry.dataSeat, seatRevision, generation, projectionGeneration,
            )) return;
            this.renderedActionIds.set(entry.dataSeat, actionKey);
            if (values.length > 0) {
                this.markPublicCardsShown(entry.dataSeat);
            }
        }
        if (this.authorityActionsInitialized) {
            for (const [seat] of [...this.renderedActionIds]) {
                if (incomingSeats.has(seat)) continue;
                // Missing history does not own visual cleanup. The seat keeps its
                // last hand until Authority gives that same seat the next turn.
                this.renderedActionIds.delete(seat);
            }
        }
        this.authorityActionsInitialized = true;
    }

    private updateActionCardLayout(parent: Node | null, context?: {
        dataSeat: number;
        physicalSlot: number;
        operationId: string;
        cardValues: readonly number[];
    }): void {
        // Newly created and reparented cards all start at the prefab origin. Force
        // the authored Out_Card Layout in the same frame so a multi-card play does
        // not appear as only its topmost/last card on another client.
        const layout = parent?.getComponent(Layout);
        if (layout?.enabled) layout.updateLayout();
        if (!parent) return;
        const cardNodes = parent.children.filter((child) => child.name !== 'PlayCount');
        if (cardNodes.length <= 1) return;
        // updateLayout() is not a reliable synchronous boundary for nodes that
        // were inactive during remote flight. Apply the authored horizontal
        // geometry explicitly so the authoritative array is visible this frame.
        const parentTransform = parent.getComponent(UITransform);
        const firstTransform = cardNodes[0]?.getComponent(UITransform);
        const cardWidth = Math.max(firstTransform?.contentSize.width ?? 0, OUT_CARD_FALLBACK_WIDTH);
        const cardHeight = firstTransform?.contentSize.height ?? 0;
        const step = cardWidth + (layout?.spacingX ?? 0);
        // updateLayout() above can appear correct for the current frame, but an
        // enabled Layout runs again during the engine's following layout pass and
        // overwrites these authoritative positions. That delayed rewrite is why a
        // complete compound play briefly looks right after refresh and later
        // collapses to its topmost attachment card. Out_Card is populated only by
        // this controller, so freeze its automatic component before publishing the
        // explicit geometry below; every subsequent play is arranged here again.
        if (layout) layout.enabled = false;
        if (parentTransform && cardWidth > 0) {
            const totalWidth = cardWidth + (cardNodes.length - 1) * Math.abs(step);
            parentTransform.setContentSize(totalWidth, Math.max(parentTransform.contentSize.height, cardHeight));
            const rightToLeft = Number(layout?.horizontalDirection ?? 0) === 1;
            // Out_Card's authored node position is the visual centre of a play.
            // Its UITransform anchor describes the container bounds; it must not
            // shift child coordinates. Using `-anchorX * totalWidth` pushed every
            // card of right-anchored remote seats far to the left, leaving only
            // the final attachment inside the viewport. Centre the complete hand
            // around the authored seat position for every physical slot.
            const firstCenter = -((cardNodes.length - 1) * step) / 2;
            cardNodes.forEach((card, childIndex) => {
                const index = rightToLeft ? cardNodes.length - 1 - childIndex : childIndex;
                card.setPosition(firstCenter + index * step, card.position.y, card.position.z);
            });
        }
        const layoutSnapshot = (stage: string): void => {
            // Reconnect can replace this complete Out_Card group before the
            // diagnostic's next-frame/100ms callbacks run. Never dereference a
            // destroyed Cocos proxy retained by the old closure.
            if (!parent.isValid) return;
            const liveCards = cardNodes.filter((card) => card?.isValid && card.parent === parent);
            this.traceOutCards(stage, {
                dataSeat: context?.dataSeat ?? -1,
                physicalSlot: context?.physicalSlot ?? -1,
                operationId: context?.operationId ?? '',
                cardValues: [...(context?.cardValues ?? [])],
                layoutEnabled: layout?.isValid ? layout.enabled : null,
                parentActive: parent.activeInHierarchy,
                parentWidth: parentTransform?.isValid ? parentTransform.contentSize.width : null,
                childCount: liveCards.length,
                childPositions: liveCards.map((card) => ({
                    name: card.name,
                    active: card.activeInHierarchy,
                    x: card.position.x,
                    y: card.position.y,
                })),
            });
        };
        layoutSnapshot('layout-now');
        globalThis.setTimeout(() => {
            if (parent.isValid) layoutSnapshot('layout-next-frame');
        }, 0);
        globalThis.setTimeout(() => {
            if (parent.isValid) layoutSnapshot('layout-after-100ms');
        }, 100);
        const currentCards = cardNodes.filter((card) => card?.isValid && card.parent === parent);
        const distinctX = new Set(currentCards.map((card) => Math.round(card.position.x * 100) / 100));
        if (distinctX.size > 1) return;
        console.error('[CommonRoomOutCardLayout]', {
            roomId: this.roomId(),
            stateVersion: Number(this.runtime.getRoom().GetRoomProperty('stateVersion') ?? -1),
            operationId: context?.operationId ?? '',
            dataSeat: context?.dataSeat ?? -1,
            physicalSlot: context?.physicalSlot ?? -1,
            cardValues: [...(context?.cardValues ?? [])],
            cardCount: currentCards.length,
            parentActive: parent.activeInHierarchy,
            layoutEnabled: Boolean(layout?.enabled),
            positions: currentCards.map((card) => ({ x: card.position.x, y: card.position.y })),
            reason: 'authoritative out-card nodes remained overlapped after layout',
        });
    }

    private async flyRemoteCards(physicalSlot: number, values: readonly number[]): Promise<void> {
        const root = this.flyingCardOverlay();
        const source = this.view?.find(`Players/Play_${physicalSlot}/Head`);
        const target = this.view?.find(`Players/Play_${physicalSlot}/Card/Out_Card`);
        const rootTransform = root?.getComponent(UITransform);
        const sourceTransform = source?.getComponent(UITransform);
        const targetTransform = target?.getComponent(UITransform);
        if (!root || !rootTransform || !sourceTransform || !targetTransform) return;
        const start = rootTransform.convertToNodeSpaceAR(sourceTransform.convertToWorldSpaceAR(Vec3.ZERO));
        const end = rootTransform.convertToNodeSpaceAR(targetTransform.convertToWorldSpaceAR(Vec3.ZERO));
        const nodes = await Promise.all(values.map((value) => this.cards.create(root, value)));
        await Promise.all(nodes.map((card, index) => new Promise<void>((resolve) => {
            let settled = false;
            const finish = (): void => {
                if (settled) return;
                settled = true;
                globalThis.clearTimeout(timeout);
                if (card.isValid) card.destroy();
                resolve();
            };
            const timeout = globalThis.setTimeout(finish, 350);
            card.setPosition(start);
            const spread = (index - (nodes.length - 1) / 2) * 18;
            tween(card).to(0.19, {
                position: new Vec3(end.x + spread, end.y, end.z),
                scale: new Vec3(0.48, 0.48, 1),
            }, { easing: 'quadOut' }).call(finish).start();
        })));
    }

    private initializeRemainingCards(): void {
        const info = this.runtime.getRoomSet().GetRoomSetInfo() ?? {};
        this.remainingCards.clear();
        for (const item of info.posInfo ?? []) {
            const values = item.surplusCardList ?? item.cards;
            // cardCount is public and authoritative on every push. Opponents'
            // remainingCards may intentionally be hidden or may be an older list.
            const publicCount = Number(item.cardCount);
            const count = Number.isSafeInteger(publicCount) && publicCount >= 0
                ? publicCount : Array.isArray(values) ? values.length : 0;
            this.remainingCards.set(Number(item.posID ?? item.pos), Math.max(0, count));
        }
        this.remainingCards.set(this.clientSeat(), (this.logic.GetHandCard() ?? []).length);
    }

    private ready(): Promise<unknown> { return this.lifecycle.ready(this.roomId(), this.clientSeat()); }

    private exitRoom(): void {
        const room = this.runtime.getRoom();
        const setInfo = this.runtime.getRoomSet().GetRoomSetInfo() ?? {};
        const phase = String(room.GetRoomProperty('authorityPhase')
            ?? setInfo.authorityPhase ?? '').trim().toUpperCase();
        const legacyState = Number(room.GetRoomProperty('state') ?? 0);
        const cardsDealt = room.GetRoomProperty('cardsDealt');
        if (!canLeaveRoom({
            cardsDealt: typeof cardsDealt === 'boolean' ? cardsDealt : undefined,
            phase,
            legacyState,
        })) {
            this.showMessage('游戏中不能退出');
            return;
        }
        this.requestLeave('user-exit');
    }
    private pass(): Promise<unknown> { return this.lifecycle.pass(this.roomId(), this.clientSeat()); }
    private tip(): void {
        const diagnostics = globalThis as typeof globalThis & {
            __PDK_E2E_LOGS__?: unknown[];
            __PDK_PLAY_CONTROLLER__?: CommonPdkPlayController;
        };
        if (Array.isArray(diagnostics.__PDK_E2E_LOGS__)) diagnostics.__PDK_PLAY_CONTROLLER__ = this;
        // A manual Hint click takes ownership of the turn. It must cancel any delayed
        // convenience submit that was prepared before the click and only change selection.
        if (this.autoPlayInFlight || this.autoPlayTimer) this.cancelAutoPlay();
        const key = this.promptKey();
        if (this.promptCycleKey !== key) {
            this.promptCycleKey = key;
            this.tipIndex = 0;
        }
        if (this.hintCacheKey !== key) this.prepareHintCache();
        const tips = this.hintCache;
        if (!tips.length) { this.showMessage('没有可出的牌'); return; }
        const selected = [...(this.logic.GetSelectCard() ?? [])].map(Number);
        const currentIndex = tips.findIndex((candidate) => this.sameCards(selected, candidate));
        if (currentIndex >= 0) this.tipIndex = (currentIndex + 1) % tips.length;
        else if (this.tipIndex >= tips.length) this.tipIndex = 0;
        this.logic.ChangeSelectCard(tips[this.tipIndex]);
        this.tipIndex = (this.tipIndex + 1) % tips.length;
        this.updateSelection();
    }

    private prepareHintCache(): void {
        this.synchronizeAuthorityComparison();
        const key = this.promptKey();
        const leading = this.isAuthoritativeLeadingTurn();
        // A trick reset is authoritative. Clear stale response data before asking
        // the local rules engine to enumerate lead candidates.
        if (leading && (this.logic.GetLastCardType() !== 0 || this.logic.lastCardList.length > 0)) {
            this.logic.ClearCardData();
        }
        const local = leading ? this.leadTipCandidates() : this.responseTipCandidates();
        this.hintCacheKey = key;
        // Lead hints choose the largest legal play first. Only equal-size lead
        // candidates compare the effective loose singles left in hand; drag
        // selection deliberately does not enable this hint-only tie-breaker.
        const legal = this.sortedLegalTipCandidates(local, leading, leading);
        const required = leading ? this.activeRequiredFirstCard() : 0;
        this.hintCache = required > 0 ? legal.filter((cards) => cards.includes(required)) : legal;
        this.traceOutCards('hint-cache', {
            leading,
            targetType: Number(this.logic.GetLastCardType()),
            targetCards: [...(this.logic.lastCardList ?? [])].map(Number),
            candidates: this.hintCache.map((cards) => [...cards]),
        });
    }
    private async outCard(authoritativeOpType = 0, automaticLastHand = false): Promise<unknown> {
        if (this.playInFlight) return;
        // A visible user click owns the final-card action. Cancel the delayed
        // convenience submit so it cannot race another play_req for this turn.
        if (this.autoPlayInFlight && !automaticLastHand) this.cancelAutoPlay();
        const setInfo = this.runtime.getRoomSet().GetRoomSetInfo() ?? {};
        const roomId = this.roomId();
        const stateVersion = Number(this.runtime.getRoom().GetRoomProperty('stateVersion') ?? -1);
        const trickId = Number(setInfo.trickId ?? -1);
        const deadline = this.record(setInfo.operationDeadline);
        const operationId = String(deadline?.operationId ?? '');
        if (Number(setInfo.opPos ?? deadline?.seatId ?? -1) !== this.clientSeat()
            || stateVersion < 0 || !operationId) return;
        this.synchronizeAuthorityComparison(setInfo);
        let values = [...this.logic.GetSelectCard()].map(Number);
        if (values.length === 0) {
            const visualValues = this.cardValues.filter((_value, index) => this.cards.isSelected(this.cardNodes[index]));
            if (visualValues.length > 0) {
                values = visualValues.map(Number);
                this.logic.ChangeSelectCard(values);
            }
        }
        if (values.length === 0) { this.showMessage('请先选择要出的牌'); return; }
        // Local recognition drives Hint and immediate wording only. It is never
        // an admission gate: Authority decides whether these exact physical
        // cards are a bomb, a split-bomb triple-with-pair, or an illegal play.
        const opType = authoritativeOpType > 0 ? authoritativeOpType : this.selectedIntrinsicType();
        // A locally valid selection can still be rejected by Authority (for
        // example because the regional attachment rule differs). Remember the
        // currently visible hands, but never clear them before play_req commits.
        const rapidPreviousPlay = this.captureRapidPreviousPlay();
        // Liangshan normally holds a completed hand in Out_Card for two seconds.
        // A new valid Play click is the sole override: release the preceding hold
        // so those same nodes start moving into Table_Cards immediately. Finish
        // that transfer before the common Hand_Cards -> Out_Card flight starts:
        // otherwise the preceding transfer can claim the newly landed card from
        // the shared Out_Card parent and make it appear to have a zero-second hold.
        // The move itself is never skipped and no retained copy is reconstructed.
        this.playInFlight = true;
        // Automatic last-hand play can start as soon as Authority returns the
        // lead, while the preceding common hand flight is still landing. Let
        // that physical flight reach Out_Card first so its retained-flow task
        // can claim the exact nodes; only then may this next play shorten the
        // preceding two-second hold.
        const precedingOwnCardFlight = this.ownCardFlight;
        const precedingTablePresentations = [...this.tableActionPresentations.values()];
        const ownOutCard = this.view?.find('Players/Play_0/Card/Out_Card');
        const hasPrecedingOwnPresentation = this.ownCardFlightActive
            || this.ownLandingCards.some((card) => card.isValid)
            || Boolean(ownOutCard?.children.some((child) =>
                child.isValid && child.name !== 'PlayCount'));
        // Authority may return the lead and schedule the automatic final hand
        // before the preceding presentation has registered its two-second hold.
        // In that narrow window Out_Card and tableActionPresentations are both
        // still empty. The ordered ledger is already committed, however: when
        // its newest played action has no retained Play_<operationId> group yet,
        // it still owns the physical Out_Card pipeline and must be advanced.
        const hasPrecedingAuthorityPresentation = automaticLastHand
            && this.hasUnretainedLatestAuthorityPlay(setInfo);
        const shouldAdvancePrecedingPresentation = hasPrecedingOwnPresentation
            || precedingTablePresentations.length > 0
            || hasPrecedingAuthorityPresentation;
        await precedingOwnCardFlight;
        await Promise.resolve();
        this.retainedPlayedCardFlow?.flushPendingHolds(shouldAdvancePrecedingPresentation);
        if (hasPrecedingAuthorityPresentation) {
            await this.advanceLatestAuthorityPlayToRetained(setInfo);
        }
        // The retained flow may not have registered its hold/transfer yet when
        // automatic final-hand play enters this method. Await the preceding
        // authority presentation itself so the next snapshot cannot clear the
        // shared Out_Card before its physical move into Table_Cards completes.
        if (shouldAdvancePrecedingPresentation && precedingTablePresentations.length > 0) {
            await Promise.all(precedingTablePresentations);
        }
        await this.retainedPlayedCardFlow?.waitForPendingTransfers();
        const scope = { roomId, stateVersion, trickId, operationId };
        this.playRequestScope = scope;
        console.info('[CommonRoomPlayAttempt]', {
            ...scope, turnSeat: this.clientSeat(), targetCards: [...(this.logic.lastCardList ?? [])].map(Number),
            selectedCards: [...values], playInFlight: true,
        });
        // Keep Hint/Play visible until Authority actually transfers the turn.
        // If this play wins the trick and returns the lead to this client, hiding
        // here and showing again on the next snapshot causes a visible flash.
        const hand = (this.logic.GetHandCard() ?? []).map(Number);
        const selectedSlots = pdkSelectionMask(hand, values);
        const selectedNodes = this.cardNodes.filter((_node, index) => selectedSlots[index] === true);
        const flyingCards = this.prepareOwnFlightCards(selectedNodes);
        this.clearOwnLandingCards();
        this.ownLandingCards = [...flyingCards];
        const localRemaining = Math.max(0, hand.length - selectedNodes.length);
        this.remainingCards.set(this.clientSeat(), localRemaining);
        this.setRemainingCardCount(0, localRemaining);
        // Start from the raised selection in the same click frame. Waiting for
        // play_req first lets the authority refresh rebuild the hand at rest,
        // which looks like the cards drop before they are played.
        // Removing only by active=false still leaves a child in Hand_Cards for
        // the current Layout pass on some Creator frames, which reserves a wide
        // empty slot. The flight already owns a clone, so detach the source card
        // before calculating the remaining hand positions.
        const compactPlan = this.buildHandCompactionPlan(selectedSlots);
        for (const node of selectedNodes) {
            if (!node.isValid) continue;
            node.active = false;
            node.removeFromParent();
            node.destroy();
        }
        const remainingNodes = this.cardNodes.filter((_node, index) => selectedSlots[index] !== true);
        const remainingValues = this.cardValues.filter((_value, index) => selectedSlots[index] !== true);
        this.cardNodes.splice(0, this.cardNodes.length, ...remainingNodes);
        this.cardValues.splice(0, this.cardValues.length, ...remainingValues);
        this.handCompaction = this.compactVisibleHand(compactPlan);
        this.ownCardFlightActive = true;
        const ownFlight = this.flyCardsToOwnAction(flyingCards).finally(() => {
            if (this.ownCardFlight === ownFlight) this.ownCardFlightActive = false;
        });
        this.ownCardFlight = ownFlight;
        const flight = this.trackPresentation(ownFlight);
        try {
            await this.lifecycle.play(roomId, this.clientSeat(), Math.max(0, opType), values,
                Number(this.logic.GetDaiNum()));
            // Liangshan has already released the preceding physical Out_Card
            // nodes into its archive. Common clear would claim the same seat and
            // cancel this newly committed hand before it reaches Out_Card.
            if (!this.runtime.arrangementEnabled()) this.clearRapidPreviousPlayAfterCommit(rapidPreviousPlay);
            if (this.playRequestScope === scope) {
                this.playInFlight = false;
                this.playRequestScope = null;
            }
            await flight;
        } catch (error: unknown) {
            this.traceOutCards('play-rejected', {
                submittedCards: [...values],
                submittedType: opType,
                targetType: Number(this.logic.GetLastCardType()),
                targetCards: [...(this.logic.lastCardList ?? [])].map(Number),
                error: error instanceof Error ? error.message : String(error),
            });
            this.clearOwnLandingCards();
            // Rebuild from the unchanged local hand so a rejected command also
            // restores the original spacing and selected-card presentation.
            await this.renderHand();
            this.updateSelection();
            throw error;
        } finally {
            if (this.playRequestScope === scope) {
                this.playInFlight = false;
                this.playRequestScope = null;
            }
            // A rejected command does not change Authority's table state. The
            // catch branch already restores this player's hand; refreshing the
            // whole room here replays public history and can replace the current
            // compound play with an older single. Public cards move only on a
            // committed authority packet.
        }
    }

    private selectedIntrinsicType(): number {
        const previousType = Number(this.logic.GetLastCardType());
        const previousCards = [...(this.logic.lastCardList ?? [])];
        try {
            this.logic.lastCardType = 0;
            this.logic.lastCardList = [];
            return Number(this.logic.GetCardType());
        } finally {
            this.logic.lastCardType = previousType;
            this.logic.lastCardList = previousCards;
        }
    }

    private buildHandCompactionPlan(selectedSlots: readonly boolean[]): Map<Node, Vec3> {
        const plan = new Map<Node, Vec3>();
        const positions = this.cardNodes.map((card) => card.position.clone());
        const selectedCount = selectedSlots.filter(Boolean).length;
        let step = 0;
        for (let index = 1; index < positions.length; index += 1) {
            const delta = positions[index].x - positions[index - 1].x;
            if (Math.abs(delta) > 0.01) { step = delta; break; }
        }
        if (Math.abs(step) <= 0.01) {
            const parent = this.view?.find('Players/Play_0/Card/Hand_Cards');
            const layout = parent?.getComponent(Layout);
            const width = this.cardNodes[0]?.getComponent(UITransform)?.contentSize.width ?? 0;
            step = width + (layout?.spacingX ?? 0);
        }
        let removedBefore = 0;
        this.cardNodes.forEach((card, index) => {
            if (selectedSlots[index]) { removedBefore += 1; return; }
            const start = positions[index];
            plan.set(card, new Vec3(start.x + (-removedBefore + selectedCount / 2) * step, start.y, start.z));
        });
        return plan;
    }

    /** Animate directly from current coordinates; enabling Layout here causes a one-frame jump. */
    private compactVisibleHand(targets: ReadonlyMap<Node, Vec3>): Promise<void> {
        const visible = this.cardNodes.filter((card) => card.isValid && card.active);
        return Promise.all(visible.map((card) => new Promise<void>((resolve) => {
            const target = targets.get(card);
            const start = card.position.clone();
            if (!start || !target || Vec3.equals(start, target)) { resolve(); return; }
            Tween.stopAllByTarget(card);
            const movement = new Vec3(target.x - start.x, target.y - start.y, target.z - start.z);
            tween(card).by(HAND_COMPACT_DURATION_SECONDS, { position: movement }, { easing: 'quadOut' })
                .call(() => resolve())
                .start();
        }))).then(() => this.cards.synchronizeLayout(visible));
    }

    private markPublicCardsShown(dataSeat: number): void {
        const timer = this.publicCardClearTimers.get(dataSeat);
        if (timer) globalThis.clearTimeout(timer);
        this.publicCardClearTimers.delete(dataSeat);
        this.publicCardShownAt.set(dataSeat, Date.now());
    }

    private claimPublicSeatRender(dataSeat: number): number {
        const revision = (this.publicSeatRenderRevisions.get(dataSeat) ?? 0) + 1;
        this.publicSeatRenderRevisions.set(dataSeat, revision);
        return revision;
    }

    private isPublicSeatRenderCurrent(
        dataSeat: number,
        seatRevision: number,
        presentationGeneration: number,
        expectedProjectionGeneration?: number,
    ): boolean {
        return Boolean(this.view)
            && presentationGeneration === this.presentationGeneration
            && this.publicSeatRenderRevisions.get(dataSeat) === seatRevision
            && (expectedProjectionGeneration === undefined
                || expectedProjectionGeneration === this.publicProjectionGeneration);
    }

    private waitForPublicCardHold(dataSeat: number): Promise<void> {
        const shownAt = this.publicCardShownAt.get(dataSeat);
        if (shownAt === undefined) return Promise.resolve();
        const remaining = COMPLETED_TRICK_HOLD_MS - (Date.now() - shownAt);
        if (remaining <= 0) return Promise.resolve();
        return new Promise((resolve) => globalThis.setTimeout(resolve, remaining));
    }

    /** Clear only the seat that has just received its next authoritative turn. */
    private clearPublicCardsForTurn(dataSeat: number): void {
        if (!Number.isInteger(dataSeat) || dataSeat < 0 || !this.view) return;
        const existingTimer = this.publicCardClearTimers.get(dataSeat);
        if (existingTimer) globalThis.clearTimeout(existingTimer);
        const shownAt = this.publicCardShownAt.get(dataSeat);
        const remaining = shownAt === undefined ? 0 : COMPLETED_TRICK_HOLD_MS - (Date.now() - shownAt);
        if (remaining <= 0) {
            this.clearPublicCardsForSeat(dataSeat);
            return;
        }
        const timer = globalThis.setTimeout(() => {
            this.publicCardClearTimers.delete(dataSeat);
            this.clearPublicCardsForSeat(dataSeat);
        }, remaining) as unknown as number;
        this.publicCardClearTimers.set(dataSeat, timer);
    }

    /**
     * A completed trick is one visual unit. Keep every play in that trick until
     * the winning play has been visible for two seconds, then clear all seats in
     * the same callback so an earlier response cannot remain by itself.
     */
    private clearCompletedTrickAfterHold(winningSeat: number): void {
        if (!Number.isInteger(winningSeat) || winningSeat < 0 || !this.view) return;
        const existingTimer = this.publicCardClearTimers.get(winningSeat);
        if (existingTimer) globalThis.clearTimeout(existingTimer);
        const shownAt = this.publicCardShownAt.get(winningSeat);
        const remaining = shownAt === undefined ? COMPLETED_TRICK_HOLD_MS
            : Math.max(0, COMPLETED_TRICK_HOLD_MS - (Date.now() - shownAt));
        const clearTrick = (): void => {
            this.publicCardClearTimers.delete(winningSeat);
            this.clearLatestPublicCards();
        };
        if (remaining <= 0) clearTrick();
        else this.publicCardClearTimers.set(winningSeat,
            globalThis.setTimeout(clearTrick, remaining) as unknown as number);
    }

    private clearPublicCardsForSeat(dataSeat: number): void {
        this.claimPublicSeatRender(dataSeat);
        const timer = this.publicCardClearTimers.get(dataSeat);
        if (timer) globalThis.clearTimeout(timer);
        this.publicCardClearTimers.delete(dataSeat);
        this.publicCardShownAt.delete(dataSeat);
        this.publicSeatOperationIds.delete(dataSeat);
        const entry = createSeatEntries(this.authoritativePlayerCount(), this.clientSeat())
            .find((item) => item.dataSeat === dataSeat);
        if (!entry || !this.view) return;
        const path = `Players/Play_${entry.physicalSlot}/Card/Out_Card`;
        const parent = this.view.find(path);
        this.cards.clear(parent);
        this.setOutCardVisible(path, false);
        this.view.visible(`Players/Play_${entry.physicalSlot}/Tip/Pass`, false);
    }

    private clearLatestPublicCards(): void {
        for (const entry of createSeatEntries(this.authoritativePlayerCount(), this.clientSeat())) {
            this.clearPublicCardsForSeat(entry.dataSeat);
        }
    }

    /**
     * A second manual play may begin before the preceding two-second presentation
     * expires. Clear the live trick slots before its flight so two hands never
     * overlap. Liangshan's accumulated Table_Cards archive is intentionally not
     * touched by this live-slot operation.
     */
    private captureRapidPreviousPlay(): Map<number, { operationId: string; shownAt: number }> {
        const snapshot = new Map<number, { operationId: string; shownAt: number }>();
        const latestShownAt = Math.max(0, ...this.publicCardShownAt.values());
        if (latestShownAt <= 0) return snapshot;
        const elapsedMs = Date.now() - latestShownAt;
        if (elapsedMs < 0 || elapsedMs >= COMPLETED_TRICK_HOLD_MS) return snapshot;
        for (const [seat, shownAt] of this.publicCardShownAt) {
            snapshot.set(seat, {
                operationId: this.publicSeatOperationIds.get(seat) ?? '',
                shownAt,
            });
        }
        return snapshot;
    }

    /** Clear only the pre-click cards that still exist after Authority accepts the play. */
    private clearRapidPreviousPlayAfterCommit(
        snapshot: ReadonlyMap<number, { operationId: string; shownAt: number }>,
    ): void {
        if (snapshot.size === 0) return;
        const clearedSeats: number[] = [];
        for (const [seat, previous] of snapshot) {
            // A fast authority push may already have replaced this seat's slot
            // with the newly committed play. Timestamp/id equality prevents the
            // delayed request result from deleting that newer presentation.
            if (this.publicCardShownAt.get(seat) !== previous.shownAt
                || (this.publicSeatOperationIds.get(seat) ?? '') !== previous.operationId) continue;
            this.clearPublicCardsForSeat(seat);
            clearedSeats.push(seat);
        }
        console.info('[PdkRapidPlayClear]', {
            roomId: this.roomId(),
            playerId: this.runtime.getPlayerId(),
            operationId: String(this.record(this.runtime.getRoomSet().GetRoomSetInfo()?.operationDeadline)?.operationId ?? ''),
            stateVersion: Number(this.runtime.getRoom().GetRoomProperty('stateVersion') ?? -1),
            clearedSeats,
            action: 'CLEAR_COMMITTED_PREVIOUS_OUT_CARDS',
        });
    }

    private cancelPublicCardClearTimers(): void {
        for (const timer of this.publicCardClearTimers.values()) globalThis.clearTimeout(timer);
        this.publicCardClearTimers.clear();
    }

    private prepareOwnFlightCards(sourceCards: readonly Node[]): Node[] {
        const root = this.flyingCardOverlay();
        const rootTransform = root?.getComponent(UITransform);
        if (!root || !rootTransform) return [];
        return sourceCards.flatMap((source) => {
            if (!source.isValid) return [];
            const sourceTransform = source.getComponent(UITransform);
            if (!sourceTransform) return [];
            const sourceWorldScale = source.worldScale.clone();
            const flying = instantiate(source);
            // The source may currently be raised/previewed. Animated copies must
            // contain only the card face, never the selection or disabled shadow.
            const presenter = flying.getComponent(Poker_Card_Presenter);
            presenter?.setPdkVisualState(false, false);
            flying.parent = root;
            flying.setWorldPosition(sourceTransform.convertToWorldSpaceAR(Vec3.ZERO));
            const rootScale = root.worldScale;
            flying.setScale(
                sourceWorldScale.x / (rootScale.x || 1),
                sourceWorldScale.y / (rootScale.y || 1),
                sourceWorldScale.z / (rootScale.z || 1),
            );
            flying.active = false;
            return [flying];
        });
    }

    private async flyCardsToOwnAction(flyingCards: readonly Node[]): Promise<void> {
        const root = this.flyingOverlay;
        const target = this.view?.find('Players/Play_0/Card/Out_Card');
        const rootTransform = root?.getComponent(UITransform);
        const targetTransform = target?.getComponent(UITransform);
        if (!root || !rootTransform || !target || !targetTransform) {
            for (const card of flyingCards) if (card.isValid) card.destroy();
            return;
        }
        const rootScale = root.worldScale;
        const targetWorldScale = target.worldScale;
        const targetScale = new Vec3(
            targetWorldScale.x / (rootScale.x || 1),
            targetWorldScale.y / (rootScale.y || 1),
            targetWorldScale.z / (rootScale.z || 1),
        );
        // Each clone flies directly to its final authored Out_Card position.
        // Interpolating every card from its hand slot to that exact point makes
        // the gaps close continuously during the flight. Using a temporary
        // fixed spread here would first squeeze the cards into a stack and then
        // expand them again when updateActionCardLayout() runs after landing.
        const layout = target.getComponent(Layout);
        const cardWidth = Math.max(
            flyingCards[0]?.getComponent(UITransform)?.contentSize.width ?? 0,
            OUT_CARD_FALLBACK_WIDTH,
        );
        const step = cardWidth + (layout?.spacingX ?? 0);
        const firstCenter = -((flyingCards.length - 1) * step) / 2;
        const rightToLeft = Number(layout?.horizontalDirection ?? 0) === 1;
        const destinations = flyingCards.map((_card, childIndex) => {
            const index = rightToLeft ? flyingCards.length - 1 - childIndex : childIndex;
            const targetWorld = targetTransform.convertToWorldSpaceAR(
                new Vec3(firstCenter + index * step, 0, 0),
            );
            return rootTransform.convertToNodeSpaceAR(targetWorld);
        });
        await Promise.all(flyingCards.map((flying, index) => new Promise<void>((resolve) => {
            if (!flying.isValid) { resolve(); return; }
            let settled = false;
            const finish = (): void => {
                if (settled) return;
                settled = true;
                globalThis.clearTimeout(timeout);
                resolve();
            };
            const timeout = globalThis.setTimeout(finish, OWN_CARD_FLIGHT_DURATION_SECONDS * 1000 + 250);
            flying.active = true;
            Tween.stopAllByTarget(flying);
            tween(flying).to(OWN_CARD_FLIGHT_DURATION_SECONDS, {
                position: destinations[index],
                scale: targetScale,
            }, { easing: 'quadOut' }).call(finish).start();
        })));
    }

    /** Swap landed flight clones for authoritative Out_Card nodes without an empty frame. */
    private clearOwnLandingCards(): void {
        for (const card of this.ownLandingCards) {
            if (!card.isValid) continue;
            Tween.stopAllByTarget(card);
            card.removeFromParent();
            card.destroy();
        }
        this.ownLandingCards.length = 0;
    }

    private flyingCardOverlay(): Node | null {
        const roomRoot = this.view?.root;
        if (!roomRoot) return null;
        if (this.flyingOverlay?.isValid) return this.flyingOverlay;
        const overlay = this.cards.createFlyingOverlay(roomRoot);
        this.flyingOverlay = overlay;
        return overlay;
    }

    private resetPromptCycle(): void {
        this.tipIndex = 0;
        this.promptCycleKey = '';
        this.hintCacheKey = '';
        this.hintCache = [];
    }

    private authoritativeRuleOptions(): Record<string, unknown> {
        const config = this.runtime.getRoom().GetRoomConfig() ?? {};
        const rules = this.record(config.ruleOptions);
        if (!rules) throw new Error('CommonPdk 权威 ruleOptions 缺失');
        return rules;
    }

    private tripleAttachmentPermissions(): { singles: boolean; pairs: boolean } {
        const mode = String(this.authoritativeRuleOptions().tripleAttachmentMode ?? '');
        if (!['DISABLED', 'SINGLES', 'PAIRS', 'EITHER'].includes(mode)) {
            throw new Error('CommonPdk 权威 tripleAttachmentMode 无效');
        }
        return {
            singles: mode === 'SINGLES' || mode === 'EITHER',
            pairs: mode === 'PAIRS' || mode === 'EITHER',
        };
    }

    private fourAttachmentPermissions(): { singles: boolean; pairs: boolean } {
        const mode = String(this.authoritativeRuleOptions().fourAttachmentMode ?? '');
        if (!['DISABLED', 'SINGLES', 'PAIRS', 'EITHER'].includes(mode)) {
            throw new Error('CommonPdk 权威 fourAttachmentMode 无效');
        }
        return {
            singles: mode === 'SINGLES' || mode === 'EITHER',
            pairs: mode === 'PAIRS' || mode === 'EITHER',
        };
    }

    private leadTipCandidates(): number[][] {
        const candidates: number[][] = [];
        const hand = [...(this.logic.GetHandCard() ?? [])].map(Number);
        const wholeHandType = this.operationTypeForCards(hand);
        // Legacy type-specific enumerators do not cover every legal complete
        // hand (for example 888+7 in a triple-with-single room).  Put the exact
        // hand into the lead cycle first and let the common legality/ranking
        // pass below validate and de-duplicate it.  This keeps Hint consistent
        // with final-hand autoplay and prevents a legal 8887 being reduced to 88.
        if (hand.length > 0 && wholeHandType > 0 && this.isWholeHandTypeEnabled(wholeHandType)) {
            candidates.push(hand);
        }
        const hasRule = (name: string) => Boolean(this.runtime.getRoom().GetRoomPaiXing?.(name));
        const triple = this.tripleAttachmentPermissions();
        const four = this.fourAttachmentPermissions();
        this.pushTipCandidates(candidates, this.logic.GetZhaDanTip());
        if (four.singles) this.pushTipCandidates(candidates, this.logic.GetSiDaiTip(9));
        if (four.pairs) this.pushTipCandidates(candidates, this.logic.GetSiDaiTip(20));
        if (this.authoritativeRuleOptions().allowFourBombWithOne === true) {
            this.pushTipCandidates(candidates, this.logic.GetSiDaiTip(8));
        }
        if (this.authoritativeRuleOptions().allowFourWithThree === true) {
            this.pushTipCandidates(candidates, this.logic.GetSiDaiTip(10));
        }
        if (triple.singles) this.pushTipCandidates(candidates, this.logic.GetSanDaiFeiJiTip(18, 3));
        if (triple.pairs) this.pushTipCandidates(candidates, this.logic.GetSanDaiFeiJiTip(17, 3));
        if (triple.singles) this.pushTipCandidates(candidates, this.logic.GetSanDaiFeiJiTip(16, 3));
        if (hasRule('SanBuDai')) this.pushTipCandidates(candidates, this.logic.GetSanDaiFeiJiTip(19, 3));
        this.pushTipCandidates(candidates, this.logic.GetLianDuiTip());
        this.pushTipCandidates(candidates, this.logic.GetShunziTip());
        if (triple.singles) this.pushTipCandidates(candidates, this.logic.GetSanDaiTip(7));
        if (triple.pairs) this.pushTipCandidates(candidates, this.logic.GetSanDaiTip(15));
        if (triple.singles) this.pushTipCandidates(candidates, this.logic.GetSanDaiTip(6));
        if (hasRule('SanBuDai') || hasRule('QuanSanBuDai')) this.pushTipCandidates(candidates, this.logic.GetSanDaiTip(5));
        this.pushTipCandidates(candidates, this.logic.GetDuiziTip());
        this.pushTipCandidates(candidates, this.singleTipCandidates());
        return candidates;
    }

    private activeRequiredFirstCard(): number {
        const setInfo = this.runtime.getRoomSet().GetRoomSetInfo() ?? {};
        const room = this.runtime.getRoom();
        const playedCards = setInfo.playedCards ?? room.GetRoomProperty('playedCards');
        const playHistory = setInfo.playHistory ?? room.GetRoomProperty('playHistory');
        // Authority keeps the round's opening-card marker in later snapshots.
        // trickId is match-global and therefore cannot identify a new round's first
        // trick. The current round's authoritative play history is the boundary.
        const currentRoundHasPlayed = (Array.isArray(playHistory) && playHistory.length > 0)
            || (Array.isArray(playedCards) && playedCards.length > 0);
        if (currentRoundHasPlayed) return 0;
        const value = Number(setInfo.activeRequiredFirstCard
            ?? room.GetRoomProperty('activeRequiredFirstCard') ?? 0);
        if (!Number.isSafeInteger(value) || value <= 0) return 0;
        // Authority may retain the opening-card marker after that physical card
        // has already been played. It can only constrain a lead while the exact
        // card is still present in this client's current hand.
        return (this.logic.GetHandCard() as number[]).includes(value) ? value : 0;
    }

    private pushTipCandidates(target: number[][], source: unknown): void {
        if (!Array.isArray(source)) return;
        for (const item of source) {
            if (!Array.isArray(item)) continue;
            const values = item.map(Number).filter(Number.isFinite);
            if (values.length > 0) target.push(values);
        }
    }

    private singleTipCandidates(): number[][] {
        const hand = this.logic.GetHandCard() ?? [];
        const singles: number[][] = [];
        for (let index = hand.length - 1; index >= 0; index -= 1) singles.push([Number(hand[index])]);
        return singles;
    }

    private responseTipCandidates(): number[][] {
        const targetCards = this.logic.lastCardList ?? [];
        if (Number(this.logic.GetLastCardType()) !== 2 || targetCards.length !== 1) {
            const legacy = this.logic.GetTipCard();
            // The migrated enumerator greedily fills attachments. In an EITHER
            // room it can turn JJJ+A+K into JJJ+AA, classify that candidate as
            // TRIPLE_WITH_PAIR, and then lose a legal response to TRIPLE_WITH_TWO.
            // Enumerate exact-size physical subsets and let the regional rule
            // engine below validate shape and comparison for every compound type.
            const candidates = [...legacy, ...this.exactSizeResponseSubsets(targetCards.length)];
            // Bombs are valid independent responses to every non-bomb shape and
            // do not have the target hand's card count. Enumerating only exact-
            // size subsets drops a four-card bomb when responding to a five-card
            // triple attachment, straight, pair-run, etc. Keep each authority-
            // recognised bomb as its own fallback candidate; the sorter below
            // still exhausts same-shape responses before presenting bombs.
            this.pushTipCandidates(candidates, this.logic.GetZhaDanTip());
            return candidates;
        }
        const target = Number(targetCards[0]);
        // A complete bomb is atomic even when one of its cards can beat the
        // table single. Exclude those physical cards at candidate creation so
        // later maximum/two-hand ranking can never reintroduce a split bomb.
        const candidates = pdkSingleResponseCandidates(
            this.logic.GetHandCard() ?? [], target, this.protectedBombGroups(),
        );
        this.pushTipCandidates(candidates, this.logic.GetZhaDanTip());
        return candidates;
    }

    private exactSizeResponseSubsets(size: number): number[][] {
        const hand = [...(this.logic.GetHandCard() ?? [])].map(Number);
        if (!Number.isSafeInteger(size) || size <= 1 || size > hand.length) return [];
        const result: number[][] = [];
        const build = (start: number, cards: number[]): void => {
            if (cards.length === size) {
                result.push([...cards]);
                return;
            }
            const remaining = size - cards.length;
            for (let index = start; index <= hand.length - remaining; index += 1) {
                cards.push(hand[index]);
                build(index + 1, cards);
                cards.pop();
            }
        };
        build(0, []);
        return result;
    }

    private sortedLegalTipCandidates(
        source: unknown,
        preferLargest = false,
        preferFewestLooseSinglesOnEqualSize = false,
    ): number[][] {
        const previous = [...(this.logic.GetSelectCard() ?? [])].map(Number);
        const targetType = Number(this.logic.GetLastCardType());
        const targetCount = Array.isArray(this.logic.lastCardList) ? this.logic.lastCardList.length : 0;
        const keyed = new Map<string, {
            cards: number[];
            order: number;
            usesFourCardBody: boolean;
            finishesInTwo: boolean;
            containsRuleMaximum: boolean;
        }>();
        try {
            const values: unknown[] = Array.isArray(source) ? source : [];
            for (let order = 0; order < values.length; order += 1) {
                if (!Array.isArray(values[order])) continue;
                const cards = this.cardsInHandOrder((values[order] as unknown[]).map(Number).filter(Number.isFinite));
                if (!cards.length) continue;
                this.logic.ChangeSelectCard(cards);
                const cardType = Number(this.logic.GetCardType());
                if (cardType <= 0) continue;
                if (!isPdkResponseShape(cardType, cards.length, targetType, targetCount)) continue;
                if (targetType === 2 && targetCount === 1 && cardType === 2
                    && !isStrictlyHigherPdkSingle(cards[0], this.logic.lastCardList[0])) continue;
                const key = `${cardType}:${cards.map((card) => this.logic.GetCardValue(card)).sort((a, b) => a - b).join(',')}`;
                if (!keyed.has(key)) keyed.set(key, {
                    cards,
                    order,
                    usesFourCardBody: cardType === 8 || cardType === 9 || cardType === 10 || cardType === 20,
                    finishesInTwo: this.leavesOneLegalPlay(cards),
                    containsRuleMaximum: this.containsRegionalMaximum(cards),
                });
            }
        } finally {
            this.logic.ChangeSelectCard(previous);
        }
        const rules = this.authoritativeRuleOptions();
        const minimumStraightLength = Number(rules.minimumStraightLength);
        const minimumPairRunLength = Number(rules.minimumPairRunLength);
        if (!Number.isSafeInteger(minimumStraightLength) || minimumStraightLength < 3
            || !Number.isSafeInteger(minimumPairRunLength) || minimumPairRunLength < 2) {
            throw new Error('CommonPdk 权威连续牌规则无效');
        }
        const candidates = [...keyed.values()];
        const constrained = this.nextPlayerReportedSingle()
            ? candidates.filter((candidate) => candidate.cards.length !== 1 || this.cardRank(candidate.cards[0]) === this.highestHandRank())
            : candidates;
        const rankCandidates = (values: typeof constrained): number[][] => rankCleanPdkHints(this.logic.GetHandCard() ?? [], values, {
            minimumStraightLength,
            minimumPairRunLength,
            allowTwoInRuns: Boolean(rules.allowTwoInRuns),
            protectedBombs: this.protectedBombGroups(),
            singleAttachmentCapacityPerTriple: ['SINGLES', 'EITHER'].includes(
                String(rules.tripleAttachmentMode ?? ''),
            ) ? 2 : 0,
            // Every response, including a single-card response, first keeps the
            // fewest effective loose singles. Candidate point value is only a
            // later tie-breaker, so equal cleanup starts from the lowest card
            // that can beat the table play.
            prioritizeLooseSingles: targetCount > 0,
        }, preferLargest, preferFewestLooseSinglesOnEqualSize);
        // Response prompts always exhaust the same legal shape first. A bomb is
        // the fallback only when no same-shape response exists; remaining-hand
        // quality must never promote a bomb ahead of a valid triple-with-two.
        const sameShape = targetType > 0 && targetType !== 11
            ? constrained.filter((candidate) => {
                const previous = [...(this.logic.GetSelectCard() ?? [])].map(Number);
                try {
                    this.logic.ChangeSelectCard(candidate.cards);
                    return Number(this.logic.GetCardType()) === targetType;
                } finally {
                    this.logic.ChangeSelectCard(previous);
                }
            })
            : constrained;
        const fallbackBombs = targetType > 0 && targetType !== 11
            ? constrained.filter((candidate) => !sameShape.includes(candidate))
            : [];
        const ranked = [...rankCandidates(sameShape), ...rankCandidates(fallbackBombs)];
        return ranked;
    }

    /** Resolve every bomb from the active regional rule engine, including 3A. */
    private protectedBombGroups(): number[][] {
        const raw = this.logic.GetZhaDanTip();
        if (!Array.isArray(raw)) return [];
        return raw
            .filter((group): group is unknown[] => Array.isArray(group))
            .map((group) => group.map(Number).filter(Number.isFinite))
            .filter((group) => group.length >= 3);
    }

    private cardsInHandOrder(cards: number[]): number[] {
        const counts = new Map<number, number>();
        for (const value of cards) counts.set(value, (counts.get(value) ?? 0) + 1);
        const ordered: number[] = [];
        for (const value of this.logic.GetHandCard() ?? []) {
            const card = Number(value);
            const count = counts.get(card) ?? 0;
            if (count <= 0) continue;
            ordered.push(card);
            if (count === 1) counts.delete(card);
            else counts.set(card, count - 1);
        }
        return ordered;
    }

    private nextPlayerReportedSingle(): boolean {
        const playerCount = this.authoritativePlayerCount();
        const nextSeat = (this.clientSeat() + 1) % playerCount;
        return this.remainingCards.get(nextSeat) === 1;
    }

    private highestHandRank(): number {
        return Math.max(...(this.logic.GetHandCard() ?? []).map((card) => this.cardRank(Number(card))));
    }

    /** Whether removing this play leaves one complete play under the active regional rules. */
    private leavesOneLegalPlay(played: readonly number[]): boolean {
        const hand = [...(this.logic.GetHandCard() ?? [])].map(Number);
        const selected = pdkSelectionMask(hand, played);
        const remaining = hand.filter((_card, index) => !selected[index]);
        if (remaining.length === 0) return false;
        const previous = [...(this.logic.GetSelectCard() ?? [])].map(Number);
        const previousType = Number(this.logic.GetLastCardType());
        const previousCards = [...(this.logic.lastCardList ?? [])].map(Number);
        try {
            this.logic.ClearCardData();
            this.logic.ChangeSelectCard(remaining);
            return Number(this.logic.GetCardType()) > 0;
        } finally {
            this.logic.lastCardType = previousType;
            this.logic.lastCardList = previousCards;
            this.logic.ChangeSelectCard(previous);
        }
    }

    /**
     * A rank is maximal for a combination when no higher rank in the immutable
     * regional deck has enough physical copies for the same multiplicity.
     * Thus Chengdu resolves single 2 and pair/triple A without region branches,
     * while Liangshan resolves A for every supported multiplicity.
     */
    private containsRegionalMaximum(cards: readonly number[]): boolean {
        const rawDeck = this.authoritativeRuleOptions().deckCards;
        if (!Array.isArray(rawDeck) || rawDeck.length === 0) {
            throw new Error('CommonPdk 权威 deckCards 缺失');
        }
        return isRegionalMaximumPdkCombination(cards, rawDeck.map(Number).filter(Number.isFinite));
    }

    private cardRank(card: number): number {
        return Number(this.logic.GetCardValue(card));
    }

    private cardDisplayName(card: number): string {
        const normalized = card > 500 ? card - 500 : card;
        const suit = Math.floor(normalized / 100);
        const rank = normalized % 100;
        if (suit === 5 && rank === 16) return '小王';
        if (suit === 5 && rank === 17) return '大王';
        const suits: Record<number, string> = { 1: '方块', 2: '梅花', 3: '红桃', 4: '黑桃' };
        const ranks: Record<number, string> = { 11: 'J', 12: 'Q', 13: 'K', 14: 'A', 15: '2' };
        return `${suits[suit] ?? ''}${ranks[rank] ?? rank}`;
    }

    private promptKey(): string {
        const hand = (this.logic.GetHandCard() ?? []).join(',');
        const last = (this.logic.lastCardList ?? []).join(',');
        return [hand, this.logic.GetLastCardType(), last, this.isAuthoritativeLeadingTurn(), this.activeOpPos,
            this.activeRequiredFirstCard(),
            Number(this.runtime.getRoom().GetRoomProperty('stateVersion') ?? 0)].join('|');
    }

    private isAuthoritativeLeadingTurn(): boolean {
        const setInfo = this.runtime.getRoomSet().GetRoomSetInfo() ?? {};
        const { cards, type } = this.authorityComparison(setInfo);
        return Boolean(setInfo.trickReset) || Boolean(setInfo.isFirstOp)
            || cards.length === 0 || type <= 0;
    }

    private async autoHintForAuthoritativeTurn(setInfo: Record<string, unknown>): Promise<void> {
        if (!this.view || this.cardNodes.length === 0) return;
        // During dealer competition Authority deliberately exposes the current
        // responder as opPos. That seat owns only the rob/pass decision; it does
        // not yet own a card-play turn. In particular, a whole-hand straight
        // must wait until competition resolves and PLAYING names the final
        // dealer as currentSeat.
        if (!this.isFormalCardPlayPhase(setInfo)) {
            this.cancelAutoPlay();
            return;
        }
        const roomId = this.roomId();
        const stateVersion = Number(this.runtime.getRoom().GetRoomProperty('stateVersion') ?? -1);
        const deadline = this.record(setInfo.operationDeadline);
        const operationId = String(deadline?.operationId ?? '');
        const turnSeat = Number(setInfo.opPos ?? deadline?.seatId ?? -1);
        const trick = this.record(setInfo.comparisonState);
        const trickId = Number(setInfo.trickId ?? trick?.trickId ?? 0);
        const tableOperations = Array.isArray(setInfo.tableOperations) ? setInfo.tableOperations : [];
        const localTurn = Number(this.runtime.getRoom().GetRoomProperty('state') ?? 0) === 1
            && this.activeOpPos === this.clientSeat()
            && turnSeat === this.clientSeat();
        if (!localTurn || this.autoPlayInFlight || this.autoPassInFlight) return;
        this.synchronizeAuthorityComparison(setInfo);
        const lastCardType = Number(this.logic.GetLastCardType());
        const lastCards = [...(this.logic.lastCardList ?? [])];
        const leading = lastCardType <= 0 || lastCards.length === 0 || Boolean(setInfo.isFirstOp);
        const key = [
            roomId,
            Number(setInfo.roundNo ?? this.runtime.getRoom().GetRoomProperty('setID') ?? 0),
            stateVersion,
            operationId,
            turnSeat,
            trickId,
            tableOperations.length,
            lastCardType,
            lastCards.join(','),
        ].join(':');
        if (!operationId || stateVersion < 0 || this.autoHintTurnKey === key) return;
        this.autoHintTurnKey = key;
        this.autoPassInFlight = true;
        try {
            const latestSet = this.runtime.getRoomSet().GetRoomSetInfo() ?? {};
            const latestDeadline = this.record(latestSet.operationDeadline);
            const stillCurrent = Number(this.runtime.getRoom().GetRoomProperty('state') ?? 0) === 1
                && this.roomId() === roomId
                && Number(this.runtime.getRoom().GetRoomProperty('stateVersion') ?? -2) === stateVersion
                && this.activeOpPos === turnSeat
                && String(latestDeadline?.operationId ?? '') === operationId
                && this.autoHintTurnKey === key;
            if (!stillCurrent || this.autoPlayInFlight) return;
            const hand = [...(this.logic.GetHandCard() ?? [])].map(Number);
            const required = leading ? this.activeRequiredFirstCard() : 0;
            const wholeHandType = this.operationTypeForCards(hand);
            const wholeHandAllowed = this.isWholeHandTypeEnabled(wholeHandType);
            // The legacy hint enumerators can omit a legal compound final hand.
            // Validate the exact whole hand directly with the regional rule engine;
            // when legal, it is the only possible final action and is auto-played.
            if ((required <= 0 || hand.includes(required)) && wholeHandType > 0 && wholeHandAllowed
                && this.maybeAutoPlay(latestSet, true, { cards: hand, opType: wholeHandType })) {
                console.info('[CommonRoomLastHandAutoPlay]', {
                    roomId, stateVersion, operationId, turnSeat, trickId,
                    leading, opType: wholeHandType, cards: [...hand],
                });
                return;
            }
            // A lead turn belongs entirely to the player. Do not raise a card
            // automatically; the Hint button remains available on demand. The
            // final-hand autoplay above is intentionally the only exception.
            if (leading) {
                this.logic.ChangeSelectCard([]);
                this.updateSelection();
                return;
            }
            const localSource = leading ? this.leadTipCandidates() : this.responseTipCandidates();
            const legal = this.sortedLegalTipCandidates(localSource, leading);
            const tips = required > 0 ? legal.filter((cards) => cards.includes(required)) : legal;
            if (tips.length > 0) {
                const automatic = tips[0];
                this.promptCycleKey = this.promptKey();
                this.tipIndex = tips.length > 1 ? 1 : 0;
                this.hintCacheKey = this.promptCycleKey;
                this.hintCache = tips;
                this.logic.ChangeSelectCard(automatic);
                this.updateSelection();
                console.info('[CommonRoomAutoHintSelection]', {
                    roomId, stateVersion, operationId, turnSeat, trickId,
                    finalCards: [...automatic],
                    nodeY: this.cardNodes.map((node) => Number(node.position.y)),
                });
                return;
            }
            this.logic.ChangeSelectCard([]);
            this.updateSelection();
            this.operations?.hide();
            this.view?.visible('Players/Play_0/Tip/Pass', true);
            console.info('[CommonRoomAutoPass]', {
                roomId, stateVersion, operationId, turnSeat, trickId,
                targetType: lastCardType, targetCards: [...lastCards],
            });
            await this.pass();
        } catch (error: unknown) {
            if (this.view && this.roomId() === roomId
                && Number(this.runtime.getRoom().GetRoomProperty('state') ?? 0) === 1
                && Number(this.runtime.getRoom().GetRoomProperty('stateVersion') ?? -2) === stateVersion) {
                // “无牌可压”属于自动过牌流程，不是需要玩家处理的提示错误。
                // 请求异常只写入带回合上下文的诊断日志，避免弹出“自动提示失败”。
                console.error('[CommonRoomAutoPassError]', {
                    roomId, stateVersion, operationId, turnSeat, trickId,
                    targetType: lastCardType, targetCards: [...lastCards],
                }, error);
            }
        } finally {
            this.autoPassInFlight = false;
        }
    }

    private operationTypeForCards(cards: readonly number[]): number {
        const previous = [...(this.logic.GetSelectCard() ?? [])].map(Number);
        try {
            this.logic.ChangeSelectCard([...cards]);
            return Number(this.logic.GetCardType());
        } finally {
            this.logic.ChangeSelectCard(previous);
        }
    }

    /** Last-hand convenience must obey the same dynamic attachment switches as Authority. */
    private isWholeHandTypeEnabled(opType: number): boolean {
        const rules = this.authoritativeRuleOptions();
        const triple = String(rules.tripleAttachmentMode ?? 'DISABLED');
        const four = String(rules.fourAttachmentMode ?? 'DISABLED');
        switch (opType) {
            case 6:
            case 7:
            case 16:
            case 18:
                return triple === 'SINGLES' || triple === 'EITHER';
            case 15:
            case 17:
                return triple === 'PAIRS' || triple === 'EITHER';
            case 8:
                return rules.allowFourBombWithOne === true;
            case 9:
                return four === 'SINGLES' || four === 'EITHER';
            case 20:
                return four === 'PAIRS' || four === 'EITHER';
            case 10:
                return rules.allowFourWithThree === true;
            default:
                return opType > 0;
        }
    }

    /** Synchronous visibility guard used before delayed whole-hand autoplay starts. */
    private isAutomaticWholeHand(setInfo: Record<string, unknown>, localTurn: boolean): boolean {
        if (!localTurn || !this.isFormalCardPlayPhase(setInfo)) return false;
        const hand = [...(this.logic.GetHandCard() ?? [])].map(Number);
        if (hand.length === 0) return false;
        if (this.autoPlayRejectedTurnKey === this.autoPlayKey(setInfo, hand)) return false;
        const leading = this.isAuthoritativeLeadingTurn();
        const required = leading ? this.activeRequiredFirstCard() : 0;
        if (required > 0 && !hand.includes(required)) return false;
        const opType = this.operationTypeForCards(hand);
        return opType > 0 && this.isWholeHandTypeEnabled(opType);
    }

    /** The atomic table snapshot is the only source allowed to mutate rule comparison state. */
    private synchronizeAuthorityComparison(
        setInfo: Record<string, unknown> = this.runtime.getRoomSet().GetRoomSetInfo() ?? {},
    ): void {
        const { cards, type } = this.authorityComparison(setInfo);
        if (cards.length > 0 && type > 0) this.logic.SetCardData(type, cards);
        else this.logic.ClearCardData();
    }

    /** One canonical comparison projection shared by Hint, autoplay, and Play. */
    private authorityComparison(setInfo: Record<string, unknown>): { cards: number[]; type: number } {
        const comparison = this.record(setInfo.comparisonState);
        if (!comparison) return { cards: [], type: 0 };
        const cards = Array.isArray(comparison.cards) ? comparison.cards.map(Number) : [];
        const type = this.legacyOperationType(comparison.cardType ?? comparison.type);
        return { cards, type };
    }

    private maybeAutoPlay(
        setInfo: Record<string, unknown>,
        localTurn: boolean,
        candidate?: { cards: number[]; opType: number },
    ): boolean {
        if (!localTurn || !this.isFormalCardPlayPhase(setInfo)) {
            this.cancelAutoPlay();
            return false;
        }
        if (this.autoPlayInFlight) return true;
        const hand = [...(candidate?.cards ?? [])].map(Number);
        const opType = Number(candidate?.opType ?? 0);
        if (!hand.length || opType <= 0 || !this.isWholeHandTypeEnabled(opType)
            || !this.sameCards(hand, this.logic.GetHandCard() ?? [])) return false;
        const turnKey = this.autoPlayKey(setInfo, hand);
        if (this.autoPlayRejectedTurnKey === turnKey) return false;
        if (this.autoPlayTurnKey === turnKey) {
            return false;
        }
        this.autoPlayTurnKey = turnKey;
        this.autoPlayInFlight = true;
        this.autoPassInFlight = false;
        // Hide manual actions in the same frame that Authority's whole-hand
        // state is accepted. Waiting for the delayed physical flight leaves a
        // clickable Hint/Play pair over an action the client already owns.
        this.refresh();
        this.traceOutCards('last-hand-auto-play', {
            turnKey,
            cards: [...hand],
            opType,
            hintVisible: Boolean(this.view?.find(PdkRoomNodePath.hintButton)?.activeInHierarchy),
            playVisible: Boolean(this.view?.find(PdkRoomNodePath.playButton)?.activeInHierarchy),
        });
        // Last-hand autoplay is a direct physical flight. Keep the cards at their
        // resting Y positions; raising them first creates an unwanted selection flash.
        this.logic.ChangeSelectCard([]);
        this.updateSelection();
        this.autoPlayTimer = globalThis.setTimeout(() => {
            this.autoPlayTimer = 0;
            const latest = this.runtime.getRoomSet().GetRoomSetInfo() ?? {};
            const stillLocalTurn = Number(this.runtime.getRoom().GetRoomProperty('state') ?? 0) === 1
                && this.activeOpPos === this.clientSeat()
                && this.isFormalCardPlayPhase(latest);
            const latestHand = [...(this.logic.GetHandCard() ?? [])].map(Number);
            const latestOpType = this.operationTypeForCards(latestHand);
            if (!stillLocalTurn || this.autoPlayKey(latest, latestHand) !== turnKey) {
                this.autoPlayInFlight = false;
                this.refresh();
                return;
            }
            // Revalidate after the delay. The hand, comparison state, or dynamic
            // room rule can change while the automatic flight is pending.
            if (latestOpType <= 0 || !this.isWholeHandTypeEnabled(latestOpType)) {
                this.traceOutCards('last-hand-auto-play-cancelled', {
                    turnKey, cards: [...latestHand], opType: latestOpType,
                    reason: 'CURRENT_RULE_REJECTED_WHOLE_HAND',
                });
                this.autoPlayInFlight = false;
                this.logic.ChangeSelectCard([]);
                this.updateSelection();
                this.refresh();
                return;
            }
            this.logic.ChangeSelectCard(latestHand);
            void this.outCard(latestOpType, true)
                .catch((error: unknown) => {
                    // Authority rejection ends automatic ownership of this turn.
                    // Keep the same hand/turn available through manual Hint/Play
                    // instead of hiding both buttons again on the final refresh.
                    this.autoPlayRejectedTurnKey = turnKey;
                    this.reportUserActionError('自动出牌', error);
                })
                .finally(() => {
                    this.autoPlayInFlight = false;
                    this.refresh();
                });
        }, AUTO_PLAY_SELECTION_DELAY_MS) as unknown as number;
        return true;
    }

    private hasUnretainedLatestAuthorityPlay(setInfo: Record<string, unknown>): boolean {
        if (!this.runtime.arrangementEnabled() || !this.view) return false;
        const operations = Array.isArray(setInfo.tableOperations) ? setInfo.tableOperations : [];
        for (let index = operations.length - 1; index >= 0; index -= 1) {
            const action = this.record(operations[index]);
            if (!action) continue;
            const cards = Array.isArray(action.cardList) ? action.cardList.map(Number) : [];
            if (cards.length === 0) continue;
            const operationId = String(action.operationId ?? action.id ?? '');
            const dataSeat = Number(action.seat ?? action.pos ?? action.opPos ?? -1);
            if (!operationId || dataSeat < 0) return false;
            const entry = createSeatEntries(this.authoritativePlayerCount(), this.clientSeat())
                .find((item) => item.dataSeat === dataSeat);
            if (!entry) return false;
            const tableCards = this.view.find(`Players/Play_${entry.physicalSlot}/Card/Table_Cards`);
            return !tableCards?.children.some((child) => child.name === `Play_${operationId}`);
        }
        return false;
    }

    private async advanceLatestAuthorityPlayToRetained(setInfo: Record<string, unknown>): Promise<void> {
        const startedAt = Date.now();
        while (this.hasUnretainedLatestAuthorityPlay(setInfo)) {
            // The presentation may enter moveAfterLiveHold after this method was
            // called. Preserve releaseNextHold until that registration happens.
            this.retainedPlayedCardFlow?.flushPendingHolds(true);
            await Promise.resolve();
            await this.retainedPlayedCardFlow?.waitForPendingTransfers();
            if (!this.hasUnretainedLatestAuthorityPlay(setInfo)) break;
            if (Date.now() - startedAt >= 3000) {
                this.traceOutCards('last-hand-preceding-transfer-timeout', {
                    waitedMs: Date.now() - startedAt,
                });
                break;
            }
            await new Promise<void>((resolve) => globalThis.setTimeout(resolve, 16));
        }
        // Creating Play_<operationId> happens at transfer start. Drain once
        // more so the cards have stopped at Table_Cards before final-hand flight.
        await this.retainedPlayedCardFlow?.waitForPendingTransfers();
    }

    private isFormalCardPlayPhase(setInfo: Record<string, unknown>): boolean {
        const phase = String(setInfo.authorityPhase ?? '').toUpperCase();
        return !this.competeDealerPhase && phase === 'PLAYING';
    }

    private autoPlayKey(setInfo: Record<string, unknown>, hand: number[]): string {
        const trick = this.record(setInfo.comparisonState);
        const deadline = this.record(setInfo.operationDeadline);
        const cards = Array.isArray(setInfo.cardList) ? setInfo.cardList
            : trick && Array.isArray(trick.cards) ? trick.cards : [];
        return [
            this.roomId(),
            this.clientSeat(),
            this.activeOpPos,
            Number(this.runtime.getRoom().GetRoomProperty('stateVersion') ?? 0),
            Number(setInfo.trickId ?? trick?.trickId ?? -1),
            String(deadline?.operationId ?? ''),
            Number(setInfo.opType ?? setInfo.opCardType ?? trick?.opType ?? trick?.opCardType ?? this.logic.GetLastCardType() ?? 0),
            cards.map(Number).join(','),
            hand.join(','),
        ].join(':');
    }

    private sameCards(left: readonly number[], right: readonly number[]): boolean {
        if (left.length !== right.length) return false;
        const sortedLeft = [...left].map(Number).sort((a, b) => a - b);
        const sortedRight = [...right].map(Number).sort((a, b) => a - b);
        return sortedLeft.every((card, index) => card === sortedRight[index]);
    }

    private cancelAutoPlay(): void {
        if (this.autoPlayTimer) globalThis.clearTimeout(this.autoPlayTimer);
        this.autoPlayTimer = 0;
        this.autoPlayInFlight = false;
    }

    private startClockFromSetInfo(packet: Record<string, unknown>): void {
        const deadline = this.record(packet.operationDeadline);
        const dataSeat = Number(deadline?.seatId ?? packet.opPos ?? -1);
        const deadlineEpochMillis = Number(deadline?.deadlineEpochMillis ?? 0);
        const serverEpochMillis = Number(packet.serverEpochMillis ?? Date.now());
        const seconds = deadlineEpochMillis > serverEpochMillis
            ? Math.ceil((deadlineEpochMillis - serverEpochMillis) / 1000)
            : Number(packet.runWaitSec ?? 0);
        if (dataSeat >= 0 && seconds > 0) this.startClock(dataSeat, seconds);
        else this.hideClocks();
    }

    private startClock(dataSeat: number, seconds: number): void {
        this.stopClock();
        let remaining = Math.max(0, Math.floor(seconds));
        const update = () => {
            const entry = createSeatEntries(this.authoritativePlayerCount(), this.clientSeat()).find((item) => item.dataSeat === dataSeat);
            for (let slot = 0; slot < 4; slot += 1) this.view?.visible(`Players/Play_${slot}/Clock`, Boolean(entry && slot === entry.physicalSlot));
            if (entry) this.view?.label(`Players/Play_${entry.physicalSlot}/Clock/Num`, String(remaining));
            const countdownKey = `${dataSeat}:${remaining}`;
            if (remaining > 3) this.lastCountdownSound = '';
            if (remaining > 0 && remaining <= 3 && countdownKey !== this.lastCountdownSound) {
                this.lastCountdownSound = countdownKey;
                void this.roomAudio?.play('daojishi');
            }
            if (remaining-- <= 0) this.stopClock();
        };
        update();
        this.clockTimer = globalThis.setInterval(update, 1000) as unknown as number;
    }
    private hideClocks(): void { this.stopClock(); for (let slot = 0; slot < 4; slot += 1) this.view?.visible(`Players/Play_${slot}/Clock`, false); }
    private stopClock(): void { if (this.clockTimer) globalThis.clearInterval(this.clockTimer); this.clockTimer = 0; }
    private bind(path: string, handler: () => void): void { this.view?.bind(path, handler, this.bound); }
    private bindCommon(path: string, handler: () => void): void { this.commonView?.bind(path, handler, this.commonBound); }
    private toggle(path: string): void { const node = this.view?.find(path); if (node) node.active = !node.active; }
    private toggleMoreMenu(): void {
        const now = Date.now();
        if (now - this.lastMoreToggleAt < 180) return;
        this.lastMoreToggleAt = now;
        const node = this.commonMoreItems;
        if (!node?.isValid) return;
        const opening = !node.active;
        // MoreMenu owns a zero-height Layout and a Widget relative to CommonRoom.
        // Reparenting that wrapper realigns or clips its children. Move only the
        // authored MoreItems list to the top PDK layer and preserve world geometry.
        if (opening && this.view) {
            const worldScale = node.worldScale.clone();
            const moreButton = this.commonMoreButton;
            const moreTransform = moreButton?.getComponent(UITransform);
            // MoreMenu is authored below a zero-sized CardCounter container, so
            // its Widget cannot derive a usable runtime position. Anchor the
            // list's top edge to the authored More button's bottom edge.
            const worldPosition = moreTransform
                ? moreTransform.convertToWorldSpaceAR(new Vec3(0, -moreTransform.height * 0.5, 0))
                : node.worldPosition.clone();
            if (!node.isChildOf(this.view.root)) {
                this.commonMoreWidgetStates.clear();
                const descendants = [node];
                while (descendants.length > 0) {
                    const current = descendants.pop()!;
                    const widget = current.getComponent(Widget);
                    if (widget) {
                        widget.updateAlignment();
                        this.commonMoreWidgetStates.set(widget, widget.enabled);
                        widget.enabled = false;
                    }
                    descendants.push(...current.children);
                }
                node.parent = this.view.root;
            }
            node.setWorldPosition(worldPosition);
            const rootScale = this.view.root.worldScale;
            node.setScale(
                worldScale.x / (rootScale.x || 1),
                worldScale.y / (rootScale.y || 1),
                worldScale.z / (rootScale.z || 1),
            );
        }
        if (opening && this.view) node.setSiblingIndex(this.view.root.children.length - 1);
        node.active = opening;
        if (!node.active) return;
        node.getComponent(Layout)?.updateLayout();
    }
    private hideMoreMenu(): void {
        if (this.commonMoreItems?.isValid) this.commonMoreItems.active = false;
    }
    private showCurrentRoomRules(): void {
        const config = this.runtime.getRoom().GetRoomConfig() ?? {};
        const rules = this.roomRuleSnapshot ?? config.ruleSnapshot ?? config.ruleOptions ?? config;
        const schema = this.roomRuleFields ?? config.ruleFields ?? config.fields ?? [];
        const text = formatPdkRuleSummary(rules, schema);
        this.view?.label('Panel/Bg_Wanfa/Labei_Wanfa', text || '当前房间没有可显示的开房规则');
        this.view?.visible('Panel/Bg_Wanfa', true);
        this.hideMoreMenu();
    }
    private roomId(): number { return Number(this.runtime.getRoom().GetRoomProperty('key') ?? 0); }
    private clientSeat(): number { return Number(this.runtime.getRoomPosManager().GetClientPos()); }

    /** Record opt-in E2E presentation evidence without producing normal runtime noise. */
    private traceOutCards(stage: string, detail: Record<string, unknown>): void {
        const diagnostics = globalThis as typeof globalThis & { __PDK_E2E_LOGS__?: unknown[] };
        if (!Array.isArray(diagnostics.__PDK_E2E_LOGS__)) return;
        diagnostics.__PDK_E2E_LOGS__.push({
            stage,
            at: Date.now(),
            roomId: this.roomId(),
            stateVersion: Number(this.runtime.getRoom().GetRoomProperty('stateVersion') ?? -1),
            trickId: Number(this.runtime.getRoomSet().GetRoomSetProperty('trickId') ?? -1),
            ...detail,
        });
    }

    private playGameOperation(dataSeat: number, opCardType: number, cards: readonly number[]): void {
        if (!this.gameAudio || dataSeat < 0 || opCardType <= 0) return;
        const player = this.runtime.getRoomPosManager().GetPlayerInfoByPos(dataSeat) as Record<string, unknown> | undefined;
        void this.gameAudio.play(opCardType, cards, pdkVoiceGender(player)).catch((error: unknown) => {
            console.error('跑得快出牌语音加载失败', error);
        });
    }
    private authoritativePlayerCount(): PdkPlayerCount {
        const config = this.runtime.getRoom().GetRoomConfig() ?? {};
        return this.playerCount(config.playerCount ?? config.playerNum ?? config.seatLimit ?? this.runtime.getRoomPosManager().GetPosCount());
    }
    private playerCount(value: unknown): PdkPlayerCount {
        const count = Number(value);
        if (count !== 2 && count !== 3 && count !== 4) throw new Error(`跑得快权威人数无效: ${String(value)}`);
        return count;
    }
    private gameAudioOperationType(type: unknown): number {
        // 权威服务端将“四带两对”命名为 FOUR_WITH_TWO_PAIRS；旧展示适配曾把它与
        // 四带一共用编号 8。音频必须保持牌型语义，单独映射到现有编号 20。
        if (String(type ?? '').trim().toUpperCase() === 'FOUR_WITH_TWO_PAIRS') return 20;
        return this.legacyOperationType(type);
    }
    private legacyOperationType(type: unknown): number {
        if (typeof type === 'number' && Number.isSafeInteger(type)) return type;
        switch (String(type ?? '').trim().toUpperCase()) {
            case 'SINGLE': return 2;
            case 'PAIR': return 3;
            case 'STRAIGHT': return 4;
            case 'TRIPLE': return 5;
            case 'TRIPLE_WITH_ONE': return 6;
            case 'TRIPLE_WITH_TWO': return 7;
            case 'FOUR_BOMB_WITH_ONE':
            case 'FOUR_WITH_TWO_PAIRS': return 8;
            case 'FOUR_WITH_TWO': return 9;
            case 'FOUR_WITH_THREE': return 10;
            case 'BOMB':
            case 'SPECIAL_TRIPLE_BOMB':
            case 'SPECIAL_TRIPLE_BOMB_WITH_ONE':
            case 'CONSECUTIVE_BOMB': return 11;
            case 'CONSECUTIVE_PAIRS': return 14;
            case 'TRIPLE_WITH_PAIR': return 15;
            case 'AIRPLANE_WITH_SINGLES': return 16;
            case 'AIRPLANE_WITH_PAIRS': return 17;
            case 'AIRPLANE_WITH_TWO': return 18;
            case 'AIRPLANE': return 19;
            default: return 0;
        }
    }
    private record(value: unknown): Record<string, unknown> | null {
        return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
    }
    private authorityActionKey(action: Record<string, unknown>): string {
        const operationId = String(action.operationId ?? '').trim();
        if (operationId) return operationId;
        const cards = Array.isArray(action.cards) ? action.cards.map(Number).join(',') : '';
        const type = String(action.opCardType ?? action.opType ?? action.cardType ?? action.type ?? '');
        return `${Number(action.seat ?? action.pos ?? action.opPos ?? -1)}:${String(action.action ?? '')}:${type}:${cards}`;
    }
    private report(error: unknown, fallback: string): void {
        console.error(`[CommonPdkPresentation] ${fallback}`, error);
        this.showMessage(fallback);
    }
    private reportPresentationError(
        error: unknown,
        stage: string,
        context: Record<string, unknown>,
    ): void {
        const diagnostic = {
            stage,
            roomId: this.roomId(),
            playerId: this.runtime.getPlayerId(),
            operationId: String(context.operationId
                ?? this.record(context.operationDeadline)?.operationId ?? ''),
            stateVersion: Number(context.stateVersion
                ?? this.runtime.getRoom().GetRoomProperty('stateVersion') ?? -1),
            reason: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
        };
        console.error('[CommonPdkPresentationError]', diagnostic, error);
        const host = globalThis as typeof globalThis & { __PDK_LAST_PRESENTATION_ERROR__?: unknown };
        host.__PDK_LAST_PRESENTATION_ERROR__ = diagnostic;
    }
    private runUserAction(label: string, action: () => Promise<unknown> | void): void {
        try {
            const result = action();
            if (result && typeof (result as Promise<unknown>).then === 'function') {
                void Promise.resolve(result).catch((error: unknown) => this.reportUserActionError(label, error));
            }
        } catch (error: unknown) {
            this.reportUserActionError(label, error);
        }
    }
    private reportUserActionError(label: string, error: unknown): void {
        const message = error instanceof Error && error.message ? error.message : `${label}失败`;
        if (message.includes('下家报单') || message.includes('must play highest single against reported single')) {
            this.showMessage('下家报单只能出最大单张');
            return;
        }
        if (label === '出牌' || label === '自动出牌') {
            if (/required|must.*contain|opening card/i.test(message)) {
                const required = this.activeRequiredFirstCard();
                this.showMessage(required > 0 ? `首手必须包含${this.cardDisplayName(required)}` : '首手缺少指定必出牌');
            } else if (/beat|higher|current trick|cannot play/i.test(message)) {
                this.showMessage('所选牌不能压过上家的牌');
            } else if (/card type|pattern|attachment|invalid play|牌型/i.test(message)) {
                this.showMessage('牌型错误');
            } else {
                this.showMessage('这手牌不能出');
            }
            console.error(`[PDKActionError] ${label}`, error);
            return;
        }
        const correlated = error as { aooCorrelation?: { msgId?: string; requestId?: string; traceId?: string } };
        const correlation = correlated.aooCorrelation;
        if (correlation) {
            console.error(`[PDKActionError] ${label}`, correlation, error);
            this.showMessage(`${label}失败，请重试`);
            return;
        }
        console.error(`[PDKActionError] ${label}`, error);
        this.showMessage(`${label}失败，请重试`);
    }
}
