import { Button, Node } from 'cc';
import type { AuthenticatedAccount } from '../../../../../../Login/Code/Auth/AuthTypes';
import { ProtocolClient } from '../../../../../../Common/Code/Runtime/network/ProtocolClient';
import { createOwnedGameClient, setGameReconnectRecipe, setGameRoomReconnectRecipe } from '../../../../../../Common/Code/Runtime/network/ConnectionOwnership';
import { LegacyRoleGateway } from '../../../../../../Common/Code/Runtime/role/LegacyRoleGateway';
import { LegacyFormManager, type LegacyForm } from '../../../../../../Common/Code/Runtime/ui/LegacyFormManager';
import { createMsgDriftLifecycle } from '../../../../../../Common/Code/Runtime/ui/MsgDriftLifecycle';
import { presentationTransition, type PresentationTransition } from '../../../../../../Common/Code/Runtime/ui/PresentationTransitionCoordinator';
import { resolveRuntimeEndpoints } from '../../../../../../Common/Code/Runtime/config/RuntimeEndpoints';
import { CommonPdkRuntime } from './CommonPdkRuntime';
import { isPdkBusinessCode } from '../Regional/PdkBusinessCodes';
import { CommonPdkPlayController } from './CommonPdkPlayController';
import { COMMON_ROOM_FORM, CommonRoomNodePath, DISSOLVE_ROOM_FORM, PDK_ROOM_FORM, POKER_CARD_SELECTION_FORM } from './Room/PdkRoomNodePaths';
import { CommonPdkResultController } from './CommonPdkResultController';
import { CommonPdkDissolveController } from './CommonPdkDissolveController';
import { CommonPdkRecordController } from './CommonPdkRecordController';
import { CommonPdkShareController } from './CommonPdkShareController';
import { settlementBundlePreloader } from '../../../../../Common/Code/Settlement/SettlementBundlePreloader';
import { settlementTemplateResolver } from '../../../../../Common/Code/Settlement/SettlementTemplateResolver';
import { CommonPdkChatController } from './CommonPdkChatController';
import { CommonPdkVoiceController } from './CommonPdkVoiceController';
import { MagicExpressionPanelController } from './MagicExpressionPanelController';
import { CommonSettingsController } from '../../../../../../Common/Code/UI/CommonSettingsController';
import { CommonPdkSocialController, type CommonPdkMediaClient } from './CommonPdkSocialController';
import { BrowserVoiceRecorder, VoiceMediaClient, type VoiceRecorder } from '../../../../../../Common/Code/Runtime/Voice/VoiceMediaClient';
import { getGameCapabilities } from '../../../../../Common/Code/Catalog/CatalogFamilyBindings';
import type { GameCapabilities } from '../../../../../Common/Code/Catalog/FamilyRuntimeRegistry';
import type {
    LegacyExternalSubgameHandoff,
    LegacySubgameTicket,
} from '../../../../../../Common/Code/Runtime/subgame/AuthoritativeSubgameHandoff';
import type { HallRoomConnectionTicket } from '../../../../../../Lobby/Code/HallRoomGateway';
import { Poker_Deck_Presenter, type PokerDeckSelectionSubmit } from '../../../../Common/Code/Card/Poker_Deck_Presenter';
import { PDK_BUSINESS_CODES } from '../Regional/PdkBusinessCodes';
import { LS201PlayedCardFlow } from '../../../LSPDK/Code/LS201PlayedCardFlow';

interface GameServerInfo {
    isStart?: boolean;
    webSocketUrl?: string;
    gameServerIP?: string;
    gameServerPort?: number;
}

const COMMON_SETTINGS_FORM = 'room/SettingsPanel';
const AUTO_PLAY_FORM = 'room/AutoPlay';

export class CommonPdkSwitchCoordinator {
    private gameClient: ProtocolClient | null = null;
    private runtime: CommonPdkRuntime | null = null;
    private playController: CommonPdkPlayController | null = null;
    private resultController: CommonPdkResultController | null = null;
    private dissolveController: CommonPdkDissolveController | null = null;
    private recordController: CommonPdkRecordController | null = null;
    private shareController: CommonPdkShareController | null = null;
    private chatController: CommonPdkChatController | null = null;
    private voiceController: CommonPdkVoiceController | null = null;
    private magicExpressionController: MagicExpressionPanelController | null = null;
    private settingsController: CommonSettingsController | null = null;
    private socialController: CommonPdkSocialController | null = null;
    private switching = false;
    private inGame = false;
    private sourceTicket: LegacySubgameTicket | null = null;
    private smallSettlementForm = 'settlement/poker/SmallSettlement';
    private bigSettlementForm = 'settlement/poker/BigSettlement';
    private externalSwitchGeneration = 0;
    private dissolveEntry: Node | null = null;
    private dissolveVoteActive = false;
    private settlementPresentationGeneration = 0;
    private settlementPendingKey = '';
    private settlementShownKey = '';
    private settlementOpenCount = 0;
    private lastSmallSettlementPayload: Record<string, unknown> | null = null;
    private readonly onDissolveEntryClick = (): void => { void this.openDissolveRoom(); };
    private disposed = false;
    private leavePending: Promise<void> | null = null;
    private terminalStateVersion = -1;
    private autoPlayVisible = false;
    private autoPlayCancelButton: Node | null = null;
    private readonly onCancelAutoPlay = (): void => { void this.cancelAutoPlay(); };
    private roomUiGeneration = 0;
    private roomCapabilities: GameCapabilities = getGameCapabilities('');
    private cardSelectionRoot: Node | null = null;
    private readonly onCardSelectionSubmit = (detail: PokerDeckSelectionSubmit): void => {
        void this.submitCardSelection(detail);
    };
    private readonly onCardSelectionClose = (): void => {
        this.forms.closeAfterPointer(POKER_CARD_SELECTION_FORM);
    };

    public isInGameSession(): boolean {
        return this.inGame;
    }

    private bindAutoPlay(root: Node): void {
        const button = root.getChildByName('btn_cancel');
        if (!button || this.autoPlayCancelButton === button) return;
        this.unbindAutoPlay();
        this.autoPlayCancelButton = button;
        button.on(Button.EventType.CLICK, this.onCancelAutoPlay, this);
    }

    private unbindAutoPlay(): void {
        this.autoPlayCancelButton?.off(Button.EventType.CLICK, this.onCancelAutoPlay, this);
        this.autoPlayCancelButton = null;
    }

    private syncAutoPlay(active: boolean): void {
        if (this.autoPlayVisible === active) return;
        this.autoPlayVisible = active;
        if (active) {
            void this.forms.show(AUTO_PLAY_FORM).catch((error: unknown) => {
                this.autoPlayVisible = false;
                console.error('[CommonPdkTrusteeship] 托管界面加载失败', error);
            });
            return;
        }
        this.forms.close(AUTO_PLAY_FORM);
    }

    private async cancelAutoPlay(): Promise<void> {
        const runtime = this.runtime;
        if (!runtime) return;
        const roomId = Number(runtime.getRoom().GetRoomProperty('key') ?? 0);
        const seat = runtime.getRoomPosManager().GetClientPos();
        await runtime.action('trusteeship', 'common.room.trusteeship_req', {
            roomID: roomId,
            pos: seat,
            trusteeship: false,
        }).catch((error: unknown) => {
            console.error('[CommonPdkTrusteeship] 取消托管失败', { roomId, seat, error });
            void this.showMessage(error instanceof Error ? error.message : '取消托管失败');
        });
    }

    private async openRoomForm(path: string, label: string): Promise<void> {
        try {
            await this.forms.show(path);
        } catch (error: unknown) {
            const detail = error instanceof Error ? error.message : String(error);
            console.error(`[CommonPdkSwitchCoordinator] ${label}打开失败: ${detail}`);
            await this.showMessage(`${label}打开失败，请重试`);
        }
    }

    /** Open the latest authoritative round settlement from the persistent room button. */
    private async openLastSmallSettlement(): Promise<void> {
        const stored = this.lastSmallSettlementPayload
            ?? this.runtime?.getRoomSet().GetRoomSetProperty('setEnd');
        if (!stored || typeof stored !== 'object' || Array.isArray(stored)
            || Object.keys(stored as Record<string, unknown>).length === 0) {
            await this.showMessage('暂无小结算');
            return;
        }
        try {
            const payload = stored as Record<string, unknown>;
            const roomId = Number(payload.roomId ?? this.runtime?.getRoom().GetRoomProperty('roomId')
                ?? this.runtime?.getRoom().GetRoomProperty('key') ?? 0);
            const roundNo = Number(payload.roundNo
                ?? this.runtime?.getRoomSet().GetRoomSetProperty('roundNo') ?? 0);
            const settlement = await this.withReplayCode(payload, roomId, roundNo);
            // A cached form can already be mounted when reconnecting at a round
            // boundary. Mark review mode before show() so even that instance's
            // existing Continue listener closes locally instead of resubmitting.
            this.resultController?.prepareRoomButtonReview();
            await this.forms.show(this.smallSettlementForm, { ...settlement, openedFromRoomButton: true });
        } catch (error: unknown) {
            const detail = error instanceof Error ? error.message : String(error);
            console.error(`[CommonPdkSwitchCoordinator] 小结算打开失败: ${detail}`);
            await this.showMessage('小结算打开失败，请重试');
        }
    }

    public enterExternalReplay(ticket: LegacySubgameTicket): void {
        const gameName = String(ticket.gameName ?? '').trim().toLowerCase();
        const gameIdByName: Record<string, number> = {
            hzmj: 0, scjymj: 628, cd201: 8, nj201: 629, ls201: 90005,
        };
        const gameId = Number(ticket.gameId ?? gameIdByName[gameName]);
        void this.prepareExternalHandoff(ticket, gameId, gameName);
    }

    public constructor(
        private readonly account: AuthenticatedAccount,
        private readonly playerId: number,
        private readonly hallClient: ProtocolClient,
        private readonly forms: LegacyFormManager,
        private readonly lobbyNode: Node,
        private readonly refreshRoomConnection: (roomId: number) => Promise<HallRoomConnectionTicket> = async () => {
            throw new Error('房间重连票据刷新器未配置');
        },
        private readonly leaveRoom: (roomId: number) => Promise<unknown> = async () => {
            throw new Error('房间退出接口未配置');
        },
        private readonly onExplicitLeave: () => void = () => undefined,
        private readonly currentReplayCode: (roomId: number, setId: number) => Promise<string> = async () => '',
        private readonly settlementHistory: (roomId: number) => Promise<unknown> = async () => ({}),
    ) {
        // PDK can be entered from lobby, club, reconnect, or replay recovery.
        // Own this logical registration here so every path resolves to the
        // authoritative Common/Prefab/MsgDrift prefab instead of depending on
        // a lobby lifecycle having registered it first.
        this.forms.register('UIMessage_Drift', {
            zOrder: 100,
            modal: false,
            presentationOwnedExternally: true,
            lifecycle: createMsgDriftLifecycle(() => this.forms.close('UIMessage_Drift')),
        });
        void this.forms.preload('UIMessage_Drift').catch((error: unknown) => {
            console.error('[CommonPdkSwitchCoordinator] MsgDrift 预加载失败', error);
        });
        this.forms.register(COMMON_ROOM_FORM, {
            zOrder: 21,
            modal: false,
            presentationOwnedExternally: true,
            lifecycle: {
                onCreate: (form) => {
                    this.playController?.onCreateCommonRoom(form);
                    this.bindDissolveEntry(form.node);
                },
                // Forms are cached across rooms. A new room controller must bind
                // the already-created common layer every time it is shown.
                onShow: (form) => {
                    this.playController?.onCreateCommonRoom(form);
                    this.bindDissolveEntry(form.node);
                },
                onDestroy: () => this.unbindDissolveEntry(),
            },
        });
        this.forms.register(DISSOLVE_ROOM_FORM, {
            zOrder: 33,
            lifecycle: {
                onCreate: (form) => this.dissolveController?.onCreate(form.node),
                onShow: (form) => {
                    this.dissolveController?.onCreate(form.node);
                    this.dissolveController?.onShow();
                },
                onClose: () => this.dissolveController?.hide(),
                onDestroy: () => this.dissolveController?.destroy(),
            },
        });
        this.forms.register(AUTO_PLAY_FORM, {
            zOrder: 34,
            modal: false,
            presentationOwnedExternally: true,
            lifecycle: {
                onCreate: (form) => this.bindAutoPlay(form.node),
                onShow: (form) => this.bindAutoPlay(form.node),
                onDestroy: () => this.unbindAutoPlay(),
            },
        });
        this.forms.register(PDK_ROOM_FORM, {
            zOrder: 20,
            // PDK_CommonRoom 是桌面根容器，不是弹窗；若沿用 zOrder>0 的默认模态，
            // LegacyModalInputMask 会覆盖出牌/不要等真实按钮，导致用户点击无响应。
            modal: false,
            presentationOwnedExternally: true,
            lifecycle: {
                onCreate: (form) => {
                    this.playController?.onCreate(form);
                },
                onShow: (form) => {
                    // onCreate does not run again for a cached room form.
                    this.playController?.onCreate(form);
                    this.lobbyNode.active = false;
                    this.playController?.onShow();
                },
                onClose: () => { if (!this.inGame) this.lobbyNode.active = true; },
                onDestroy: () => this.playController?.destroy(),
            },
        });
        this.forms.register(POKER_CARD_SELECTION_FORM, {
            zOrder: 42,
            modal: true,
            lifecycle: {
                onCreate: (form) => this.bindCardSelectionForm(form),
                onShow: (form, context) => this.showCardSelectionForm(form, context),
                onClose: () => this.unbindCardSelectionForm(),
                onDestroy: () => this.unbindCardSelectionForm(),
            },
        });
        this.registerSmallSettlementForm('settlement/poker/SmallSettlement');
        this.registerBigSettlementForm('settlement/poker/BigSettlement');
        this.forms.register(CommonPdkChatController.formKey, {
            zOrder: 30,
            lifecycle: {
                onCreate: (form) => this.chatController?.onCreate(form),
                onShow: (form) => this.chatController?.onShow(form),
                onDestroy: () => this.chatController?.destroy(),
            },
        });
        this.forms.register(CommonPdkVoiceController.formKey, {
            zOrder: 31,
            lifecycle: {
                onCreate: (form) => this.voiceController?.onCreate(form),
                onShow: (form) => this.voiceController?.onShow(form),
                onDestroy: () => this.voiceController?.destroy(),
            },
        });
        this.forms.register(MagicExpressionPanelController.formKey, {
            zOrder: 32,
            lifecycle: {
                onCreate: (form) => this.magicExpressionController?.onCreate(form),
                onShow: (form, targetSeat) => this.magicExpressionController?.onShow(form, targetSeat),
                onClose: () => this.magicExpressionController?.onClose(),
                onDestroy: () => this.magicExpressionController?.destroy(),
            },
        });
        this.forms.register(COMMON_SETTINGS_FORM, {
            zOrder: 30,
            lifecycle: {
                onCreate: (form) => this.settingsController?.onCreate(form.node),
                onShow: () => this.settingsController?.onShow('poker'),
                onDestroy: () => this.settingsController?.destroy(),
            },
        });
    }

    public async enter(ticket: LegacySubgameTicket): Promise<void> {
        if (this.switching || this.inGame) return;
        const gameId = Number(ticket.gameId ?? 0);
        const gameName = String(ticket.gameName ?? '').trim();
        // 玩法归属只能使用服务端权威目录下发的 family。地区 gameId/简称会随
        // 运营发布扩展，若在公共房间判断这些值，新地区玩法必然再次污染公共层。
        const playFamily = String(ticket.playFamily ?? '').trim().toLowerCase().replace(/_/g, '-');
        // Catalog 的 familyCode 是“牌类:规则族”完整标识。这里只接受权威的 Poker
        // 跑得快族，不能丢掉牌类前缀，也不能用地区 gameId/简称猜测玩法归属。
        const isPaoDeKuaiFamily = playFamily === 'poker:pao-de-kuai' || playFamily === 'poker-pao-de-kuai';
        if (!isPaoDeKuaiFamily) {
            await this.prepareExternalHandoff(ticket, gameId, gameName.toLowerCase());
            return;
        }
        const gameCode = gameName.toUpperCase();
        if (!isPdkBusinessCode(gameCode)) {
            await this.showMessage('跑得快业务编码无效，请刷新游戏目录后重试');
            return;
        }
        this.roomCapabilities = getGameCapabilities(gameCode);
        const roomId = Number(ticket.roomId ?? ticket.roomID ?? 0);
        if (!Number.isSafeInteger(roomId) || roomId <= 0) {
            await this.showMessage('房间数据无效，请重新进入');
            return;
        }
        const playVersion = String(ticket.playVersion ?? '').trim();
        const authorityRoute = String(ticket.authorityRoute ?? '').trim();
        const gameTicket = String(ticket.gameTicket ?? '').trim();
        if (!playVersion || !authorityRoute || !gameTicket) {
            await this.showMessage('房间连接凭据不完整，请重新创建或加入房间');
            return;
        }
        this.switching = true;
        this.sourceTicket = { ...ticket };
        const smallRoute = settlementTemplateResolver.resolve({
            gameId: gameCode,
            playFamily: ticket.playFamily,
            settlementType: 'SMALL',
            configuredTemplateId: ticket.smallSettleTemplate,
            playVersion,
        });
        const bigRoute = settlementTemplateResolver.resolve({
            gameId: gameCode,
            playFamily: ticket.playFamily,
            settlementType: 'BIG',
            configuredTemplateId: ticket.bigSettleTemplate,
            playVersion,
        });
        this.smallSettlementForm = `settlement/poker/${smallRoute.templateId}`;
        this.bigSettlementForm = `settlement/poker/${bigRoute.templateId}`;
        if (!smallRoute.isDefault) this.registerSmallSettlementForm(this.smallSettlementForm);
        if (!bigRoute.isDefault) this.registerBigSettlementForm(this.bigSettlementForm);
        try {
            // Decode the two mandatory room prefabs while the Game WebSocket is
            // connecting. They have no dependency on authoritative room data;
            // keeping them after connect/enter made CPU time add to network time.
            const roomFormsReady = this.preloadRequiredRoomForms(roomId)
                .then<unknown>(() => null, (error: unknown) => error);
            const showRoomLayersWhenReady = async (): Promise<void> => {
                const preloadError = await roomFormsReady;
                if (preloadError) throw preloadError;
                await this.showRoomLayers();
            };
            let gameClient = createOwnedGameClient();
            this.gameClient = gameClient;
            gameClient.setWsTicket(gameTicket);
            gameClient.bindRoomAuthority(roomId, playVersion);
            try {
                await gameClient.connect(authorityRoute);
            } catch (firstConnectError: unknown) {
                // Game tickets are single-use. During a full-table fan-out, an old
                // recovery attempt can consume the ticket immediately before this
                // socket opens. Refresh only this player's committed membership and
                // retry once with a new client so other seats remain independent.
                gameClient.close();
                const refreshed = await this.refreshRoomConnectionWithRetry(roomId, 'AUTHORITY_TICKET_REFRESH');
                console.warn('[CommonPdkRoomEntry] authority-ticket-refresh', {
                    roomId, playerId: Number(this.account.accountId ?? this.playerId),
                    reason: firstConnectError instanceof Error ? firstConnectError.message : String(firstConnectError),
                });
                gameClient = createOwnedGameClient();
                this.gameClient = gameClient;
                gameClient.setWsTicket(refreshed.gameTicket);
                gameClient.bindRoomAuthority(roomId, playVersion);
                await gameClient.connect(refreshed.authorityRoute || authorityRoute);
            }
            // Every seated member receives an independent ticket and connection. Once this
            // authority boundary succeeds, leave the club surface immediately for every
            // client; waiting until PDK_ROOM_FORM.onShow lets a slower prefab decode strand
            // an already-connected player visually in ClubMain while the last joiner enters.
            this.lobbyNode.active = false;
            console.info('[CommonPdkRoomEntry] authority-connected', {
                roomId, playerId: Number(this.account.accountId ?? this.playerId), gameCode,
            });
            setGameRoomReconnectRecipe(roomId, playVersion, this.refreshRoomConnection);
            const authorityPlayerId = Number(this.account.accountId ?? this.playerId);
            let roomLayersPending: Promise<void> | null = null;
            let controllersReady = false;
            const runtime = new CommonPdkRuntime(gameClient, {
                gameCode,
                playerId: Number.isSafeInteger(authorityPlayerId) && authorityPlayerId > 0 ? authorityPlayerId : this.playerId,
                isActualGameScene: () => this.inGame,
                // The migrated runtime can announce room readiness from its
                // constructor path. Do not show cached forms until their new
                // room controllers exist, otherwise onCreate/onShow binds the
                // previous (or no) controller and avatar social effects vanish.
                onRoomReady: () => {
                    if (controllersReady) {
                        roomLayersPending ??= showRoomLayersWhenReady();
                    }
                },
                onEvent: (event, body) => {
                    if (this.disposed) return;
                    if (event === 'CommonPdk_DissolveRoom') {
                        const terminal = body && typeof body === 'object' ? body as Record<string, unknown> : {};
                        const stateVersion = Number(terminal.stateVersion ?? -1);
                        if (stateVersion >= 0 && this.terminalStateVersion >= 0 && stateVersion <= this.terminalStateVersion) return;
                        this.terminalStateVersion = stateVersion >= 0 ? stateVersion : Number.MAX_SAFE_INTEGER;
                        this.dissolveVoteActive = false;
                        this.forms.close(DISSOLVE_ROOM_FORM);
                        this.requestLeave('pdk-room-dissolved');
                        return;
                    }
                    this.playController?.onEvent(event, body);
                    const phasePacket = body && typeof body === 'object'
                        ? body as Record<string, unknown> : undefined;
                    const phaseChangedToPlaying = event === 'CommonPdk_AuthoritativePhaseChanged'
                        && String(phasePacket?.to ?? '').toUpperCase() === 'PLAYING';
                    if (event === 'CommonPdkSetStart' || phaseChangedToPlaying) {
                        // A reconnect or an already-acknowledged Continue can leave a cached
                        // settlement form mounted while Authority has started the next round.
                        // The playing boundary owns the screen and must release that modal mask.
                        this.settlementPresentationGeneration += 1;
                        this.settlementPendingKey = '';
                        this.forms.close(this.smallSettlementForm);
                    }
                    if (event === 'CommonPdkSetEnd') {
                        const setEnd = body && typeof body === 'object' ? body as Record<string, unknown>
                            : runtime.getRoomSet().GetRoomSetProperty('setEnd');
                        void this.showSettlementAfterPresentation(false, setEnd).catch((error: unknown) => {
                            console.error('[CommonPdkSwitchCoordinator] 小结算展示失败', error);
                            void this.showMessage('小结算打开失败，请重试');
                        });
                    }
                    if (event === 'CommonPdk_PosContinueGame') {
                        this.settlementPresentationGeneration += 1;
                        this.forms.close(this.smallSettlementForm);
                        const current = runtime.getRoomSet().GetRoomSetInfo() ?? {};
                        const phase = String(current.authorityPhase ?? '').toUpperCase();
                        // A timely continue acknowledgement clears the completed
                        // round immediately. A delayed legacy acknowledgement may
                        // arrive after the next deal and must not erase that hand.
                        const presentationMutation = phase === 'COMPETE_DEALER' || phase === 'PLAYING'
                            ? 'SKIP_ACTIVE_ROUND' : 'CLEAR_COMPLETED_ROUND';
                        if (presentationMutation === 'CLEAR_COMPLETED_ROUND') {
                            this.playController?.clearCompletedRound();
                        }
                        console.info('[CommonRoomContinueAck]', {
                            roomId: Number(runtime.getRoom().GetRoomProperty('key') ?? 0),
                            stateVersion: Number(runtime.getRoom().GetRoomProperty('stateVersion') ?? -1),
                            operationId: String((current.operationDeadline as Record<string, unknown> | undefined)?.operationId ?? ''),
                            phase,
                            presentationMutation,
                        });
                    }
                    if (event === 'CommonPdk_StartVoteDissolve') {
                        if (!this.roomCapabilities.supportsDissolve) return;
                        this.dissolveVoteActive = true;
                        void this.openDissolveForm();
                    }
                    if (event === 'CommonPdk_DissolveVoteRejected') {
                        if (!this.roomCapabilities.supportsDissolve) return;
                        const rejected = body && typeof body === 'object'
                            ? body as { rejectedSeat?: number } : {};
                        this.dissolveVoteActive = false;
                        this.dissolveController?.onRejected(rejected.rejectedSeat);
                    }
                    if (event === 'PosDealVote') {
                        if (!this.roomCapabilities.supportsDissolve) return;
                        this.dissolveController?.onVote(body);
                        const vote = body && typeof body === 'object' ? body as { posAgreeList?: unknown[] } : {};
                        if (vote.posAgreeList?.some((value) => Number(value) === 2)) this.dissolveVoteActive = false;
                    }
                    if (event === 'RoomEnd') {
                        const latest = runtime.getRoomSet().GetRoomSetProperty('setEnd');
                        const terminal = body && typeof body === 'object' ? body as Record<string, unknown> : {};
                        void this.showSettlementAfterPresentation(false, { ...latest, ...terminal, matchFinished: true });
                    }
                    this.lobbyNode.emit('common-pdk-event', { event, body });
                },
                onMessage: (message) => { void this.showMessage(message); },
                // Runtime exits can race Hall recovery. Always use the guarded
                // path so a transient Hall failure cannot become an unhandled
                // rejection and open Creator's full-screen Error surface.
                onExit: () => { this.requestLeave('room-not-found'); },
            });
            this.runtime = runtime;
            const media = this.roomMediaClient();
            const unavailableMedia: CommonPdkMediaClient = {
                recordVoice: async () => { throw new Error('当前平台未提供语音录制接口'); },
                stopRecording: () => undefined,
                uploadVoice: async () => { throw new Error('当前平台未提供媒体上传接口'); },
                playVoice: async () => { throw new Error('当前平台未提供语音播放接口'); },
                cancel: () => undefined,
            };
            let play!: CommonPdkPlayController;
            this.socialController = new CommonPdkSocialController(runtime, media ?? unavailableMedia, {
                showQuickText: (seatId, text, durationMs) => play?.showQuickText(seatId, text, durationMs),
                showEmoji: (seatId, emojiId, durationMs) => play?.showEmoji(seatId, emojiId, durationMs),
                showVoice: (seatId, durationMs) => play?.showVoice(seatId, durationMs),
                hideVoice: (seatId) => play?.hideVoice(seatId),
                playMagicExpression: (source, target, expression) => play?.playMagicExpression(source, target, expression),
                clear: () => undefined,
            }, (message) => { void this.showMessage(message); }, Date.now, {
                supportsChat: this.roomCapabilities.supportsChat,
                supportsVoice: this.roomCapabilities.supportsVoice,
            });
            this.magicExpressionController = new MagicExpressionPanelController(
                runtime,
                this.forms,
                this.socialController,
                (message) => { void this.showMessage(message); },
            );
            play = new CommonPdkPlayController(
                runtime,
                (reason) => this.requestLeave(reason),
                (message) => { void this.showMessage(message); },
                () => { void this.openRoomForm(CommonPdkChatController.formKey, '聊天界面'); },
                this.socialController,
                () => { void this.openRoomForm(CommonPdkVoiceController.formKey, '语音界面'); },
                () => this.voiceController?.finishRecording(),
                () => { void this.openRoomForm(COMMON_SETTINGS_FORM, '设置界面'); },
                (targetSeat) => { void this.forms.show(MagicExpressionPanelController.formKey, targetSeat); },
                () => { void this.openLastSmallSettlement(); },
                this.roomCapabilities,
                ticket.entryOrigin === 'UNION' || Number(ticket.unionId ?? ticket.returnContext?.unionId ?? 0) > 0,
                ticket.ruleSnapshot,
                ticket.ruleFields,
                (active) => this.syncAutoPlay(active),
                (targetSeat) => { void this.openCardSelection(targetSeat); },
                runtime.getGameCode() === PDK_BUSINESS_CODES.LIANGSHAN
                    ? new LS201PlayedCardFlow() : undefined,
            );
            this.playController = play;
            this.chatController = this.roomCapabilities.supportsChat
                ? new CommonPdkChatController(runtime, this.forms, (message) => { void this.showMessage(message); }, this.socialController) : null;
            this.voiceController = this.roomCapabilities.supportsVoice
                ? new CommonPdkVoiceController(this.forms, this.socialController) : null;
            this.settingsController = this.roomCapabilities.supportsSettings
                ? new CommonSettingsController(() => this.forms.close(COMMON_SETTINGS_FORM)) : null;
            this.resultController = new CommonPdkResultController(
                runtime,
                this.forms,
                (reason) => this.requestLeave(reason),
                () => this.shareController?.shareLink(),
                this.smallSettlementForm,
                this.bigSettlementForm,
                (message) => { void this.showMessage(message); },
                this.currentReplayCode,
                this.settlementHistory,
                () => this.playController?.clearCompletedRound(),
            );
            this.dissolveController = this.roomCapabilities.supportsDissolve ? new CommonPdkDissolveController(
                runtime,
                (message) => { void this.showMessage(message); },
                () => this.forms.closeAfterPointer(DISSOLVE_ROOM_FORM),
            ) : null;
            this.shareController = new CommonPdkShareController(runtime, (request) => {
                this.lobbyNode.emit('legacy-share-request', request);
            });
            this.recordController = new CommonPdkRecordController(
                runtime,
                (reason) => this.requestLeave(reason),
                (message) => { void this.showMessage(message); },
                this.shareController,
                () => this.shareController?.shareLink(),
                () => this.forms.close(this.bigSettlementForm),
            );
            controllersReady = true;
            this.inGame = true;
            await runtime.enterRoom(roomId);
            await (roomLayersPending ??= showRoomLayersWhenReady());
            this.lobbyNode.emit('common-pdk-room-ready', {
                ticket, room: runtime.getRoom().GetRoomDataInfo(),
            });
            // The room's connected, painted base UI is the interaction barrier.
            // Optional panels and settlement assets warm only after that barrier;
            // putting their serial decode work before connect/show delayed every
            // lobby and club desk click by several seconds.
            globalThis.setTimeout(() => { void this.preloadDeferredRoomForms(gameCode, ticket.playFamily); }, 0);
        } catch (error: unknown) {
            this.inGame = false;
            this.sourceTicket = null;
            // The visual boundary above is optimistic only after authority connection. Any
            // later initialization failure must reveal the Hall again before recovery feedback.
            this.lobbyNode.active = true;
            console.error('[CommonPdkRoomEntryFailed]', {
                roomId,
                playerId: Number(this.account.accountId ?? this.playerId),
                gameCode,
                playVersion,
                reason: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
            }, error);
            let message = this.roomEntryFailureMessage(error);
            try {
                await this.recoverHall();
            } catch (recoveryError: unknown) {
                const normalizedRecovery = this.roomEntryFailureMessage(recoveryError);
                const detail = normalizedRecovery === '进入游戏失败' ? '大厅恢复失败' : normalizedRecovery;
                message = `${message}；${detail}`;
            }
            await this.showMessage(message);
            throw error;
        } finally {
            this.switching = false;
        }
    }

    private async showRoomLayers(): Promise<void> {
        // CommonRoom must exist before the PDK layer runs onShow, because room
        // information and shared controls are projected during that callback.
        const commonForm = await this.forms.show(COMMON_ROOM_FORM);
        if (commonForm) {
            this.playController?.onCreateCommonRoom(commonForm);
            this.bindDissolveEntry(commonForm.node);
        }
        const roomForm = await this.forms.show(PDK_ROOM_FORM);
        if (roomForm) {
            // Explicit post-show binding closes both cached-form and asynchronous
            // preload races; lifecycle callbacks alone may have run before the
            // current room controller was assigned.
            this.playController?.onCreate(roomForm);
            this.playController?.onShow();
        }
        await this.playController?.waitForInitialPresentation();
    }

    /** A cold Safari preview can fail one bundle request while the next request succeeds. */
    private async preloadRequiredRoomForms(roomId: number): Promise<void> {
        let lastError: unknown;
        for (let attempt = 1; attempt <= 2; attempt += 1) {
            try {
                await Promise.all([
                    this.forms.preload(COMMON_ROOM_FORM),
                    this.forms.preload(PDK_ROOM_FORM),
                ]);
                if (attempt > 1) console.info('[CommonPdkRoomLoadRecovered]', {
                    stage: 'REQUIRED_ROOM_FORMS', roomId, attempt,
                });
                return;
            } catch (error: unknown) {
                lastError = error;
                console.warn('[CommonPdkRoomLoadRetry]', {
                    stage: 'REQUIRED_ROOM_FORMS', roomId, attempt,
                    reason: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
                }, error);
                if (attempt < 2) await this.roomLoadRetryDelay();
            }
        }
        throw lastError;
    }

    private async refreshRoomConnectionWithRetry(
        roomId: number,
        stage: string,
    ): Promise<HallRoomConnectionTicket> {
        let lastError: unknown;
        for (let attempt = 1; attempt <= 2; attempt += 1) {
            try {
                const ticket = await this.refreshRoomConnection(roomId);
                if (attempt > 1) console.info('[CommonPdkRoomLoadRecovered]', { stage, roomId, attempt });
                return ticket;
            } catch (error: unknown) {
                lastError = error;
                console.warn('[CommonPdkRoomLoadRetry]', {
                    stage, roomId, attempt,
                    reason: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
                }, error);
                if (attempt < 2) await this.roomLoadRetryDelay();
            }
        }
        throw lastError;
    }

    private roomLoadRetryDelay(): Promise<void> {
        return new Promise<void>((resolve) => globalThis.setTimeout(resolve, 300));
    }

    private roomEntryFailureMessage(error: unknown): string {
        const message = error instanceof Error ? error.message.trim() : '';
        if (/load failed|failed to fetch|network(?:error| request failed)|fetch failed|aborterror/i.test(message)) {
            return '房间资源或网络加载失败，请重新进入房间';
        }
        return message || '进入游戏失败';
    }

    private async preloadDeferredRoomForms(gameCode: string, playFamily: string | undefined): Promise<void> {
        if (this.disposed || !this.inGame) return;
        try {
            settlementBundlePreloader.preloadForGame(gameCode, playFamily);
            await settlementBundlePreloader.preload('Poker');
            for (const form of [
                this.smallSettlementForm,
                this.bigSettlementForm,
                CommonPdkChatController.formKey,
                CommonPdkVoiceController.formKey,
                MagicExpressionPanelController.formKey,
                COMMON_SETTINGS_FORM,
            ]) {
                if (this.disposed || !this.inGame) return;
                await this.forms.preload(form);
                // Yield between decodes so background warming cannot monopolize
                // the first interactive room frames.
                await new Promise<void>(resolve => globalThis.setTimeout(resolve, 0));
            }
        } catch (error: unknown) {
            console.warn('[CommonPdkRoomWarmup] deferred preload failed', error);
        }
    }

    private registerSmallSettlementForm(formPath: string): void {
        this.forms.register(formPath, {
            zOrder: 24,
            lifecycle: {
                onCreate: (form) => this.resultController?.onCreate(form),
                onShow: (_form, setEnd) => this.resultController?.onShow(setEnd),
                onClose: () => this.resultController?.onClose(),
                onDestroy: () => this.resultController?.destroy(),
            },
        });
    }

    private registerBigSettlementForm(formPath: string): void {
        this.forms.register(formPath, {
            zOrder: 25,
            lifecycle: {
                onCreate: (form) => this.recordController?.onCreate(form),
                onShow: (form, roomEnd) => {
                    // The settlement prefab may be preloaded before a room controller exists.
                    // Bind idempotently at show time so cached forms always receive live handlers.
                    this.recordController?.onCreate(form);
                    this.recordController?.onShow(form, roomEnd);
                },
                onDestroy: () => this.recordController?.destroy(),
            },
        });
    }

    public async enterReplay(playBackCode: string): Promise<void> {
        if (this.switching || this.inGame || !playBackCode) return;
        await this.showMessage('历史回放仅通过大厅战绩接口加载，不再建立旧游戏服会话');
    }

    private requestLeave(reason: string): void {
        void this.leave(reason).catch((error: unknown) => {
            const roomId = Number(this.sourceTicket?.roomId ?? this.sourceTicket?.roomID ?? 0);
            console.error('[AooRoomExit] navigation_failed', {
                reason,
                roomId: Number.isSafeInteger(roomId) && roomId > 0 ? roomId : undefined,
                message: error instanceof Error ? error.message : String(error),
            });
            void this.showMessage(error instanceof Error ? error.message : '退出房间失败，请重试');
        });
    }

    private async showSettlementAfterPresentation(finalSettlement: boolean, setEnd?: unknown): Promise<void> {
        let payload = setEnd && typeof setEnd === 'object' && !Array.isArray(setEnd)
            ? setEnd as Record<string, unknown> : {};
        payload = {
            ...payload,
            ruleSnapshot: payload.ruleSnapshot ?? this.sourceTicket?.ruleSnapshot,
            ruleFields: payload.ruleFields ?? this.sourceTicket?.ruleFields,
            // SetEnd/RoomEnd 的精简事件体不保证重复携带开房选项；结算展示必须
            // 回读当前权威房间快照，不能因事件字段缺省退回默认弹窗模式。
            ruleOptions: payload.ruleOptions ?? this.runtime?.getRoom().GetRoomConfig()?.ruleOptions,
            settlementPresentation: payload.settlementPresentation
                ?? this.runtime?.getRoom().GetRoomProperty('settlementPresentation')
                ?? this.runtime?.getRoom().GetRoomConfig()?.ruleOptions?.settlementPresentation,
        };
        // History belongs to the connected room session, not to the modal. Record
        // the terminal payload before de-duplication or presentation delays can
        // skip opening SmallSettlement for this round.
        this.resultController?.recordSettlement(payload);
        if (!finalSettlement) this.lastSmallSettlementPayload = this.cloneSettlementPayload(payload);
        const roomId = Number(payload.roomId ?? this.runtime?.getRoom().GetRoomProperty('roomId')
            ?? this.runtime?.getRoom().GetRoomProperty('key') ?? 0);
        const stateVersion = Number(payload.stateVersion
            ?? this.runtime?.getRoom().GetRoomProperty('stateVersion') ?? -1);
        const roundNo = Number(payload.roundNo
            ?? this.runtime?.getRoomSet().GetRoomSetProperty('roundNo') ?? 0);
        const operationId = String(payload.operationId ?? '');
        // A round may publish several terminal snapshots with newer versions or
        // operation ids. They are the same settlement and must not repeatedly
        // cancel the two-second FLOATING continuation timer.
        const key = `${roomId}:${roundNo}:${finalSettlement ? 'FINAL' : 'ROUND'}`;
        if (key === this.settlementPendingKey || key === this.settlementShownKey) return;
        const generation = ++this.settlementPresentationGeneration;
        this.settlementPendingKey = key;
        const receivedAt = Date.now();
        const staticRestore = Boolean(payload.staticRestore);
        const settlementPresentation = String(payload.settlementPresentation
            ?? (payload.ruleOptions as Record<string, unknown> | undefined)?.settlementPresentation
            ?? this.runtime?.getRoom().GetRoomProperty('settlementPresentation')
            ?? this.runtime?.getRoom().GetRoomConfig()?.ruleOptions?.settlementPresentation
            ?? '').toUpperCase();
        const matchFinished = Boolean(payload.matchFinished
            ?? this.runtime?.getRoom().GetRoomProperty('matchFinished'));
        console.info('[CommonRoomSettlement]', {
            stage: 'received', key, roomId, roundNo, stateVersion, operationId,
            phase: String(payload.authorityPhase ?? ''), finalSettlement, staticRestore,
        });
        try {
            if (!staticRestore) {
                // Settlement reveal is independent of each device's animation
                // queue. Every client starts the same fixed delay from the same
                // authoritative terminal push, so the winner cannot open first.
                await new Promise<void>((resolve) => globalThis.setTimeout(resolve,
                    settlementPresentation === 'FLOATING' && !matchFinished && !finalSettlement ? 2000 : 1000));
            }
            if (generation !== this.settlementPresentationGeneration || !this.inGame) return;
            // A delayed/reconnect settlement task can finish after both players have
            // continued and Authority has already dealt the next round. Never mount
            // the old modal over a live table.
            if (Number(this.runtime?.getRoom().GetRoomProperty('state') ?? 0) === 1) return;
            // The first terminal projection can precede the complete per-seat
            // settlement payload. Re-read the model after presentation delay so
            // both players render immediately instead of requiring reconnect.
            const latestSetEnd = this.runtime?.getRoomSet().GetRoomSetProperty('setEnd');
            if (latestSetEnd && typeof latestSetEnd === 'object' && !Array.isArray(latestSetEnd)) {
                payload = { ...payload, ...latestSetEnd as Record<string, unknown> };
                this.resultController?.recordSettlement(payload);
                this.lastSmallSettlementPayload = this.cloneSettlementPayload(payload);
            }
            // FLOATING is selected by the authoritative room rule. The server's
            // authoritative settlement timer advances the round; sending a
            // client continue acknowledgement here races that transition and is
            // rejected with 3008 once the next round has already started.
            if (settlementPresentation === 'FLOATING' && !matchFinished && !finalSettlement) {
                if (generation !== this.settlementPresentationGeneration || !this.inGame) return;
                this.settlementShownKey = key;
                return;
            }
            // The terminal round is still a completed round and must be visible as
            // roundLimit/roundLimit in SmallSettlement. BigSettlement is opened by
            // its summary button afterwards; skipping this screen leaves history at
            // 7/8 and makes the final hand appear unrecorded.
            payload = await this.withReplayCode(payload, roomId, roundNo);
            if (generation !== this.settlementPresentationGeneration || !this.inGame) return;
            await this.forms.show(this.smallSettlementForm, payload);
            if (generation !== this.settlementPresentationGeneration || !this.inGame) return;
            this.settlementShownKey = key;
            this.settlementOpenCount += 1;
            console.info('[CommonRoomSettlement]', {
                stage: 'opened', key, roomId, roundNo, stateVersion, operationId,
                finalSettlement, staticRestore, delayMs: Date.now() - receivedAt,
                openCount: this.settlementOpenCount,
            });
        } finally {
            if (this.settlementPendingKey === key) this.settlementPendingKey = '';
        }
    }

    private async withReplayCode(payload: Record<string, unknown>, roomId: number,
                                 roundNo: number): Promise<Record<string, unknown>> {
        const direct = String(payload.replayCode ?? '');
        if (/^(?:\d{6}|\d{7}|\d{8}|\d{11})$/.test(direct)) return payload;
        const setId = Math.max(0, roundNo - 1);
        let lastError: unknown = null;
        for (let attempt = 0; attempt < 3; attempt += 1) {
            try {
                const code = await this.currentReplayCode(roomId, setId);
                if (/^(?:\d{6}|\d{7}|\d{8}|\d{11})$/.test(code)) {
                    return { ...payload, replayCode: code, replaySetId: setId };
                }
            } catch (error: unknown) { lastError = error; }
            if (attempt < 2) await new Promise<void>((resolve) => globalThis.setTimeout(resolve, 120));
        }
        // Settlement is authoritative even when the replay manifest is generated later or its
        // lookup is temporarily unavailable. Open the result first; ResultController continues
        // resolving the same round code and only enables sharing after a valid code arrives.
        console.warn('[CommonRoomSettlement] replay code unavailable', {
            roomId, roundNo, setId, staticRestore: payload.staticRestore === true,
            reason: lastError instanceof Error ? lastError.message : 'invalid-or-empty-code',
        });
        return { ...payload, replayCode: '', replaySetId: setId };
    }

    private cloneSettlementPayload(payload: Record<string, unknown>): Record<string, unknown> {
        if (typeof globalThis.structuredClone === 'function') {
            return globalThis.structuredClone(payload) as Record<string, unknown>;
        }
        return JSON.parse(JSON.stringify(payload)) as Record<string, unknown>;
    }

    public async leave(reason = 'user-exit'): Promise<void> {
        if (this.leavePending) return this.leavePending;
        if (this.disposed || this.switching) return;
        // Start retention before any leave request or form cleanup can mutate the room frame.
        const transition = presentationTransition.begin({
            name: 'game-return-lobby', message: '正在返回大厅...', progress: 0,
            progressKind: 'STAGE', showAfterMs: 0, showDuringProgress: false,
            retainCurrentFrame: true, timeoutMs: 15_000,
        });
        const pending = (async () => {
            await transition.retainCurrentPresentation();
            await this.performLeave(reason, transition);
        })();
        this.leavePending = pending;
        try {
            await pending;
        } catch (error: unknown) {
            transition.cancel();
            throw error;
        } finally {
            if (this.leavePending === pending) this.leavePending = null;
        }
    }

    private async performLeave(reason: string, transition: PresentationTransition): Promise<void> {
        this.roomUiGeneration += 1;
        this.settlementPresentationGeneration += 1;
        this.settlementPendingKey = '';
        this.switching = true;
        const source = this.sourceTicket;
        const roomId = Number(source?.roomId ?? source?.roomID ?? 0);
        const authorityAlreadyExited = reason === 'authority-left' || reason === 'pdk-room-dissolved'
            || reason === 'waiting-room-expired' || reason === 'room-not-found'
            || reason === 'reconnect-room-failed';
        console.info('[AooRoomExit] begin', { reason, roomId, authorityAlreadyExited });
        if (Number.isSafeInteger(roomId) && roomId > 0) {
            try {
                // Hall owns the canonical room lifecycle and verifies the active-room state
                // after the mutation. When Authority has already reported that the room is
                // gone (including a terminal reconnect failure), another Hall leave can only
                // race the removed route and surface HALL_INTERNAL_ERROR. Skip that redundant
                // mutation so the terminal signal can never block navigation away from the
                // retired room screen.
                if (!authorityAlreadyExited) await this.leaveRoom(roomId);
                this.onExplicitLeave();
            } catch (error: unknown) {
                this.switching = false;
                throw error;
            }
        }
        let recoveryError: unknown = null;
        try {
            try {
                // SceneRouter owns the destination Hall login. A page-restored
                // room has no live Hall transport here, so waiting on a request
                // through that retired client only adds a full network timeout.
                await this.recoverHall(false);
            } catch (error: unknown) {
                recoveryError = error;
            }
        } finally {
            this.inGame = false;
            // Close every room-owned overlay before announcing navigation. The
            // launcher handles that announcement synchronously and may destroy
            // this manager before leave() unwinds.
            this.forms.onBeforeExitScene(true);
            this.lobbyNode.active = true;
            this.sourceTicket = null;
            this.lobbyNode.emit('subgame-returned', {
                reason,
                // Deliver terminal feedback through the destination startup
                // channel so room-overlay cleanup cannot erase it mid-transition.
                startupMessage: reason === 'pdk-room-dissolved' ? '房间已解散' : undefined,
                presentationTransition: transition,
                source,
                entryOrigin: source?.entryOrigin ?? (source?.unionId ? 'UNION' : source?.clubId || source?.fromClub ? 'CLUB' : 'GAME_LOBBY'),
                returnContext: source?.returnContext ?? { clubId: source?.clubId, unionId: source?.unionId },
                fromClub: source?.entryOrigin === 'CLUB' || source?.entryOrigin === 'UNION' || Boolean(source?.fromClub),
                hallRecovered: recoveryError === null,
                recoveryError: recoveryError instanceof Error ? recoveryError.message : recoveryError ? String(recoveryError) : '',
            });
            this.switching = false;
        }
        // Recovery failure is carried by subgame-returned. At this point the
        // navigation owner may already have destroyed every room form.
    }

    public destroy(): void {
        if (this.disposed) return;
        this.disposed = true;
        this.roomUiGeneration += 1;
        this.settlementPresentationGeneration += 1;
        this.settlementPendingKey = '';
        setGameReconnectRecipe(null);
        this.externalSwitchGeneration += 1;
        this.dissolveVoteActive = false;
        this.unbindDissolveEntry();
        this.autoPlayVisible = false;
        this.unbindAutoPlay();
        this.forms.close(AUTO_PLAY_FORM);
        this.runtime?.destroy();
        this.runtime = null;
        this.playController?.destroy();
        this.playController = null;
        this.resultController?.destroy();
        this.resultController = null;
        this.dissolveController?.destroy();
        this.dissolveController = null;
        this.recordController?.destroy();
        this.recordController = null;
        this.shareController = null;
        this.chatController?.destroy();
        this.chatController = null;
        this.voiceController?.destroy();
        this.voiceController = null;
        this.magicExpressionController?.destroy();
        this.magicExpressionController = null;
        this.settingsController = null;
        this.socialController?.destroy();
        this.socialController = null;
        this.gameClient?.close();
        this.gameClient = null;
        this.sourceTicket = null;
        this.leavePending = null;
    }

    private async recoverHall(reconnect = true): Promise<void> {
        const game = this.gameClient;
        this.dissolveVoteActive = false;
        this.autoPlayVisible = false;
        this.forms.close(AUTO_PLAY_FORM);
        this.runtime?.destroy();
        this.runtime = null;
        this.playController?.destroy();
        this.playController = null;
        this.resultController?.destroy();
        this.resultController = null;
        this.dissolveController?.destroy();
        this.dissolveController = null;
        this.recordController?.destroy();
        this.recordController = null;
        this.chatController?.destroy();
        this.chatController = null;
        this.voiceController?.destroy();
        this.voiceController = null;
        this.magicExpressionController?.destroy();
        this.magicExpressionController = null;
        this.settingsController = null;
        this.socialController?.destroy();
        this.socialController = null;
        // Hall recovery is a fresh session transition. The room-scoped socket
        // must never request the retired C1110 handoff through hall.dispatch;
        // use the Account service's one-time wsTicket issuer instead.
        game?.close();
        this.gameClient = null;
        if (reconnect && !this.hallClient.isConnected()) {
            await this.hallClient.request('gateway.heartbeat', { clientTime: Date.now() });
        }
    }

    private gatewayEndpoint(): string {
        return resolveRuntimeEndpoints().hallWebSocketUrl;
    }

    private async prepareExternalHandoff(
        ticket: LegacySubgameTicket,
        gameId: number,
        gameName: string,
    ): Promise<void> {
        if (this.switching) return;
        if (!Number.isSafeInteger(gameId) || gameId < 0 || !gameName) {
            await this.showMessage('玩法数据无效，请重新进入');
            return;
        }
        this.switching = true;
        const generation = ++this.externalSwitchGeneration;
        try {
            const server = await this.hallClient.request<GameServerInfo>('room.CBaseGameTypeUrl', { gametype: gameId });
            if (generation !== this.externalSwitchGeneration) return;
            if (server.isStart === false) throw new Error('游戏维护中，请稍后重试');
            const roomId = Number(ticket.roomId ?? ticket.roomID ?? 0);
            if (!Number.isSafeInteger(roomId) || roomId <= 0) throw new Error('房间数据无效，请重新进入');
            const gameToken = (await this.refreshRoomConnection(roomId)).gameTicket;
            if (generation !== this.externalSwitchGeneration) return;
            let consumed = false;
            const consume = (): boolean => {
                if (consumed || generation !== this.externalSwitchGeneration) return false;
                consumed = true;
                setGameRoomReconnectRecipe(Number(ticket.roomId ?? ticket.roomID ?? 0),
                    String(ticket.playVersion ?? ''), this.refreshRoomConnection);
                return true;
            };
            const cancel = (): void => {
                if (consumed || generation !== this.externalSwitchGeneration) return;
                this.externalSwitchGeneration += 1;
                this.switching = false;
            };
            const handoff: LegacyExternalSubgameHandoff = {
                ...ticket,
                gameId,
                gameName,
                gameServerUrl: this.gatewayEndpoint(),
                gameToken,
                consume,
                cancel,
            };
            this.lobbyNode.emit(ticket.playBackCode ? 'authoritative-replay-handoff' : 'authoritative-subgame-handoff', handoff);
        } catch (error: unknown) {
            if (generation === this.externalSwitchGeneration) {
                await this.showMessage(error instanceof Error ? error.message : '进入游戏失败');
            }
        } finally {
            if (generation === this.externalSwitchGeneration) this.switching = false;
        }
    }

    /**
     * 房间预制体只约定同名入口，不携带玩法脚本或资源路径。由公共房间协调器
     * 在实例创建时绑定，销毁时精确解绑，避免缓存房间或重复进入产生多次申请。
     */
    private bindDissolveEntry(root: Node): void {
        this.unbindDissolveEntry();
        const entry = CommonRoomNodePath.dissolveButton.split('/').reduce<Node | null>(
            (node, segment) => node?.getChildByName(segment) ?? null,
            root,
        );
        if (!entry) return;
        entry.active = this.roomCapabilities.supportsDissolve;
        if (!this.roomCapabilities.supportsDissolve) return;
        if (!entry.getComponent(Button)) {
            void this.showMessage('解散房间按钮缺少 Button 组件');
            return;
        }
        entry.on(Button.EventType.CLICK, this.onDissolveEntryClick, this);
        this.dissolveEntry = entry;
        console.info('[RoomDissolve] bound unified entry', { node: CommonRoomNodePath.dissolveButton });
    }

    private unbindDissolveEntry(): void {
        this.dissolveEntry?.off(Button.EventType.CLICK, this.onDissolveEntryClick, this);
        this.dissolveEntry = null;
    }

    private async openDissolveForm(): Promise<boolean> {
        try {
            const form = await this.forms.show(DISSOLVE_ROOM_FORM);
            if (!form || this.disposed || !this.dissolveController) return false;
            this.dissolveController.onCreate(form.node);
            this.dissolveController.onShow();
            return true;
        } catch (error: unknown) {
            console.error('[RoomDissolve] form open failed', error);
            await this.showMessage(error instanceof Error ? error.message : '解散房间界面打开失败');
            return false;
        }
    }

    private async openDissolveRoom(): Promise<void> {
        if (!this.roomCapabilities.supportsDissolve) return;
        const runtime = this.runtime;
        if (!this.inGame || !runtime) return;
        if (this.dissolveEntry?.parent) this.dissolveEntry.parent.active = false;
        const generation = this.roomUiGeneration;
        const roomId = Number(runtime.getRoomManager().GetEnterRoomID());
        if (!Number.isSafeInteger(roomId) || roomId <= 0) {
            void this.showMessage('当前房间数据无效，无法申请解散');
            return;
        }
        if (!await this.openDissolveForm()) return;
        console.info('[RoomDissolve] opening independent dialog and applying', { roomId });
        // 必须由明确的用户点击开启；服务端 StartVoteDissolve 只负责刷新/补开
        // 独立弹窗由表单管理器复用同一个实例，不会叠加弹窗。
        const dissolve = runtime.getRoom().GetRoomProperty('dissolve') as { createPos?: unknown; endSec?: unknown } | null;
        const voteActive = this.dissolveVoteActive
            || (Number(dissolve?.createPos ?? -1) >= 0 && Number(dissolve?.endSec ?? 0) > Date.now() / 1000);
        if (voteActive) return;
        await runtime.action('dissolve', 'common.room.dissolve_req', { roomID: roomId }).catch((error: unknown) => {
            if (this.disposed || generation !== this.roomUiGeneration || !this.forms.isAlive()) return;
            console.error('[RoomDissolve] apply failed', error);
            this.forms.close(DISSOLVE_ROOM_FORM);
            void this.showMessage(error instanceof Error ? error.message : '申请解散失败，请重试');
        });
    }

    private async openCardSelection(targetSeat: number): Promise<void> {
        const runtime = this.runtime;
        if (!runtime || !this.inGame) return;
        const player = runtime.getRoomPosManager().GetPlayerInfoByPos(targetSeat) as Record<string, unknown> | undefined;
        const targetPlayerId = Number(player?.pid ?? 0);
        if (!Number.isSafeInteger(targetPlayerId) || targetPlayerId <= 0) {
            await this.showMessage('该座位当前没有玩家');
            return;
        }
        const ruleOptions = runtime.getRoom().GetRoomConfig()?.ruleOptions;
        if (!ruleOptions || typeof ruleOptions !== 'object' || Array.isArray(ruleOptions)) {
            await this.showMessage('当前玩法牌堆配置缺失');
            return;
        }
        const deckCards = (ruleOptions as Record<string, unknown>).deckCards;
        if (!Array.isArray(deckCards)) {
            await this.showMessage('当前玩法牌堆配置缺失');
            return;
        }
        await this.forms.show(POKER_CARD_SELECTION_FORM, {
            gameCode: runtime.getGameCode(), targetPlayerId, targetSeat,
            // PDK 属于整局一次发完类，因此不显示 CurrentRound / NextRound。
            dealFlow: 'DEAL_ONCE', deckCards: deckCards.map(Number),
        });
    }

    private bindCardSelectionForm(form: LegacyForm): void {
        if (this.cardSelectionRoot === form.node) return;
        this.unbindCardSelectionForm();
        this.cardSelectionRoot = form.node;
        form.node.on('poker-card-selection-submit', this.onCardSelectionSubmit, this);
        form.node.on('poker-card-selection-close', this.onCardSelectionClose, this);
    }

    private showCardSelectionForm(form: LegacyForm, context: unknown): void {
        this.bindCardSelectionForm(form);
        if (!context || typeof context !== 'object' || Array.isArray(context)) {
            throw new Error('扑克选牌上下文缺失');
        }
        const presenter = form.node.getComponent(Poker_Deck_Presenter);
        if (!presenter) throw new Error('PokerTest 缺少 Poker_Deck_Presenter');
        presenter.configure(context as Parameters<Poker_Deck_Presenter['configure']>[0]);
    }

    private unbindCardSelectionForm(): void {
        this.cardSelectionRoot?.off('poker-card-selection-submit', this.onCardSelectionSubmit, this);
        this.cardSelectionRoot?.off('poker-card-selection-close', this.onCardSelectionClose, this);
        this.cardSelectionRoot = null;
    }

    private async submitCardSelection(detail: PokerDeckSelectionSubmit): Promise<void> {
        const runtime = this.runtime;
        if (!runtime || !this.inGame) return;
        const roomId = Number(runtime.getRoomManager().GetEnterRoomID());
        console.info('[PokerCardSelection] submit', {
            roomId, gameCode: detail.gameCode, targetPlayerId: detail.targetPlayerId,
            targetSeat: detail.targetSeat, dealStage: detail.dealStage, cardCount: detail.cards.length,
        });
        try {
            await runtime.action(`cardSelection:${detail.targetSeat}`, `poker.${runtime.getGameCode()}.dispatch`, {
                action: 'selectCards',
                payload: {
                    roomId, targetPlayerId: detail.targetPlayerId, targetSeat: detail.targetSeat,
                    dealStage: detail.dealStage,
                    // Confirm submits the complete local selection once. REPLACE
                    // keeps repeated confirmations idempotent and supports clearing.
                    selectionMode: 'REPLACE',
                    cards: [...detail.cards],
                },
            });
            this.forms.closeAfterPointer(POKER_CARD_SELECTION_FORM);
            await this.showMessage('OK了');
        } catch (error: unknown) {
            console.error('[PokerCardSelection] submit failed', {
                roomId, targetPlayerId: detail.targetPlayerId, targetSeat: detail.targetSeat, error,
            });
            await this.showMessage(error instanceof Error ? error.message : '选牌设置失败');
        }
    }

    private roomMediaClient(): CommonPdkMediaClient | null {
        const globals = globalThis as typeof globalThis & { aooVoiceRecorder?: VoiceRecorder };
        const recorder = globals.aooVoiceRecorder ?? (typeof window !== 'undefined' ? new BrowserVoiceRecorder() : undefined);
        if (!recorder) return null;
        const client = new VoiceMediaClient(
            resolveRuntimeEndpoints().apiBaseUrl,
            async () => String(this.account.accessToken || this.account.token || this.account.accountToken),
            () => ({
                deviceId: String(this.account.deviceId || 'cocos-client'),
                channel: 'pdk-room',
                clientVersion: '3.8.8',
            }),
            recorder,
        );
        return {
            recordVoice: async () => {
                const voice = await client.record();
                if (!voice) return null;
                const codec = voice.mimeType === 'audio/aac' ? 'aac' : voice.mimeType === 'audio/amr' ? 'amr' : 'opus';
                return { bytes: voice.bytes, durationMs: voice.durationMillis, codec };
            },
            stopRecording: () => client.stop(),
            uploadVoice: async (voice) => {
                const mimeType = voice.codec === 'aac' ? 'audio/aac' : voice.codec === 'amr' ? 'audio/amr' : 'audio/ogg';
                const ready = await client.upload({ bytes: voice.bytes, durationMillis: voice.durationMs, mimeType });
                return { mediaId: String(ready.assetId) };
            },
            playVoice: async (mediaId) => {
                const assetId = Number(mediaId);
                if (!Number.isSafeInteger(assetId) || assetId <= 0) throw new Error('语音资源编号无效');
                await client.play(await client.describe(assetId));
            },
            cancel: () => client.cancel(),
        };
    }

    private async showMessage(message: string): Promise<void> {
        await this.forms.show('UIMessage_Drift', null, null, message);
    }
}
