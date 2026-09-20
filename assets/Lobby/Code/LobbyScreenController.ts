import { assetManager, Button, director, EventMouse, EventTouch, game, Label, Layout, Node, RichText, Sprite, UITransform, Vec2 } from 'cc';
import type { AuthenticatedAccount } from '../../Login/Code/Auth/AuthTypes';
import type { RoleSession } from '../../Common/Code/Runtime/role/RoleTypes';
import { LegacyFormManager, type LegacyForm } from '../../Common/Code/Runtime/ui/LegacyFormManager';
import { createMsgDriftLifecycle } from '../../Common/Code/Runtime/ui/MsgDriftLifecycle';
import type { PresentationTransition } from '../../Common/Code/Runtime/ui/PresentationTransitionCoordinator';
import { ProtocolClient } from '../../Common/Code/Runtime/network/ProtocolClient';
import { JoinRoomController } from './JoinRoomController';
import { LobbySessionService } from './LobbySessionService';
import { LobbyTopBarController } from './LobbyTopBarController';
import { HallRoomGateway } from './HallRoomGateway';
import { PlaySelectorController } from '../../Modules/CreateRoom/Code/PlaySelectorController';
import { LobbyClubEntryController } from './ClubList/LobbyClubEntryController';
import {
    CommonPdkSwitchCoordinator,
} from '../../Games/Poker/PDK/Common/Code/Runtime/CommonPdkSwitchCoordinator';
import type {
    LegacyExternalSubgameHandoff,
    LegacySubgameTicket,
} from '../../Common/Code/Runtime/subgame/AuthoritativeSubgameHandoff';
import { CommonPdkGameSceneLauncher } from '../../Games/Poker/PDK/Common/Code/Runtime/CommonPdkGameSceneLauncher';
import { CommonPdkRuntimeEntry } from '../../Games/Poker/PDK/Common/Code/Runtime/CommonPdkRuntimeEntry';
import { createProductionGameRuntimeEntryRegistry } from '../../Games/Common/Code/Runtime/GameRuntimeEntries';
import type { GameRuntimeEntryRegistry } from '../../Games/Common/Code/Runtime/GameRuntimeEntryRegistry';
import { ScjymjSwitchCoordinator } from '../../Common/Code/Runtime/CompatibilityApp/scjymj/ScjymjSwitchCoordinator';
import { HzmjSwitchCoordinator } from '../../Games/Mahjong/Packs/Pack01/Code/Runtime/hzmj/HzmjSwitchCoordinator';
import { A3pkSwitchCoordinator } from '../../Common/Code/Runtime/CompatibilityApp/a3pk/A3pkSwitchCoordinator';
import { AfmjSwitchCoordinator } from '../../Common/Code/Runtime/CompatibilityApp/afmj/AfmjSwitchCoordinator';
import { AhhbmjSwitchCoordinator } from '../../Common/Code/Runtime/CompatibilityApp/ahhbmj/AhhbmjSwitchCoordinator';
import { AhhnmjSwitchCoordinator } from '../../Common/Code/Runtime/CompatibilityApp/ahhnmj/AhhnmjSwitchCoordinator';
import { AhmjSwitchCoordinator } from '../../Common/Code/Runtime/CompatibilityApp/ahmj/AhmjSwitchCoordinator';
import { Ak159mjSwitchCoordinator } from '../../Common/Code/Runtime/CompatibilityApp/ak159mj/Ak159mjSwitchCoordinator';
import { AqmjSwitchCoordinator } from '../../Common/Code/Runtime/CompatibilityApp/aqmj/AqmjSwitchCoordinator';
import { AsmjSwitchCoordinator } from '../../Common/Code/Runtime/CompatibilityApp/asmj/AsmjSwitchCoordinator';
import { AydssSwitchCoordinator } from '../../Common/Code/Runtime/CompatibilityApp/aydss/AydssSwitchCoordinator';
import { AycpSwitchCoordinator } from '../../Common/Code/Runtime/CompatibilityApp/aycp/AycpSwitchCoordinator';
import { AymjSwitchCoordinator } from '../../Common/Code/Runtime/CompatibilityApp/aymj/AymjSwitchCoordinator';
import { AypdkSwitchCoordinator } from '../../Common/Code/Runtime/CompatibilityApp/aypdk/AypdkSwitchCoordinator';
import { BamjSwitchCoordinator } from '../../Common/Code/Runtime/CompatibilityApp/bamj/BamjSwitchCoordinator';
import { BdjhmjSwitchCoordinator } from '../../Common/Code/Runtime/CompatibilityApp/bdjhmj/BdjhmjSwitchCoordinator';
import { ReplayCodeController } from '../../Modules/Records/Code/ReplayCodeController';
import type { LegacyUiInteractionPayload } from '../../Common/Code/Runtime/ui/LegacyPrefabRenderer';
import { legacyPlatformBridge } from '../../Common/Code/Runtime/platform/LegacyPlatformBridge';
import { LobbyModuleCoordinator } from './LobbyModuleCoordinator';
import { ProductionApiClient } from '../../Common/Code/Runtime/Activity/ProductionApiClient';
import { ProtocolHttpClient } from '../../Common/Code/Runtime/network/ProtocolHttpClient';
import { SocialGateway } from '../../Common/Code/Runtime/Social/SocialGateway';
import { SocialController } from '../../Modules/Activity/Social/Code/SocialController';
import { SpectatorGateway } from '../../Common/Code/Runtime/Spectator/SpectatorGateway';
import { SpectatorController } from '../../Common/Code/Runtime/Spectator/SpectatorController';
import { resolveRuntimeEndpoints } from '../../Common/Code/Runtime/config/RuntimeEndpoints';
import { GiftingClient } from '../../Common/Code/Runtime/Gifting/GiftingClient';
import { GiftRoomCardController } from '../../Modules/GiftRoomCard/Code/GiftRoomCardController';
import { ShareInviteGateway } from '../../Common/Code/Runtime/Share/ShareInviteGateway';
import { ShareInviteController } from '../../Common/Code/Runtime/Share/ShareInviteController';
import { InviteDeepLinkRuntime } from '../../Common/Code/Runtime/DeepLink/InviteDeepLinkRuntime';
import { RoomNetworkControllerMount } from '../../Games/Common/Code/Room/RoomNetworkControllerMount';
import { PlayerAvatarService } from '../../Common/Code/UI/PlayerAvatarService';
import type { VoiceRecorder } from '../../Common/Code/Runtime/Voice/VoiceMediaClient';
import { RoomRecoveryStore } from '../../Common/Code/Runtime/room/RoomRecoveryStore';
import { CommonSettingsController } from '../../Common/Code/UI/CommonSettingsController';
import { NoticeController } from '../../Modules/Activity/Social/Code/NoticeController';
import { classifyRefreshFailure, type SessionInvalidationReason } from '../../Login/Code/Network/SessionInvalidation';

export interface AooLobbyStartupOptions {
    readonly restoreLastClubBeforeShow?: boolean;
    readonly restoreClubId?: number;
    readonly startupMessage?: string;
    readonly skipRoomRecovery?: boolean;
}

type LobbyRegionName = 'Top' | 'Bottom' | 'Left' | 'Right' | 'Center';

export class LobbyScreenController {
    private forms: LegacyFormManager | null = null;
    private formLoading = false;
    private formLoadingTimer = 0;
    private gameIds: string[] = [];
    private session: LobbySessionService | null = null;
    private playSelector: PlaySelectorController | null = null;
    private joinRoomController: JoinRoomController | null = null;
    private hallRoomGateway: HallRoomGateway | null = null;
    private clubEntry: LobbyClubEntryController | null = null;
    private subgame: CommonPdkSwitchCoordinator | null = null;
    private commonPdkSceneLauncher: CommonPdkGameSceneLauncher | null = null;
    private commonPdkRuntimeEntry: CommonPdkRuntimeEntry | null = null;
    private gameRuntimeEntries: GameRuntimeEntryRegistry | null = null;
    private scjymj: ScjymjSwitchCoordinator | null = null;
    private hzmj: HzmjSwitchCoordinator | null = null;
    private a3pk: A3pkSwitchCoordinator | null = null;
    private afmj: AfmjSwitchCoordinator | null = null;
    private ahhbmj: AhhbmjSwitchCoordinator | null = null;
    private ahhnmj: AhhnmjSwitchCoordinator | null = null;
    private ahmj: AhmjSwitchCoordinator | null = null;
    private ak159mj: Ak159mjSwitchCoordinator | null = null;
    private aqmj: AqmjSwitchCoordinator | null = null;
    private asmj: AsmjSwitchCoordinator | null = null;
    private aydss: AydssSwitchCoordinator | null = null;
    private aycp: AycpSwitchCoordinator | null = null;
    private aymj: AymjSwitchCoordinator | null = null;
    private aypdk: AypdkSwitchCoordinator | null = null;
    private bamj: BamjSwitchCoordinator | null = null;
    private bdjhmj: BdjhmjSwitchCoordinator | null = null;
    private readonly nodeDisposers: Array<() => void> = [];
    private readonly boundLegacyButtons = new WeakSet<Node>();
    private readonly viewportCapturedMainForms = new WeakSet<Node>();
    private readonly formScopedDisposers: Map<string, Array<() => void>> = new Map();
    private enteringRoom = false;
    private waitingReadyRoomId = 0;
    private waitingReadyAttempt = 0;
    private waitingReadyTimer = 0;
    private readonly mainButtonTapGuard = new Map<string, number>();
    private readonly backTapGuard = new Map<string, number>();
    private readonly systemCloseTapGuard = new Map<string, number>();
    private readonly mainActionBusy = new Set<string>();
    private productionBridge: LobbyModuleCoordinator | null = null;
    private socialController: SocialController | null = null;
    private socialApi: ProductionApiClient | null = null;
    private tokenRefreshPending: Promise<void> | null = null;
    private sessionInvalidated = false;
    private shareController: ShareInviteController | null = null;
    private deepLinkRuntime: InviteDeepLinkRuntime | null = null;
    private spectatorController: SpectatorController | null = null;
    private giftingController: GiftRoomCardController | null = null;
    private roomNetworkControllers: RoomNetworkControllerMount | null = null;
    private lobbySettings: CommonSettingsController | null = null;
    private lobbyNotice: NoticeController | null = null;
    private lobbyTop: LobbyTopBarController | null = null;
    private lifecycleEpoch = 0;
    private disposed = false;
    private avatarUrl = '';
    private readonly formAlias: Record<string, string> = {
        UIServer: 'UIServeice',
        UIServe: 'UIServeice',
        UIFuWuTiaoKuan: 'UIServeice',
        UILingJiang: 'UILingJiang',
        UIGameRecordDetail: 'UILobbyRecords',
        UIUserGameRecord: 'UILobbyRecords',
    };

    public constructor(
        private readonly account: AuthenticatedAccount,
        private readonly role: RoleSession,
        private readonly client: ProtocolClient,
        private readonly resetRuntime: () => void,
        private readonly roomRecovery?: RoomRecoveryStore,
        private readonly startupOptions: AooLobbyStartupOptions = {},
        private readonly invalidateSession: (reason: SessionInvalidationReason) => void = () => undefined,
        private readonly navigateToLobby?: (target?: {
            entryOrigin?: unknown;
            fromClub?: unknown;
            returnContext?: unknown;
            presentationTransition?: PresentationTransition;
            startupMessage?: string;
        }) => Promise<void>,
    ) {}

    public getFormManager(): LegacyFormManager | null {
        return this.forms;
    }

    public async mount(parent: Node): Promise<Node> {
        const epoch = ++this.lifecycleEpoch;
        this.disposed = false;
        this.forms = new LegacyFormManager(parent, (loading) => this.onFormsLoadingChanged(loading), true);
        this.registerCommonSystemForms();
        this.forms.register('UILobbyMain', {
            zOrder: 0,
            lifecycle: {
                onCreate: (form) => {
                    this.applyLegacyRuntimeVisibility(form.node);
                    if (this.startupOptions.restoreLastClubBeforeShow) form.node.active = false;
                    this.setLobbyLabel(form.node, 'Top', ['Player', 'PlayerName'], this.role.displayName || this.account.displayName);
                    this.setLobbyLabel(form.node, 'Top', ['Player', 'PlayerId'], `ID:${this.role.playerId}`);
                    this.setLobbyLabel(form.node, 'Top', ['Balances', 'RoomCard', 'Value'], String(this.role.roomCard));
                    this.setLobbyLabel(form.node, 'Top', ['Balances', 'ClubCard', 'Value'], String(this.role.raw.clubCard ?? 0));
                    this.setLobbyLabel(form.node, 'Top', ['Balances', 'Gold', 'Value'], String(this.role.raw.gold ?? 0));
                    const clientVersion = globalThis.__aoo_RUNTIME_CONFIG__?.clientVersion?.trim() || '0.1.0';
                    this.setLobbyLabel(form.node, 'Top', ['Version'], `V${clientVersion}`);
                    this.updateAvatar(form.node, this.role.headImageUrl);
                    this.installProductionWeChatButton(form.node);
                    this.bindMainLegacyButtons(form.node);
                },
                onLegacyEvent: (form, payload, sourceNode) => {
                    void this.routeLobbyMainButton(form.node, sourceNode, payload);
                },
            },
        });
        this.forms.addDefault('UILobbyMain');
        this.forms.register('UIMessage_Drift', {
            zOrder: 40,
            modal: false,
            lifecycle: createMsgDriftLifecycle(() => this.forms?.close('UIMessage_Drift')),
        });
        const accessToken = () => this.account.accessToken || this.account.token;
        const refreshAccessToken = () => this.refreshAccessToken();
        const shouldRefreshAccessToken = () => this.shouldRefreshAccessToken();
        if (!accessToken()) throw new Error('登录会话缺少访问令牌，请重新登录');
        const hallRoomGateway = new HallRoomGateway(
            accessToken, String(this.role.playerId),
            () => {
                const deviceId = this.account.deviceId?.trim() ?? '';
                if (!deviceId) throw new Error('登录会话缺少设备标识，请重新登录');
                return deviceId;
            },
            refreshAccessToken,
            shouldRefreshAccessToken,
        );
        this.hallRoomGateway = hallRoomGateway;
        this.joinRoomController = new JoinRoomController(this.forms, hallRoomGateway, handoff => {
            this.forms?.close('common/Numpad');
            // The room's clubId describes ownership, not how this player reached it.
            // A room-number join from the game lobby must return to the game lobby even
            // when the selected room belongs to a club. Never infer navigation origin
            // from authoritative room metadata at this boundary.
            this.forms?.get('UILobbyMain')?.node.emit('open-authoritative-subgame', {
                ...handoff,
                entryOrigin: 'GAME_LOBBY',
                fromClub: false,
                returnContext: {},
            });
        });
        this.joinRoomController.install();
        await this.forms.onSceneDidEnter();
        const main = this.forms.get('UILobbyMain');
        if (!main) throw new Error('旧版大厅主界面创建失败');
        this.productionBridge = new LobbyModuleCoordinator(
            this.forms,
            main.node,
            accessToken,
            String(this.role.playerId),
            this.client,
            (error) => this.showProductionError(error),
            refreshAccessToken,
            shouldRefreshAccessToken,
        );
        this.lobbySettings = new CommonSettingsController(() => this.forms?.closeAfterPointer('UILobbySettings'));
        this.lobbyNotice = new NoticeController(this.forms, main.node);
        this.onNode(main.node, 'aoo-competition-room-ready', (payload) => {
            const room = payload as { roomId?: unknown; gameId?: unknown; route?: unknown };
            const roomId = Number(room.roomId ?? 0), gameId = Number(room.gameId ?? 0);
            if (!roomId || !gameId || !String(room.route ?? '')) {
                void this.forms?.show('UIMessage_Drift', null, null, '匹配房间路由无效，请重试');
                return;
            }
            main.node.emit('open-authoritative-subgame', { roomId, gameId,
                gameName: gameId === 629 ? 'pdk' : gameId === 628 ? 'scjymj' : '',
                authorityRoute: String(room.route), matchmaking: true });
        });
        const runtimeConfig = globalThis.__aoo_RUNTIME_CONFIG__ ?? {};
        this.giftingController = new GiftRoomCardController(
            this.forms,
            main.node,
            new GiftingClient(
                runtimeConfig.giftingHttpUrl || resolveRuntimeEndpoints().apiBaseUrl,
                async () => this.account.accessToken ?? this.account.token,
                () => this.account.deviceId ?? runtimeConfig.deviceId ?? 'legacy-cocos-client',
            ),
            Number(this.role.playerId),
            error => this.showProductionError(error),
        );
        this.giftingController.install();
        this.spectatorController = new SpectatorController(main.node,
            new SpectatorGateway(resolveRuntimeEndpoints().apiBaseUrl, accessToken()),
            error => this.showProductionError(error));
        this.spectatorController.install();
        this.socialApi = new ProductionApiClient(accessToken, String(this.role.playerId), undefined, undefined,
            refreshAccessToken, shouldRefreshAccessToken);
        this.socialController = new SocialController(main.node, new SocialGateway(this.socialApi), error => this.showProductionError(error));
        this.socialController.install();
        this.nodeDisposers.push(this.client.on('social.notice.changed', body => main.node.emit('social.notice.changed', body)));
        // A full waiting room is a Hall-session transition, not a ClubMain widget
        // transition. Keep one owner for ticket issuance and scene navigation so
        // server retries, desk refreshes and prefab lifecycles cannot race by
        // issuing several single-use tickets for the same player.
        this.nodeDisposers.push(this.client.on('club.waiting_room_ready', body => {
            const roomId = Number((body as { roomId?: unknown } | null)?.roomId ?? 0);
            if (roomId > 0) this.queueWaitingRoomReady(roomId);
        }));
        this.shareController = new ShareInviteController(main.node, new ShareInviteGateway(this.socialApi), error => this.showProductionError(error));
        this.shareController.install();
        this.deepLinkRuntime = new InviteDeepLinkRuntime(main.node, this.socialApi, () => true, () => true, () => undefined);
        this.roomNetworkControllers = new RoomNetworkControllerMount(
            main.node,
            this.client,
            async () => this.account.accessToken || this.account.token,
            () => (globalThis as typeof globalThis & { aooVoiceRecorder?: VoiceRecorder }).aooVoiceRecorder,
        );
        this.roomNetworkControllers.install();
        const onBack = (): void => {
            const handled = this.forms?.back() ?? false;
            if (!handled) {
                this.forms?.get('UILobbyMain')?.node.emit('legacy-lobby-back-empty');
            }
        };
        this.bindWindowBackHandler(onBack);
        this.onNode(main.node, 'legacy-back', onBack);
        main.node.emit('legacy-back-mounted');
        const top = new LobbyTopBarController(this.forms, {
            playerId: this.role.playerId,
            name: this.role.displayName || this.account.displayName,
            roomCard: this.role.roomCard,
            diamond: this.role.diamond,
            clubCard: Number(this.role.raw.clubCard ?? 0),
            gold: Number(this.role.raw.gold ?? 0),
        });
        top.install();
        this.lobbyTop = top;
        this.commonPdkSceneLauncher = new CommonPdkGameSceneLauncher(
            this.account,
            this.role.playerId,
            roomId => hallRoomGateway.refreshRoomConnection(roomId),
            roomId => hallRoomGateway.leave(roomId),
            () => this.clearRoomNavigationContext(),
            this.navigateToLobby,
            async (roomId, setId) => (await hallRoomGateway.currentReplayCode(roomId, setId)).code,
            roomId => hallRoomGateway.historyDetail(roomId),
        );
        this.subgame = new CommonPdkSwitchCoordinator(
            this.account, this.role.playerId, this.client, this.forms, main.node,
            roomId => hallRoomGateway.refreshRoomConnection(roomId),
            roomId => hallRoomGateway.leave(roomId),
            () => this.clearRoomNavigationContext(),
            async (roomId, setId) => (await hallRoomGateway.currentReplayCode(roomId, setId)).code,
            roomId => hallRoomGateway.historyDetail(roomId),
        );
        this.commonPdkRuntimeEntry = new CommonPdkRuntimeEntry(this.commonPdkSceneLauncher, this.subgame);
        this.gameRuntimeEntries = createProductionGameRuntimeEntryRegistry({
            pdk: this.commonPdkRuntimeEntry,
            lobbyNode: main.node,
            playerId: this.role.playerId,
            onCD299ExitRequested: async roomId => {
                await hallRoomGateway.leave(roomId);
                this.clearRoomNavigationContext();
                this.gameRuntimeEntries?.all().find(entry => entry.id === 'cd299')?.destroy();
            },
        });
        // Start before create-room controls and club restoration are mounted, so
        // the first visible desk click can use the parsed room scene immediately.
        void this.commonPdkRuntimeEntry.preload().catch(() => undefined);
        this.playSelector = new PlaySelectorController(
            this.forms, main.node, top, hallRoomGateway,
            packet => this.enterAuthoritativeSubgame(packet as LegacySubgameTicket),
            message => { void this.forms?.show('UIMessage_Drift', null, null, message); },
            String(this.account.accountId),
        );
        await this.playSelector.install();
        if (!this.isActiveEpoch(epoch)) return main.node;
        this.onNode(main.node, 'legacy-club-prewarm-room', (payload) => {
            const roomId = Number((payload as { roomId?: unknown })?.roomId ?? 0);
            if (!Number.isSafeInteger(roomId) || roomId <= 0) return;
            void hallRoomGateway.prepare(roomId)
                .then(preparation => this.commonPdkSceneLauncher?.prewarm(preparation))
                .catch(() => undefined);
        });
        this.clubEntry = new LobbyClubEntryController(
            this.forms, this.client, main.node, top, this.role.playerId,
            this.role.displayName || this.account.displayName, String(this.account.accountId),
        );
        this.clubEntry.install();
        let startupMessage = this.startupOptions.startupMessage ?? '';
        if (this.startupOptions.restoreLastClubBeforeShow) {
            const restored = await this.clubEntry.restoreLastClub(this.startupOptions.restoreClubId);
            if (!restored) main.node.active = true;
            else startupMessage = '';
        }
        this.scjymj = new ScjymjSwitchCoordinator(
            this.account,
            this.client,
            main.node,
            (message) => { void this.forms?.show('UIMessage_Drift', null, null, message); },
        );
        this.hzmj = new HzmjSwitchCoordinator(
            this.account,
            this.client,
            main.node,
            (message) => { void this.forms?.show('UIMessage_Drift', null, null, message); },
        );
        this.a3pk = new A3pkSwitchCoordinator(
            this.account,
            this.client,
            main.node,
            (message) => { void this.forms?.show('UIMessage_Drift', null, null, message); },
        );
        this.afmj = new AfmjSwitchCoordinator(
            this.account,
            this.client,
            main.node,
            (message) => { void this.forms?.show('UIMessage_Drift', null, null, message); },
        );
        this.ahhbmj = new AhhbmjSwitchCoordinator(
            this.account,
            this.client,
            main.node,
            (message) => { void this.forms?.show('UIMessage_Drift', null, null, message); },
        );
        this.ahhnmj = new AhhnmjSwitchCoordinator(
            this.account, this.client, main.node,
            (message) => { void this.forms?.show('UIMessage_Drift', null, null, message); },
        );
        this.ahmj = new AhmjSwitchCoordinator(
            this.account, this.client, main.node,
            (message) => { void this.forms?.show('UIMessage_Drift', null, null, message); },
        );
        this.ak159mj = new Ak159mjSwitchCoordinator(
            this.account, this.client, main.node,
            (message) => { void this.forms?.show('UIMessage_Drift', null, null, message); },
        );
        this.aqmj = new AqmjSwitchCoordinator(
            this.account, this.client, main.node,
            (message) => { void this.forms?.show('UIMessage_Drift', null, null, message); },
        );
        this.asmj = new AsmjSwitchCoordinator(
            this.account, this.client, main.node,
            (message) => { void this.forms?.show('UIMessage_Drift', null, null, message); },
        );
        this.aydss = new AydssSwitchCoordinator(
            this.account, this.client, main.node,
            (message) => { void this.forms?.show('UIMessage_Drift', null, null, message); },
        );
        this.aycp = new AycpSwitchCoordinator(
            this.account, this.client, main.node,
            (message) => { void this.forms?.show('UIMessage_Drift', null, null, message); },
        );
        this.aymj = new AymjSwitchCoordinator(
            this.account, this.client, main.node,
            (message) => { void this.forms?.show('UIMessage_Drift', null, null, message); },
        );
        this.bdjhmj = new BdjhmjSwitchCoordinator(
            this.account, this.client, main.node,
            (message) => { void this.forms?.show('UIMessage_Drift', null, null, message); },
        );
        this.bamj = new BamjSwitchCoordinator(
            this.account, this.client, main.node,
            (message) => { void this.forms?.show('UIMessage_Drift', null, null, message); },
        );
        this.aypdk = new AypdkSwitchCoordinator(
            this.account, this.role.playerId, this.client, this.forms, main.node,
            roomId => hallRoomGateway.refreshRoomConnection(roomId),
        );
        this.onNode(main.node, 'authoritative-subgame-handoff', (payload) => {
            const handoff = payload as LegacyExternalSubgameHandoff;
            if (this.scjymj?.accepts(handoff)) void this.scjymj.enter(handoff);
            else if (this.hzmj?.accepts(handoff)) void this.hzmj.enter(handoff);
            else if (this.a3pk?.accepts(handoff)) void this.a3pk.enter(handoff);
            else if (this.afmj?.accepts(handoff)) void this.afmj.enter(handoff);
            else if (this.ahhbmj?.accepts(handoff)) void this.ahhbmj.enter(handoff);
            else if (this.ahhnmj?.accepts(handoff)) void this.ahhnmj.enter(handoff);
            else if (this.ahmj?.accepts(handoff)) void this.ahmj.enter(handoff);
            else if (this.ak159mj?.accepts(handoff)) void this.ak159mj.enter(handoff);
            else if (this.aqmj?.accepts(handoff)) void this.aqmj.enter(handoff);
            else if (this.asmj?.accepts(handoff)) void this.asmj.enter(handoff);
            else if (this.aycp?.accepts(handoff)) void this.aycp.enter(handoff);
            else if (this.aydss?.accepts(handoff)) void this.aydss.enter(handoff);
            else if (this.aymj?.accepts(handoff)) void this.aymj.enter(handoff);
            else if (this.aypdk?.accepts(handoff)) void this.aypdk.enter(handoff);
            else if (this.bamj?.accepts(handoff)) void this.bamj.enter(handoff);
            else if (this.bdjhmj?.accepts(handoff)) void this.bdjhmj.enter(handoff);
        });
        this.onNode(main.node, 'authoritative-replay-handoff', (payload) => {
            const handoff = payload as LegacyExternalSubgameHandoff;
            if (this.hzmj?.accepts(handoff)) void this.hzmj.enterReplay(handoff);
        });
        new ReplayCodeController(this.forms, this.client, value => hallRoomGateway.resolveReplayCode(value), (target) => {
            if (target.type === 'SHORT') void this.forms?.show('pdk/AuthoritativeReplay', { roomId: target.roomId, setId: target.setId });
            else if (target.gameName === 'pdk') void this.commonPdkRuntimeEntry?.enterReplay(target);
            else this.commonPdkRuntimeEntry?.enterExternalReplay(target);
        }).install();
        this.onNode(main.node, 'legacy-open-replay-code', () => { void this.forms?.show('UIReplayCode'); });
        this.onNode(main.node, 'legacy-club-open-replay', (target) => {
            const replay = target as { gameName?: unknown; playBackCode?: unknown };
            const gameName = String(replay.gameName ?? '').toLowerCase();
            const playBackCode = String(replay.playBackCode ?? '');
            if (gameName === 'pdk') void this.commonPdkRuntimeEntry?.enterReplay({ gameName, playBackCode });
            else this.commonPdkRuntimeEntry?.enterExternalReplay({ gameName, playBackCode });
        });
        this.onNode(main.node, 'open-authoritative-subgame', (ticket) => {
            void this.enterAuthoritativeSubgame(ticket as LegacySubgameTicket).catch((error: unknown) => {
                this.showProductionError(error);
            });
        });
        this.onNode(main.node, 'legacy-club-join-room', (ticket) => {
            const room = ticket as LegacySubgameTicket;
            void this.enterRoom(String(room.roomKey ?? ''), Number(room.gameId ?? 0),
                Number(room.clubId ?? 0), String(room.gameName ?? ''), Number(room.unionId ?? 0),
                Number(room.roomId ?? 0), Boolean((room as LegacySubgameTicket & { waitingEntry?: boolean }).waitingEntry),
                room as LegacySubgameTicket & Record<string, unknown>);
        });
        this.onNode(main.node, 'legacy-room-operation-failed', (packet) => {
            this.enteringRoom = false;
            const result = packet as { msg?: unknown };
            void this.forms?.show('UIMessage_Drift', null, null, this.roomEntryMessage(result.msg));
        });
        this.onNode(main.node, 'aoo-room-auto-dissolved', (packet) => {
            const value = packet as { message?: unknown };
            this.clearRoomRecoveryIntent();
            main.node.active = true;
            void this.forms?.show('UIMessage_Drift', null, null,
                String(value?.message ?? '房间超过300秒未开始，已自动解散'));
        });
        this.onNode(main.node, 'legacy-player-changed', (body) => this.applyPlayerChanged(main.node, top, body));
        this.onNode(main.node, 'subgame-returned', (payload) => {
            const reason = String((payload as { reason?: unknown })?.reason ?? '');
            if (reason !== 'reconnect-room-failed') this.clearRoomRecoveryIntent();
            const origin = String((payload as { entryOrigin?: unknown })?.entryOrigin ?? 'GAME_LOBBY');
            if (origin === 'CLUB' || origin === 'UNION' || Boolean((payload as { fromClub?: unknown })?.fromClub)) {
                void this.clubEntry?.restoreLastClub();
            }
        });
        this.session = new LobbySessionService(this.client, main.node);
        await this.session.start();
        if (!this.isActiveEpoch(epoch)) return main.node;
        try {
            const unifiedCatalog = await hallRoomGateway.catalog('ALL');
            this.gameIds = this.normalizeGameIds(unifiedCatalog.map(game => String(game.gameId)).filter(Boolean));
        } catch {
            // Catalog availability must not tear down the already-mounted lobby. The
            // request boundary has already applied its bounded retry policy; retain
            // the current catalog state and expose a recoverable business message.
            await this.forms.show('UIMessage_Drift', null, null, '玩法目录暂时不可用，请稍后重试');
        }
        // Region/session initialization can replay serialized design-time
        // visibility. Reapply the 2.2.2 OnShow state after all startup work so
        // restored sessions expose exactly the same lobby controls as first entry.
        this.applyLegacyRuntimeVisibility(main.node);
        // 启动阶段目录、会话与区域数据会异步恢复旧界面显隐；Preview 中按钮可能在首次扫描后才变为可点。
        // 这里在最终可见态后幂等补装一次绑定，保证大厅“创建房间”入口真实点击不会静默丢失。
        this.bindMainLegacyButtons(main.node);
        // Lobby startup may overlap several asynchronous prefab loads. The old
        // client always closes its loading form after the final initialization
        // callback, so explicitly restore that terminal UI state here as well.
        this.formLoading = false;
        if (this.formLoadingTimer) globalThis.clearTimeout(this.formLoadingTimer);
        this.formLoadingTimer = 0;
        this.forms.close('UILobbyDownload');
        this.forms.close('UIWaitForm');
        if (!this.startupOptions.skipRoomRecovery) await this.restoreRoomAfterReload(hallRoomGateway);
        if (startupMessage) await this.forms.show('UIMessage_Drift', null, null, startupMessage);
        // The current surface is interactive first. Deferred forms then enter the
        // cache one at a time so decoding cannot monopolize the reveal frame.
        globalThis.setTimeout(() => { void this.forms?.preloadRefreshSurface(true, 1); }, 0);
        return main.node;
    }

    private async enterAuthoritativeSubgame(handoff: LegacySubgameTicket): Promise<void> {
        this.rememberRoomRecoveryIntent(handoff);
        try {
            const runtimeEntry = this.gameRuntimeEntries?.resolveUnique(handoff);
            if (runtimeEntry) {
                await runtimeEntry.enter(handoff);
                return;
            }
            if (!this.subgame) throw new Error('游戏房间启动器尚未就绪，请重试');
            await this.subgame.enter(handoff);
        } finally {
            this.enteringRoom = false;
        }
    }

    private queueWaitingRoomReady(roomId: number): void {
        if (!Number.isSafeInteger(roomId) || roomId <= 0) return;
        if (this.waitingReadyRoomId !== roomId) {
            this.waitingReadyRoomId = roomId;
            this.waitingReadyAttempt = 0;
        }
        if (this.waitingReadyTimer) return;
        const run = (): void => {
            this.waitingReadyTimer = 0;
            void this.consumeWaitingRoomReady(roomId);
        };
        this.waitingReadyTimer = globalThis.setTimeout(run, this.enteringRoom ? 100 : 0);
    }

    private async consumeWaitingRoomReady(roomId: number): Promise<void> {
        if (this.disposed || this.waitingReadyRoomId !== roomId) return;
        if (this.enteringRoom) {
            this.queueWaitingRoomReady(roomId);
            return;
        }
        this.enteringRoom = true;
        const attempt = ++this.waitingReadyAttempt;
        try {
            const handoff = await this.hallRoomGateway?.activeRoom();
            if (!handoff || Number(handoff.roomId) !== roomId) {
                this.waitingReadyRoomId = 0;
                return;
            }
            if (handoff.waitingFull !== true) throw new Error('权威满员状态尚未可见');
            console.info('[LobbyWaitingRoomReady] handoff-started', {
                roomId, playerId: this.role.playerId, attempt,
            });
            await this.enterAuthoritativeSubgame({
                ...handoff,
                roomKey: roomId,
                clubId: handoff.clubId,
                fromClub: true,
                entryOrigin: 'CLUB',
                returnContext: { clubId: handoff.clubId },
            });
            this.waitingReadyRoomId = 0;
            this.waitingReadyAttempt = 0;
        } catch (error: unknown) {
            console.warn('[LobbyWaitingRoomReady] handoff-retry', {
                roomId, playerId: this.role.playerId, attempt,
                reason: error instanceof Error ? error.message : String(error),
            });
            if (attempt < 10 && this.waitingReadyRoomId === roomId) {
                this.waitingReadyTimer = globalThis.setTimeout(() => {
                    this.waitingReadyTimer = 0;
                    void this.consumeWaitingRoomReady(roomId);
                }, Math.min(1000, attempt * 100));
            } else {
                this.waitingReadyRoomId = 0;
            }
        } finally {
            this.enteringRoom = false;
        }
    }

    private async restoreRoomAfterReload(hallRoomGateway: HallRoomGateway): Promise<void> {
        const intent = this.roomRecovery?.load(this.recoveryAccountId());
        if (this.enteringRoom) return;
        this.enteringRoom = true;
        try {
            // Local recovery intent is only navigation context. Hall/Authority own
            // membership. A cleared cache, reload, or scene reconstruction must not
            // expose an interactive lobby while the same account is still JOINED in
            // an authoritative room; that contradictory UI later causes
            // HALL_ALREADY_IN_ANOTHER_ROOM on the next join.
            const authoritative = intent ? null : await hallRoomGateway.activeRoom();
            if (!intent && !authoritative) {
                this.enteringRoom = false;
                return;
            }
            const roomId = Number(intent?.roomId ?? authoritative?.roomId ?? 0);
            const handoff = intent ? await hallRoomGateway.join(roomId) : authoritative!;
            console.info('[RoomMembershipBoundary] restoring-authoritative-room', {
                roomId,
                playerId: this.role.playerId,
                recoverySource: intent ? 'LOCAL_INTENT' : 'HALL_ACTIVE_ROOM',
                entryOrigin: intent?.entryOrigin ?? 'GAME_LOBBY',
            });
            await this.enterAuthoritativeSubgame({
                ...handoff,
                roomKey: intent?.roomKey ?? handoff.roomId,
                clubId: intent?.clubId ?? handoff.clubId,
                unionId: intent?.unionId,
                fromClub: intent?.fromClub ?? false,
                entryOrigin: intent?.entryOrigin ?? 'GAME_LOBBY',
                returnContext: intent?.returnContext ?? {},
            });
        } catch (error: unknown) {
            // A transient presentation failure is not a room exit. Keep the
            // recovery intent so refresh/retry still reconciles against Hall's
            // authoritative membership instead of stranding the player in an
            // interactive lobby that contradicts the server.
            console.error('[RoomMembershipBoundary] lobby-room-recovery-blocked', {
                roomId: Number(intent?.roomId ?? 0),
                playerId: this.role.playerId,
                operationId: 'LOBBY_ROOM_RECOVERY',
                stateVersion: 0,
                membershipAction: 'PRESERVED',
                error: error instanceof Error ? error.message : String(error),
            });
            await this.forms?.show('UIMessage_Drift', null, null,
                error instanceof Error ? error.message : '房间恢复失败，请刷新重试');
            this.enteringRoom = false;
        }
    }

    private rememberRoomRecoveryIntent(handoff: LegacySubgameTicket): void {
        this.roomRecovery?.save(this.recoveryAccountId(), handoff);
    }

    private clearRoomRecoveryIntent(): void {
        this.roomRecovery?.clear(this.recoveryAccountId());
    }

    private clearRoomNavigationContext(): void {
        this.clearRoomRecoveryIntent();
        this.enteringRoom = false;
        this.joinRoomController?.cancelPending();
        // The lobby controller and its Hall gateway remain alive across an
        // in-place room return. Destroying the create-room selector here leaves
        // the still-visible CreateRoom button with no controller until a full
        // scene reconstruction. Lifetime cleanup belongs to destroy().
    }

    private recoveryAccountId(): string {
        return String(this.account.accountId ?? this.role.playerId);
    }

    private async ensureRequiredBundle(bundleName: string, failureMessage: string): Promise<void> {
        if (assetManager.getBundle(bundleName)) return;
        await new Promise<void>((resolve, reject) => {
            assetManager.loadBundle(bundleName, (error, bundle) => {
                if (error || !bundle) {
                    reject(new Error(`${failureMessage}: ${error?.message ?? bundleName}`));
                    return;
                }
                resolve();
            });
        });
    }

    private registerCommonSystemForms(): void {
        const registerMessageForm = (path: string): void => {
            this.forms?.register(path, {
                zOrder: 20,
                lifecycle: {
                    onShow: (form, ...args) => {
                        this.setSystemMessage(form, this.extractMessageArg(args));
                        this.bindSystemCloseButtons(form);
                    },
                    onClose: () => {
                        if (path === 'UILobbyDraw') this.forms?.get('UILobbyMain')?.node.emit('legacy-luck-draw-close');
                    },
                },
            });
        };
        for (const path of [
            'UILobbyInviteRewards',
            'UIInfo',
            'UIFuWuTiaoKuan',
            'UILobbyFeedback',
            'UIMessage',
            'UIMessageJoin',
            'UIMessageUpdate',
            'UIMessageLostConnect',
            'UIMessageGps',
            'UIMessageTip',
            'UIMessage02',
            'UILobbyLeaderboard',
            'UILobbyRecords',
            'UILobbyRecordItem',
            'UIServeice',
            'UILobbyService',
            'UIServer',
            'UIServe',
            'UILobbyTasks',
            'UILobbyCheckIn',
            'UIDaiLiCopy',
            'UILobbyPromoBind',
            'UILobbyPhoneBind',
            'UILingJiang',
            'UILobbyInviteTask',
            'UILobbyShareImage',
            'UILobbyShare',
            'UIWaitForm',
            'UILuckyDrawShare',
            'UILobbyProfile',
            'UIDaiLiXieYi',
            'UILobbyRealName',
            'UILobbyRemark',
            'UILogin',
            'UILogin01',
            'UILogin02',
            'UIYinSiZhenCe',
            'UILobbyInvite',
            'UILobbyRoomCopy',
            'UILobbyPractice',
            'UILobbyUserRecord',
            'UIWenJuan',
            'UILobbyGift',
            'UILobbyNotice',
            'UILobbyDraw',
        ]) {
            registerMessageForm(path);
        }

        this.forms?.register('UILobbySettings', {
            zOrder: 20,
            lifecycle: {
                onCreate: form => this.lobbySettings?.onCreate(form.node),
                onShow: () => this.lobbySettings?.onShow('general'),
                onDestroy: () => this.lobbySettings?.destroy(),
            },
        });
        for (const path of ['UIStore', 'UIGameHelp']) {
            this.forms?.register(path, {
                // These 2.2.2 page bodies use the shared top navigation form
                // for closing; neither page contains its own return button.
                zOrder: 10,
                lifecycle: {
                    onShow: form => {
                        if (path === 'UIGameHelp') this.productionBridge?.help.show(form);
                        void this.lobbyTop?.push(path);
                    },
                    onClose: () => this.lobbyTop?.pop(path),
                },
            });
        }

        this.forms?.register('UITanChuang', {
            zOrder: 24,
            lifecycle: {
                onShow: (form, ...args) => {
                    this.setSystemMessage(form, this.extractMessageArg(args));
                    this.bindSystemCloseButtons(form);
                },
            },
        });
        this.forms?.register('UILobbyDownload', {
            zOrder: 35,
            lifecycle: {
                onShow: (form, ...args) => {
                    this.setSystemMessage(form, this.extractMessageArg(args), ['LabelMessage', 'label', 'msg']);
                    this.bindSystemCloseButtons(form, ['btn_close', 'btn_cancel', 'btn_sure']);
                },
            },
        });
    }

    private onFormsLoadingChanged(loading: boolean): void {
        if (!this.isActiveEpoch(this.lifecycleEpoch)) return;
        if (!this.forms) return;
        if (loading) {
            if (this.formLoading) return;
            this.formLoading = true;
            const epoch = this.lifecycleEpoch;
            const forms = this.forms;
            this.formLoadingTimer = globalThis.setTimeout(() => {
                this.formLoadingTimer = 0;
                // 切换游戏场景或返回大厅会销毁旧 FormManager。定时器属于旧大厅实例，
                // 必须在访问 diagnostics/show 前同时校验代次、引用与存活状态。
                if (!this.isActiveEpoch(epoch) || this.forms !== forms || !forms.isAlive()
                    || !this.formLoading || !forms.diagnostics().loading) return;
                void forms.show('UIWaitForm');
            }, 120);
            return;
        }
        if (!this.formLoading) return;
        this.formLoading = false;
        if (this.formLoadingTimer) globalThis.clearTimeout(this.formLoadingTimer);
        this.formLoadingTimer = 0;
        this.forms.close('UIWaitForm');
        this.forms.close('UILobbyDownload');
    }

    private extractMessageArg(args: unknown[]): string {
        for (const arg of args) {
            if (typeof arg === 'string' && arg.trim()) return arg.trim();
            if (arg instanceof Error && arg.message.trim()) return arg.message.trim();
            if (typeof arg === 'object' && arg && 'msg' in arg && typeof (arg as { msg?: unknown }).msg === 'string') {
                return String((arg as { msg: string }).msg);
            }
            if (typeof arg === 'object' && arg && 'message' in arg && typeof (arg as { message?: unknown }).message === 'string') {
                return String((arg as { message: string }).message);
            }
        }
        return '';
    }

    private setSystemMessage(form: LegacyForm, message: string, candidates: string[] = ['LabelMessage', 'Label', 'msg', 'label', 'rich_message', 'message']): void {
        if (!message) return;
        const root = form.node;
        const priorityNodes = candidates.flatMap((path) => {
            const byPath = this.find(root, path);
            return byPath ? [byPath] : [];
        });
        const all = priorityNodes.length ? priorityNodes : this.findAll(root, (node) => Boolean(node.getComponent(Label) || node.getComponent(RichText)));
        for (const node of all) {
            const rich = node.getComponent(RichText);
            if (rich) {
                if (rich.string !== message) {
                    rich.string = message;
                    break;
                }
            }
            const label = node.getComponent(Label);
            if (label) {
                if (label.string !== message) {
                    label.string = message;
                    break;
                }
            }
        }
    }

    private bindSystemCloseButtons(form: LegacyForm, fallbackNames: string[] = []): void {
        const previous = this.formScopedDisposers.get(form.name);
        if (previous) {
            for (const dispose of previous) dispose();
        }

        const defaultCloseNames = [
            'btn_close', 'btn_cancel', 'btn_ok', 'btn_yes', 'btn_no', 'btn_sure',
            // Common/Prefab/Message uses Creator camelCase node names.
            'btnSure', 'btnCancel', 'btn_closeshare', 'btn_bg',
        ];
        const candidates = fallbackNames.length ? [...defaultCloseNames, ...fallbackNames] : defaultCloseNames;
        const scopedDisposers: Array<() => void> = [];

        const closeNodes = new Set<Node>();
        for (const name of candidates) {
            const found = this.findAll(form.node, (node) => node.name.toLowerCase().includes(name.toLowerCase()));
            for (const node of found) closeNodes.add(node);
        }
        for (const node of closeNodes) {
            if (!this.isActiveEpoch(this.lifecycleEpoch)) break;
            const closeKey = `${form.name}::${node.uuid ?? node.name}::close`;
            const closeOnce = (): void => {
                if (!this.isActiveEpoch(this.lifecycleEpoch)) return;
                const now = Date.now();
                const last = this.systemCloseTapGuard.get(closeKey) ?? 0;
                if (now - last < 260) return;
                this.systemCloseTapGuard.set(closeKey, now);
                this.forms?.closeAfterPointer(form.name);
            };
            node.on(Button.EventType.CLICK, closeOnce);
            const disposeClick = this.createNodeDisposer(node, Button.EventType.CLICK, closeOnce);
            scopedDisposers.push(disposeClick);
            this.nodeDisposers.push(disposeClick);
        }

        this.formScopedDisposers.set(form.name, scopedDisposers);
    }

    private bindWindowBackHandler(backHandler: () => void): void {
        if (typeof globalThis.window === 'undefined') return;
        const epoch = this.lifecycleEpoch;
        const keyHandler = (event: { key?: string; preventDefault?: () => void; stopPropagation?: () => void; }): void => {
            if (!this.isActiveEpoch(epoch)) return;
            if (event.key !== 'Escape') return;
            const now = Date.now();
            const guardKey = 'escape';
            const last = this.backTapGuard.get(guardKey) ?? 0;
            if (now - last < 180) return;
            this.backTapGuard.set(guardKey, now);
            event.preventDefault?.();
            event.stopPropagation?.();
            backHandler();
        };
        const onPopState = (): void => {
            if (!this.isActiveEpoch(epoch)) return;
            const now = Date.now();
            const guardKey = 'popstate';
            const last = this.backTapGuard.get(guardKey) ?? 0;
            if (now - last < 220) return;
            this.backTapGuard.set(guardKey, now);
            backHandler();
            history.replaceState(null, '', window.location.href);
        };
        window.addEventListener('keydown', keyHandler, false);
        window.addEventListener('popstate', onPopState, false);
        this.nodeDisposers.push(() => window.removeEventListener('keydown', keyHandler, false));
        this.nodeDisposers.push(() => window.removeEventListener('popstate', onPopState, false));
        history.replaceState(null, '', window.location.href);
    }

    private async refreshAccessToken(): Promise<void> {
        if (this.sessionInvalidated || this.disposed) throw new Error('登录会话已失效，请重新登录');
        if (this.tokenRefreshPending) return this.tokenRefreshPending;
        const refreshToken = (this.account.refreshToken || '').trim();
        if (!refreshToken) throw new Error('登录会话缺少刷新令牌，请重新登录');
        this.tokenRefreshPending = (async () => {
            const endpoints = resolveRuntimeEndpoints();
            const response = await ProtocolHttpClient.fetch(new URL('token/refresh', endpoints.accountHttpUrl.replace(/\/?$/, '/')), {
                method: 'POST',
                headers: {
                    'X-Aoo-Api-Version': '1',
                    'X-Device-Id': endpoints.deviceId,
                    'X-Client-Channel': endpoints.clientChannel,
                    'X-Client-Version': endpoints.clientVersion,
                    'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
                },
                body: new URLSearchParams({ refreshToken }).toString(),
            });
            const packet = await response.json().catch(() => ({})) as Record<string, unknown>;
            const data = packet.data && typeof packet.data === 'object' ? packet.data as Record<string, unknown> : packet;
            const access = typeof data.accessToken === 'string' ? data.accessToken : '';
            const refresh = typeof data.refreshToken === 'string' ? data.refreshToken : '';
            const accessExpiresAt = this.tokenExpiry(data.accessExpiresAt);
            const refreshExpiresAt = this.tokenExpiry(data.refreshExpiresAt);
            if (!response.ok || !access || !refresh) {
                const invalidation = classifyRefreshFailure(response.status, packet);
                if (invalidation) {
                    this.sessionInvalidated = true;
                    if (invalidation === 'SESSION_REPLACED') {
                        this.client.confirmSessionReplacement('refresh-401');
                    } else this.invalidateSession(invalidation);
                }
                throw new Error(String(packet.message ?? packet.error ?? '刷新登录会话失败'));
            }
            this.account.accessToken = access;
            this.account.token = access;
            this.account.refreshToken = refresh;
            this.account.accessExpiresAt = accessExpiresAt;
            this.account.refreshExpiresAt = refreshExpiresAt;
            this.account.onSessionRotated?.();
        })();
        try {
            await this.tokenRefreshPending;
        } finally {
            this.tokenRefreshPending = null;
        }
    }

    private shouldRefreshAccessToken(): boolean {
        const expiresAt = this.tokenExpiryMillis(this.account.accessExpiresAt);
        return Number.isFinite(expiresAt) && expiresAt - Date.now() < 120000;
    }

    private tokenExpiry(value: unknown): string | number {
        if (typeof value === 'string' && value.length > 0) return value;
        if (typeof value === 'number' && Number.isFinite(value)) return value;
        return '';
    }

    private tokenExpiryMillis(value: unknown): number {
        if (typeof value === 'number' && Number.isFinite(value)) {
            return value > 100000000000 ? value : value * 1000;
        }
        if (typeof value === 'string' && value.length > 0) {
            const numeric = Number(value);
            if (Number.isFinite(numeric)) return numeric > 100000000000 ? numeric : numeric * 1000;
            const parsed = Date.parse(value);
            if (Number.isFinite(parsed)) return parsed;
        }
        return Number.NaN;
    }

    public destroy(): void {
        if (this.disposed) return;
        this.disposed = true;
        this.lifecycleEpoch += 1;
        this.tokenRefreshPending = null;
        if (this.waitingReadyTimer) globalThis.clearTimeout(this.waitingReadyTimer);
        this.waitingReadyTimer = 0;
        this.waitingReadyRoomId = 0;
        for (const cleanup of this.formScopedDisposers.values()) {
            for (const dispose of cleanup) dispose();
        }
        this.formScopedDisposers.clear();
        for (const dispose of this.nodeDisposers.splice(0)) dispose();
        this.mainButtonTapGuard.clear();
        this.backTapGuard.clear();
        this.systemCloseTapGuard.clear();
        this.mainActionBusy.clear();
        this.joinRoomController?.destroy();
        this.joinRoomController = null;
        this.playSelector?.destroy();
        this.playSelector = null;
        this.socialController?.destroy();
        this.shareController?.destroy();
        this.deepLinkRuntime?.destroy();
        this.shareController = null;
        this.deepLinkRuntime = null;
        this.socialApi?.destroy();
        this.spectatorController?.destroy();
        this.giftingController?.destroy();
        this.roomNetworkControllers?.destroy();
        this.roomNetworkControllers = null;
        this.giftingController = null;
        this.spectatorController = null;
        this.lobbyNotice?.destroy();
        this.lobbyNotice = null;
        this.lobbyTop = null;
        this.lobbySettings?.destroy();
        this.lobbySettings = null;
        this.productionBridge?.destroy();
        this.productionBridge = null;
        this.gameRuntimeEntries?.destroy();
        this.gameRuntimeEntries = null;
        this.commonPdkRuntimeEntry = null;
        this.subgame = null;
        this.commonPdkSceneLauncher = null;
        this.scjymj?.destroy();
        this.scjymj = null;
        this.hzmj?.destroy();
        this.hzmj = null;
        this.a3pk?.destroy();
        this.a3pk = null;
        this.afmj?.destroy();
        this.afmj = null;
        this.ahhbmj?.destroy();
        this.ahhbmj = null;
        this.ahhnmj?.destroy();
        this.ahhnmj = null;
        this.ahmj?.destroy();
        this.ahmj = null;
        this.ak159mj?.destroy();
        this.ak159mj = null;
        this.aqmj?.destroy();
        this.aqmj = null;
        this.asmj?.destroy();
        this.asmj = null;
        this.aydss?.destroy();
        this.aydss = null;
        this.aycp?.destroy();
        this.aycp = null;
        this.aymj?.destroy();
        this.aymj = null;
        this.aypdk?.destroy();
        this.aypdk = null;
        this.bamj?.destroy();
        this.bamj = null;
        this.bdjhmj?.destroy();
        this.bdjhmj = null;
        this.clubEntry?.dispose();
        this.clubEntry = null;
        this.session?.destroy();
        this.session = null;
        this.avatarUrl = '';
        if (this.formLoadingTimer) globalThis.clearTimeout(this.formLoadingTimer);
        this.formLoadingTimer = 0;
        this.formLoading = false;
        this.forms?.destroy();
        this.forms = null;
    }

    private async enterRoom(
        roomKey: string,
        gameType: number,
        clubId = 0,
        gameName = '',
        unionId = 0,
        existingRoomId = 0,
        waitingEntry = false,
        selectedDesk?: LegacySubgameTicket & Record<string, unknown>,
    ): Promise<void> {
        const epoch = this.lifecycleEpoch;
        if (!roomKey) return;
        if (this.enteringRoom) return;
        const stableGameCode = gameName.trim().toUpperCase();
        const isRegionalPdk = stableGameCode === 'CD201'
            || stableGameCode === 'NJ201' || stableGameCode === 'LS201';
        // SCJYMJ (628) now has a native 3.8.8 runtime. It must first execute
        // the authoritative hall enter-room request just like PDK so the
        // asynchronous response carries roomID into the one-time handoff.
        if (!isRegionalPdk && gameType !== 629 && gameType !== 628 && gameType !== 399 && gameType !== 376 && gameType !== 308 && gameType !== 272 && gameType !== 174 && gameType !== 254 && gameType !== 232 && gameType !== 407 && gameType !== 0) {
            if (!this.isActiveEpoch(epoch)) return;
            this.forms?.close('common/Numpad');
            this.subgame && this.mainNodeExternalBoundary(gameType, gameName, roomKey);
            return;
        }
        this.enteringRoom = true;
        const entryOrigin = unionId > 0 ? 'UNION' : clubId > 0 ? 'CLUB' : 'GAME_LOBBY';
        const returnTarget = {
            entryOrigin,
            fromClub: clubId > 0,
            returnContext: { clubId, unionId },
        };
        try {
            if (waitingEntry && this.hallRoomGateway) {
                const current = await this.client.request<Record<string, unknown>>('room.CBaseRoomConfig', {});
                const currentRoomId = Number(current?.roomID ?? current?.roomId ?? 0);
                const sameSelectedDesk = currentRoomId > 0 && this.sameWaitingDesk(current, selectedDesk);
                const enterCurrentWaitingRoom = currentRoomId > 0
                    && (currentRoomId === existingRoomId || sameSelectedDesk);
                if (enterCurrentWaitingRoom && existingRoomId <= 0) existingRoomId = currentRoomId;
                console.info('[ClubWaitingDesk] tap-routing', {
                    clubId, playerId: this.role.playerId,
                    currentRoomId, selectedRoomId: existingRoomId,
                    sameSelectedDesk, action: enterCurrentWaitingRoom ? 'ENTER' : currentRoomId > 0 ? 'SWITCH' : 'SEAT',
                });
                if (!enterCurrentWaitingRoom) {
                    const changedDesk = currentRoomId > 0 && !sameSelectedDesk;
                    if (changedDesk) {
                        await this.hallRoomGateway.leaveWaiting(currentRoomId);
                    }
                    let waitingRoomId = existingRoomId;
                    if (existingRoomId > 0) {
                        await this.hallRoomGateway.joinWaiting(existingRoomId);
                    } else {
                        const created = await this.client.request<{ roomId?: unknown; roomID?: unknown }>(
                            'room.CBaseEnterRoom', {
                                roomKey, posID: -1, password: '', clubId, existQuickJoin: false,
                            });
                        waitingRoomId = Number(created?.roomId ?? created?.roomID ?? 0);
                    }
                    if (changedDesk) {
                        await this.forms?.show('UIMessage_Drift', null, null, '换桌成功');
                    }
                    // Waiting entry keeps the player in the club after seating.
                    // RoomDetails now belongs to ClubMain, so ask its controller to
                    // reveal the embedded node instead of loading a second prefab.
                    try {
                        const waitingRoom = await this.client.request<Record<string, unknown>>(
                            'room.CBaseRoomConfig', {});
                        if (Number(waitingRoom.roomID ?? waitingRoom.roomId ?? waitingRoomId) > 0) {
                            this.mainNode.emit('legacy-club-show-current-room', waitingRoom);
                        }
                    } catch {
                        // The seat has already been committed. A transient detail
                        // read must not turn a successful wait into an entry failure;
                        // club restoration retries the authoritative room query.
                    }
                    this.enteringRoom = false;
                    return;
                }
                if (currentRoomId > 0 && currentRoomId !== existingRoomId) {
                    await this.hallRoomGateway.leaveWaiting(currentRoomId);
                }
            }
            const entered = existingRoomId > 0 ? { roomId: existingRoomId } :
                await this.client.request<{ roomId?: unknown; roomID?: unknown }>('room.CBaseEnterRoom', {
                    roomKey, posID: -1, password: '', clubId, existQuickJoin: false,
                });
            const roomId = Number(entered?.roomId ?? entered?.roomID ?? 0);
            if (Number.isSafeInteger(roomId) && roomId > 0 && this.hallRoomGateway) {
                // Waiting players are already JOINED before the room-ready push.
                // Replaying the ordinary join mutation from every client races the
                // full-room transition and can leave both launchers behind the
                // navigation cover. Resume only the committed membership and issue
                // an independent one-time game ticket for each player.
                const handoff = existingRoomId <= 0 && clubId > 0
                        ? await this.hallRoomGateway.resumeCommittedClubEntry(roomId)
                        : await this.hallRoomGateway.join(roomId);
                await this.enterAuthoritativeSubgame({
                    ...handoff,
                    roomKey: roomId,
                    clubId,
                    unionId,
                    fromClub: clubId > 0,
                    entryOrigin,
                    // 2.2.2 的亲友圈/联盟返回链始终保留入口俱乐部。房间 handoff
                    // 只描述游戏连接，不能覆盖大厅返回所需的联盟上下文。
                    returnContext: returnTarget.returnContext,
                });
            }
        } catch (error: unknown) {
            if (!this.isActiveEpoch(epoch)) return;
            this.enteringRoom = false;
            const message = this.roomEntryMessage(error);
            await this.forms?.show('UIMessage_Drift', null, null,
                message);
            return;
        }
        if (!this.isActiveEpoch(epoch)) return;
        this.enteringRoom = false;
    }

    /** A template desk and its instantiated waiting room are the same clickable desk. */
    private sameWaitingDesk(current: Record<string, unknown>,
        selected?: LegacySubgameTicket & Record<string, unknown>): boolean {
        if (!selected) return false;
        const currentTag = Number(current.tagId ?? current.configId ?? 0);
        const selectedTag = Number(selected.tagId ?? selected.configId ?? 0);
        if (currentTag > 0 && selectedTag > 0) return currentTag === selectedTag;
        const currentTemplate = String(current.templateCode ?? current.clubTemplateCode ?? '').trim();
        const selectedTemplate = String(selected.templateCode ?? selected.clubTemplateCode ?? '').trim();
        if (currentTemplate && selectedTemplate) return currentTemplate === selectedTemplate;
        return Number(current.gameId ?? 0) === Number(selected.gameId ?? 0)
            && String(current.roomName ?? '').trim() === String(selected.roomName ?? '').trim();
    }

    private roomEntryMessage(reason: unknown): string {
        const message = String(reason instanceof Error ? reason.message : reason ?? '').trim();
        if (/password/i.test(message)) return '房间密码错误';
        if (/full|人数已满/i.test(message)) return '房间人数已满';
        if (/started|playing|已开局/i.test(message)) return '房间已经开局';
        if (/disabled|stopped|停用/i.test(message)) return '该模板桌已停用';
        if (/NotEnough_(?:RoomCard|Currency)|owner room-card balance is insufficient/i.test(message)) {
            return '房主房卡不足，暂时无法进入';
        }
        if (/NotFind_Room|room not found/i.test(message)) return '房间暂不可用，请刷新后重试';
        if (/club manager role required to create rooms/i.test(message)) return '模板桌进入链异常，请刷新后重试';
        if (message && /[\u3400-\u9fff]/.test(message)) return message;
        return '进入房间失败，请稍后重试';
    }

    private normalizeGameIds(gameIds: readonly string[]): string[] {
        const normalized = [...new Set(gameIds.map(String).filter(Boolean))];
        return normalized;
    }

    private isActiveEpoch(epoch: number): boolean {
        return !this.disposed && this.lifecycleEpoch === epoch;
    }

    private mainNodeExternalBoundary(gameType: number, gameName: string, roomKey: string): void {
        // Preserve the old external-subgame boundary without pretending that an
        // unavailable external package is PDK.
        this.forms?.get('UILobbyMain')?.node.emit('authoritative-subgame-handoff', {
            gameId: gameType, gameName, roomKey,
        });
    }

    private routeLobbyMainButton(
        formRoot: Node,
        sourceNode: Node | null,
        payload: LegacyUiInteractionPayload,
    ): void {
        if (!this.isActiveEpoch(this.lifecycleEpoch)) return;
        const buttonName = this.getLegacyButtonName(sourceNode, payload);
        this.routeMainButton(formRoot, buttonName, payload);
    }

    private routeMainButton(
        formRoot: Node,
        buttonName: string,
        payload?: LegacyUiInteractionPayload,
    ): void {
        if (!this.isActiveEpoch(this.lifecycleEpoch)) return;
        const normalized = buttonName.trim();
        if (!normalized) return;
        const routeGuardKey = `main-route:${normalized}`;
        const routeNow = Date.now();
        const lastRoute = this.mainButtonTapGuard.get(routeGuardKey) ?? 0;
        if (routeNow - lastRoute < 220) return;
        this.mainButtonTapGuard.set(routeGuardKey, routeNow);
        if (payload?.handler === 'CloseForm' || payload?.handler === 'OnClick_Close') {
            this.forms?.closeAfterPointer(formRoot.name);
            return;
        }
        switch (normalized) {
            case 'logo':
                return;
            case 'btn_club':
                void this.clubEntry?.openAll();
                return;
            case 'JoinClub':
                void this.clubEntry?.openAll();
                return;
            case 'JoinRoom':
                console.info('[LobbyJoinRoomEntry]', {
                    action: 'OPEN_NUMPAD',
                    controllerReady: Boolean(this.joinRoomController),
                    disposed: this.disposed,
                    lifecycleEpoch: this.lifecycleEpoch,
                    scene: director.getScene()?.name ?? '',
                });
                void this.forms?.show('common/Numpad').then(form => {
                    console.info('[LobbyJoinRoomEntry]', {
                        action: form?.isShown() ? 'NUMPAD_SHOWN' : 'NUMPAD_UNAVAILABLE',
                        lifecycleEpoch: this.lifecycleEpoch,
                    });
                });
                return;
            case 'CreateRoom':
                this.openCreateRoomSelector();
                return;
            case 'Practice':
                this.safeShowForm('UILobbyPractice');
                return;
            case 'Avatar':
                this.runMainAction(normalized, () => this.productionBridge?.profile.open());
                return;
            case 'More':
                void this.toggleMorePanel(formRoot);
                return;
            case 'Shop':
                this.runMainAction(normalized, () => this.productionBridge?.store.open());
                return;
            case 'record':
            case 'Record':
            case 'Records':
                this.runMainAction(normalized, () => this.productionBridge?.replay.open());
                return;
            case 'btn_paihang':
                this.runMainAction(normalized, () => this.productionBridge?.rank.open());
                return;
            case 'BindPromotion':
                this.safeShowForm('UILobbyPromoBind');
                return;
            case 'Feedback':
                this.openFeedback();
                return;
            case 'Share':
                this.safeShowForm('UILobbyShare');
                return;
            case 'CheckIn':
                this.runMainAction(normalized, () => this.productionBridge?.task.open('UILobbyCheckIn'));
                return;
            case 'Settings':
            case 'btn_shezhi':
                this.runMainAction(normalized, async () => {
                    const settings = await this.forms?.show('UILobbySettings');
                    if (settings) this.lobbySettings?.onShow('general');
                });
                return;
            case 'Notice':
                this.runMainAction(normalized, () => this.lobbyNotice?.open());
                return;
            case 'Agent':
                this.safeShowForm('UIDaiLiCopy');
                return;
            case 'Rebate':
                this.runMainAction(normalized, () => this.productionBridge?.task.open());
                return;
            case 'Support':
                this.runMainAction(normalized, async () => { this.productionBridge?.support.open(); });
                return;
            case 'Help':
                this.safeShowForm('UIGameHelp', 'pdk');
                return;
            case 'Report':
                this.runMainAction(normalized, async () => { this.productionBridge?.roomSafety.open(); });
                return;
            case 'VerifyIdentity':
                this.runMainAction(normalized, () => this.productionBridge?.identity.openRealName());
                return;
            case 'BindPhone':
            case 'Bind':
                this.runMainAction(normalized, () => this.productionBridge?.identity.openPhone());
                return;
            case 'BindWeChat':
                this.forms?.get('UILobbyMain')?.node.emit('aoo-wechat-bind');
                return;
            case 'GiftRoomCard':
                if (!this.giftingController) {
                    const runtimeConfig = globalThis.__aoo_RUNTIME_CONFIG__ ?? {};
                    this.showProductionError(new Error(
                        runtimeConfig.giftingUnavailableMessage ?? '赠送功能当前未启用，请稍后再试',
                    ));
                    return;
                }
                this.runMainAction(normalized, () => this.giftingController?.open());
                return;
            case 'InviteRewards':
                this.runMainAction(normalized, () => this.productionBridge?.task.open('UILobbyInviteRewards'));
                return;
            case 'LuckyDraw':
                this.productionBridge?.luckDraw.open();
                return;
            case 'Bounty':
                this.runMainAction(normalized, () => this.productionBridge?.task.open());
                return;
            case 'AddRoomCard':
                this.runMainAction(normalized, () => this.productionBridge?.store.open('btn_table2'));
                return;
            case 'btn_uploadImg_test':
                this.handleUploadImgTest();
                return;
            case 'Logout':
                void this.confirmAccountLogout();
                return;
            case 'AddGold':
                this.runMainAction(normalized, () => this.productionBridge?.store.open('btn_table0'));
                return;
            case 'AddClubCard':
                this.runMainAction(normalized, () => this.productionBridge?.store.open('btn_table1'));
                return;
            case 'btn_location':
                this.runMainAction(normalized, () => this.productionBridge?.location.open());
                return;
            case 'btn_pdk':
                this.openCreateGame('pdk');
                return;
            default:
                break;
        }
        // Do not treat every legacy btn_* asset name as a game entry. 2.2 UI
        // sprites such as the Records icon report their source name (`btn_zj`)
        // through the compatibility event path; routing those names here opens
        // the room selector on top of the intended form. Serialized game entry
        // `btn_pdk` is handled explicitly above.
    }

    private runMainAction(key: string, action: () => Promise<unknown> | undefined): void {
        if (this.mainActionBusy.has(key) || !this.isActiveEpoch(this.lifecycleEpoch)) return;
        const pending = action();
        if (!pending) return;
        this.mainActionBusy.add(key);
        void pending.then(
            () => this.mainActionBusy.delete(key),
            () => this.mainActionBusy.delete(key),
        );
    }

    private bindMainLegacyButtons(formRoot: Node): void {
        for (const node of this.findAll(formRoot, (candidate) => {
            return this.isLobbyMainInteractiveNode(candidate);
        })) {
            this.bindSingleLegacyButton(node, formRoot, candidate => this.routeMainButton(formRoot, candidate.name));
        }
        this.installMainEntryViewportCapture(formRoot);
    }

    private installMainEntryViewportCapture(formRoot: Node): void {
        if (this.viewportCapturedMainForms.has(formRoot)) {
            return;
        }
        this.viewportCapturedMainForms.add(formRoot);
        const supportedEntryNames = new Set(['CreateRoom', 'JoinRoom', 'record', 'Record', 'Records']);
        const invokeWhenInside = (location: Vec2): boolean => {
            if (!formRoot.isValid) return false;
            const matched = this.findAll(formRoot, candidate => supportedEntryNames.has(candidate.name))
                .flatMap(node => {
                    if (!node.activeInHierarchy) return [];
                    const bounds = node.getComponent(UITransform)?.getBoundingBoxToWorld();
                    return bounds?.contains(location) ? [{ node, area: bounds.width * bounds.height }] : [];
                })
                .sort((left, right) => left.area - right.area)[0];
            if (!matched) return false;
            // 旧大厅存在透明或重叠热区；同一点命中多个入口时，以面积最小的实际按钮为准。
            // 捕获层仍只在入口自身世界矩形内转发，并继续走统一路由与防重入守卫。
            this.routeMainButton(formRoot, matched.node.name);
            return true;
        };
        const invokeEventTarget = (target: unknown): 'handled' | 'overlay' | 'miss' => {
            if (!(target instanceof Node)) return 'miss';
            let current: Node | null = target;
            let matchedName = '';
            while (current) {
                if (!matchedName && supportedEntryNames.has(current.name)) matchedName = current.name;
                if (current === formRoot) {
                    if (!matchedName) return 'miss';
                    this.routeMainButton(formRoot, matchedName);
                    return 'handled';
                }
                current = current.parent;
            }
            // The event belongs to an overlay form rather than LobbyMain.
            // Never project that coordinate back through the covered lobby buttons.
            return 'overlay';
        };
        const captureTouch = (event: EventTouch): void => {
            const result = invokeEventTarget(event.target);
            if (result === 'handled' || (result === 'miss' && invokeWhenInside(event.getUILocation()))) {
                event.propagationStopped = true;
                event.propagationImmediateStopped = true;
            }
        };
        const captureMouse = (event: EventMouse): void => {
            const result = invokeEventTarget(event.target);
            if (result === 'handled' || (result === 'miss' && invokeWhenInside(event.getUILocation()))) {
                event.propagationStopped = true;
                event.propagationImmediateStopped = true;
            }
        };
        const roots = [...new Set([formRoot, formRoot.scene].filter((node): node is Node => !!node))];
        for (const root of roots) {
            if (!(root instanceof Node) || typeof root.on !== 'function' || !root.isValid) continue;
            root.on(Node.EventType.TOUCH_END, captureTouch, this, true);
            root.on(Node.EventType.MOUSE_UP, captureMouse, this, true);
            this.nodeDisposers.push(this.createNodeDisposer(root, Node.EventType.TOUCH_END, captureTouch, this, true));
            this.nodeDisposers.push(this.createNodeDisposer(root, Node.EventType.MOUSE_UP, captureMouse, this, true));
        }
    }

    private installProductionWeChatButton(formRoot: Node): void {
        if (this.findDescendant(formRoot, 'BindWeChat')) return;
        const buttonNode = new Node('BindWeChat');
        buttonNode.addComponent(UITransform).setContentSize(150, 46);
        buttonNode.setPosition(-430, 5.5, 0);
        buttonNode.addComponent(Button);
        const textNode = new Node('Label');
        textNode.addComponent(UITransform).setContentSize(150, 46);
        const label = textNode.addComponent(Label);
        label.string = '绑定微信';
        label.fontSize = 24;
        label.lineHeight = 30;
        buttonNode.addChild(textNode);
        this.lobbyNode(formRoot, 'Bottom').addChild(buttonNode);
    }

    private bindSingleLegacyButton(
        node: Node,
        formRoot: Node,
        routeName: (buttonNode: Node) => void,
    ): void {
        // Ignore stale deserialized entries during a Creator prefab reimport
        // instead of aborting the entire lobby mount.
        if (!(node instanceof Node) || typeof node.on !== 'function' || !node.isValid) return;
        if (this.boundLegacyButtons.has(node)) {
            return;
        }
        this.boundLegacyButtons.add(node);
        const epoch = this.lifecycleEpoch;
        const target = `${formRoot.name}/${node.uuid ?? node.name}`;
        const eventGuardKey = `legacy-btn:${target}`;
        const targetHandler = (): void => {
            if (!this.isActiveEpoch(epoch)) return;
            const now = Date.now();
            const lastFire = this.mainButtonTapGuard.get(target) ?? 0;
            if (now - lastFire < 220) return;
            this.mainButtonTapGuard.set(target, now);
            routeName(node);
        };
        node.on(Button.EventType.CLICK, targetHandler);
        node.on(Node.EventType.TOUCH_END, targetHandler);
        node.on(Node.EventType.MOUSE_UP, targetHandler);
        this.nodeDisposers.push(this.createNodeDisposer(node, Button.EventType.CLICK, targetHandler));
        this.nodeDisposers.push(this.createNodeDisposer(node, Node.EventType.TOUCH_END, targetHandler));
        this.nodeDisposers.push(this.createNodeDisposer(node, Node.EventType.MOUSE_UP, targetHandler));
        const listener = (): void => {
            if (!this.isActiveEpoch(epoch)) return;
            const now = Date.now();
            const lastFire = this.mainButtonTapGuard.get(eventGuardKey) ?? 0;
            if (now - lastFire < 220) return;
            this.mainButtonTapGuard.set(eventGuardKey, now);
            targetHandler();
        };
        const legacyListener = (_payload: unknown): void => listener();
        node.on('legacy-ui-event', legacyListener);
        this.nodeDisposers.push(this.createNodeDisposer(node, 'legacy-ui-event', legacyListener));
    }

    private isLobbyMainInteractiveNode(node: Node): boolean {
        if (!node.getComponent(Button)) return false;
        return node.name !== 'JoinRoomGlow';
    }

    private getLegacyButtonName(sourceNode: Node | null, payload: LegacyUiInteractionPayload): string {
        if (sourceNode?.name) return sourceNode.name;
        if (payload.sourceName) return payload.sourceName;
        return '';
    }

    private openCreateGame(gameName: string): void {
        if (!gameName) return;
        void this.playSelector?.open(gameName, { gameList: this.gameIds });
    }

    private openCreateRoomSelector(): void {
        const selector = this.playSelector;
        console.info('[LobbyCreateRoomEntry]', {
            action: 'CLICK',
            controllerReady: Boolean(selector),
            disposed: this.disposed,
            lifecycleEpoch: this.lifecycleEpoch,
            scene: director.getScene()?.name ?? '',
        });
        if (!selector) {
            void this.forms?.show('UIMessage_Drift', null, null, '创建房间功能正在初始化，请稍后重试');
            return;
        }
        void selector.open().catch((error: unknown) => this.showProductionError(error));
    }

    private openFeedback(): void {
        this.runMainAction('Feedback', () => this.productionBridge?.feedback.open());
    }

    private showProductionError(error: unknown): void {
        const record = error && typeof error === 'object' ? error as { message?: unknown; code?: unknown } : {};
        const message = String(record.message ?? record.code ?? error ?? '服务暂不可用，请稍后重试');
        console.error('[LobbyScreenController]', message, error);
        if (this.disposed || !this.forms?.isAlive()) return;
        void this.forms?.show('UIMessage_Drift', null, null, message);
    }

    private applyPlayerChanged(root: Node, top: LobbyTopBarController, body: unknown): void {
        if (!body || typeof body !== 'object') return;
        const packet = body as Record<string, unknown>;
        const property = String(packet.Property ?? packet.property ?? '');
        const value = packet.Value ?? packet.value ?? packet[property];
        if (property === 'gold') {
            this.setLobbyLabel(root, 'Top', ['Balances', 'Gold', 'Value'], String(value ?? 0));
            top.setGold(Number(value ?? 0));
        }
        if (property === 'roomCard') {
            this.setLobbyLabel(root, 'Top', ['Balances', 'RoomCard', 'Value'], String(value ?? 0));
            top.setRoomCard(Number(value ?? 0));
        }
        if (property === 'clubCard') {
            this.setLobbyLabel(root, 'Top', ['Balances', 'ClubCard', 'Value'], String(value ?? 0));
            top.setClubCard(Number(value ?? 0));
        }
        if (property === 'name') this.setLobbyLabel(root, 'Top', ['Player', 'PlayerName'], String(value ?? '').slice(0, 9));
        if (property === 'headimg') this.updateAvatar(root, String(value ?? this.role.headImageUrl));
    }

    private updateAvatar(root: Node, url: string): void {
        const resolvedUrl = PlayerAvatarService.url(this.role.playerId, url);
        if (!resolvedUrl || resolvedUrl === this.avatarUrl) return;
        this.avatarUrl = resolvedUrl;
        const epoch = this.lifecycleEpoch;
        // Avatar is an interactive lobby entry. Its parent hierarchy is a designer
        // concern, so runtime binding follows the semantic name.
        const sprite = this.lobbySemanticNode(root, 'Avatar').getComponent(Sprite);
        void PlayerAvatarService.frame(this.role.playerId, url).then((frame) => {
            if (!sprite?.node.isValid || !this.isActiveEpoch(epoch) || this.avatarUrl !== resolvedUrl) return;
            sprite.spriteFrame = frame;
        }).catch(() => undefined);
    }

    private async confirmAccountLogout(): Promise<void> {
        const form = await this.forms?.show(
            'UIMessage',
            'UIMoreQieHuanZhangHao',
            [],
            '确定要切换账号吗？',
            '切换账号',
            '退出游戏',
        );
        if (!form) return;
        this.setSystemMessage(form, '确定要切换账号吗？');
        // The unified Message template promotes the selected template's
        // controls to its root; older standalone prefabs kept image01.
        const sure = form.find('btnSure') ?? form.find('image01/btnSure');
        const cancel = form.find('btnCancel') ?? form.find('image01/btnCancel');
        let handled = false;
        const confirm = (): void => {
            if (handled) return;
            handled = true;
            this.forms?.close('UIMessage');
            this.requestAccountLogout();
        };
        const exit = (): void => {
            if (handled) return;
            handled = true;
            this.forms?.close('UIMessage');
            game.end();
        };
        sure?.once(Button.EventType.CLICK, confirm);
        cancel?.once(Button.EventType.CLICK, exit);
        const deferPointerAction = (action: () => void) => (event: EventTouch): void => {
            if (handled) return;
            event.propagationStopped = true;
            event.propagationImmediateStopped = true;
            globalThis.setTimeout(action, 0);
        };
        sure?.once(Node.EventType.TOUCH_END, deferPointerAction(confirm));
        cancel?.once(Node.EventType.TOUCH_END, deferPointerAction(exit));
    }

    private requestAccountLogout(): void {
        this.clearRoomRecoveryIntent();
        this.resetRuntime();
    }

    private safeShowForm(formPath: string, ...args: unknown[]): void {
        const epoch = this.lifecycleEpoch;
        void (async () => {
            if (!this.isActiveEpoch(epoch)) return;
            try {
                const normalizedFormPath = this.formAlias[formPath] ?? formPath;
                if (normalizedFormPath !== formPath) {
                    if (!this.isActiveEpoch(epoch)) return;
                    await this.forms?.show(normalizedFormPath, ...args);
                    return;
                }
                await this.forms?.show(formPath, ...args);
            } catch {
                if (!this.isActiveEpoch(epoch)) return;
                const alias = this.formAlias[formPath];
                if (alias && alias !== formPath) {
                    await this.forms?.show(alias, ...args);
                    return;
                }
                await this.forms?.show('UIMessage_Drift', null, null, `未迁移界面: ${formPath}`);
            }
        })();
    }

    private toggleMorePanel(root: Node): void {
        const epoch = this.lifecycleEpoch;
        const target = this.lobbyNode(root, 'Bottom', 'MoreMenu');
        if (!this.isActiveEpoch(epoch)) return;
        if (target) target.active = !target.active;
    }

    private onNode(node: Node, event: string, listener: (body: unknown) => void): void {
        const epoch = this.lifecycleEpoch;
        const wrapped = (body: unknown): void => {
            if (!this.isActiveEpoch(epoch)) return;
            listener(body);
        };
        node.on(event, wrapped);
        this.nodeDisposers.push(this.createNodeDisposer(node, event, wrapped));
    }

    private createNodeDisposer(node: Node, event: string, callback: (...args: any[]) => void, target?: unknown, useCapture = false): () => void {
        let disposed = false;
        return (): void => {
            if (disposed) return;
            disposed = true;
            const eventProcessor = (node as unknown as { _eventProcessor?: unknown })._eventProcessor;
            if (!node.isValid || !eventProcessor) return;
            if (target === undefined) node.off(event, callback);
            else node.off(event, callback, target, useCapture);
        };
    }

    private applyLegacyRuntimeVisibility(root: Node): void {
        // LobbyMain.prefab 只保存设计器默认状态；UILobbyMain.OnShow 会在运行时
        // 打开大厅入口。3.8 迁移后必须显式恢复，否则这些按钮永远保持隐藏。
        // `Bottom` itself is also disabled in the serialized prefab. Enabling
        // only its descendants has no visible effect in Creator 3, so restore
        // the bar first while keeping MoreMenu/Actions (the expanded More
        // panel) under its original toggle lifecycle.
        this.lobbyNode(root, 'Bottom').active = true;
        // Lobby entries are intentionally located by their unique semantic
        // names. Artists may regroup or move them anywhere below LobbyMain
        // without coupling runtime behavior to a particular parent hierarchy.
        const visibleNodeNames: readonly string[] = [
            'Practice',
            'JoinClub', 'CreateRoom', 'JoinRoom',
            'AddRoomCard', 'AddClubCard', 'AddGold',
            'More', 'Agent', 'Bounty', 'Rebate', 'LuckyDraw', 'InviteRewards',
            'Settings', 'Report', 'Help', 'Feedback', 'Bind', 'Notice', 'GiftRoomCard', 'BindPromotion',
            'VerifyIdentity', 'Support', 'CheckIn', 'Records', 'Share', 'Shop',
            'Logout', 'Avatar',
        ];
        for (const name of visibleNodeNames) this.lobbySemanticNode(root, name).active = true;
        // btn_pdk is the serialized game-button template. Creator 2.2 keeps it
        // hidden and inserts the runtime game entries into gameLayout. Showing
        // the template at the scene root produces the oversized standalone card
        // seen in the migrated lobby.
        const gameTemplate = this.find(root, 'btn_pdk');
        const gameLayout = this.findDescendant(root, 'gameLayout');
        if (gameTemplate && gameLayout) {
            gameTemplate.setParent(gameLayout);
            gameTemplate.setPosition(0, 0, 0);
            gameTemplate.active = this.gameIds.length > 0;
            gameLayout.active = true;
            gameLayout.getComponent(Layout)?.updateLayout();
        } else if (gameTemplate) {
            gameTemplate.active = false;
        }

        // Production-only controls are added after the serialized 2.2 lobby is
        // instantiated. Do not let the temporary matchmaking entry cover the
        // user's authoritative Records placement; its event API remains mounted
        // for layouts that provide a dedicated entry.
        const records = this.findDescendant(root, 'Records');
        const matchmaking = this.findDescendant(root, 'btn_matchmaking');
        const recordsBounds = records?.getComponent(UITransform)?.getBoundingBoxToWorld();
        const matchmakingBounds = matchmaking?.getComponent(UITransform)?.getBoundingBoxToWorld();
        if (matchmaking && recordsBounds && matchmakingBounds) {
            const overlaps = recordsBounds.x < matchmakingBounds.x + matchmakingBounds.width
                && recordsBounds.x + recordsBounds.width > matchmakingBounds.x
                && recordsBounds.y < matchmakingBounds.y + matchmakingBounds.height
                && recordsBounds.y + recordsBounds.height > matchmakingBounds.y;
            if (overlaps) matchmaking.active = false;
        }
    }

    private findDescendant(root: Node, name: string): Node | null {
        if (root.name === name) return root;
        for (const child of root.children) {
            const result = this.findDescendant(child, name);
            if (result) return result;
        }
        return null;
    }

    private lobbySemanticNode(root: Node, name: string): Node {
        const matches = this.findAll(root, node => node.name === name);
        if (matches.length === 0) throw new Error(`大厅缺少语义节点: ${name}`);
        if (matches.length > 1) throw new Error(`大厅语义节点名称不唯一: ${name}`);
        return matches[0];
    }

    private handleUploadImgTest(): void {
        const config = (globalThis as Record<string, unknown>).app;
        const uploadImgURL = this.readUploadImgUrl(config);
        legacyPlatformBridge.callNative('openPhotoAlbum', [
            { Name: 'uploadImgURL', Value: uploadImgURL ?? '' },
        ]);
        void this.forms?.show('UIMessage_Drift', null, null,
            `btn_uploadImg_test 暂未接入原生桥接${uploadImgURL ? '' : ' (缺失 uploadImgURL)'}`);
    }

    private readUploadImgUrl(config: unknown): string | null {
        if (!config || typeof config !== 'object') return null;
        const candidates = [
            (config as Record<string, unknown>).uploadImgURL,
            (config as Record<string, unknown>).UploadImgURL,
            (config as Record<string, unknown>).url,
        ];
        for (const candidate of candidates) {
            if (typeof candidate === 'string' && candidate.trim()) return candidate.trim();
        }
        return null;
    }

    private setLabel(root: Node, path: string, text: string): void {
        const label = this.find(root, path)?.getComponent(Label);
        if (label) label.string = text;
    }

    private setLobbyLabel(root: Node, region: LobbyRegionName, path: readonly string[], text: string): void {
        const node = this.lobbyNode(root, region, ...path);
        const label = node.getComponent(Label);
        if (!label) throw new Error(`大厅语义节点缺少 Label: ${region}/${path.join('/')}`);
        label.string = text;
    }

    private lobbyNode(root: Node, region: LobbyRegionName, ...path: string[]): Node {
        let current: Node | null = root.getChildByName(region);
        if (!current) throw new Error(`大厅缺少方向容器: ${region}`);
        for (const part of path) {
            const child: Node | null = current.getChildByName(part);
            if (!child) throw new Error(`大厅缺少语义节点: ${region}/${path.join('/')}`);
            current = child;
        }
        return current as Node;
    }

    private find(root: Node, path: string): Node | null {
        let current: Node | null = root;
        for (const part of path.split('/')) current = current?.getChildByName(part) ?? null;
        return current;
    }

    private findAll(root: Node, predicate: (node: Node) => boolean): Node[] {
        const result: Node[] = [];
        const visit = (node: Node): void => {
            if (predicate(node)) result.push(node);
            for (const child of node.children) visit(child);
        };
        visit(root);
        return result;
    }
}
