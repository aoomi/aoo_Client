import { Button, EventMouse, EventTouch, game, instantiate, Label, Layout, Node, tween, Tween, UITransform, Vec2, Vec3, view } from 'cc';
import type { LegacyForm } from '../../../../../../Common/Code/Runtime/ui/LegacyFormManager';
import { PdkAnimationPresenter } from './Room/PdkAnimationPresenter';
import { PdkCardPresenter } from './Room/PdkCardPresenter';
import { PdkOperationPresenter } from './Room/PdkOperationPresenter';
import { PdkRoomLifecycleController } from './Room/PdkRoomLifecycleController';
import { PdkRoomBubblePresenter } from './Room/PdkRoomBubblePresenter';
import { PdkRoomViewBindings } from './Room/PdkRoomViewBindings';
import { createSeatEntries, PdkPlayerCount, PdkSeatPresenter } from './Room/PdkSeatPresenter';
import { PdkGameAudioPresenter, pdkVoiceGender } from './Room/PdkGameAudioPresenter';
import { PdkRoomAudioPresenter } from './Room/PdkRoomAudioPresenter';
import type { GameCapabilities } from '../../../../../Common/Code/Catalog/FamilyRuntimeRegistry';
import type { CommonRoomMountedView } from '../../../../../Common/Code/Runtime/GameRuntimeEntry';
import { resolvePdkHintPolicy } from '../Regional/PdkHintPolicyRegistry';
import { PdkGameLogic } from './logic/PdkGameLogic';
import { effectivePdkMaximumSingleRanks, generatePdkFixedPlanCandidates, isStrictlyHigherPdkSingle, largestLegalPdkSubsets, pdkCardRank, pdkOperationTypeForCards, pdkSelectionMask, rankCleanPdkHints, rankPdkDragCandidates, resolvePdkHintRulePlan, type PdkHintCandidate, type PdkHintRulePlan } from './logic/PdkCleanHintRanker';
import type { PdkRuntime } from './PdkRuntime';
import { canLeaveRoom } from '../../../../../Common/Code/Room/RoomController';
import { CommonRoomNodePath, PdkRoomNodePath } from './Room/PdkRoomNodePaths';
import { formatPdkRuleSummary } from '../Rules/PdkRuleSummaryFormatter';
import { Poker_Card_Presenter } from '../../../../Common/Code/Card/Poker_Card_Presenter';
import { PokerDealNodeAnim } from '../../../../Common/Code/Card/PokerDealNodeAnim';
import {
    layoutPdkRetainedHand,
    layoutPdkRetainedHands,
    setPdkRetainedPlayIndex,
    type PdkRetainedPlayedCardFlow,
} from './Room/PdkRetainedPlayedCardFlow';
import { PdkCurrentPlayArrowPresenter } from './Room/PdkCurrentPlayArrowPresenter';
import { normalizePdkRoundActivitySnapshot, projectPdkOperationClock } from './PdkAuthoritativeViewAdapter';
import {
    PdkRoundPresentationLifecycle,
    type PdkRoundPresentationAcceptance,
    type PdkRoundPresentationLease,
} from './Room/PdkRoundPresentationLifecycle';

import { PdkHandInputController, type HandPointerSample, type HandPointerSource } from './PdkHandInputController';
import { PdkHintController } from './PdkHintController';
import { PdkTablePresentationController } from './PdkTablePresentationController';
import { PdkTurnClockController } from './PdkTurnClockController';

// Every successful play owns its temporary Out_Card slot for at least two
// seconds, including an unbeatable lead that immediately receives the turn
// again. Table_Cards is an independent round archive and never shortens this.
// Changes to the hint candidate pipeline must produce a new immutable preview
// chunk so an already-open client cannot reuse an older cached module.

/** 将既有协议事件投影到公共房间层与跑得快专属牌桌层；此处不得判断地区玩法。 */
export class PdkPlayController {
    private view: PdkRoomViewBindings | null = null;
    private seats: PdkSeatPresenter | null = null;
    private operations: PdkOperationPresenter | null = null;
    private animations: PdkAnimationPresenter | null = null;
    private bubble: PdkRoomBubblePresenter | null = null;
    private gameAudio: PdkGameAudioPresenter | null = null;
    private roomAudio: PdkRoomAudioPresenter | null = null;
    private currentPlayArrow: PdkCurrentPlayArrowPresenter | null = null;
    private currentPlayArrowIndex = 0;
    private currentPlayArrowOperationId = '';
    private readonly cards = new PdkCardPresenter();
    private readonly lifecycle: PdkRoomLifecycleController;
    private readonly logic: PdkGameLogic;
    private readonly handInput: PdkHandInputController;
    private readonly hintController: PdkHintController;
    private readonly tablePresentation: PdkTablePresentationController;
    private readonly turnClock: PdkTurnClockController;
    private readonly bound = new Set<Node>();
    private readonly cardNodes: Node[] = [];
    private readonly cardValues: number[] = [];
    private readonly remainingCards = new Map<number, number>();
    private clockTimer = 0;
    private lastTurnPointerTraceKey = '';
    private activeOpPos = -1;
    private tipIndex = 0;
    private promptCycleKey = '';
    private dragStartIndex = -1;
    private dragLastIndex = -1;
    private dragActive = false;
    private dragMoved = false;
    private readonly dragIndices = new Set<number>();
    private gestureSurface: Node | null = null;
    private handTransform: UITransform | null = null;
    private handCardsTransform: UITransform | null = null;
    private handVisibleWidth = 0;
    private gestureCanvas: HTMLCanvasElement | null = null;
    private capturedPointerId: number | null = null;
    private lastPointerSample: HandPointerSample | null = null;
    private suppressClickUntil = 0;
    private autoPassInFlight = false;
    private autoHintTurnKey = '';
    private hintCacheKey = '';
    private hintCache: number[][] = [];
    private activeHintPlan: PdkHintRulePlan | null = null;
    private playInFlight = false;
    /**
     * Keep the current controls visually stable while play_req is resolving.
     * Authority may publish responder-scan snapshots before it knows whether any
     * opponent can actually beat the play; those transient seats must not make
     * the controls disappear and then flash back for an unbeatable play.
     */
    private keepOperationsVisibleDuringPlay = false;
    /** Manual Hint clicked while play_req still owns the old authority hand. */
    private hintRequestedDuringPlay = false;
    /**
     * Monotonic ownership token for manual Hint intent. Authority rendering is
     * asynchronous, so an automatic hint must not overwrite a newer manual
     * selection made while that hand projection was still being prepared.
     */
    private selectionIntentRevision = 0;
    private handCompaction: Promise<void> = Promise.resolve();
    private ownCardFlight: Promise<void> = Promise.resolve();
    private ownCardFlightActive = false;
    private ownLandingCards: Node[] = [];
    /** The newest committed physical hand has fully landed in its Out_Card slot. */
    private latestPublicCardLanding: Promise<void> = Promise.resolve();
    /**
     * One terminal-round clock owns both the 1.5-second hold and release of the
     * next deal. Authority may announce that deal before the physical card has
     * completed its client-side flight; those events are buffered here so they
     * cannot shorten the visible hold.
     */
    private terminalCardHoldBarrier: Promise<void> | null = null;
    private readonly deferredNextRoundEvents: Array<{ event: string; body: unknown }> = [];
    private readonly publicCardShownAt = new Map<number, number>();
    private readonly publicSeatOperationIds = new Map<number, string>();
    private readonly publicCardClearTimers = new Map<number, number>();
    private completedRoundVisualsCleared = false;
    private playRequestScope: { roomId: number; stateVersion: number; trickId: number; operationId: string } | null = null;
    private selectionAuthorityKey = '';
    private readonly roundPresentation = new PdkRoundPresentationLifecycle();
    private publicProjectionGeneration = 0;
    private commonRoomMountedView: CommonRoomMountedView | null = null;
    private waitingActionsVisibility: { ready: boolean; start: boolean } | null = null;
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
    private pendingRoundActivityResetKey = '';
    private lastDealAnimationKey = '';
    private renderedTrickId = -1;
    private competeDealerPhase = false;
    private readonly warnedOperationIds = new Set<string>();
    private readonly animatedOperationIds = new Set<string>();
    private lastCountdownSound = '';

    public constructor(
        private readonly runtime: PdkRuntime,
        private readonly requestLeave: (reason: string) => void,
        private readonly showMessage: (message: string) => void,
        private readonly capabilities?: GameCapabilities,
        /** Only alliance rooms expose the top club-credit balance. */
        private readonly isUnionRoom = false,
        private readonly roomRuleSnapshot?: unknown,
        private readonly roomRuleFields?: unknown,
        private readonly syncAutoPlay: (active: boolean) => void = () => undefined,
        private readonly openCardSelection: (targetSeat: number) => void = () => undefined,
        private readonly openDealQuality: (targetSeat: number) => void = () => undefined,
        private readonly retainedPlayedCardFlow?: PdkRetainedPlayedCardFlow,
    ) {
        this.lifecycle = new PdkRoomLifecycleController(runtime);
        this.logic = new PdkGameLogic({ room: runtime.getRoom(), roomSet: runtime.getRoomSet() });
        this.handInput = new PdkHandInputController(this);
        this.hintController = new PdkHintController(this);
        this.tablePresentation = new PdkTablePresentationController(this);
        this.turnClock = new PdkTurnClockController(this);
    }

    /**
     * A menu action opens a room form from the shared shell. Ask Common to
     * close its menu through the semantic capability before mounting that form
     * so stale menu hit rectangles cannot receive the next pointer event.
     */
    public closeCommonRoomMoreMenu(): void {
        this.commonRoomMountedView?.closeMoreMenu();
    }

    public bindCommonRoomMountedView(view: CommonRoomMountedView): () => void {
        this.commonRoomMountedView = view;
        // The Common shell and its controls remain Common-owned. The mounted
        // view exposes only semantic layout/capability requests, never Nodes.
        view.setRootLayout(1280, 720, 0, 0, 1);
        // Keep the authored menu below the shared More button in the PDK design
        // space. Common applies the Widget/position change on its own nodes.
        view.setMoreMenuLayout({ x: 600, y: 410, z: 0 });
        // The PDK table is a sibling of the shared shell. Its root transform
        // must not become the fallback hit target for empty pixels; otherwise
        // clicks aimed at CommonRoom controls stop at PDK_CommonRoom before
        // reaching the shared Button nodes. Child card/hand transforms remain
        // enabled and continue to own gameplay input.
        const gameplayRootTransform = this.view?.root.getComponent(UITransform);
        const gameplayRootTransformEnabled = gameplayRootTransform?.enabled;
        if (gameplayRootTransform) gameplayRootTransform.enabled = false;
        // Card-play controls belong to PDK_CommonRoom. CommonRoom has no
        // generic turn-action group; the shared shell owns only room chrome.
        const waiting = this.waitingActionsVisibility;
        view.setWaitingActions(waiting?.ready ?? false, waiting?.start ?? false);
        this.refresh();
        return () => {
            if (gameplayRootTransform && gameplayRootTransform.isValid
                && gameplayRootTransformEnabled !== undefined) {
                gameplayRootTransform.enabled = gameplayRootTransformEnabled;
            }
            if (this.commonRoomMountedView === view) this.commonRoomMountedView = null;
        };
    }

    /**
     * Compatibility surface for the split table-presentation controller.
     * CommonRoom owns all Head creation and public identity rendering; this
     * method intentionally performs no PDK-side Head work.
     */
    public async renderHeads(): Promise<void> {}

    public onCreate(form: LegacyForm): void {
        const diagnostics = globalThis as typeof globalThis & {
            __PDK_E2E_LOGS__?: unknown[];
            __PDK_PLAY_CONTROLLER__?: PdkPlayController;
        };
        if (this.view?.root === form.node) return;
        if (Array.isArray(diagnostics.__PDK_E2E_LOGS__)) diagnostics.__PDK_PLAY_CONTROLLER__ = this;
        this.view = new PdkRoomViewBindings(form.node);
        this.seats = new PdkSeatPresenter(form.node);
        this.gameAudio = new PdkGameAudioPresenter(form.node);
        this.roomAudio = new PdkRoomAudioPresenter(form.node);
        this.currentPlayArrow = new PdkCurrentPlayArrowPresenter(form.node);
        this.operations = new PdkOperationPresenter(this.view);
        this.animations = new PdkAnimationPresenter((path) => this.view?.find(path) ?? null);
        this.bubble = new PdkRoomBubblePresenter(form.node);
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
            this.view.bindIfPresent(`Players/Seat_${physicalSlot}/Head/Btn_CardSelection`, () => {
                const target = createSeatEntries(this.authoritativePlayerCount(), this.clientSeat())
                    .find((entry) => entry.physicalSlot === physicalSlot);
                if (target) this.openCardSelection(target.dataSeat);
            }, this.bound);
            this.view.bindIfPresent(`Players/Seat_${physicalSlot}/Head/Btn_DealQuality`, () => {
                const target = createSeatEntries(this.authoritativePlayerCount(), this.clientSeat())
                    .find((entry) => entry.physicalSlot === physicalSlot);
                if (target) this.openDealQuality(target.dataSeat);
            }, this.bound);
        }
        this.bindGestureSurface(this.view.find('Players/Seat_0/Card/Hand_TouchArea'));
        view.on('canvas-resize', this.syncHandTouchArea, this);
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
            const path = `Players/Seat_${slot}/Card/Table_Cards`;
            const table = this.view.find(path);
            if (!table) continue;
            this.cards.clear(table);
            table.active = enabled;
        }
    }

    public onShow(): void {
        // Forms may be mounted after onCreate. Resolve the hand again once the room
        // is in the live scene so its hit area follows the current visible Canvas.
        if (this.view) this.bindGestureSurface(this.view.find('Players/Seat_0/Card/Hand_TouchArea'));
        this.refresh();
        void this.roomAudio?.playMusic();
        this.renderCompeteDealerControls();
        this.logic.InitHandCard();
        const rawSnapshot = this.runtime.getRoomSet().GetRoomSetInfo() ?? {};
        const roundAcceptance = this.acceptPresentationRound(rawSnapshot, 'ON_SHOW');
        if (!roundAcceptance.accepted) return;
        const snapshot = normalizePdkRoundActivitySnapshot(
            rawSnapshot, this.shouldResetRoundActivity(rawSnapshot, roundAcceptance),
        );
        this.competeDealerPhase = String(snapshot.authorityPhase ?? '').toUpperCase() === 'COMPETE_DEALER';
        const formalCardPlayPhase = this.isFormalCardPlayPhase(snapshot);
        const roomPlaying = Number(this.runtime.getRoom().GetRoomProperty('state') ?? 0) === 1;
        const completedRound = snapshot.setEnd ?? this.runtime.getRoomSet().GetRoomSetProperty('setEnd');
        const localPlayer = this.runtime.getRoomPosManager().GetRoomAllPlayerInfo()?.[this.clientSeat()];
        const waitingForContinue = !roomPlaying && Boolean(completedRound) && !Boolean(localPlayer?.isContinue);
        this.completedRoundVisualsCleared = !roomPlaying && Boolean(localPlayer?.isContinue);
        this.activeOpPos = Number(snapshot.opPos ?? -1);
        if (this.completedRoundVisualsCleared) {
            this.endRoundPresentation('ON_SHOW_COMPLETED_ROUND');
            this.clearHandVisuals('ON_SHOW_COMPLETED_ROUND');
            this.refresh();
            return;
        }
        const showSelectionRevision = this.selectionIntentRevision;
        const showProjectionStartedAt = globalThis.performance?.now?.() ?? Date.now();
        this.trackPresentation(this.renderHand()
            .then(() => this.autoHintForAuthoritativeTurn(
                snapshot,
                showSelectionRevision,
                showProjectionStartedAt,
            ))
            .catch((error: unknown) => this.report(error, '手牌加载失败')));
        if (formalCardPlayPhase || waitingForContinue) {
            this.trackPresentation(this.reconcileAuthorityPublicCards(snapshot));
            // Retained-table presentation is an explicit variant capability. Card
            // cleanup and dealing remain owned by this common lifecycle controller.
            if (this.runtime.arrangementEnabled()) {
                const snapshotPresentationLease = this.roundPresentation.lease();
                this.trackPresentation(this.restoreTableCards(snapshot, snapshotPresentationLease));
            }
        }
        this.startClockFromSetInfo(snapshot);
        this.refresh();
    }

    public onEvent(event: string, body: unknown): void {
        const packet = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
        if (this.deferNextRoundEventUntilTerminalHold(event, body)) return;
        if (event === 'CommonPdk_AuthoritativeState') {
            // V2 Authority 每次提交后推送完整视图，不再额外伪造旧版 CommonPdkSetStart。
            // RoomRuntime 在发出本事件前已经把权威视图写入 RoomSet，因此这里必须以
            // RoomSet 为唯一牌面来源重新投影；否则服务端虽已发牌，公共 Poker_Card
            // 工厂永远不会被调用，画面会错误停留在空牌桌。
            // A committed authority version is the atomic boundary for turn-owned
            // interaction state. Selection from an older hint/play must never
            // survive into the next turn or the next trick.
            const rawSetInfo = this.runtime.getRoomSet().GetRoomSetInfo() ?? {};
            const roundAcceptance = this.acceptPresentationRound(rawSetInfo, 'AUTHORITY_STATE');
            if (!roundAcceptance.accepted) return;
            const roundPresentationChanged = roundAcceptance.changed;
            const resetRoundActivity = this.shouldResetRoundActivity(rawSetInfo, roundAcceptance);
            const setInfo = normalizePdkRoundActivitySnapshot(rawSetInfo, resetRoundActivity);
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
                this.endRoundPresentation('AUTHORITY_COMPLETED_ROUND');
                this.clearHandVisuals('AUTHORITY_COMPLETED_ROUND');
                this.activeOpPos = -1;
                this.refresh();
                this.renderCompeteDealerControls();
                return;
            }
            this.activeOpPos = Number(setInfo.opPos ?? -1);
            // A local play starts its hand-compaction tween before the authority
            // response arrives. Do not destroy and rebuild those nodes mid-tween.
            // A normal authority refresh is never a deal boundary. Deal movement
            // is driven only by the explicit round/phase transition events below.
            const authoritySelectionRevision = this.selectionIntentRevision;
            const authorityProjectionStartedAt = globalThis.performance?.now?.() ?? Date.now();
            const handRender = this.handCompaction.then(() => this.renderHand(false, authorityHand))
                .catch((error: unknown) => {
                    this.reportPresentationError(error, 'HAND_RENDER', setInfo);
                    throw error;
                });
            const projectRoundCards = formalCardPlayPhase || waitingForContinue;
            const snapshotPresentationLease = this.roundPresentation.lease();
            // Only Liangshan consumes the ordered historical ledger. Suppress
            // that ledger at a new-deal boundary so completed-round operations
            // cannot be restored into the next archive. Ordinary PDK projects
            // only comparisonState, which is the authoritative current play and
            // must remain visible even when this observer first accepts the deal.
            // Skipping every variant here left the actor's local flight visible
            // while remote clients silently discarded the same committed play.
            const skipStaleRetainedLedger = roundPresentationChanged
                && this.runtime.arrangementEnabled();
            const publicPresentation = !projectRoundCards || skipStaleRetainedLedger
                ? Promise.resolve()
                : this.runtime.arrangementEnabled()
                    // This handler only receives live authoritative commits. Even
                    // the first play after a round/phase reset must travel through
                    // Hand_Cards -> Out_Card -> Table_Cards. Snapshot restoration
                    // belongs exclusively to onShow/reconnect; using it here made
                    // the first committed hand flash directly into Table_Cards.
                    ? this.presentLatestAuthorityAction(setInfo, snapshotPresentationLease)
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
            // Turn interaction belongs to the committed hand snapshot. Public-card
            // flight, sound and decorative table reconciliation must never gate
            // Hint or final-hand autoplay; a stalled decorative Promise previously
            // left a legal local turn with no buttons and no submitted play.
            const hintReady = handRender;
            this.trackPresentation(settledPublicPresentation);
            const turnPresentation = hintReady
                .then(() => this.consumeQueuedHintAfterPlay()
                    ? undefined : this.autoHintForAuthoritativeTurn(
                        setInfo, authoritySelectionRevision, authorityProjectionStartedAt,
                    ))
                .catch((error: unknown) => this.report(error, '牌面与自动提示加载失败'));
            this.trackPresentation(turnPresentation);
            this.startClockFromSetInfo(setInfo);
        } else if (event === 'CommonPdkSetStart') {
            this.completedRoundVisualsCleared = false;
            void this.roomAudio?.play('xipai');
            void this.roomAudio?.play('zhuang', 350);
            void this.roomAudio?.play('fapai', 700);
            this.logic.InitHandCard();
            this.initializeRemainingCards();
            const setInfo = this.record(packet.setInfo) ?? packet;
            if (!this.acceptPresentationRound(setInfo, 'SET_START').accepted) return;
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
                const setInfo = this.runtime.getRoomSet().GetRoomSetInfo() ?? {};
                if (!this.acceptPresentationRound(setInfo, 'PHASE_COMPETE_DEALER').accepted) return;
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
                // The authoritative snapshot starts the first turn clock before
                // this phase-boundary event. The round lifecycle deliberately
                // clears the preceding round, including that clock, so restore
                // the same authoritative deadline after the reset.
                this.startClockFromSetInfo(setInfo);
            }
            if (to === 'PLAYING') {
                // The previous round owns a delayed visual cleanup so its last
                // play remains visible for two seconds. Authority can start the
                // next round before that timer expires. Cancel and invalidate the
                // old round before projecting the newly dealt hand; otherwise the
                // stale callback clears valid second-round cards until refresh.
                this.completedRoundVisualsCleared = false;
                void this.roomAudio?.play('zhuang');
                void this.roomAudio?.play('fapai', 350);
                const setInfo = this.runtime.getRoomSet().GetRoomSetInfo() ?? {};
                if (!this.acceptPresentationRound(setInfo, 'PHASE_PLAYING').accepted) return;
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
                this.startClockFromSetInfo(setInfo);
            }
        } else if (event === 'CommonPdk_PosUpdate') {
            if (Number(this.record(packet.posInfo)?.pid ?? 0) > 0) void this.roomAudio?.play('zuoxia');
        } else if (event === 'CommonPdkSetEnd') {
            const points = packet.pointList;
            const seat = this.clientSeat();
            const point = Number(Array.isArray(points) ? points[seat] : this.record(points)?.[seat] ?? 0);
            void this.roomAudio?.play(point > 0 ? 'win' : 'lose');
        }
        const folderKey = String(packet.animationFolderKey ?? '').trim();
        if (folderKey) {
            void this.animations?.play(folderKey, 0, {
                roomId: this.roomId(),
                playerId: this.runtime.getPlayerId(),
                operationId: String(packet.operationId ?? ''),
                stateVersion: Number(this.runtime.getRoom().GetRoomProperty('stateVersion') ?? -1),
            }).catch((error: unknown) => this.report(error, '动画加载失败'));
        }
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
            return;
        }
        this.view.visible(PdkRoomNodePath.operationButtons, localTurn);
        this.view.visible(PdkRoomNodePath.passButton, false);
        this.view.visible(PdkRoomNodePath.hintButton, false);
        this.view.visible(PdkRoomNodePath.playButton, false);
        this.view.visible(PdkRoomNodePath.noGrabButton, localTurn);
        this.view.visible(PdkRoomNodePath.grabDealerButton, localTurn);
    }

    public destroy(): void {
        const diagnostics = globalThis as typeof globalThis & { __PDK_PLAY_CONTROLLER__?: PdkPlayController };
        if (diagnostics.__PDK_PLAY_CONTROLLER__ === this) delete diagnostics.__PDK_PLAY_CONTROLLER__;
        // A cached CommonRoom node tree can outlive this controller. End the
        // lease and detach its complete card surface before releasing services,
        // otherwise the next controller may inherit the previous deal's nodes.
        void this.endRoundPresentation('DESTROY');
        this.handRenderGeneration += 1;
        this.playInFlight = false;
        this.keepOperationsVisibleDuringPlay = false;
        this.hintRequestedDuringPlay = false;
        this.playRequestScope = null;
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
        this.seats?.clear();
        this.view = null;
        this.commonRoomMountedView = null;
        this.waitingActionsVisibility = null;
        this.seats = null;
        this.operations = null;
        this.animations = null;
        this.bubble = null;
        this.cardNodes.length = 0;
        this.cardValues.length = 0;
        if (this.flyingOverlay?.isValid) this.flyingOverlay.destroy();
        this.flyingOverlay = null;
        this.cancelPendingPresentations();
        this.remainingCards.clear();
        this.warnedOperationIds.clear();
        this.animatedOperationIds.clear();
        this.cancelPublicCardClearTimers();
        this.publicCardShownAt.clear();
        this.clearDragSelection();
        this.autoPassInFlight = false;
        this.autoHintTurnKey = '';
        // Cocos may clear the global view singleton during scene teardown;
        // destroying a room must not dereference it after that point.
        view?.off('canvas-resize', this.syncHandTouchArea, this);
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
        // V2 Authority 的 WAITING 投影到旧模型后是 3（Waiting），重连过渡态是 4。
        const waiting = state === 0 || state === 3 || state === 4;
        this.commonRoomMountedView?.setLabel(CommonRoomNodePath.roomIdLabel,
            `房间号：${room.GetRoomProperty('key') ?? ''}`);
        this.commonRoomMountedView?.setLabel(CommonRoomNodePath.roundLabel,
            `局数：${Number(room.GetRoomProperty('setID') ?? 0)}/${Number(config.setCount ?? 0)}`);
        const local = players[positions.GetClientPos()];
        this.syncAutoPlay(Boolean(local?.trusteeship));
        this.commonRoomMountedView?.setVisible(CommonRoomNodePath.clubCent, this.isUnionRoom);
        if (this.isUnionRoom) {
            this.commonRoomMountedView?.setLabel(CommonRoomNodePath.clubCent, `积分：${local?.clubCent ?? 0}`);
        }
        const localSeated = Number(local?.pid) > 0;
        const cardSelectionAvailable = localSeated
            && Number(room.GetRoomProperty('ownerID') ?? 0) === Number(local?.pid ?? 0);
        const activeSlots = new Set(entries.map((entry) => entry.physicalSlot));
        for (let physicalSlot = 0; physicalSlot < 4; physicalSlot += 1) {
            const entry = entries.find((candidate) => candidate.physicalSlot === physicalSlot);
            const occupied = entry !== undefined && Number(players[entry.dataSeat]?.pid ?? 0) > 0;
            this.view.visible(`Players/Seat_${physicalSlot}/Head/Btn_CardSelection`,
                cardSelectionAvailable && activeSlots.has(physicalSlot) && occupied);
            this.view.visible(`Players/Seat_${physicalSlot}/Head/Btn_DealQuality`,
                cardSelectionAvailable && activeSlots.has(physicalSlot) && occupied);
        }
        // Public owns the WaitingActions nodes; gameplay supplies authoritative availability only.
        const readyVisible = waiting && localSeated && !Boolean(local?.roomReady);
        const manualStart = waiting && localSeated
            && Number(room.GetRoomProperty('ownerID') ?? 0) === Number(local?.pid ?? 0)
            && this.runtime.supportsManualStart();
        this.waitingActionsVisibility = { ready: readyVisible, start: manualStart };
        this.commonRoomMountedView?.setWaitingActions(readyVisible, manualStart);
        const setInfo = this.runtime.getRoomSet().GetRoomSetInfo() ?? {};
        const authorityDeadline = this.record(setInfo.operationDeadline);
        const authorityClock = projectPdkOperationClock(authorityDeadline ?? {}, setInfo.serverEpochMillis);
        const actionableTurn = authorityClock.mode === 'unlimited' || authorityClock.mode === 'timed';
        const authorityTurnSeat = Number(setInfo.opPos ?? authorityDeadline?.seatId ?? -1);
        const authorityLocalTurn = state === 1 && actionableTurn
            && authorityClock.seatId === positions.GetClientPos()
            && authorityTurnSeat === positions.GetClientPos();
        const localTurn = authorityLocalTurn
            || (state === 1 && actionableTurn && this.keepOperationsVisibleDuringPlay);
        if (state !== 1) this.hideClocks();
        const ruleOptions = this.record(config.ruleOptions) ?? {};
        const canPass = localTurn && !Boolean(setInfo.isFirstOp)
            && setInfo.mustBeatWhenPossible === false
            && ruleOptions.allowPassByRoomRule === true;
        this.operations.render({
            isLocalTurn: localTurn,
            canPass,
            canTip: localTurn,
            canPlay: localTurn,
            isCompeteDealer: this.competeDealerPhase,
        });
        for (const entry of entries) {
            const player = players[entry.dataSeat];
            const count = this.remainingCards.get(entry.dataSeat)
                ?? Number(player?.cardCount ?? player?.cardNum ?? player?.handCardCount ?? 0);
            this.setRemainingCardCount(entry.physicalSlot, count);
        }
    }

    private setRemainingCardCount(physicalSlot: number, count: number): void {
        const path = `Players/Seat_${physicalSlot}/Head/RemainingCount`;
        const node = this.view?.find(path);
        if (!node) return;
        const label = node.getComponent(Label)
            ?? node.getChildByName('Count')?.getComponent(Label)
            ?? node.getChildByName('Label')?.getComponent(Label);
        if (label) label.string = count > 0 ? `${count}张` : '';
        node.active = count > 0;
    }

    private async renderHand(animateDeal = false, authorityHand?: readonly number[]): Promise<void> {
        const parent = this.view?.find('Players/Seat_0/Card/Hand_Cards');
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
            this.bindGestureSurface(this.view?.find('Players/Seat_0/Card/Hand_TouchArea') ?? null);
            return;
        }
        // Build the complete replacement outside Hand_Cards. Asset loading may
        // yield between any two cards; publishing each node immediately lets an
        // older render leave partial children behind after a newer authority
        // packet invalidates its generation.
        const staging = new Node('PDK_Hand_Render_Staging');
        const createdNodes: Node[] = [];
        const createdValues: number[] = [];
        try {
            for (let index = 0; index < hand.length; index += 1) {
                const card = await this.cards.create(staging, Number(hand[index]), false);
                createdNodes.push(card);
                createdValues.push(Number(hand[index]));
                if (generation !== this.handRenderGeneration || !parent.isValid) {
                    this.discardUncommittedHandNodes(staging, createdNodes);
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
            }
        } catch (error: unknown) {
            this.discardUncommittedHandNodes(staging, createdNodes);
            throw error;
        }
        if (generation !== this.handRenderGeneration || !parent.isValid) {
            this.discardUncommittedHandNodes(staging, createdNodes);
            return;
        }
        // Commit one complete generation. The formal hand container never sees
        // an incomplete replacement and therefore never reserves a Layout slot
        // for an abandoned asynchronous render.
        this.cards.stopAll(true);
        this.cards.clear(parent);
        this.cardNodes.length = 0;
        this.cardValues.length = 0;
        this.clearDragSelection();
        this.resetPromptCycle();
        for (const card of createdNodes) parent.addChild(card);
        this.cardNodes.splice(0, this.cardNodes.length, ...createdNodes);
        this.cardValues.splice(0, this.cardValues.length, ...createdValues);
        if (staging.isValid) staging.destroy();
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
        this.bindGestureSurface(this.view?.find('Players/Seat_0/Card/Hand_TouchArea') ?? null);
    }

    private discardUncommittedHandNodes(staging: Node, createdNodes: readonly Node[]): void {
        for (const card of createdNodes) {
            if (!card.isValid) continue;
            card.removeFromParent();
            card.destroy();
        }
        if (staging.isValid) staging.destroy();
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

    /** Settlement/round transitions own timing; visual effects must converge, never delay them. */
    public async truncateRoundEndPresentation(): Promise<void> {
        this.completedRoundVisualsCleared = true;
        // Invalidate the round before starting any asynchronous drain. Every
        // visible node is detached synchronously below; awaiting the regional
        // flow may overlap the next deal but can no longer mutate its surface.
        const drain = this.endRoundPresentation('SET_END');
        await drain;
    }

    /**
     * Retain the terminal hand for 1.5 seconds after its physical Out_Card landing.
     * This method deliberately does not clear the table: popup settlement clears
     * after this boundary, while FLOATING settlement lets the accepted next deal
     * replace the old round atomically so an imprecise server lifecycle tick can
     * never expose an empty table between cleanup and dealing.
     */
    public async waitForTerminalCardHold(holdMs = 1500): Promise<boolean> {
        if (this.terminalCardHoldBarrier) {
            await this.terminalCardHoldBarrier;
            return true;
        }
        const lease = this.roundPresentation.lease();
        const landing = this.latestPublicCardLanding;
        let heldCurrentRound = false;
        const barrier = (async () => {
            await landing.catch((error: unknown) => {
                this.reportPresentationError(error, 'TERMINAL_CARD_LANDING', {
                    ...this.roundPresentation.currentIdentity(),
                });
            });
            if (!this.roundPresentation.isCurrent(lease)) return;
            const landedAt = Date.now();
            await new Promise<void>((resolve) => globalThis.setTimeout(resolve, Math.max(0, holdMs)));
            if (!this.roundPresentation.isCurrent(lease)) return;
            heldCurrentRound = true;
            console.info('[CommonRoomRoundPresentation]', {
                stage: 'TERMINAL_HOLD_COMPLETE', roomId: this.roomId(),
                roundNo: this.roundPresentation.currentIdentity()?.roundNo ?? 0,
                stateVersion: Number(this.runtime.getRoom().GetRoomProperty('stateVersion') ?? -1),
                operationId: String(this.record(
                    this.runtime.getRoomSet().GetRoomSetInfo()?.operationDeadline,
                )?.operationId ?? ''),
                landedAt, holdMs: Math.max(0, holdMs),
            });
        })();
        this.terminalCardHoldBarrier = barrier;
        await barrier;
        if (this.terminalCardHoldBarrier === barrier) {
            this.terminalCardHoldBarrier = null;
            const deferred = this.deferredNextRoundEvents.splice(0);
            console.info('[CommonRoomRoundPresentation]', {
                stage: 'NEXT_DEAL_RELEASED', roomId: this.roomId(),
                deferredEventCount: deferred.length,
                holdMs: Math.max(0, holdMs),
            });
            for (const pending of deferred) this.onEvent(pending.event, pending.body);
        }
        return heldCurrentRound;
    }

    private deferNextRoundEventUntilTerminalHold(event: string, body: unknown): boolean {
        if (!this.terminalCardHoldBarrier || ![
            'CommonPdk_AuthoritativeState',
            'CommonPdkSetStart',
            'CommonPdk_AuthoritativePhaseChanged',
        ].includes(event)) return false;
        const setInfo = this.runtime.getRoomSet().GetRoomSetInfo() ?? {};
        const current = this.roundPresentation.currentIdentity();
        if (!current) return false;
        const nextRoundNo = Number(setInfo.roundNo ?? setInfo.setID
            ?? this.runtime.getRoom().GetRoomProperty('setID') ?? 0);
        const nextShuffleSequence = Number(setInfo.shuffleSequence ?? setInfo.dealSequence ?? -1);
        const nextDealIdentity = String(setInfo.dealId ?? setInfo.dealIdentity ?? '');
        const changed = nextRoundNo !== current.roundNo
            || (nextShuffleSequence >= 0 && nextShuffleSequence !== current.shuffleSequence)
            || Boolean(nextDealIdentity && nextDealIdentity !== current.dealIdentity);
        if (!changed) return false;
        this.deferredNextRoundEvents.push({ event, body });
        console.info('[CommonRoomRoundPresentation]', {
            stage: 'NEXT_DEAL_DEFERRED', roomId: this.roomId(), event,
            currentRoundNo: current.roundNo, nextRoundNo,
            currentShuffleSequence: current.shuffleSequence, nextShuffleSequence,
            deferredEventCount: this.deferredNextRoundEvents.length,
        });
        return true;
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
    private toggleCardAt(index: number, capturedPointer = false): Promise<void> { return this.handInput.toggleCardAt(index, capturedPointer); }

    private responseCoreSelectionForCard(clicked: number): number[] { return this.handInput.responseCoreSelectionForCard(clicked); }

    private updateSelection(): void { return this.handInput.updateSelection(); }

    private onRoomTouchEnd(event: EventTouch): void { return this.handInput.onRoomTouchEnd(event); }

    private onRoomMouseUp(event: EventMouse): void { return this.handInput.onRoomMouseUp(event); }

    private clearSelectionOutsideCards(target: Node | null, screenX: number, screenY: number, windowId: number, uiX: number, uiY: number): void { return this.handInput.clearSelectionOutsideCards(target, screenX, screenY, windowId, uiX, uiY); }

    private hasInteractiveButtonAncestor(start: Node | null): boolean { return this.handInput.hasInteractiveButtonAncestor(start); }

    private onHandTouchStart(event: EventTouch): void { return this.handInput.onHandTouchStart(event); }

    private bindGestureSurface(surface: Node | null): void { return this.handInput.bindGestureSurface(surface); }

    private installHandHitTest(hand: Node): void { return this.handInput.installHandHitTest(hand); }

    private restoreHandHitTest(): void { return this.handInput.restoreHandHitTest(); }

    private syncHandTouchArea(): void { return this.handInput.syncHandTouchArea(); }

    private isHandInteractionEnabled(): boolean { return this.handInput.isHandInteractionEnabled(); }

    private bindDomPointerBridge(): void { return this.handInput.bindDomPointerBridge(); }

    private unbindDomPointerBridge(): void { return this.handInput.unbindDomPointerBridge(); }

    private readonly onDomPointerDown = (event: PointerEvent): void => this.handInput.onDomPointerDown(event);

    private readonly onDomPointerMove = (event: PointerEvent): void => this.handInput.onDomPointerMove(event);

    private readonly onDomPointerUp = (event: PointerEvent): void => this.handInput.onDomPointerUp(event);

    private readonly onDomPointerCancel = (event: PointerEvent): void => this.handInput.onDomPointerCancel(event);

    private sampleFromPointer(event: PointerEvent): HandPointerSample { return this.handInput.sampleFromPointer(event); }

    private sampleFromTouch(event: EventTouch): HandPointerSample { return this.handInput.sampleFromTouch(event); }

    private sampleFromMouse(event: EventMouse): HandPointerSample { return this.handInput.sampleFromMouse(event); }

    private buildPointerSample(base: Omit<HandPointerSample, 'handLocal' | 'cardLocal' | 'index'>): HandPointerSample { return this.handInput.buildPointerSample(base); }

    private pointerSource(value: string): HandPointerSource { return this.handInput.pointerSource(value); }

    private domTargetPath(target: EventTarget | null): string { return this.handInput.domTargetPath(target); }

    private nodeTargetPath(target: Node | null): string { return this.handInput.nodeTargetPath(target); }

    private traceDomPointer(stage: string, sample: HandPointerSample): void { return this.handInput.traceDomPointer(stage, sample); }

    private onHandTouchMove(event: EventTouch): void { return this.handInput.onHandTouchMove(event); }

    private onHandTouchCancel(event: EventTouch): void { return this.handInput.onHandTouchCancel(event); }

    private onHandTouchEnd(event: EventTouch): void { return this.handInput.onHandTouchEnd(event); }

    private onHandMouseDown(event: EventMouse): void { return this.handInput.onHandMouseDown(event); }

    private onHandMouseMove(event: EventMouse): void { return this.handInput.onHandMouseMove(event); }

    private onHandMouseUp(event: EventMouse): void { return this.handInput.onHandMouseUp(event); }

    private onHandMouseCancel(event: EventMouse): void { return this.handInput.onHandMouseCancel(event); }

    private cardIndexAtScreen(screenX: number, screenY: number, windowId: number): number { return this.handInput.cardIndexAtScreen(screenX, screenY, windowId); }

    private cardIndexAtUi(uiX: number, uiY: number): number { return this.handInput.cardIndexAtUi(uiX, uiY); }

    private isInsideHandGestureArea(sample: HandPointerSample): boolean { return this.handInput.isInsideHandGestureArea(sample); }

    private isInteractiveRoomControlAtUi(uiX: number, uiY: number): boolean { return this.handInput.isInteractiveRoomControlAtUi(uiX, uiY); }

    private beginDragSelection(sample: HandPointerSample): void { return this.handInput.beginDragSelection(sample); }

    private updateDragSelection(index: number): void { return this.handInput.updateDragSelection(index); }

    private previewDragSelection(): void { return this.handInput.previewDragSelection(); }

    private commitSmartDragSelection(sample: HandPointerSample): void { return this.handInput.commitSmartDragSelection(sample); }

    private largestLegalDragCandidates(touched: readonly number[]): number[][] { return this.handInput.largestLegalDragCandidates(touched); }

    private cancelDragSelection(): void { return this.handInput.cancelDragSelection(); }

    private clearCardSelection(): void { return this.handInput.clearCardSelection(); }

    private clearDragSelection(): void { return this.handInput.clearDragSelection(); }

    private coveredDragIndices(startIndex: number, endIndex: number): number[] { return this.handInput.coveredDragIndices(startIndex, endIndex); }

    private sortedDragIndices(): number[] { return this.handInput.sortedDragIndices(); }

    private orderedDragIndices(): number[] { return this.handInput.orderedDragIndices(); }

    private traceGesture(stage: string, index: number, finalCards: readonly number[] = [], sample: HandPointerSample | null = null): void { return this.handInput.traceGesture(stage, index, finalCards, sample); }

    private renderPublicOperation(packet: Record<string, unknown>, expectedProjectionGeneration?: number): Promise<void> { return this.tablePresentation.renderPublicOperation(packet, expectedProjectionGeneration); }

    private presentPublicOperation(packet: Record<string, unknown>): Promise<void> { return this.tablePresentation.presentPublicOperation(packet); }

    private rememberLatestPublicCardLanding(landing: Promise<void>): Promise<void> { return this.tablePresentation.rememberLatestPublicCardLanding(landing); }

    private resolveAuthorityPlayIndex(operationId: string, fallback: number): number { return this.tablePresentation.resolveAuthorityPlayIndex(operationId, fallback); }

    private presentLatestAuthorityAction(setInfo: Record<string, unknown>, expectedLease: PdkRoundPresentationLease): Promise<void> { return this.tablePresentation.presentLatestAuthorityAction(setInfo, expectedLease); }

    private presentNewAuthorityAction(latest: Record<string, unknown>, authorityPlayIndex: number): Promise<void> { return this.tablePresentation.presentNewAuthorityAction(latest, authorityPlayIndex); }

    private clearPublicCards(): void { return this.tablePresentation.clearPublicCards(); }


    private continueReadyRoundKey(setInfo: Record<string, unknown>): string { return this.tablePresentation.continueReadyRoundKey(setInfo); }

    private acceptPresentationRound(setInfo: Record<string, unknown>, source: string): PdkRoundPresentationAcceptance { return this.tablePresentation.acceptPresentationRound(setInfo, source); }

    private shouldResetRoundActivity(setInfo: Record<string, unknown>, acceptance: PdkRoundPresentationAcceptance): boolean { return this.tablePresentation.shouldResetRoundActivity(setInfo, acceptance); }

    private clearTableCards(): void { return this.tablePresentation.clearTableCards(); }

    private appendTableCards(packet: Record<string, unknown>, expectedLease: PdkRoundPresentationLease, ownsReconciliation: () => boolean): Promise<void> { return this.tablePresentation.appendTableCards(packet, expectedLease, ownsReconciliation); }

    private restoreTableCards(packet: Record<string, unknown>, expectedLease: PdkRoundPresentationLease, ownsReconciliation: () => boolean = () => true): Promise<void> { return this.tablePresentation.restoreTableCards(packet, expectedLease, ownsReconciliation); }

    private showCurrentPlayArrow(target: Node, packet: Record<string, unknown>, claimLatest: boolean): void { return this.tablePresentation.showCurrentPlayArrow(target, packet, claimLatest); }

    private clearActionSlot(parent: Node | null): Promise<void> { return this.tablePresentation.clearActionSlot(parent); }

    private setOutCardVisible(path: string, visible: boolean): void { return this.tablePresentation.setOutCardVisible(path, visible); }

    private clearOutCardPlayCount(parent: Node | null): void { return this.tablePresentation.clearOutCardPlayCount(parent); }

    private endRoundPresentation(reason: string): Promise<void> { return this.tablePresentation.endRoundPresentation(reason); }

    private clearRoundPresentationNodes(): Promise<void> { return this.tablePresentation.clearRoundPresentationNodes(); }

    private clearHandVisuals(reason: string): void { return this.tablePresentation.clearHandVisuals(reason); }

    public clearCompletedRound(): void { return this.tablePresentation.clearCompletedRound(); }

    private applyAuthoritativeTurnBoundary(setInfo: Record<string, unknown>): void { return this.tablePresentation.applyAuthoritativeTurnBoundary(setInfo); }

    private reconcileAuthorityPublicCards(packet: Record<string, unknown>): Promise<void> { return this.tablePresentation.reconcileAuthorityPublicCards(packet); }

    private restoreSeatPlayStates(raw: unknown[], projectionGeneration: number): Promise<void> { return this.tablePresentation.restoreSeatPlayStates(raw, projectionGeneration); }

    private updateActionCardLayout(parent: Node | null, context?: {
        dataSeat: number;
        physicalSlot: number;
        operationId: string;
        cardValues: readonly number[];
    }): void { return this.tablePresentation.updateActionCardLayout(parent, context); }

    private flyRemoteCards(physicalSlot: number, values: readonly number[]): Promise<void> { return this.tablePresentation.flyRemoteCards(physicalSlot, values); }


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

    public async requestCommonRoomReady(): Promise<void> { await this.ready(); }

    public async requestCommonRoomStart(): Promise<void> { await this.runtime.manualStart(); }

    public assertCommonRoomExitAllowed(): void {
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
            throw new Error('游戏中不能退出');
        }
    }
    private pass(): Promise<unknown> {
        const setInfo = this.runtime.getRoomSet().GetRoomSetInfo() ?? {};
        const deadline = this.record(setInfo.operationDeadline);
        return this.lifecycle.pass(
            this.roomId(),
            this.clientSeat(),
            Number(this.runtime.getRoom().GetRoomProperty('stateVersion') ?? -1),
            Number(setInfo.trickId ?? -1),
            String(deadline?.operationId ?? ''),
        );
    }
    private tip(): void { return this.hintController.tip(); }

    private prepareHintCache(): void { return this.hintController.prepareHintCache(); }

    private consumeQueuedHintAfterPlay(): boolean { return this.hintController.consumeQueuedHintAfterPlay(); }


    private async outCard(authoritativeOpType = 0): Promise<unknown> {
        if (this.playInFlight) {
            console.info('[CommonRoomPlayIgnored]', { reason: 'PLAY_REQUEST_IN_FLIGHT' });
            this.showMessage('上一手出牌请求处理中，请稍候');
            return;
        }
        const setInfo = this.runtime.getRoomSet().GetRoomSetInfo() ?? {};
        const roomId = this.roomId();
        const stateVersion = Number(this.runtime.getRoom().GetRoomProperty('stateVersion') ?? -1);
        const trickId = Number(setInfo.trickId ?? -1);
        const deadline = this.record(setInfo.operationDeadline);
        const operationId = String(deadline?.operationId ?? '');
        const turnSeat = Number(setInfo.opPos ?? deadline?.seatId ?? -1);
        if (turnSeat !== this.clientSeat() || stateVersion < 0 || !operationId) {
            console.info('[CommonRoomPlayIgnored]', {
                reason: 'AUTHORITY_TURN_NOT_READY', roomId, stateVersion, trickId,
                operationId, turnSeat, localSeat: this.clientSeat(),
            });
            this.runtime.reconcileAuthority();
            this.showMessage('出牌状态未同步，请稍后重试');
            return;
        }
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
        if (!this.obeysReportedSingleRule(values)) {
            console.info('[CommonRoomPlayBlocked]', {
                reason: 'REPORTED_SINGLE_REQUIRES_HIGHEST', roomId, stateVersion, trickId, operationId,
                playerId: this.runtime.getPlayerId(), seatId: this.clientSeat(), selectedCards: [...values],
                requiredRank: this.requiredReportedSingleRank(),
            });
            this.showMessage('下家报单只能出最大单张');
            return;
        }
        // Required opening-card UX is derived from the same authoritative room
        // snapshot used by Hint and Play. Reject before any presentation node is
        // detached or any request lock is acquired, so repeated clicks always
        // report the exact card and cannot fall through to a generic animation
        // or transport error. Authority keeps the identical validation as the
        // security boundary for stale or non-conforming clients.
        const missingRequiredCard = this.missingRequiredFirstCard(values);
        if (missingRequiredCard > 0) {
            console.info('[CommonRoomPlayBlocked]', {
                reason: 'MISSING_REQUIRED_FIRST_CARD', roomId, stateVersion, trickId, operationId,
                playerId: this.runtime.getPlayerId(), seatId: this.clientSeat(),
                requiredCard: missingRequiredCard, selectedCards: [...values],
            });
            this.showMessage(`必须带${this.cardDisplayName(missingRequiredCard)}牌`);
            return;
        }
        // Local recognition drives Hint and immediate wording only. It is never
        // an admission gate: Authority decides whether these exact physical
        // cards are a bomb, a split-bomb triple-with-pair, or an illegal play.
        const opType = authoritativeOpType > 0 ? authoritativeOpType : this.selectedIntrinsicType();
        // Visual feedback belongs to the click frame, not to the network reply.
        // The authority projection reuses operationId and therefore cannot replay it.
        this.playOperationAnimationOnce(operationId, opType, 0);
        // Liangshan holds a completed hand in Out_Card for 1.5 seconds.
        // A new valid Play click is the sole override: release the preceding hold
        // so those same nodes start moving into Table_Cards immediately. The new
        // hand flight starts in parallel; the move is never skipped and no
        // retained copy is reconstructed.
        this.playInFlight = true;
        this.keepOperationsVisibleDuringPlay = true;
        this.refresh();
        // Automatic last-hand play can start as soon as Authority returns the
        // lead, while the preceding common hand flight is still landing. Let
        // that physical flight reach Out_Card first so its retained-flow task
        // can claim the exact nodes; only then may this next play shorten the
        // preceding 1.5-second hold.
        const precedingOwnCardFlight = this.ownCardFlight;
        const precedingTablePresentations = [...this.tableActionPresentations.values()];
        const ownOutCard = this.view?.find('Players/Seat_0/Card/Out_Card');
        const hasPrecedingOwnPresentation = this.ownCardFlightActive
            || this.ownLandingCards.some((card) => card.isValid)
            || Boolean(ownOutCard?.children.some((child) =>
                child.isValid && child.name !== 'PlayCount'));
        // Authority may return the lead and schedule the automatic final hand
        // before the preceding presentation has registered its 1.5-second hold.
        // In that narrow window Out_Card and tableActionPresentations are both
        // still empty. The ordered ledger is already committed, however: when
        // its newest played action has no retained Play_<operationId> group yet,
        // it still owns the physical Out_Card pipeline and must be advanced.
        const hasPrecedingAuthorityPresentation = this.hasUnretainedLatestAuthorityPlay(setInfo);
        const shouldAdvancePrecedingPresentation = hasPrecedingOwnPresentation
            || precedingTablePresentations.length > 0
            || hasPrecedingAuthorityPresentation;
        await precedingOwnCardFlight;
        await Promise.resolve();
        if (shouldAdvancePrecedingPresentation) {
            this.retainedPlayedCardFlow?.flushPendingHolds();
        }
        if (hasPrecedingAuthorityPresentation) {
            // Release/advance the preceding owner, but never put its 0.45-second
            // archive transfer on the next click's critical path. Both physical
            // animations run concurrently from this frame.
            void this.advanceLatestAuthorityPlayToRetained(setInfo);
        }
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
        const remainingNodes = this.cardNodes.filter((_node, index) => selectedSlots[index] !== true);
        const remainingValues = this.cardValues.filter((_value, index) => selectedSlots[index] !== true);
        const compactionStarts = new Map<Node, Vec3>(
            remainingNodes.map((node) => [node, node.position.clone()]),
        );
        for (const node of selectedNodes) {
            if (!node.isValid) continue;
            node.active = false;
            node.removeFromParent();
            node.destroy();
        }
        this.cardNodes.splice(0, this.cardNodes.length, ...remainingNodes);
        this.cardValues.splice(0, this.cardValues.length, ...remainingValues);
        const compactPlan = this.buildCanonicalHandCompactionPlan(remainingNodes, compactionStarts);
        this.handCompaction = this.compactVisibleHand(compactPlan);
        this.ownCardFlightActive = true;
        const ownFlight = this.flyCardsToOwnAction(flyingCards).finally(() => {
            if (this.ownCardFlight === ownFlight) this.ownCardFlightActive = false;
        });
        this.ownCardFlight = ownFlight;
        const flight = this.trackPresentation(ownFlight);
        try {
            const result = await this.lifecycle.play(roomId, this.clientSeat(), Math.max(0, opType), values,
                0, stateVersion, trickId, operationId);
            const resultPacket = this.record(result) ?? {};
            const resultBody = this.record(resultPacket.body) ?? resultPacket;
            const resultSet = this.record(resultBody.setInfo)
                ?? this.record(resultBody.roomSetInfo)
                ?? this.record(resultPacket.roomSetInfo)
                ?? resultBody;
            const resultDeadline = this.record(resultSet.operationDeadline);
            const latestSet = this.runtime.getRoomSet().GetRoomSetInfo() ?? {};
            const latestDeadline = this.record(latestSet.operationDeadline);
            const resultTurnSeat = Number(resultSet.opPos ?? resultSet.currentSeat ?? resultSet.turnSeat
                ?? resultDeadline?.seatId ?? latestSet.opPos ?? latestDeadline?.seatId ?? -1);
            this.keepOperationsVisibleDuringPlay = false;
            const queuedHint = this.hintRequestedDuringPlay;
            if (resultTurnSeat !== this.clientSeat()) this.hintRequestedDuringPlay = false;
            if (this.playRequestScope === scope) {
                this.playInFlight = false;
                this.playRequestScope = null;
            }
            if (resultTurnSeat !== this.clientSeat()) {
                this.operations?.hide();
            } else {
                this.refresh();
                if (queuedHint) {
                    // Let the authority event finish its synchronous hand/state
                    // projection, then apply the preserved user intent. Zero delay
                    // avoids coupling Hint to card-flight or sound animation time.
                    globalThis.setTimeout(() => {
                        this.consumeQueuedHintAfterPlay();
                    }, 0);
                }
            }
            console.info('[CommonRoomPlayControlResult]', {
                roomId,
                playerId: this.runtime.getPlayerId(),
                operationId,
                stateVersion,
                resultTurnSeat,
                localSeat: this.clientSeat(),
                controlsKeptVisible: resultTurnSeat === this.clientSeat(),
            });
            if (this.playRequestScope === scope) {
                this.playInFlight = false;
                this.playRequestScope = null;
            }
            await flight;
        } catch (error: unknown) {
            this.keepOperationsVisibleDuringPlay = false;
            this.hintRequestedDuringPlay = false;
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
            this.refresh();
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
        return pdkOperationTypeForCards(
            this.logic.GetSelectCard() ?? [], this.recognitionRules(),
        );
    }
    private playOperationAnimationOnce(operationId: string, opType: number, physicalSlot: number): void { return this.tablePresentation.playOperationAnimationOnce(operationId, opType, physicalSlot); }

    private buildCanonicalHandCompactionPlan(cards: readonly Node[], starts: ReadonlyMap<Node, Vec3>): Map<Node, Vec3> { return this.tablePresentation.buildCanonicalHandCompactionPlan(cards, starts); }

    private compactVisibleHand(targets: ReadonlyMap<Node, Vec3>): Promise<void> { return this.tablePresentation.compactVisibleHand(targets); }

    private markPublicCardsShown(dataSeat: number): void { return this.tablePresentation.markPublicCardsShown(dataSeat); }

    private claimPublicSeatRender(dataSeat: number): number { return this.tablePresentation.claimPublicSeatRender(dataSeat); }

    private isPublicSeatRenderCurrent(dataSeat: number, seatRevision: number, lease: PdkRoundPresentationLease, expectedProjectionGeneration?: number): boolean { return this.tablePresentation.isPublicSeatRenderCurrent(dataSeat, seatRevision, lease, expectedProjectionGeneration); }

    private waitForPublicCardHold(dataSeat: number): Promise<void> { return this.tablePresentation.waitForPublicCardHold(dataSeat); }

    private clearPublicCardsForTurn(dataSeat: number): void { return this.tablePresentation.clearPublicCardsForTurn(dataSeat); }

    private clearCompletedTrickAfterHold(winningSeat: number): void { return this.tablePresentation.clearCompletedTrickAfterHold(winningSeat); }

    private clearPublicCardsForSeat(dataSeat: number, reason = 'UNSPECIFIED'): void { return this.tablePresentation.clearPublicCardsForSeat(dataSeat, reason); }

    private clearLatestPublicCards(): void { return this.tablePresentation.clearLatestPublicCards(); }

    private cancelPublicCardClearTimers(): void { return this.tablePresentation.cancelPublicCardClearTimers(); }

    private prepareOwnFlightCards(sourceCards: readonly Node[]): Node[] { return this.tablePresentation.prepareOwnFlightCards(sourceCards); }

    private flyCardsToOwnAction(flyingCards: readonly Node[]): Promise<void> { return this.tablePresentation.flyCardsToOwnAction(flyingCards); }

    private clearOwnLandingCards(): void { return this.tablePresentation.clearOwnLandingCards(); }

    private flyingCardOverlay(): Node | null { return this.tablePresentation.flyingCardOverlay(); }

    private resetPromptCycle(): void { return this.hintController.resetPromptCycle(); }

    private authoritativeRuleOptions(): Record<string, unknown> { return this.hintController.authoritativeRuleOptions(); }

    private recognitionRules(handCardCount = (this.logic.GetHandCard() ?? []).length, responseTurn = !this.isAuthoritativeLeadingTurn()): Record<string, unknown> { return this.hintController.recognitionRules(handCardCount, responseTurn); }

    private tripleAttachmentPermissions(): { oneSingle: boolean; twoSingles: boolean; pairs: boolean } { return this.hintController.tripleAttachmentPermissions(); }

    private fourAttachmentPermissions(): { singles: boolean; pairs: boolean } { return this.hintController.fourAttachmentPermissions(); }

    private activeRequiredFirstCard(): number { return this.hintController.activeRequiredFirstCard(); }

    private isFirstPlayOfRound(setInfo: Readonly<Record<string, unknown>>): boolean { return this.hintController.isFirstPlayOfRound(setInfo); }

    private isMandatoryFirstCardRule(rules: Readonly<Record<string, unknown>>): boolean { return this.hintController.isMandatoryFirstCardRule(rules); }

    private authoritativeDeckCards(): number[] { return this.hintController.authoritativeDeckCards(); }

    private authoritativePlayedRankCounts(deckCards: readonly number[]): number[] { return this.hintController.authoritativePlayedRankCounts(deckCards); }

    private validateHintRuleContext(): void { return this.hintController.validateHintRuleContext(); }

    private sortedLegalTipCandidates(leading: boolean, strategy: 'HINT' | 'DRAG' | 'HOST' = 'HINT', dragSource: readonly number[][] = []): number[][] { return this.hintController.sortedLegalTipCandidates(leading, strategy, dragSource); }

    private requiredReportedSingleRank(): number | null { return this.hintController.requiredReportedSingleRank(); }

    private obeysReportedSingleRule(cards: readonly number[]): boolean { return this.hintController.obeysReportedSingleRule(cards); }

    private scoringBombGroups(): number[][] { return this.hintController.scoringBombGroups(); }

    private allBombGroups(): number[][] { return this.hintController.allBombGroups(); }

    private cardsInHandOrder(cards: number[]): number[] { return this.hintController.cardsInHandOrder(cards); }

    private isLocalTrusteeship(setInfo: Record<string, unknown>): boolean { return this.hintController.isLocalTrusteeship(setInfo); }

    private cardRank(card: number): number { return this.hintController.cardRank(card); }

    private lowestResponseBodyRank(cards: readonly number[], targetType: number): number { return this.hintController.lowestResponseBodyRank(cards, targetType); }

    private cardDisplayName(card: number): string { return this.hintController.cardDisplayName(card); }

    private missingRequiredFirstCard(cards: readonly number[]): number { return this.hintController.missingRequiredFirstCard(cards); }

    private promptKey(): string { return this.hintController.promptKey(); }

    private isAuthoritativeLeadingTurn(setInfo: Record<string, unknown> = this.runtime.getRoomSet().GetRoomSetInfo() ?? {}): boolean { return this.hintController.isAuthoritativeLeadingTurn(setInfo); }

    private autoHintForAuthoritativeTurn(setInfo: Record<string, unknown>, expectedSelectionRevision: number, authorityProjectionStartedAt = globalThis.performance?.now?.() ?? Date.now()): Promise<void> { return this.hintController.autoHintForAuthoritativeTurn(setInfo, expectedSelectionRevision, authorityProjectionStartedAt); }

    private operationTypeForCards(cards: readonly number[], responseTurn = !this.isAuthoritativeLeadingTurn()): number { return this.hintController.operationTypeForCards(cards, responseTurn); }

    private intrinsicOperationTypeForCards(cards: readonly number[], responseTurn = !this.isAuthoritativeLeadingTurn()): number { return this.hintController.intrinsicOperationTypeForCards(cards, responseTurn); }

    private synchronizeAuthorityComparison(setInfo: Record<string, unknown> = this.runtime.getRoomSet().GetRoomSetInfo() ?? {}): void { return this.hintController.synchronizeAuthorityComparison(setInfo); }

    private authorityComparison(setInfo: Record<string, unknown>): { cards: number[]; type: number } { return this.hintController.authorityComparison(setInfo); }

    private hasUnretainedLatestAuthorityPlay(setInfo: Record<string, unknown>): boolean { return this.tablePresentation.hasUnretainedLatestAuthorityPlay(setInfo); }

    private advanceLatestAuthorityPlayToRetained(setInfo: Record<string, unknown>): Promise<void> { return this.tablePresentation.advanceLatestAuthorityPlayToRetained(setInfo); }

    private isFormalCardPlayPhase(setInfo: Record<string, unknown>): boolean { return this.hintController.isFormalCardPlayPhase(setInfo); }

    private sameCards(left: readonly number[], right: readonly number[]): boolean { return this.hintController.sameCards(left, right); }

    private startClockFromSetInfo(packet: Record<string, unknown>): void { return this.turnClock.startClockFromSetInfo(packet); }

    private startClock(dataSeat: number, seconds: number | null): void { return this.turnClock.startClock(dataSeat, seconds); }

    private hideClocks(): void { return this.turnClock.hideClocks(); }

    private stopClock(): void { return this.turnClock.stopClock(); }

    private bind(path: string, handler: () => void): void { this.view?.bind(path, handler, this.bound); }
    private toggle(path: string): void { const node = this.view?.find(path); if (node) node.active = !node.active; }
    public async openCommonRoomRule(): Promise<void> {
        const config = this.runtime.getRoom().GetRoomConfig() ?? {};
        const rules = this.roomRuleSnapshot ?? config.ruleSnapshot ?? config.ruleOptions ?? config;
        const schema = this.roomRuleFields ?? config.ruleFields ?? config.fields ?? [];
        const text = formatPdkRuleSummary(rules, schema);
        this.view?.label('Panel/Bg_Wanfa/Labei_Wanfa', text || '当前房间没有可显示的开房规则');
        this.view?.visible('Panel/Bg_Wanfa', true);
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

    /** Low-frequency authority/public-card lifecycle evidence for cross-client failures. */
    private tracePublicProjection(stage: string, detail: Record<string, unknown>): void {
        console.info('[PdkPublicProjection]', JSON.stringify({
            stage,
            roomId: this.roomId(),
            playerId: this.runtime.getPlayerId(),
            stateVersion: Number(this.runtime.getRoom().GetRoomProperty('stateVersion') ?? -1),
            ...detail,
        }));
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
                return 8;
            case 'FOUR_WITH_TWO_PAIRS': return 20;
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
        if (/CONNECTION_NOT_READY|not connected|socket|network|timeout|timed out|网络|连接失败|尚未连接/i.test(message)) {
            console.error(`[PDKActionError] ${label}`, error);
            this.showMessage('网络未连接，请稍后重试');
            return;
        }
        if (message.includes('下家报单') || message.includes('must play highest single against reported single')) {
            this.showMessage('下家报单只能出最大单张');
            return;
        }
        if (label === '出牌' || label === '自动出牌') {
            const required = this.isAuthoritativeLeadingTurn() ? this.activeRequiredFirstCard() : 0;
            const selected = [...(this.logic.GetSelectCard() ?? [])].map(Number);
            if (this.missingRequiredFirstCard(selected) > 0
                || /required|must.*contain|opening card/i.test(message)) {
                this.showMessage(required > 0 ? `必须带${this.cardDisplayName(required)}牌` : '必须带指定牌');
            } else if (/beat|higher|current trick|cannot play/i.test(message)) {
                this.showMessage('所选牌不能压过上家的牌');
            } else if (/card type|pattern|attachment|invalid play|牌型/i.test(message)) {
                this.showMessage('牌型错误');
            } else {
                this.showMessage('出牌失败，请重试');
            }
            console.error(`[PDKActionError] ${label}`, {
                requiredCard: required,
                selectedCards: selected,
                stateVersion: Number(this.runtime.getRoom().GetRoomProperty('stateVersion') ?? -1),
            }, error);
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
