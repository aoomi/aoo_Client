import {
    AssetManager,
    Button,
    EditBox,
    EventTouch,
    Label,
    Layout,
    Node,
    Prefab,
    ScrollView,
    Sprite,
    SpriteFrame,
    Toggle,
    UITransform,
    Widget,
    assetManager,
    instantiate,
    sys,
} from 'cc';
import { ProtocolClient } from '../../../Common/Code/Runtime/network/ProtocolClient';
import {
    CATALOG_GAME_METADATA,
    populateAuthoritativeGameNames,
} from '../../../Games/Common/Code/Catalog/CatalogFamilyBindings';
import { LegacyForm, LegacyFormManager } from '../../../Common/Code/Runtime/ui/LegacyFormManager';
import { NumpadService } from '../../../Common/Code/Runtime/ui/NumpadService';
import type { NumpadHandle } from '../../../Common/Code/Runtime/ui/NumpadService';
import { LegacyClubRecordListController } from './LegacyClubRecordListController';
import { LegacyRecordAllResultController } from './LegacyRecordAllResultController';
import type { ClubTopBarPort } from './ClubTopBarPort';
import { LegacyClubMemberController } from './LegacyClubMemberController';
import { LegacyClubMessageController } from './LegacyClubMessageController';
import { LegacyClubForbidController } from './LegacyClubForbidController';
import { LegacyClubManagementController } from './LegacyClubManagementController';
import { LegacyClubCentController } from './LegacyClubCentController';
import { LegacyClubPromotionController } from './LegacyClubPromotionController';
import { LegacyClubRoomManagementController } from './LegacyClubRoomManagementController';
import { LegacyClubRecordUserDayController } from './LegacyClubRecordUserDayController';
import { LegacyClubPlayerRecordController } from './LegacyClubPlayerRecordController';
import { LegacyClubRecordUserController } from './LegacyClubRecordUserController';
import { LegacyClubReportController } from './LegacyClubReportController';
import { LegacyUnionClubReportController } from './LegacyUnionClubReportController';
import { LegacyUnionManagerController } from './LegacyUnionManagerController';
import { adaptClubMainLandscape, adaptClubModalLandscape } from './LegacyClubLandscapeAdapter';
import { ClubBoxController } from './ClubBox/ClubBoxController';
import type { ClubBoxOperation } from './ClubBox/ClubBoxController';
import { ClubBoxGateway } from './ClubBox/ClubBoxGateway';
import { PlayerAvatarService } from '../../../Common/Code/UI/PlayerAvatarService';
import { AssetLoader } from '../../../Common/Code/UI/Infrastructure';
import { COMMON_ASSET_BUNDLE, COMMON_HEAD_ASSET } from '../../../Common/Code/Runtime/ui/CommonPrefabRegistry';
import { UnifiedScroll, UnifiedScrollDirection } from '../../../Common/Code/UI/UnifiedScroll';

const CLUB_DESK_PREFAB = { bundle: 'club', path: 'Prefab/ClubDesk' } as const;
const COMMON_HEAD_PREFAB = { bundle: COMMON_ASSET_BUNDLE, path: COMMON_HEAD_ASSET } as const;

interface ClubSkinSpriteSpec {
    label: string;
    bundlePath: string;
    spriteUuid: string;
}

const CLUB_SKIN_BUNDLE_FALLBACKS = ['club', 'main'];

const CLUB_BACKGROUND_SKINS: readonly ClubSkinSpriteSpec[] = [
    {
        label: 'bg02',
        bundlePath: 'Legacy/assets/texture/clubmain/bg02/spriteFrame',
        spriteUuid: 'c3be0a4c-0bbc-4ef9-a63b-142639e662d5@f9941',
    },
    {
        label: 'bg01',
        bundlePath: 'Legacy/assets/texture/clubmain/bg01/spriteFrame',
        spriteUuid: '144f4d88-18c1-4678-a0ea-5417e9e6d5a0@f9941',
    },
    {
        label: 'bg04',
        bundlePath: 'Legacy/assets/texture/clubmain/bg04/spriteFrame',
        spriteUuid: 'dea06f88-e046-48f4-9fef-c6f4fd37eab2@f9941',
    },
    {
        label: 'bg03',
        bundlePath: 'Legacy/assets/texture/clubmain/bg03/spriteFrame',
        spriteUuid: 'fbbb4de0-21dd-4574-a859-f86cf626ec1f@f9941',
    },
    {
        label: 'bg05',
        bundlePath: 'Legacy/assets/texture/clubmain/bg05/spriteFrame',
        spriteUuid: '15c382c3-4b74-4ac1-aac0-9d3c95f8557f@f9941',
    },
    {
        label: 'bg06',
        bundlePath: 'Legacy/assets/texture/clubmain/bg06/spriteFrame',
        spriteUuid: '31b7e060-b70c-4ffe-ae78-5eb0f9d2ea72@f9941',
    },
    {
        label: 'bg07',
        bundlePath: 'Legacy/assets/texture/clubmain/bg07/spriteFrame',
        spriteUuid: 'fde99b71-eff4-444c-a115-0ff027cf1716@f9941',
    },
    {
        label: 'bg08',
        bundlePath: 'Legacy/assets/texture/clubmain/bg08/spriteFrame',
        spriteUuid: '0f5107e0-fd54-4d10-97f2-ac99eea537dc@f9941',
    },
];

const CLUB_TABLE_SKINS: readonly ClubSkinSpriteSpec[] = [
    {
        label: 'img_mjz（01）',
        bundlePath: 'Legacy/assets/texture/clubhuanpi/img_mjz（01）/spriteFrame',
        spriteUuid: '313b7de4-853b-4c39-9685-7394e0e9003d@f9941',
    },
    {
        label: 'img_mjz（02）',
        bundlePath: 'Legacy/assets/texture/clubhuanpi/img_mjz（02）/spriteFrame',
        spriteUuid: 'f6064a47-8bee-4482-8f49-50e1442116f1@f9941',
    },
    {
        label: 'img_mjz（03）',
        bundlePath: 'Legacy/assets/texture/clubhuanpi/img_mjz（03）/spriteFrame',
        spriteUuid: 'abe8d72f-24e7-470a-bfaf-82e8bda3c89e@f9941',
    },
    {
        label: 'img_zz0402',
        bundlePath: 'Legacy/assets/texture/clubmain/img_zz0402/spriteFrame',
        spriteUuid: '469af7e6-e6fa-4899-a0a7-0254e23ecd3c@f9941',
    },
    {
        label: 'puke',
        bundlePath: 'Legacy/assets/texture/clubmain/xingyun/puke/spriteFrame',
        spriteUuid: '27353331-acc9-4e3f-849c-fcfb0d00aea8@f9941',
    },
    {
        label: 'desk_1_1_2',
        bundlePath: 'Legacy/assets/texture/clubhuanpi/desk_1_1_2/spriteFrame',
        spriteUuid: '04907eb8-7552-417d-bd30-fa0fa274289c@f9941',
    },
    {
        label: 'desk_1_2_2',
        bundlePath: 'Legacy/assets/texture/clubhuanpi/desk_1_2_2/spriteFrame',
        spriteUuid: '7dcda62f-1a29-42c7-8711-330d98e63bba@f9941',
    },
    {
        label: 'desk_1_2_3',
        bundlePath: 'Legacy/assets/texture/clubhuanpi/desk_1_2_3/spriteFrame',
        spriteUuid: '29c74841-4ebf-4472-9e57-6d6e3b487e46@f9941',
    },
];

export interface LegacyClubDetail {
    id?: number;
    clubId?: number;
    clubID?: number;
    clubsign?: number;
    name?: string;
    skinType?: number;
    unionId?: number;
    minister?: number;
    myisminister?: number;
    unionPostType?: number;
    isPromotionManage?: boolean | number;
    levelPromotion?: number;
    [key: string]: unknown;
}

interface ClubRoom {
    roomId?: number;
    roomID?: number;
    roomKey?: number | string;
    gameId?: number | string;
    gameType?: number | string;
    gameName?: string;
    gameCode?: string;
    game_code?: string;
    roomName?: string;
    setId?: number;
    setCount?: number;
    playerNum?: number;
    posList?: unknown[];
    [key: string]: unknown;
}

interface ClubMainContext {
    club: LegacyClubDetail;
    rooms: unknown;
}

interface QuickJoinSelection {
    roomKey: number | string;
    roomName: string;
    tagId?: number;
    configId?: number;
    templateCode?: string;
    gameId?: number | string;
    gameCode?: string;
}

export interface ClubDeskVariantSelection {
    readonly shapeName: 'Square' | 'Round' | 'Long';
    readonly playersName: string;
}

export function resolveClubDeskVariant(gameCode: string, playerCount: number): ClubDeskVariantSelection | null {
    const metadata = CATALOG_GAME_METADATA[gameCode];
    const normalizedCount = Math.trunc(playerCount);
    if (!metadata || normalizedCount <= 0) return null;
    return {
        shapeName: metadata.category === 'MAHJONG' ? 'Square' : normalizedCount <= 5 ? 'Round' : 'Long',
        playersName: `Players_${normalizedCount}`,
    };
}

export class LegacyClubMainController {
    private readonly paths = [
        'ui/club/ClubMain',
        'ui/club_1/UIClubMain_1',
        'ui/club_2/UIClubMain_2',
    ];
    private readonly disposers: Array<() => void> = [];
    private readonly roomDisposers: Array<() => void> = [];
    private readonly quickRoomDisposers: Array<() => void> = [];
    private readonly roomFilterDisposers: Array<() => void> = [];
    private readonly switchDisposers: Array<() => void> = [];
    private readonly gameNames = new Map<number, string>();
    private activeForm: LegacyForm | null = null;
    private activePath = '';
    private club: LegacyClubDetail | null = null;
    private rooms: ClubRoom[] = [];
    private selectedRoomFilter: ClubRoom | null = null;
    private roomForm: LegacyForm | null = null;
    private currentRoom: ClubRoom | null = null;
    private skinForm: LegacyForm | null = null;
    private selectedBackground = -1;
    private selectedTable = 7;
    private inviteCandidatePid = 0;
    private invitePending = false;
    private inviteEpoch = 0;
    private quickJoinEpoch = 0;
    private switchPending = false;
    private hideOpenedRooms = true;
    private switchingClubId = 0;
    private clubBoxController: ClubBoxController | null = null;
    private clubBoxNumpad: NumpadHandle | null = null;
    private clubBoxAmountResolver: ((value: number | null) => void) | null = null;
    private readonly clubBoxNumpadService = new NumpadService();
    private readonly roomDetailPending = new Set<string>();
    private readonly skinBundleLoading = new Map<string, Promise<AssetManager.Bundle | null>>();
    private readonly assets = new AssetLoader();
    private clubDeskPrefab: Prefab | null = null;
    private clubDeskPrefabLoading: Promise<Prefab | null> | null = null;
    private commonHeadPrefab: Prefab | null = null;
    private commonHeadPrefabLoading: Promise<Prefab | null> | null = null;
    private assetLoadGeneration = 0;
    private roomRenderEpoch = 0;
    private templateRestoreGeneration = 0;
    private visualEpoch = 0;
    private memberController: LegacyClubMemberController | null = null;
    private messageController: LegacyClubMessageController | null = null;
    private forbidController: LegacyClubForbidController | null = null;
    private managementController: LegacyClubManagementController | null = null;
    private clubCentController: LegacyClubCentController | null = null;
    private promotionController: LegacyClubPromotionController | null = null;
    private roomManagementController: LegacyClubRoomManagementController | null = null;
    private clubCentRefreshTimer: ReturnType<typeof setInterval> | null = null;
    private clubCentRefreshPending = false;
    private activeRoomRefreshTimer: ReturnType<typeof setInterval> | null = null;
    private activeRoomRefreshPending = false;
    private waitingHandoffRoomId = 0;
    private waitingHandoffRetryTimer: ReturnType<typeof setTimeout> | null = null;
    private waitingBackPending = false;

    public constructor(
        private readonly forms: LegacyFormManager,
        private readonly client: ProtocolClient,
        private readonly mainNode: Node,
        private readonly top: ClubTopBarPort,
        private readonly playerId: number,
        private readonly playerName: string,
        private readonly onReturnLobby: () => void = () => undefined,
    ) {}

    public install(): void {
        this.registerClubActionForms();
        this.memberController = new LegacyClubMemberController(this.forms, this.client, this.playerId);
        this.memberController.install();
        this.messageController = new LegacyClubMessageController(this.forms, this.client);
        this.messageController.install();
        this.forbidController = new LegacyClubForbidController(this.forms, this.client);
        this.forbidController.install();
        this.managementController = new LegacyClubManagementController(this.forms, this.client, this.playerId);
        this.managementController.install();
        this.clubCentController = new LegacyClubCentController(this.forms, this.client);
        this.clubCentController.install();
        this.promotionController = new LegacyClubPromotionController(this.forms, this.client, this.playerId);
        this.promotionController.install();
        this.roomManagementController = new LegacyClubRoomManagementController(this.forms, this.client);
        this.roomManagementController.install();
        new LegacyClubRecordListController(this.forms, this.client, this.playerId, this.mainNode).install();
        new LegacyClubRecordUserDayController(this.forms, this.client, this.playerId).install();
        new LegacyClubPlayerRecordController(this.forms, this.client).install();
        new LegacyClubRecordUserController(this.forms, this.client).install();
        new LegacyClubReportController(this.forms, this.client).install();
        new LegacyUnionClubReportController(this.forms, this.client).install();
        new LegacyUnionManagerController(this.forms, this.client).install();
        new LegacyRecordAllResultController(
            this.forms, this.client, this.mainNode, this.playerName, this.top,
        ).install();
        if (this.activeForm && this.club) {
            const playName = this.findMainNode(this.activeForm, 'Lb_PlayName');
            if (playName) this.setDescendantLabel(playName, 'Lb_PlayName', '全部玩法');
        }
        populateAuthoritativeGameNames(this.gameNames);
        this.forms.register('ui/club/UIClubInRoom', {
            zOrder: 8,
            lifecycle: {
                onCreate: (form) => { adaptClubModalLandscape(form.node); this.bindCurrentRoom(form); },
                onShow: (form, room) => { adaptClubModalLandscape(form.node); this.showCurrentRoom(form, room as ClubRoom); },
                onClose: () => {
                    this.roomForm = null;
                    this.currentRoom = null;
                },
            },
        });
        this.forms.register('ui/club/UIQuickJoinRoom', {
            zOrder: 9,
            lifecycle: {
                onCreate: (form) => {
                    adaptClubModalLandscape(form.node);
                    this.blockInput(form.node);
                    this.onClick(form.find('bg/bg_create/btn_close') ?? form.find('btn_close'),
                        () => this.forms.close('ui/club/UIQuickJoinRoom'));
                },
                onShow: (form) => { adaptClubModalLandscape(form.node); void this.showQuickJoin(form); },
                onClose: () => { this.quickJoinEpoch += 1; this.clearQuickRoomListeners(); },
            },
        });
        this.forms.register('ui/club/UIClubSafePanel', {
            zOrder: 9,
            lifecycle: {
                onCreate: (form) => { adaptClubModalLandscape(form.node); this.blockInput(form.node); },
                onShow: (form) => { adaptClubModalLandscape(form.node); this.showClubBox(form); },
                onClose: () => this.closeClubBox(),
            },
        });
        for (const path of this.paths) {
            this.forms.register(path, {
                zOrder: 7,
                lifecycle: {
                    onCreate: (form) => { adaptClubMainLandscape(form.node); this.bind(form, path); },
                    onShow: (form, context) => {
                        adaptClubMainLandscape(form.node);
                        this.show(form, path, context as ClubMainContext);
                    },
                    onClose: () => {
                        // Leaving the club must cancel any club-only modal that is still loading.
                        // Otherwise a late ZhongZhi form request can resume after the hall is shown.
                        this.forms.close('ui/club_2/Skin2UnionManagerZhongZhi', true);
                        this.close(path);
                    },
                },
            });
        }
        for (const event of [
            'SClub_GetAllRoomMin', 'SUnion_GetAllRoomMin',
            'SClub_GetAllRoomGroup', 'SUnion_GetAllRoomGroup',
            'club.room_templates_changed',
        ]) this.disposers.push(this.client.on(event, (body) => this.refreshRoomsFromTemplatePush(body)));
        for (const event of [
            'SClub_RoomStatusChange', 'SUnion_RoomStatusChange',
            'SClub_RoomPlayerChange', 'SUnion_RoomPlayerChange',
            'SClub_RoomSetChange', 'SUnion_RoomSetChange',
        ]) this.disposers.push(this.client.on(event, (body) => this.updateRoom(body)));
        this.disposers.push(this.client.on('club.waiting_room_ready', (body) => {
            const ready = body && typeof body === 'object' ? body as Record<string, unknown> : {};
            const roomId = Number(ready.roomId ?? 0);
            if (!this.activeForm || roomId <= 0 || this.waitingHandoffRoomId === roomId) return;
            // The targeted server push is the primary synchronization path. Re-read
            // current membership so a stale or duplicated push can never move a player.
            void this.enterCurrentWaitingRoomWhenFull(roomId);
        }));
        const refreshRooms = (body: unknown): void => this.replaceRooms(body);
        this.mainNode.on('legacy-club-rooms-refreshed', refreshRooms);
        this.disposers.push(() => {
            if (this.mainNode.isValid) this.mainNode.off('legacy-club-rooms-refreshed', refreshRooms);
        });
        this.disposers.push(this.client.onReconnect(() => this.restoreTemplatesAfterReconnect()));
    }

    public dispose(): void {
        this.assetLoadGeneration += 1;
        this.templateRestoreGeneration += 1;
        this.roomRenderEpoch += 1;
        this.quickJoinEpoch += 1;
        this.inviteEpoch += 1;
        this.switchPending = false;
        this.switchingClubId = 0;
        this.stopClubCentRefresh();
        this.stopActiveRoomRefresh();
        this.clearWaitingHandoffRetry();
        this.closeClubBox();
        this.roomDetailPending.clear();
        this.memberController?.dispose();
        this.memberController = null;
        this.messageController?.dispose();
        this.messageController = null;
        this.forbidController?.dispose();
        this.forbidController = null;
        this.managementController?.dispose();
        this.managementController = null;
        this.clubCentController?.dispose();
        this.clubCentController = null;
        this.promotionController?.dispose();
        this.promotionController = null;
        this.roomManagementController?.dispose();
        this.roomManagementController = null;
        this.clearRoomListeners();
        this.clearQuickRoomListeners();
        this.clearRoomFilterListeners();
        this.clearSwitchListeners();
        for (const dispose of this.disposers.splice(0)) dispose();
        this.activeForm = null;
        this.club = null;
        this.rooms = [];
        this.roomForm = null;
        this.currentRoom = null;
        this.clubDeskPrefab = null;
        this.clubDeskPrefabLoading = null;
        this.commonHeadPrefab = null;
        this.commonHeadPrefabLoading = null;
        this.assets.releaseAll();
    }

    private bind(form: LegacyForm, path: string): void {
        this.blockInput(form.node);
        // ClubMain follows the lobby contract: interactive nodes are addressed by
        // unique semantic names, so artists may regroup them under any edge folder.
        const node = (name: string): Node | null => this.findMainNode(form, name);
        // ClubSwitcher is a visual container authored with a legacy full-panel Button.
        // Keep only its child buttons interactive; otherwise the container consumes their taps.
        const leftPanelButton = node('ClubSwitcher')?.getComponent(Button);
        if (leftPanelButton) leftPanelButton.enabled = false;
        this.bindClubBack(node('Btn_Back'), path);
        const show = (nodeName: string, formPath: string, ...args: unknown[]) => {
            this.onClick(node(nodeName), () => { void this.forms.show(formPath, ...args); });
        };
        this.onClick(node('Btn_HideClubList'), () => this.active(form, 'ClubSwitcher', false));
        const clubSwitcher = node('ClubSwitcher');
        const joinClubButton = clubSwitcher
            ? this.findDescendant(clubSwitcher, 'Btn_Join')
            : this.find(form.node, 'left_main/btn_join');
        this.onClick(joinClubButton, () => { void this.forms.show('ui/club/UIJoinClub'); });
        const createClubButton = clubSwitcher
            ? this.findDescendant(clubSwitcher, 'Btn_Create')
            : this.find(form.node, 'left_main/btn_create');
        this.onClick(createClubButton, () => {
            this.mainNode.emit('legacy-open-club-create');
        });
        this.onClick(node('Btn_ClubList'), () => { void this.forms.show('ui/club/UIClub'); });
        this.onClick(node('Btn_Member'), () => {
            void this.forms.show('ui/club/ClubMembers', this.club ?? {});
        });
        this.onClick(node('Btn_Score'), () => {
            void this.forms.show('ui/club/ClubScoreRecord', this.club ?? {});
        });
        const skinButton = node('Btn_Skin');
        this.onClick(skinButton, () => { void this.forms.show('ui/club/UIClubHuanPi'); });
        this.onClick(node('Btn_Promoter'), () => {
            if (!this.canOpenCaptainList()) return;
            const path = Number(this.club?.skinType ?? 0) === 2 ? 'ui/club_2/UIPromoterAllManager_2' : 'ui/club/ClubPromoters';
            void this.forms.show(path, { ...(this.club ?? {}), pid: this.playerId });
        });
        this.onClick(node('Btn_Room'), () => this.openRoomManagement());
        this.onClick(node('Btn_Event'), () => {
            if (!this.canOpenUnionEntry()) return;
            void this.openUnionEntry();
        });
        this.onClick(node('Btn_More'), () => this.togglePanel(form, 'Menu'));
        this.onClick(node('Btn_BanTable'), () => {
            if (!this.canManageAlliance()) return;
            void this.forms.show('ui/club/ClubBan', this.club ?? {});
        });
        show('Btn_Wechat', 'ui/club/UIYaoQing');
        this.onClick(node('Btn_Msg'), () => {
            void this.forms.show('ui/club/ClubMsg', this.club ?? {});
        });
        this.onClick(node('Btn_Manage'), () => {
            void this.forms.show('ui/club/ClubManage', this.club ?? {});
        });
        show('Btn_FindRoom', 'ui/club/ClubFind');
        this.onClick(node('Btn_Safe'), () => {
            void this.forms.show('ui/club/UIClubSafePanel');
        });
        show('Btn_PromoterManage', 'ui/club/UIPromoterManager');
        this.onClick(node('Btn_Join'), () => this.startQuickJoin());
        this.onClick(node('Btn_Modify'), () => { void this.forms.show('ui/club/UIQuickJoinRoom'); });
        this.onClick(node('Btn_Record'), () => this.openClubRecord());
        this.onClick(node('Btn_EventRecord'), () => this.openClubRecord());
        show('btn_shop', 'ui/club/UIClubStore');
        show('btn_addRoomCard', 'ui/club/UIClubStore');
        this.onClick(node('Btn_ShowClubList'), () => { void this.openClubSwitcher(form); });
        this.onClick(this.findDescendant(node('ClubSwitcher') ?? form.node, 'Btn_Close')
            ?? this.find(form.node, 'left_main/btn_close_left'),
            () => this.active(form, 'ClubSwitcher', false));
        this.onClick(node('Btn_ShowPlayFilter'), () => this.togglePanel(form, 'PlayFilter'));
        const hideRoomToggle = node('HideRoomToggle')?.getComponent(Toggle) ?? null;
        if (hideRoomToggle) {
            this.hideOpenedRooms = hideRoomToggle.isChecked;
            const change = () => {
                this.hideOpenedRooms = hideRoomToggle.isChecked;
                this.renderRooms();
            };
            hideRoomToggle.node.on(Toggle.EventType.TOGGLE, change);
            this.disposers.push(() => {
                if (hideRoomToggle.node?.isValid) hideRoomToggle.node.off(Toggle.EventType.TOGGLE, change);
            });
        }
        this.onClick(this.findDescendant(node('PlayFilter') ?? form.node, 'Btn_Close')
            ?? this.find(form.node, 'left_wanfa/btn_aoowh'),
            () => this.active(form, 'PlayFilter', false));
        this.onClick(node('btn_youxi'), () => this.markSelected(node('btn_youxi')));
        this.onClick(node('btn_difen'), () => this.markSelected(node('btn_difen')));
        this.onClick(node('btn_saixuan'), () => this.markSelected(node('btn_saixuan')));
        this.onClick(node('btn_paihangbang'), () => {
            void this.forms.show('ui/club_2/Skin2UnionRankZhongZhi', this.currentClubContext());
        });
        this.onClick(node('img_bjl'), () => {
            void this.forms.show('ui/club_2/Skin2UnionManagerZhongZhi', this.currentClubContext());
        });
        this.onClick(node('Btn_EventRoom'), () => {
            void this.forms.show('ui/club/UIUnionManager', this.currentClubContext());
        });
        this.onClick(node('Btn_AllPlay'), () => {
            const checkmark = node('Btn_AllPlay')?.getChildByName('Checkmark') ?? null;
            if (checkmark) checkmark.active = !checkmark.active;
        });
        this.onClick(node('Btn_All'), () => {
            this.selectedRoomFilter = null;
            this.markSelected(node('Btn_All'));
            this.renderRooms();
        });
        this.onClick(node('Btn_CloseTable'), () => this.active(form, 'TableList', false));
        this.onClick(node('btn_room_last'), () => this.scrollRooms(-1));
        this.onClick(node('btn_room_next'), () => this.scrollRooms(1));
    }

    private registerClubActionForms(): void {
        const forms = [
            'ui/club/UIClub',
            'ui/club/UIUnionNone',
            'ui/club/ClubFind',
            'ui/club/UIClubStore',
            'UILobbyRecordResult',
            'ui/club_2/Skin2UnionRankZhongZhi',
            'ui/club/UIClubRoomJoin', 'ui/club/UIClubRoomPassword',
            'ui/club_2/Skin2UnionManagerZhongZhi',
        ];
        for (const path of forms) {
            this.forms.register(path, {
                zOrder: 9,
                lifecycle: {
                    onCreate: (form) => {
                        adaptClubModalLandscape(form.node);
                        this.bindModalClose(form, path);
                        if (path === 'ui/club/UIUnionNone') this.bindUnionNone(form);
                    },
                    onShow: (form, ...args) => {
                        adaptClubModalLandscape(form.node);
                        if (path === 'ui/club/UIUnionNone') {
                            const create = this.findDescendant(form.node, 'btn_create');
                            if (create) create.active = Number(this.club?.minister ?? 0) === 2;
                        }
                        if (path === 'ui/club/UIClubRoomJoin') {
                            this.renderRoomDetail(form, args[0]);
                        }
                    },
                },
            });
        }
        this.forms.register('ui/club/UIYaoQing', {
            zOrder: 9,
            lifecycle: {
                onCreate: (form) => { adaptClubModalLandscape(form.node); this.bindInviteForm(form); },
                onShow: (form) => { adaptClubModalLandscape(form.node); this.resetInviteForm(form); },
                onClose: () => { this.inviteEpoch += 1; this.inviteCandidatePid = 0; this.invitePending = false; },
            },
        });
        this.forms.register('ui/club/UIClubHuanPi', {
            zOrder: 9,
            lifecycle: {
                onCreate: (form) => { adaptClubModalLandscape(form.node); this.bindSkinForm(form); },
                onShow: (form) => { adaptClubModalLandscape(form.node); this.showSkinForm(form); },
                onClose: () => { this.skinForm = null; },
            },
        });
    }

    private bindSkinForm(form: LegacyForm): void {
        this.blockInput(form.node);
        this.onClick(form.find('bg/btn_close'), () => { void this.closeSkinForm(); });
        const backgroundList = this.findDescendant(form.node, 'bglist');
        const tableList = this.findDescendant(form.node, 'tblist');
        for (let index = 0; index < 8; index += 1) {
            this.onClick(backgroundList?.getChildByName(`btn_bg${index + 1}`) ?? null,
                () => this.selectBackground(index));
            this.onClick(tableList?.getChildByName(`btn_tb${index + 1}`) ?? null,
                () => this.selectTable(index));
        }
    }

    private showSkinForm(form: LegacyForm): void {
        this.skinForm = form;
        this.selectedBackground = this.readSkinSetting('ClubNewBg');
        this.selectedTable = this.readSkinSetting('ClubNewTb');
        this.refreshSkinChecks();
        const toggle = form.find('Toggle');
        const canSync = Number(this.club?.unionId ?? 0) > 0 && Number(this.club?.minister ?? 0) === 2;
        if (toggle) {
            toggle.active = canSync;
            const component = toggle.getComponent(Toggle);
            if (component) component.isChecked = false;
        }
    }

    private readSkinSetting(key: string): number {
        const raw = sys.localStorage.getItem(key);
        if (key === 'ClubNewBg' && sys.localStorage.getItem('ClubNewCuntom') !== '1') return -1;
        const value = raw === null ? 7 : Number(raw);
        const normalized = Number.isInteger(value) && value >= 0 && value < 8 ? value : 7;
        if (raw === null || normalized !== value) sys.localStorage.setItem(key, String(normalized));
        return normalized;
    }

    private selectBackground(index: number): void {
        this.selectedBackground = index;
        sys.localStorage.setItem('ClubNewBg', String(index));
        sys.localStorage.setItem('ClubNewCuntom', '1');
        this.refreshSkinChecks();
        this.applyBackground(index);
    }

    private selectTable(index: number): void {
        this.selectedTable = index;
        sys.localStorage.setItem('ClubNewTb', String(index));
        sys.localStorage.setItem('ClubNewCuntom', '1');
        this.refreshSkinChecks();
        this.applyTable(index);
    }

    private refreshSkinChecks(): void {
        const form = this.skinForm;
        if (!form) return;
        const backgroundList = this.findDescendant(form.node, 'bglist');
        const tableList = this.findDescendant(form.node, 'tblist');
        for (let index = 0; index < 8; index += 1) {
            const check = backgroundList?.getChildByName(`btn_bg${index + 1}`)?.getChildByName('check');
            if (check) check.active = index === this.selectedBackground;
            const tableButton = tableList?.getChildByName(`btn_tb${index + 1}`);
            const on = tableButton?.getChildByName('on');
            const off = tableButton?.getChildByName('off');
            if (on) on.active = index === this.selectedTable;
            if (off) off.active = index !== this.selectedTable;
        }
    }

    private async closeSkinForm(): Promise<void> {
        const toggle = this.skinForm?.find('Toggle')?.getComponent(Toggle);
        const shouldSync = Boolean(toggle?.isChecked)
            && Number(this.club?.unionId ?? 0) > 0 && Number(this.club?.minister ?? 0) === 2;
        if (shouldSync) {
            try {
                await this.client.request('union.CUnionChangeSkin', {
                    unionId: this.club?.unionId,
                    clubId: this.club?.id,
                    skinTable: this.selectedTable,
                    skinBackColor: this.selectedBackground,
                });
            } catch (error: unknown) {
                await this.forms.show('UIMessage_Drift', null, null,
                    error instanceof Error ? error.message : '同步联盟换肤配置失败，请稍后重试');
                return;
            }
        }
        this.forms.close('ui/club/UIClubHuanPi');
    }

    private applyBackground(index: number): void {
        // Keep the SpriteFrame authored on ClubMain/Bg as the default background.
        // Runtime replacement is reserved for a skin explicitly selected by the player.
        if (index < 0) return;
        const background = this.activeForm ? this.findMainNode(this.activeForm, 'Bg') : null;
        const sprite = background?.getComponent(Sprite);
        if (!sprite) return;
        const epoch = this.visualEpoch;
        const spec = CLUB_BACKGROUND_SKINS[index];
        if (!spec) return;
        this.loadClubSkinSpriteFrame(spec, (frame) => {
            if (epoch !== this.visualEpoch || !sprite.node.isValid || !frame) return;
            this.setSpriteFrame(sprite, frame);
        });
    }

    private applyTable(index: number): void {
        const roomList = this.activeForm ? this.findMainNode(this.activeForm, 'RoomList') : null;
        const sprite = roomList
            ? this.findDescendant(roomList, 'demo')?.getComponent(Sprite)
            : null;
        if (!sprite) {
            this.renderRooms();
            return;
        }
        const epoch = this.visualEpoch;
        const spec = CLUB_TABLE_SKINS[index];
        if (!spec) {
            this.renderRooms();
            return;
        }
        this.loadClubSkinSpriteFrame(spec, (frame) => {
            if (epoch !== this.visualEpoch || !sprite.node.isValid) return;
            if (frame) this.setSpriteFrame(sprite, frame);
            this.renderRooms();
        });
    }

    private loadClubSkinSpriteFrame(spec: ClubSkinSpriteSpec, onComplete: (frame: SpriteFrame | null) => void): void {
        void this.loadClubSkinSpriteFrameFromBundles(spec).then((frame) => {
            if (!frame) console.warn(`[ClubSkin] missing sprite frame: ${spec.label}`);
            onComplete(frame);
        });
    }

    private async loadClubSkinSpriteFrameFromBundles(spec: ClubSkinSpriteSpec): Promise<SpriteFrame | null> {
        for (const bundleName of CLUB_SKIN_BUNDLE_FALLBACKS) {
            const bundle = await this.loadSkinBundle(bundleName);
            if (!bundle) continue;
            const assetPath = bundleName === 'club' ? `Atlas/${spec.bundlePath}` : `Club/Atlas/${spec.bundlePath}`;
            const frame = await this.loadSpriteFrameFromBundle(bundle, assetPath);
            if (frame) return frame;
        }
        return this.loadSpriteFrameByUuid(spec.spriteUuid);
    }

    private loadSkinBundle(name: string): Promise<AssetManager.Bundle | null> {
        const existing = assetManager.getBundle(name);
        if (existing) return Promise.resolve(existing);
        const pending = this.skinBundleLoading.get(name);
        if (pending) return pending;
        const task = new Promise<AssetManager.Bundle | null>((resolve) => {
            assetManager.loadBundle(name, (error, bundle) => {
                this.skinBundleLoading.delete(name);
                resolve(error || !bundle ? null : bundle);
            });
        });
        this.skinBundleLoading.set(name, task);
        return task;
    }

    private loadSpriteFrameFromBundle(bundle: AssetManager.Bundle, path: string): Promise<SpriteFrame | null> {
        return new Promise((resolve) => {
            bundle.load(path, SpriteFrame, (error, frame) => resolve(error || !frame ? null : frame));
        });
    }

    private loadSpriteFrameByUuid(uuid: string): Promise<SpriteFrame | null> {
        return new Promise((resolve) => {
            assetManager.loadAny<SpriteFrame>(uuid, (error, frame) => {
                resolve(error || !(frame instanceof SpriteFrame) ? null : frame);
            });
        });
    }

    private setSpriteFrame(sprite: Sprite, frame: SpriteFrame): void {
        const transform = sprite.node.getComponent(UITransform);
        const width = transform?.contentSize.width ?? 0;
        const height = transform?.contentSize.height ?? 0;
        sprite.sizeMode = Sprite.SizeMode.CUSTOM;
        sprite.spriteFrame = frame;
        if (transform && width > 0 && height > 0) transform.setContentSize(width, height);
    }

    private bindModalClose(form: LegacyForm, path: string): void {
        this.blockInput(form.node);
        const visit = (node: Node): void => {
            if (['btn_close', 'btn_back', 'btn_closeshare', 'btn_bg'].includes(node.name)) {
                this.onClick(node, () => this.forms.close(path));
            }
            for (const child of node.children) visit(child);
        };
        visit(form.node);
    }

    private bindInviteForm(form: LegacyForm): void {
        this.bindModalClose(form, 'ui/club/UIYaoQing');
        this.onClick(this.findDescendant(form.node, 'btn_search'), () => { void this.searchInvitePlayer(form); });
        this.onClick(this.findDescendant(form.node, 'btn_yaoqing'), () => { void this.sendClubInvite(form); });
    }

    private bindUnionNone(form: LegacyForm): void {
        this.onClick(this.findDescendant(form.node, 'btn_create'), () => {
            if (Number(this.club?.minister ?? 0) !== 2) {
                void this.forms.show('UIMessage_Drift', null, null, '只有圈主可以创建联盟');
                return;
            }
            void this.forms.show('ui/club/UIUnionCreate', {
                clubId: this.clubId(),
                onCreated: async (createdClub: Record<string, unknown>, union: Record<string, unknown>) => {
                    const club = createdClub as LegacyClubDetail;
                    if (this.club) Object.assign(this.club, createdClub);
                    if (this.activeForm) this.applyClubModeVisibility(this.activeForm);
                    await this.forms.show('ui/club/UIUnionManager', {
                        ...(this.club ?? club),
                        unionName: String(club.unionName ?? union.name ?? ''),
                        unionSign: Number(club.unionSign ?? union.unionSign ?? 0),
                    });
                },
            });
        });
        this.onClick(this.findDescendant(form.node, 'btn_join'), () => {
            void this.forms.show('ui/club/UIJoinUnion', this.clubId());
        });
    }

    private async openUnionEntry(): Promise<void> {
        const clubId = this.clubId();
        if (clubId <= 0) return;
        try {
            const detail = await this.refreshCurrentClub(clubId);
            const context = this.currentClubContext();
            const path = context.unionId > 0 ? 'ui/club/UIUnionManager' : 'ui/club/UIUnionNone';
            void this.forms.show(path, {
                ...detail,
                ...context,
                onDissolved: () => this.handleUnionDissolved(clubId),
            });
        } catch (error) {
            await this.forms.show('UIMessage_Drift', null, null,
                error instanceof Error ? error.message : '刷新联盟状态失败，请稍后重试');
        }
    }

    private async handleUnionDissolved(expectedClubId: number): Promise<void> {
        if (this.clubId() !== expectedClubId) return;
        // The dissolve command has committed already. Clear the routing fields first so
        // a delayed read projection can never reopen the obsolete union manager.
        if (this.club) Object.assign(this.club, { unionId: 0, unionSign: 0, unionName: '', unionPostType: 0 });
        if (this.activeForm) this.applyClubModeVisibility(this.activeForm);
        try {
            await this.refreshCurrentClub(expectedClubId);
        } catch {
            this.persistCurrentClub();
        }
    }

    private async refreshCurrentClub(expectedClubId: number): Promise<LegacyClubDetail> {
        const detail = await this.client.request<LegacyClubDetail>('club.CGetClubListById', { clubId: expectedClubId });
        if (this.clubId() !== expectedClubId) return detail;
        this.club = { ...(this.club ?? {}), ...detail, id: expectedClubId };
        this.persistCurrentClub();
        if (this.activeForm) this.applyClubModeVisibility(this.activeForm);
        return detail;
    }

    private persistCurrentClub(): void {
        if (!this.club) return;
        sys.localStorage.setItem(`legacy_last_club_${this.playerId}`, JSON.stringify(this.club));
    }

    private resetInviteForm(form: LegacyForm): void {
        this.inviteEpoch += 1;
        this.inviteCandidatePid = 0;
        this.invitePending = false;
        const edit = this.findDescendant(form.node, 'EditBox')?.getComponent(EditBox);
        if (edit) edit.string = '';
        this.setLabel(form.node, 'lb_tip', '输入成员ID，确认后直接加入');
        const user = this.findDescendant(form.node, 'user');
        if (user) user.active = false;
        const invite = this.findDescendant(form.node, 'btn_yaoqing');
        if (invite) invite.active = false;
    }

    private async searchInvitePlayer(form: LegacyForm): Promise<void> {
        if (this.invitePending) return;
        const value = this.findDescendant(form.node, 'EditBox')?.getComponent(EditBox)?.string.trim() ?? '';
        if (!/^[1-9]\d*$/.test(value)) {
            await this.forms.show('UIMessage_Drift', null, null, '请输入有效的成员ID');
            return;
        }
        this.invitePending = true;
        const epoch = this.inviteEpoch;
        try {
            const result = await this.client.request<{ player?: { pid?: number; name?: string }; state?: number }>(
                'club.CClubFindPIDInfo', { clubId: this.clubId(), pid: Number(value) },
            );
            if (epoch !== this.inviteEpoch || !form.node.isValid || !form.isShown()) return;
            const pid = Number(result.player?.pid ?? value);
            if (!Number.isSafeInteger(pid) || pid <= 0) throw new Error('未找到该成员');
            this.inviteCandidatePid = pid;
            const user = this.findDescendant(form.node, 'user');
            if (user) user.active = true;
            this.setLabel(form.node, 'user/name', String(result.player?.name ?? `成员${pid}`));
            this.setLabel(form.node, 'user/id', `ID:${pid}`);
            this.setLabel(form.node, 'lb_tip', Number(result.state ?? 0) === 0 ? '确认后成员将直接加入' : '该成员已在俱乐部中');
            const invite = this.findDescendant(form.node, 'btn_yaoqing');
            if (invite) invite.active = Number(result.state ?? 0) === 0;
        } catch (error: unknown) {
            if (epoch !== this.inviteEpoch) return;
            this.inviteCandidatePid = 0;
            await this.forms.show('UIMessage_Drift', null, null,
                error instanceof Error ? error.message : '搜索成员失败');
        } finally {
            if (epoch === this.inviteEpoch) this.invitePending = false;
        }
    }

    private async sendClubInvite(form: LegacyForm): Promise<void> {
        if (this.invitePending || this.inviteCandidatePid <= 0) return;
        this.invitePending = true;
        const epoch = this.inviteEpoch;
        try {
            await this.client.request('club.CClubFindPIDAdd', {
                clubId: this.clubId(), pid: this.inviteCandidatePid,
            });
            if (epoch !== this.inviteEpoch || !form.node.isValid || !form.isShown()) return;
            const confirmation = await this.client.request<{ state?: number }>('club.CClubFindPIDInfo', {
                clubId: this.clubId(), pid: this.inviteCandidatePid,
            });
            if (Number(confirmation.state ?? 0) === 0) throw new Error('成员未实际加入，请重试');
            if (epoch !== this.inviteEpoch || !form.node.isValid || !form.isShown()) return;
            const invite = this.findDescendant(form.node, 'btn_yaoqing');
            if (invite) invite.active = false;
            await this.forms.show('UIMessage_Drift', null, null, '成员已加入俱乐部并归属在您名下');
        } catch (error: unknown) {
            if (epoch !== this.inviteEpoch) return;
            await this.forms.show('UIMessage_Drift', null, null,
                error instanceof Error ? error.message : '邀请发送失败');
        } finally {
            if (epoch === this.inviteEpoch) this.invitePending = false;
        }
    }

    private async showQuickJoin(form: LegacyForm): Promise<void> {
        this.clearQuickRoomListeners();
        const epoch = ++this.quickJoinEpoch;
        this.setCollectionState(form.node, 'loading');
        const clubId = this.clubId();
        const unionId = Number(this.club?.unionId ?? 0);
        try {
            const packet = unionId > 0 ? 'union.CUnionRoomConfigItemList' : 'club.CClubRoomConfigItemList';
            const response = await this.client.request<unknown>(packet, {
                clubId, unionId: unionId || undefined,
            });
            if (epoch !== this.quickJoinEpoch || !form.node.isValid || !form.isShown()) return;
            const configs = this.templateRoomArray(response);
            const mark = form.find('mark');
            const template = form.find('demo');
            const layout = mark?.getChildByName('layout');
            if (!template || !layout) return;
            for (const child of [...layout.children]) child.destroy();
            template.active = false;
            const selected = unionId > 0
                ? String(sys.localStorage.getItem(`mywanfa_${unionId}_${clubId}`) ?? '')
                    .split(',').map(Number).filter((value) => value > 0)
                : [];
            const selectedConfigs = selected.length > 0
                ? configs.filter((config) => selected.includes(Number(config.tagId ?? 0)))
                : configs;
            this.setCollectionState(form.node, selectedConfigs.length > 0 ? 'content' : 'empty');
            for (const config of selectedConfigs) {
                const tagId = Number(config.tagId ?? 0);
                const node = instantiate(template);
                node.name = `quick_room_${tagId}`;
                node.active = true;
                this.setLabel(node, 'btn_roomCfg/lb_roomName',
                    String(config.name ?? config.roomName ?? this.gameNames.get(Number(config.gameId ?? 0)) ?? ''));
                this.setLabel(node, 'btn_roomCfg/lb_roomInfo',
                    this.quickRoomInfo(config));
                this.setLabel(node, 'btn_roomCfg/lb_tagid', String(tagId));
                const button = node.getChildByName('btn_roomCfg');
                const lock = button?.getChildByName('tip_lock');
                const password = String(config.password ?? '');
                if (lock) lock.active = password.length > 0;
                const listener = () => {
                    this.saveQuickJoinSelection(config);
                    this.refreshQuickJoinLabel();
                    if (password && !sys.localStorage.getItem(`password_${clubId}_${tagId}`)) {
                        void this.forms.show('ui/club/UIClubRoomPassword', config, clubId);
                        return;
                    }
                    this.emitQuickJoin(config, clubId, unionId);
                    this.forms.close('ui/club/UIQuickJoinRoom');
                };
                if (button) {
                    button.on(Button.EventType.CLICK, listener);
                    this.quickRoomDisposers.push(() => {
                        if (button.isValid) button.off(Button.EventType.CLICK, listener);
                    });
                }
                layout.addChild(node);
            }
            layout.getComponent(Layout)?.updateLayout();
        } catch (error: unknown) {
            if (epoch !== this.quickJoinEpoch || !form.node.isValid || !form.isShown()) return;
            this.setCollectionState(form.node, 'error');
            await this.forms.show('UIMessage_Drift', null, null,
                error instanceof Error ? error.message : '快速加入玩法加载失败，请稍后重试');
        }
    }

    private startQuickJoin(): void {
        const selected = this.readQuickJoinSelection();
        if (!selected) {
            void this.forms.show('ui/club/UIQuickJoinRoom');
            return;
        }
        const template = this.findSelectedTemplate(selected);
        if (!template) {
            this.clearQuickJoinSelection();
            this.refreshQuickJoinLabel();
            void this.forms.show('ui/club/UIQuickJoinRoom');
            return;
        }
        const entity = this.mostPopulatedRoomForTemplate(template);
        const target = entity ?? template;
        this.saveQuickJoinSelection(target);
        this.refreshQuickJoinLabel();
        this.emitQuickJoin(target, this.clubId(), Number(this.club?.unionId ?? 0));
    }

    private mostPopulatedRoomForTemplate(template: ClubRoom): ClubRoom | null {
        const candidates = this.rooms.filter((room) => Number(room.roomId ?? room.roomID ?? 0) > 0
            && this.sameRoomTemplate(room, template)
            && (Number(room.playerNum ?? 0) <= 0
                || this.occupiedRoomSeats(room) < Number(room.playerNum)));
        candidates.sort((left, right) => this.occupiedRoomSeats(right) - this.occupiedRoomSeats(left));
        return candidates[0] ?? null;
    }

    private occupiedRoomSeats(room: ClubRoom): number {
        return Array.isArray(room.posList)
            ? room.posList.filter((position) => Number((position as Record<string, unknown> | undefined)?.pid ?? 0) > 0).length
            : Number(room.occupiedCount ?? 0);
    }

    private sameRoomTemplate(room: ClubRoom, template: ClubRoom): boolean {
        const roomTag = Number(room.tagId ?? room.configId ?? 0);
        const templateTag = Number(template.tagId ?? template.configId ?? 0);
        if (roomTag > 0 && templateTag > 0) return roomTag === templateTag;
        const roomCode = String(room.templateCode ?? room.clubTemplateCode ?? '').trim();
        const templateCode = String(template.templateCode ?? template.clubTemplateCode ?? '').trim();
        if (roomCode && templateCode) return roomCode === templateCode;
        return Number(room.gameId ?? 0) === Number(template.gameId ?? 0)
            && this.roomDisplayName(room) === this.roomDisplayName(template);
    }

    private findSelectedTemplate(selected: QuickJoinSelection): ClubRoom | null {
        const probe = selected as ClubRoom;
        return this.rooms.find((room) => Number(room.roomId ?? room.roomID ?? 0) <= 0
            && this.sameRoomTemplate(room, probe)) ?? null;
    }

    private quickJoinStorageKey(): string {
        return `club_quick_join_${this.playerId}_${this.clubId()}`;
    }

    private saveQuickJoinSelection(config: ClubRoom): void {
        const selection: QuickJoinSelection = {
            roomKey: String(config.roomKey ?? config.tagId ?? config.configId ?? ''),
            roomName: this.roomDisplayName(config),
            tagId: Number(config.tagId ?? 0) || undefined,
            configId: Number(config.configId ?? 0) || undefined,
            templateCode: String(config.templateCode ?? config.clubTemplateCode ?? '') || undefined,
            gameId: config.gameId,
            gameCode: this.roomGameCode(config) || undefined,
        };
        sys.localStorage.setItem(this.quickJoinStorageKey(), JSON.stringify(selection));
    }

    private readQuickJoinSelection(): QuickJoinSelection | null {
        const raw = sys.localStorage.getItem(this.quickJoinStorageKey());
        if (!raw) return null;
        try {
            const selection = JSON.parse(raw) as QuickJoinSelection;
            return selection && selection.roomKey !== undefined && selection.roomName ? selection : null;
        } catch {
            return null;
        }
    }

    private clearQuickJoinSelection(): void {
        sys.localStorage.removeItem(this.quickJoinStorageKey());
    }

    private refreshQuickJoinLabel(): void {
        if (!this.activeForm) return;
        const selection = this.readQuickJoinSelection();
        this.setDescendantLabel(this.findMainNode(this.activeForm, 'Btn_QuickJoin') ?? this.activeForm.node,
            'Lb_RoomName', selection?.roomName || '快速开始');
    }

    private emitQuickJoin(config: ClubRoom, clubId: number, unionId: number): void {
        const tagId = Number(config.tagId ?? 0);
        const storedPassword = sys.localStorage.getItem(`password_${clubId}_${tagId}`) ?? '';
        this.mainNode.emit('legacy-club-join-room', {
            ...config,
            gameName: this.roomGameCode(config) || config.gameName,
            clubId, unionId, password: storedPassword, quickJoin: true,
            waitingEntry: this.isWaitingEntry(config),
        });
    }

    private quickRoomInfo(config: ClubRoom): string {
        const size = Number(config.size ?? config.playerNum ?? 0);
        const setCount = Number(config.setCount ?? 0);
        if (setCount > 100 && setCount < 200) return `${size}人/${size * (setCount % 100)}庄`;
        if (setCount === 201) return `${size}人/1拷`;
        if (setCount === 310) return `${size}人/1课:10分`;
        if (setCount === 311) return `${size}人/1课:100分`;
        if (setCount === 312) return `${size}人/局麻`;
        return `${size}人/${setCount}局`;
    }

    private showClubBox(form: LegacyForm): void {
        this.closeClubBox();
        this.clubBoxController = new ClubBoxController(
            form.node,
            new ClubBoxGateway(this.client),
            { id: this.playerId, name: this.playerName },
            {
                close: () => this.forms.close('ui/club/UIClubSafePanel'),
                requestAmount: (operation, maximum) => this.requestClubBoxAmount(form, operation, maximum),
                notify: async (message) => {
                    await this.forms.show('UIMessage_Drift', null, null, message);
                },
                report: (error) => {
                    void this.forms.show('UIMessage_Drift', null, null,
                        error instanceof Error ? error.message : '保险箱操作失败');
                },
            },
        );
        this.clubBoxController.install();
    }

    private requestClubBoxAmount(
        form: LegacyForm,
        operation: ClubBoxOperation,
        maximum: number,
    ): Promise<number | null> {
        this.cancelClubBoxAmount();
        let value = '';
        return new Promise((resolve) => {
            let settled = false;
            const finish = (result: number | null): void => {
                if (settled) return;
                settled = true;
                this.clubBoxAmountResolver = null;
                this.clubBoxNumpad?.dispose();
                this.clubBoxNumpad = null;
                resolve(result);
            };
            this.clubBoxAmountResolver = finish;
            const maxDigits = Math.max(1, Math.min(12, String(Math.max(0, Math.trunc(maximum))).length));
            void this.clubBoxNumpadService.open(form.node, () => this.forms.loadCommonNumpad(), {
                close: () => finish(null),
                confirm: () => finish(value ? Number(value) : null),
            }, {
                digitCount: maxDigits,
                maxDigits,
                value: () => value,
                setValue: next => { value = next; },
            }, {
                title: `${operation === 'store' ? '存入' : '取出'}积分（最多${maximum}）`,
            }).then((handle) => {
                if (settled) {
                    handle?.dispose();
                    return;
                }
                if (!handle) {
                    finish(null);
                    return;
                }
                this.clubBoxNumpad = handle;
            }).catch((error: unknown) => {
                finish(null);
                void this.forms.show('UIMessage_Drift', null, null,
                    error instanceof Error ? error.message : '数字键盘加载失败');
            });
        });
    }

    private cancelClubBoxAmount(): void {
        const resolve = this.clubBoxAmountResolver;
        this.clubBoxAmountResolver = null;
        if (resolve) resolve(null);
        this.clubBoxNumpad?.dispose();
        this.clubBoxNumpad = null;
    }

    private closeClubBox(): void {
        this.cancelClubBoxAmount();
        this.clubBoxController?.dispose();
        this.clubBoxController = null;
    }

    private openRoomManagement(): void {
        if (!this.canManageRooms()) return;
        const clubId = this.clubId();
        const unionId = Number(this.club?.unionId ?? 0);
        if (unionId <= 0) {
            const path = 'ui/club/ClubRooms';
            void this.forms.show(path, {
                ...(this.club ?? {}), id: clubId, clubId,
                onTemplateSaved: async (savedRoom?: unknown) => {
                    this.forms.close(path);
                    await this.restoreAuthoritativeTemplates(clubId, '保存俱乐部模板后的刷新', savedRoom);
                },
            });
            return;
        }
        const path = this.activePath.includes('club_2')
            ? 'ui/club_2/UIUnionManager_2'
            : 'ui/club/UIUnionManager';
        void this.forms.show(path, {
            ...(this.club ?? {}),
            id: clubId,
            clubId,
            unionId,
            defaultPage: 'btn_Wanfa',
            onTemplateSaved: async (savedRoom?: unknown) => {
                this.forms.close(path);
                await this.restoreAuthoritativeTemplates(clubId, '保存联盟模板后的刷新', savedRoom);
            },
        });
    }

    public async restoreAuthoritativeTemplates(
        expectedClubId = this.clubId(),
        source = '俱乐部模板恢复',
        savedRoom?: unknown,
    ): Promise<boolean> {
        const clubId = this.clubId();
        if (!this.activeForm?.node.isValid || clubId <= 0 || clubId !== expectedClubId) return false;
        const generation = ++this.templateRestoreGeneration;
        const roomList = this.findMainNode(this.activeForm, 'RoomList');
        const mark = roomList ? this.findDescendant(roomList, 'mark') : null;
        const hasRenderedSnapshot = this.rooms.length > 0;
        // Reconnect refreshes must not blank the last authoritative desk snapshot.
        // The replacement is rendered atomically after both club and template reads succeed.
        if (mark && !hasRenderedSnapshot) this.setCollectionState(mark, 'loading');
        try {
            // A return/reconnect can carry an older unionId from local storage. Resolve
            // current club membership first so the snapshot packet and unionId agree.
            const detail = await this.client.request<LegacyClubDetail>('club.CGetClubListById', { clubId });
            if (generation !== this.templateRestoreGeneration || this.clubId() !== clubId
                || !this.activeForm?.node.isValid) return false;
            this.club = { ...(this.club ?? {}), ...detail, id: clubId };
            this.applyClubModeVisibility(this.activeForm);
            const unionId = Number(this.club.unionId ?? 0);
            const packet = unionId > 0 ? 'union.CUnionRoomConfigItemList' : 'club.CClubRoomConfigItemList';
            const scope = { clubId, unionId: unionId || undefined };
            const roomPacket = unionId > 0 ? 'union.CUnionGetAllRoomMin' : 'club.CClubGetAllRoomMin';
            // 2.2.2 receives instantiated rooms and the replacement idle desk in one
            // roomList. The migrated services expose those as two projections, so both
            // must be read from the same scope and combined atomically.
            // Template desks are the permanent lobby entry points. The active-room
            // projection is supplementary and may be temporarily unavailable while
            // Hall/Room services recover; that must never blank the template desks.
            let result = await this.client.request<unknown>(packet, scope);
            if (this.templateRoomArray(result).length === 0) {
                // Some 2.2.2 deployments expose the authoritative templates only
                // through the management projection. Keep the lightweight lobby
                // packet as the primary source, then fall back to that original
                // protocol instead of treating a valid configured club as empty.
                const fallbackPacket = unionId > 0
                    ? 'union.CUnionRoomCfgList' : 'club.CClubGetCreateGameSet';
                const fallbackScope = unionId > 0
                    ? { ...scope, pageNum: 1, classType: 0 } : scope;
                result = await this.client.request<unknown>(fallbackPacket, fallbackScope);
            }
            const activeResult = await this.client.request<unknown>(roomPacket, scope).catch(() => []);
            if (generation !== this.templateRestoreGeneration || this.clubId() !== clubId
                || !this.activeForm?.node.isValid) return false;
            // 2.2.2 renders every template returned by the authoritative room-config
            // projection. `status` is protocol-specific metadata (and commonly 1/2),
            // not a cross-protocol visibility flag; filtering it blanks valid desks.
            const templates = this.templateRoomArray(result);
            this.rooms = this.mergeLobbyRooms(templates, this.activeRoomArray(activeResult));
            // The create response remains authoritative until the read projection catches up.
            const saved = this.templateRoomArray(savedRoom);
            if (saved.length > 0) {
                const savedKey = String(saved[0].roomKey);
                const index = this.rooms.findIndex((room) => String(room.roomKey) === savedKey);
                // The club create response is a management projection and may omit
                // player count/game identity. Keep the authoritative lobby snapshot
                // on top so an incomplete create response cannot make the desk invalid.
                if (index >= 0) this.rooms[index] = { ...saved[0], ...this.rooms[index] };
                else this.rooms.push(saved[0]);
            }
            this.renderRoomFilter();
            this.renderRooms();
            return true;
        } catch (error: unknown) {
            if (generation !== this.templateRestoreGeneration || this.clubId() !== clubId
                || !this.activeForm?.node.isValid) return false;
            if (mark?.isValid) this.setCollectionState(mark, hasRenderedSnapshot ? 'content' : 'error');
            await this.forms.show('UIMessage_Drift', null, null,
                error instanceof Error ? error.message : `${source}失败，请稍后重试`);
            return false;
        }
    }

    private restoreTemplatesAfterReconnect(): void {
        const expectedClubId = this.clubId();
        // StableTransportFacade invokes reconnect listeners while the candidate is
        // still RECOVERING. Defer this UI projection read until the slot commits READY;
        // otherwise a transient recovery-phase query failure leaves no later refresh.
        globalThis.setTimeout(() => {
            void this.restoreAuthoritativeTemplates(expectedClubId, '断线重连后的俱乐部模板恢复');
        }, 0);
    }

    private templateRoomArray(body: unknown): ClubRoom[] {
        let source: unknown = body;
        if (body && typeof body === 'object' && !Array.isArray(body)) {
            const packet = body as Record<string, unknown>;
            source = packet.clubCreateGameSets ?? packet.roomList ?? packet.data ?? packet.result ?? [body];
            if (source !== body && source && typeof source === 'object' && !Array.isArray(source)) {
                return this.templateRoomArray(source);
            }
        }
        if (!Array.isArray(source)) return [];
        return source.flatMap((value): ClubRoom[] => {
            if (!value || typeof value !== 'object') return [];
            const room = value as Record<string, unknown>;
            const config = room.bRoomConfigure && typeof room.bRoomConfigure === 'object'
                ? room.bRoomConfigure as Record<string, unknown> : {};
            let rules: Record<string, unknown> = {};
            if (room.rules && typeof room.rules === 'object') rules = room.rules as Record<string, unknown>;
            else if (typeof room.rules === 'string') {
                try {
                    const decoded = JSON.parse(room.rules) as unknown;
                    if (decoded && typeof decoded === 'object' && !Array.isArray(decoded)) {
                        rules = decoded as Record<string, unknown>;
                    }
                } catch {
                    rules = {};
                }
            }
            const base = config.baseCreateRoom && typeof config.baseCreateRoom === 'object'
                ? config.baseCreateRoom as Record<string, unknown> : {};
            const clubConfig = config.clubRoomCfg && typeof config.clubRoomCfg === 'object'
                ? config.clubRoomCfg as Record<string, unknown> : {};
            // Legacy CClubGetCreateGameSet wraps the playable fields in
            // bRoomConfigure.baseCreateRoom. Flatten that authoritative packet before
            // selecting a desk variant; otherwise playerNum becomes 0 and the desk is discarded.
            const normalized = { ...rules, ...clubConfig, ...base, ...config, ...room } as ClubRoom;
            const roomKey = [room.roomKey, room.configId, room.id, room.gameIndex,
                base.gameIndex, config.gameIndex, clubConfig.roomKey, room.tagId]
                .find((candidate) => candidate !== undefined && candidate !== null
                    && String(candidate).trim() !== '');
            if (roomKey === undefined) return [];
            const gameCode = this.resolveCatalogGameCode(normalized);
            const metadata = gameCode ? CATALOG_GAME_METADATA[gameCode] : undefined;
            return [{
                ...normalized,
                roomKey: roomKey as number | string,
                roomName: String(room.roomName ?? room.name ?? base.roomName ?? config.roomName ?? ''),
                gameCode: gameCode || undefined,
                gameName: gameCode || String(room.gameName ?? room.gameType ?? config.gameType ?? ''),
                gameId: metadata?.gameId ?? Number(room.gameId ?? config.gameId ?? base.gameId ?? 0),
                playerNum: Number(room.playerNum ?? room.size ?? room.playerCount ?? room.renshu
                    ?? base.playerNum ?? base.playerCount ?? base.renshu
                    ?? config.playerNum ?? config.playerCount ?? config.renshu
                    ?? rules.playerNum ?? rules.playerCount ?? rules.renshu ?? 0),
                setCount: Number(room.setCount ?? base.setCount ?? base.jushu
                    ?? config.setCount ?? config.roundCount ?? 0),
            }];
        });
    }

    private activeRoomArray(body: unknown): ClubRoom[] {
        const source = body && typeof body === 'object' && !Array.isArray(body)
            ? (body as Record<string, unknown>).roomList : body;
        if (!Array.isArray(source)) return [];
        return source.filter((value): value is ClubRoom => Boolean(value && typeof value === 'object'));
    }

    private mergeLobbyRooms(templates: ClubRoom[], activeRooms: ClubRoom[]): ClubRoom[] {
        const active = activeRooms.filter((room) => room.isClose !== true).map((room) => {
            const templateCode = String(room.templateCode ?? room.clubTemplateCode ?? room.roomName ?? '');
            const template = templates.find((item) => String(item.templateCode ?? '') === templateCode)
                ?? templates.find((item) => Number(item.gameId ?? 0) === Number(room.gameId ?? 0));
            const merged = { ...(template ?? {}), ...room };
            // The Hall projection historically used zero as "field omitted". Do not
            // let those placeholders erase the template fields required to select
            // the desk shape, exactly as 2.2.2 kept the room configuration attached.
            merged.playerNum = Number(room.playerNum ?? 0) > 0
                ? Number(room.playerNum) : Number(template?.playerNum ?? 0);
            merged.setCount = Number(room.setCount ?? 0) > 0
                ? Number(room.setCount) : Number(template?.setCount ?? 0);
            if (template && (!room.roomName || String(room.roomName) === templateCode)) {
                merged.roomName = template.roomName;
            }
            return { ...merged, roomId: Number(room.roomId ?? room.roomKey ?? 0) };
        });
        // An occupied/playing room does not consume its template desk. As in 2.2.2,
        // members see the real room plus one idle desk for every enabled template.
        return [...active, ...templates];
    }

    private togglePanel(form: LegacyForm, semanticName: string): void {
        const node = this.findMainNode(form, semanticName);
        if (!node) return;
        node.active = !node.active;
        if (node.active) {
            // The menu descends into the bottom toolbar's screen area. Keep the
            // owning top layer above that toolbar so visible menu buttons receive
            // the pointer instead of the quick-join button underneath.
            const top = this.findMainNode(form, 'Top');
            if (top?.parent) top.setSiblingIndex(top.parent.children.length - 1);
        }
    }

    private async openClubSwitcher(form: LegacyForm): Promise<void> {
        const panel = this.findMainNode(form, 'ClubSwitcher');
        if (!panel) return;
        if (panel.active) {
            panel.active = false;
            return;
        }
        if (this.switchPending) return;
        this.switchPending = true;
        this.setCollectionState(panel, 'loading');
        try {
            const clubs = await this.client.request<LegacyClubDetail[]>('club.CGetClubListMin', {});
            this.renderClubSwitcher(form, clubs);
            this.setCollectionState(panel, clubs.length > 0 ? 'content' : 'empty');
            panel.active = true;
        } catch (error: unknown) {
            this.setCollectionState(panel, 'error');
            panel.active = true;
            await this.forms.show('UIMessage_Drift', null, null,
                error instanceof Error ? error.message : '俱乐部列表加载失败，请稍后再试');
        } finally {
            this.switchPending = false;
        }
    }

    private renderClubSwitcher(form: LegacyForm, clubs: LegacyClubDetail[]): void {
        const panel = this.findMainNode(form, 'ClubSwitcher') ?? form.node;
        const mark = this.findDescendant(panel, 'Scroll') ?? this.findDescendant(panel, 'mark');
        const template = mark?.getChildByName('Template') ?? mark?.getChildByName('btn_demo');
        const layout = mark?.getChildByName('Content') ?? mark?.getChildByName('layout');
        if (!template || !layout) return;
        this.clearSwitchListeners();
        for (const child of [...layout.children]) child.destroy();
        template.active = false;
        for (const club of clubs) {
            const node = instantiate(template);
            node.name = `Btn_Club_${club.id ?? 0}`;
            node.active = true;
            this.setLabel(node, node.getChildByName('Lb_Name') ? 'Lb_Name' : 'name', String(club.name ?? ''));
            this.setLabel(node, node.getChildByName('Lb_Id') ? 'Lb_Id' : 'id', `ID:${club.clubsign ?? ''}`);
            this.setLabel(node, node.getChildByName('Lb_PlayerCount') ? 'Lb_PlayerCount' : 'renshu', '*');
            const listener = () => { void this.switchClub(club); };
            this.listenClick(node, listener, this.switchDisposers);
            layout.addChild(node);
        }
        layout.getComponent(Layout)?.updateLayout();
    }

    private async switchClub(summary: LegacyClubDetail): Promise<void> {
        const clubId = Number(summary.id ?? 0);
        if (clubId <= 0 || clubId === this.clubId()) {
            if (this.activeForm) this.active(this.activeForm, 'ClubSwitcher', false);
            return;
        }
        if (this.switchingClubId !== 0) return;
        this.switchingClubId = clubId;
        try {
            const detail = await this.client.request<LegacyClubDetail>('club.CGetClubListById', { clubId });
            const selected = { ...summary, ...detail };
            sys.localStorage.setItem(`legacy_last_club_${this.playerId}`, JSON.stringify(selected));
            const skin = Number(selected.skinType ?? 0);
            const path = skin === 1 ? 'ui/club_1/UIClubMain_1'
                : skin === 2 ? 'ui/club_2/UIClubMain_2' : 'ui/club/ClubMain';
            // Reusing the same skin is an in-place club switch. Closing the form here
            // runs the real "leave club" lifecycle and races the immediately reopened
            // form with lobby navigation and duplicate room restoration.
            if (this.activePath && this.activePath !== path) this.forms.close(this.activePath);
            await this.forms.show(path, { club: selected, rooms: [] });
            this.mainNode.emit('legacy-club-enter', { club: selected });
        } catch (error: unknown) {
            await this.forms.show('UIMessage_Drift', null, null,
                error instanceof Error ? error.message : '切换俱乐部失败，请稍后再试');
        } finally {
            if (this.switchingClubId === clubId) this.switchingClubId = 0;
        }
    }

    private clearSwitchListeners(): void {
        for (const dispose of this.switchDisposers.splice(0)) dispose();
    }

    private active(form: LegacyForm, path: string, active: boolean): void {
        const semanticName = path.slice(path.lastIndexOf('/') + 1);
        const target = this.findMainNode(form, semanticName);
        if (target) target.active = active;
    }

    private markSelected(node: Node | null): void {
        if (!node) return;
        const on = node.getChildByName('on');
        if (on) on.active = true;
        for (const sibling of node.parent?.children ?? []) {
            if (sibling !== node) {
                const other = sibling.getChildByName('on');
                if (other) other.active = false;
            }
        }
    }

    private scrollRooms(delta: number): void {
        const roomList = this.activeForm ? this.findMainNode(this.activeForm, 'RoomList') : null;
        const mark = roomList ? this.findDescendant(roomList, 'mark') : null;
        if (!mark) return;
        const unifiedScroll = mark.getComponent(UnifiedScroll);
        if (unifiedScroll) {
            unifiedScroll.scrollByPage(delta);
            return;
        }
        const scroll = mark.getComponent(ScrollView);
        const viewport = mark.getChildByName('view')?.getComponent(UITransform) ?? mark.getComponent(UITransform);
        if (!scroll?.content || !viewport) return;
        const offset = scroll.getScrollOffset();
        const maximum = scroll.getMaxScrollOffset();
        offset.x = Math.max(0, Math.min(maximum.x, offset.x + delta * viewport.width));
        scroll.scrollToOffset(offset, 0.16, true);
    }

    private show(form: LegacyForm, path: string, context: ClubMainContext): void {
        this.templateRestoreGeneration += 1;
        this.visualEpoch += 1;
        this.mainNode.active = false;
        this.activeForm = form;
        this.activePath = path;
        this.club = context?.club ?? {};
        this.rooms = this.templateRoomArray(context?.rooms);
        this.active(form, 'ClubSwitcher', false);
        this.selectedBackground = this.readSkinSetting('ClubNewBg');
        this.selectedTable = this.readSkinSetting('ClubNewTb');
        this.applyBackground(this.selectedBackground);
        this.setDescendantLabel(form.node, this.findMainNode(form, 'Lb_ClubName') ? 'Lb_ClubName' : 'clubName',
            String(this.club.name ?? ''));
        this.setDescendantLabel(form.node, this.findMainNode(form, 'Lb_ClubId') ? 'Lb_ClubId' : 'clubId',
            `ID:${this.club.clubsign ?? ''}`);
        this.setDescendantLabel(form.node, this.findMainNode(form, 'Lb_PlayName') ? 'Lb_PlayName' : 'lb_cityName',
            '全部玩法');
        const userInfo = this.findMainNode(form, 'Player');
        if (userInfo) {
            this.setDescendantLabel(userInfo, userInfo.getChildByName('Lb_Name') ? 'Lb_Name' : 'lb_name', this.playerName);
            this.setDescendantLabel(userInfo, userInfo.getChildByName('Lb_Id') ? 'Lb_Id' : 'lb_id', `ID:${this.playerId}`);
        }
        this.applyClubModeVisibility(form);
        this.setClubCent(Number(this.club.clubCent ?? 0));
        this.startClubCentRefresh();
        this.startActiveRoomRefresh();
        this.applyTable(this.selectedTable);
        this.refreshQuickJoinLabel();
        this.selectedRoomFilter = null;
        this.renderRoomFilter();
        this.renderRooms();
        // The entry context is only the currently instantiated room projection. In
        // 2.2.2 Event_InitClubRoom always followed it with InitNullTable, which reads
        // every enabled template. Restore that authoritative snapshot on every entry
        // so idle templates are not replaced by the last active/created room.
        void this.restoreAuthoritativeTemplates(this.clubId(), '进入俱乐部后的模板恢复');
        void this.checkCurrentRoom();
    }

    private openClubRecord(): void {
        // Records owns its loading lifecycle; route through the module controller
        // instead of mounting its prefab directly from Club.
        this.mainNode.emit('legacy-open-records', { source: 'CLUB' });
    }

    private applyClubModeVisibility(form: LegacyForm): void {
        const isUnion = Number(this.club?.unionId ?? 0) > 0;
        const minister = this.clubMinister();
        const isCaptain = this.isCaptain();
        const canManageRooms = this.canManageRooms();
        this.active(form, 'RoomFilter', isUnion);
        this.active(form, 'TableList', false);
        this.active(form, 'Event', isUnion);
        this.active(form, 'Btn_Record', !isUnion);
        this.active(form, 'Btn_Event', this.canOpenUnionEntry());
        // 2.2.2: managers see the member list; captain identities also see it even
        // when their club minister role is still the ordinary-member value.
        this.active(form, 'Btn_Member', minister !== 0 || isCaptain);
        this.active(form, 'Btn_Room', canManageRooms);
        this.active(form, 'Btn_Promoter', this.canOpenCaptainList());
        this.active(form, 'Btn_BanTable', this.canManageAlliance());
        this.active(form, 'Btn_Wechat', minister !== 0);
        this.active(form, 'Btn_Msg', minister !== 0);
        // Skin switching is an owner-level entrance in the current ClubMain UI.
        this.active(form, 'Btn_Skin', this.isClubOwnerOrAllianceOwner());
        this.active(form, 'Btn_Manage', true);
        this.active(form, 'Btn_More', true);
        // The old client gated the safe-box entry by tournament state. It is now
        // available for every club, including immediately after creating a union.
        this.active(form, 'Btn_Safe', true);
    }

    /**
     * The club owner remains the same principal after this club creates an alliance:
     * minister=2 therefore means club owner before creation and alliance owner after it.
     * unionPostType is still accepted for alliance administrators and legacy snapshots.
     */
    private canOpenUnionEntry(): boolean {
        const unionId = Number(this.club?.unionId ?? 0);
        const allianceRole = Number(this.club?.unionPostType ?? 0);
        // 2.2.2 keeps this entry visible for the club creator before alliance
        // creation as well; it opens the create-alliance panel in that state.
        return this.isClubOwner() || (unionId > 0 && (allianceRole === 2 || allianceRole === 3));
    }

    private canManageRooms(): boolean {
        const unionId = Number(this.club?.unionId ?? 0);
        if (unionId <= 0) return this.clubMinister() > 0;
        const allianceRole = Number(this.club?.unionPostType ?? 0);
        return this.isClubOwner() || allianceRole === 2 || allianceRole === 3;
    }

    private canManageAlliance(): boolean {
        return Number(this.club?.unionId ?? 0) > 0
            && (this.isClubOwner() || [2, 3].includes(Number(this.club?.unionPostType ?? 0)));
    }

    private canOpenCaptainList(): boolean {
        return this.isClubOwnerOrCaptain();
    }

    private isClubOwnerOrCaptain(): boolean {
        return this.isClubOwnerOrAllianceOwner()
            || this.isCaptain();
    }

    private isClubOwnerOrAllianceOwner(): boolean {
        return this.isClubOwner() || Number(this.club?.unionPostType ?? 0) === 3;
    }

    private isClubOwner(): boolean {
        return this.clubMinister() === 2;
    }

    private isCaptain(): boolean {
        return this.club?.isPromotionManage === true
            || Number(this.club?.isPromotionManage ?? 0) > 0
            || Number(this.club?.levelPromotion ?? 0) > 0;
    }

    private clubMinister(): number {
        return Number(this.club?.minister ?? this.club?.myisminister ?? 0);
    }

    private clubId(): number {
        for (const value of [this.club?.id, this.club?.clubId, this.club?.clubID]) {
            const candidate = Number(value ?? 0);
            if (candidate > 0) return candidate;
        }
        return 0;
    }

    private currentClubContext(): LegacyClubDetail & { id: number; clubId: number; unionId: number } {
        const clubId = this.clubId();
        return { ...(this.club ?? {}), id: clubId, clubId, unionId: Number(this.club?.unionId ?? 0) };
    }

    private close(path: string): void {
        if (this.activePath !== path) return;
        const internalSwitch = this.switchingClubId !== 0;
        this.templateRestoreGeneration += 1;
        this.visualEpoch += 1;
        this.clearSwitchListeners();
        this.stopClubCentRefresh();
        this.stopActiveRoomRefresh();
        this.activeForm = null;
        this.activePath = '';
        this.club = null;
        this.rooms = [];
        if (!internalSwitch) {
            this.mainNode.active = true;
            this.onReturnLobby();
            void this.client.request<unknown>('player.CPlayerSignInterface', { sign: 0 }).catch(() => undefined);
        }
    }

    private setClubCent(value: number): void {
        if (!this.activeForm) return;
        const normalized = Number.isFinite(value) ? value : 0;
        const event = this.findMainNode(this.activeForm, 'Event');
        const label = event
            ? this.findDescendant(event, 'Lb_Score') ?? this.findDescendant(event, 'lb_ClubCent')
            : null;
        if (label) this.setDescendantLabel(label, label.name, String(normalized));
    }

    private startClubCentRefresh(): void {
        this.stopClubCentRefresh();
        void this.refreshClubCent();
        this.clubCentRefreshTimer = setInterval(() => { void this.refreshClubCent(); }, 1000);
    }

    private stopClubCentRefresh(): void {
        if (this.clubCentRefreshTimer !== null) clearInterval(this.clubCentRefreshTimer);
        this.clubCentRefreshTimer = null;
        this.clubCentRefreshPending = false;
    }

    private async refreshClubCent(): Promise<void> {
        const clubId = this.clubId();
        if (!this.activeForm || clubId <= 0 || this.clubCentRefreshPending) return;
        this.clubCentRefreshPending = true;
        try {
            const detail = await this.client.request<LegacyClubDetail>('club.CGetClubListById', { clubId });
            if (!this.activeForm || this.clubId() !== clubId) return;
            this.club = { ...(this.club ?? {}), ...detail };
            this.setClubCent(Number(detail.clubCent ?? 0));
        } catch {
            // Keep the last confirmed value during a transient reconnect.
        } finally {
            this.clubCentRefreshPending = false;
        }
    }

    private startActiveRoomRefresh(): void {
        this.stopActiveRoomRefresh();
        this.activeRoomRefreshTimer = setInterval(() => { void this.refreshActiveRooms(); }, 1000);
    }

    private stopActiveRoomRefresh(): void {
        if (this.activeRoomRefreshTimer !== null) clearInterval(this.activeRoomRefreshTimer);
        this.activeRoomRefreshTimer = null;
        this.activeRoomRefreshPending = false;
    }

    private async refreshActiveRooms(): Promise<void> {
        const clubId = this.clubId();
        if (!this.activeForm || clubId <= 0 || this.activeRoomRefreshPending) return;
        this.activeRoomRefreshPending = true;
        try {
            // Waiting clients must use their own authoritative room membership as
            // the handoff source. Relying only on the shared desk snapshot made the
            // last joiner enter while an earlier waiter could remain in the lobby.
            await this.enterCurrentWaitingRoomWhenFull();
            if (!this.activeForm || this.clubId() !== clubId) return;
            const unionId = Number(this.club?.unionId ?? 0);
            const packet = unionId > 0 ? 'union.CUnionGetAllRoomMin' : 'club.CClubGetAllRoomMin';
            const result = await this.client.request<unknown>(packet, { clubId, unionId: unionId || undefined });
            if (!this.activeForm || this.clubId() !== clubId) return;
            const templates = this.rooms.filter((room) => Number(room.roomId ?? 0) <= 0);
            const next = this.mergeLobbyRooms(templates, this.activeRoomArray(result));
            if (this.roomSnapshotKey(next) === this.roomSnapshotKey(this.rooms)) return;
            this.rooms = next;
            // 满员是房间状态迁移，不应依赖桌子 Prefab 的异步加载/渲染完成。
            // 先按权威座位快照触发当前玩家进房，再刷新桌面表现，保证所有客户端
            // 在最后一个座位提交后同一轮轮询内进入房间。
            this.enterFullWaitingRoom();
            this.renderRooms();
        } catch {
            // Pushes remain the primary path. Preserve the last confirmed desk list
            // while the authoritative polling fallback is temporarily unavailable.
        } finally {
            this.activeRoomRefreshPending = false;
        }
    }

    private async enterCurrentWaitingRoomWhenFull(expectedRoomId = 0): Promise<void> {
        let current: ClubRoom & { occupiedCount?: number; waitingFull?: boolean };
        try {
            current = await this.client.requestLobby<ClubRoom & {
                occupiedCount?: number;
                waitingFull?: boolean;
            }>('room.CBaseRoomConfig', {});
        } catch {
            // A transient Hall reconnect must not prevent the independent desk-list
            // refresh below; the next one-second tick retries this authoritative check.
            return;
        }
        const roomId = Number(current.roomId ?? current.roomID ?? 0);
        // A ready event can arrive after the player has switched desks. Pin push
        // handling to its source room so the stale event cannot enter/dissolve the
        // player's newly selected waiting room.
        if (expectedRoomId > 0 && roomId !== expectedRoomId) return;
        const playerNum = Number(current.playerNum ?? 0);
        const occupiedCount = Number(current.occupiedCount ?? 0);
        const waitingFull = current.waitingFull === true || String(current.waitingFull) === 'true'
            || (playerNum > 0 && occupiedCount >= playerNum);
        if (roomId <= 0 || !this.isWaitingEntry(current)
            || !waitingFull || this.waitingHandoffRoomId === roomId) return;
        this.waitingHandoffRoomId = roomId;
        this.mainNode.emit('legacy-club-join-room', {
            ...current,
            roomId,
            roomKey: roomId,
            gameName: this.roomGameCode(current) || current.gameName,
            clubId: current.clubId ?? this.club?.id,
            unionId: this.club?.unionId,
            waitingEntry: true,
            forceEnter: true,
        });
        this.armWaitingHandoffRetry(roomId);
    }

    private roomSnapshotKey(rooms: ClubRoom[]): string {
        return JSON.stringify(rooms.map((room) => ({
            roomId: Number(room.roomId ?? 0),
            roomKey: String(room.roomKey ?? ''),
            templateCode: String(room.templateCode ?? room.clubTemplateCode ?? ''),
            state: String(room.state ?? ''),
            setId: Number(room.setId ?? 0),
            setCount: Number(room.setCount ?? 0),
            playerNum: Number(room.playerNum ?? 0),
            posList: Array.isArray(room.posList) ? room.posList.map((position) => {
                const value = position && typeof position === 'object'
                    ? position as Record<string, unknown> : {};
                return { pid: Number(value.pid ?? 0), pos: Number(value.pos ?? -1), name: String(value.name ?? '') };
            }) : [],
        })));
    }

    private async checkCurrentRoom(): Promise<void> {
        try {
            const room = await this.client.requestLobby<ClubRoom>('room.CBaseRoomConfig', {});
            // UIClubInRoom is the waiting-entry seat panel. Direct-entry games
            // navigate straight to their game scene and must never open this form.
            if (Number(room.roomID ?? room.roomId ?? 0) > 0
                && this.isWaitingEntry(room) && this.activeForm) {
                await this.forms.show('ui/club/UIClubInRoom', room);
                this.mainNode.emit('legacy-club-current-room', room);
            }
        } catch { /* The normal not-in-room response is intentionally silent. */ }
    }

    private replaceRooms(body: unknown): void {
        if (!this.activeForm || !this.matchesClub(body)) return;
        void this.restoreAuthoritativeTemplates(this.clubId(), '俱乐部模板推送刷新');
    }

    private refreshRoomsFromTemplatePush(body: unknown): void {
        if (!this.activeForm || !this.matchesClub(body)) return;
        // Room-status pushes contain only currently instantiated rooms. The hall is a
        // template desk list, so replacing it with that payload would erase every idle template.
        void this.restoreAuthoritativeTemplates(this.clubId(), '俱乐部模板推送刷新');
    }

    private updateRoom(body: unknown): void {
        if (!this.activeForm || !body || typeof body !== 'object') return;
        const packet = body as Record<string, unknown>;
        const hasScope = packet.clubId !== undefined || packet.unionId !== undefined;
        if (!hasScope) {
            // Unscoped legacy events cannot safely mutate a newly restored club. Re-read
            // the current club's authoritative snapshot instead.
            void this.restoreAuthoritativeTemplates(this.clubId(), '俱乐部房间状态刷新');
            return;
        }
        if (!this.matchesClub(body)) return;
        const candidate = (packet.roomInfoItem ?? packet.roomInfo ?? packet) as ClubRoom;
        const roomKey = candidate?.roomKey ?? packet.roomKey;
        if (roomKey === undefined) return;
        const index = this.rooms.findIndex((room) => String(room.roomKey) === String(roomKey));
        if (candidate.isClose === true) {
            // Only the instantiated room disappears. Its idle template is a separate
            // row and must remain available for the next click, as it did in 2.2.2.
            if (index >= 0 && Number(this.rooms[index].roomId ?? 0) > 0) this.rooms.splice(index, 1);
        } else if (packet.pos && typeof packet.pos === 'object') {
            if (index < 0) {
                // A player event may race the room-created event. A partial packet has
                // no rules/shape data, so recover the authoritative room snapshot.
                void this.restoreAuthoritativeTemplates(this.clubId(), '俱乐部玩家进出房间刷新');
                return;
            }
            const room = this.rooms[index];
            const position = packet.pos as Record<string, unknown>;
            const seat = Math.trunc(Number(position.pos ?? -1));
            const positions = Array.isArray(room.posList) ? [...room.posList] : [];
            if (seat >= 0) {
                if (Number(position.pid ?? 0) > 0) positions[seat] = position;
                else positions[seat] = undefined;
            }
            this.rooms[index] = { ...room, ...candidate, posList: positions };
        } else if (index >= 0) {
            this.rooms[index] = { ...this.rooms[index], ...candidate };
        } else {
            // Room-created pushes contain the full 2.2.2 room item. If a migrated
            // backend sends only identifiers, use the authoritative projection.
            const hasRoomShape = Number(candidate.playerNum ?? 0) > 0 || Number(candidate.gameId ?? 0) > 0;
            if (!hasRoomShape) {
                void this.restoreAuthoritativeTemplates(this.clubId(), '俱乐部房间状态刷新');
                return;
            }
            this.rooms.push(candidate);
        }
        if (this.currentRoom && String(this.currentRoom.roomKey) === String(roomKey)) {
            if (candidate.isClose === true) this.forms.close('ui/club/UIClubInRoom');
            else if (this.roomForm) this.showCurrentRoom(this.roomForm, { ...this.currentRoom, ...candidate });
        }
        this.enterFullWaitingRoom();
        this.renderRooms();
    }

    private renderRooms(): void {
        const roomList = this.activeForm ? this.findMainNode(this.activeForm, 'RoomList') : null;
        const mark = roomList ? this.findDescendant(roomList, 'mark') : null;
        const layout = mark?.getChildByName('view')?.getChildByName('layout');
        if (!mark || !layout) return;
        const legacyDemo = mark.getChildByName('demo');
        if (legacyDemo) legacyDemo.active = false;
        const epoch = ++this.roomRenderEpoch;
        this.setCollectionState(mark, 'loading');
        // CommonHead/Stat is only needed for occupied seats. Never put this optional
        // resource on the critical path of idle/template desk rendering.
        void this.loadClubDeskPrefab().then((prefab) => {
            if (epoch !== this.roomRenderEpoch || !this.activeForm?.node.isValid || !mark.isValid || !layout.isValid) return;
            if (!prefab) {
                this.setCollectionState(mark, 'error');
                return;
            }
            this.renderClubDesks(mark, layout, prefab, this.commonHeadPrefab?.isValid ? this.commonHeadPrefab : null);
            if (!this.commonHeadPrefabLoading && !this.commonHeadPrefab?.isValid) {
                void this.loadCommonHeadPrefab().then((commonHeadPrefab) => {
                    if (!commonHeadPrefab || epoch !== this.roomRenderEpoch || !this.activeForm?.node.isValid) return;
                    this.renderRooms();
                });
            }
        });
    }

    private renderClubDesks(mark: Node, layout: Node, prefab: Prefab, commonHeadPrefab: Prefab | null): void {
        const roomScroll = UnifiedScroll.ensure(mark, UnifiedScrollDirection.Horizontal);
        const unifiedScroll = mark.getComponent(UnifiedScroll);
        const roomLayout = layout.getComponent(Layout);
        if (roomLayout) {
            // 2.2.2 creates one fixed placeholder for every desk and positions those
            // placeholders itself. Creator 3.8 Layout does not recalculate correctly
            // for the migrated 620x360 variant prefab, leaving all desks overlapped.
            // Keep the original explicit-placement contract instead of relying on it.
            roomLayout.enabled = false;
        }
        this.clearRoomListeners();
        // destroy() is deferred until the end of the frame. Detach first so Layout
        // never counts stale desks together with the freshly restored snapshot.
        for (const child of [...layout.children]) {
            child.removeFromParent();
            child.destroy();
        }
        const seen = new Set<string>();
        const filteredRooms = this.selectedRoomFilter
            ? this.rooms.filter((room) => this.sameRoomTemplate(room, this.selectedRoomFilter as ClubRoom))
            : this.rooms;
        // 2.2.2 的“隐藏已开房间”只隐藏已经开始牌局的实体桌。
        // 玩家刚坐下但 setId 仍为 0 的等待桌必须继续显示，并与永久模板桌并存。
        const visibleRooms = this.hideOpenedRooms
            ? filteredRooms.filter((room) => Number(room.setId ?? 0) <= 0)
            : filteredRooms;
        for (const room of visibleRooms) {
            const key = `${Number(room.roomId ?? 0) > 0 ? 'room' : 'template'}:${String(room.roomKey ?? '')}`;
            if (!key || seen.has(key)) continue;
            const roomId = Number(room.roomId ?? room.roomID ?? 0);
            if (Number.isSafeInteger(roomId) && roomId > 0) {
                this.mainNode.emit('legacy-club-prewarm-room', { roomId });
            }
            const node = instantiate(prefab);
            if (!this.selectClubDeskVariant(node, room)) {
                node.destroy();
                continue;
            }
            seen.add(key);
            node.name = `join_room_${key}`;
            node.active = true;
            // ClubDesk was authored as a standalone full-panel preview and its root
            // Widget recenters the node every frame. In the hall it is a repeated
            // item, so placement belongs exclusively to the 2.2.2 two-row desk grid below.
            const deskWidget = node.getComponent(Widget);
            if (deskWidget) deskWidget.enabled = false;
            node.setScale(0.7, 0.7, 1);
            this.setDescendantLabel(node, 'GameName', this.roomDisplayName(room));
            this.setDescendantLabel(node, 'RoundInfo', `${room.setId ?? 0}/${room.setCount ?? 0}`);
            this.renderDeskPlayers(node, room, commonHeadPrefab);
            // ClubDesk keeps Long/Round/Square variants in one prefab. Searching the
            // whole tree returns Long's hidden detail node even when Round/Square is
            // displayed, which makes the visible label inert.
            const detail = this.findActiveDescendant(node, 'Btn_Detail');
            let lastPointerAt = 0;
            const listener = (event?: EventTouch) => {
                // The 2.2.2 desk prefab binds the detail label separately from the
                // desk join surface.  A root Button in Creator 3 receives the same
                // bubbled gesture and turns a detail tap into a room join, so keep
                // the join surface as a touch listener and exclude the detail tree.
                let target = event?.target instanceof Node ? event.target : null;
                while (target) {
                    if (target === detail) return;
                    if (target === node) break;
                    target = target.parent;
                }
                if (unifiedScroll?.shouldSuppressClick()) return;
                const now = Date.now();
                if (now - lastPointerAt < 250) return;
                lastPointerAt = now;
                const gameCode = this.roomGameCode(room);
                this.saveQuickJoinSelection(room);
                this.refreshQuickJoinLabel();
                this.mainNode.emit('legacy-club-join-room', {
                    ...room, gameName: gameCode || room.gameName,
                    clubId: this.club?.id, unionId: this.club?.unionId,
                    waitingEntry: this.isWaitingEntry(room),
                });
            };
            const deskButton = node.getComponent(Button);
            if (deskButton) deskButton.enabled = false;
            node.on(Node.EventType.TOUCH_END, listener);
            this.roomDisposers.push(() => {
                if (!node.isValid) return;
                node.off(Node.EventType.TOUCH_END, listener);
            });
            if (detail) {
                const showDetail = (event?: { propagationStopped?: boolean }) => {
                    if (event) event.propagationStopped = true;
                    void this.openRoomDetail(room);
                };
                // Two of the three migrated ClubDesk variants contain only a Label
                // here.  2.2.2 treated that node as a clickable item; Creator 3 does
                // not emit Button.CLICK until a Button component exists.
                const detailButton = detail.getComponent(Button) ?? detail.addComponent(Button);
                detailButton.transition = Button.Transition.NONE;
                detail.on(Button.EventType.CLICK, showDetail);
                this.roomDisposers.push(() => {
                    if (detail.isValid) detail.off(Button.EventType.CLICK, showDetail);
                });
            }
            layout.addChild(node);
        }
        const contentTransform = layout.getComponent(UITransform);
        const deskNodes = layout.children;
        // These are the effective 2.2.2 placeholder coordinates from
        // ClubMain: two rows per column, then paginate to the right.
        const columnStep = 317;
        const rowStep = 215;
        const firstX = 193.5;
        const firstY = -162.5;
        const columnCount = Math.ceil(deskNodes.length / 2);
        const viewportWidth = layout.parent?.getComponent(UITransform)?.width ?? 1066;
        const contentWidth = Math.max(viewportWidth, firstX * 2 + Math.max(0, columnCount - 1) * columnStep);
        if (contentTransform) contentTransform.setContentSize(contentWidth, 550);
        deskNodes.forEach((node, index) => {
            const column = Math.floor(index / 2);
            const row = index % 2;
            node.setPosition(firstX + column * columnStep, firstY - row * rowStep, 0);
        });
        mark.getComponent(ScrollView)?.scrollToLeft(0, false);
        this.setCollectionState(mark, seen.size > 0 ? 'content' : 'empty');
        this.enterFullWaitingRoom();
    }

    private renderRoomFilter(): void {
        const form = this.activeForm;
        if (!form) return;
        const filter = this.findMainNode(form, 'RoomFilter');
        const list = filter ? this.findDescendant(filter, 'PlayList') : null;
        const content = list ? this.findDescendant(list, 'Content') : null;
        const template = content?.getChildByName('Btn_Play') ?? null;
        if (!content || !template) return;
        this.clearRoomFilterListeners();
        for (const child of [...content.children]) {
            if (child !== template) child.destroy();
        }
        template.active = false;
        const templates = this.rooms.filter((room) => Number(room.roomId ?? room.roomID ?? 0) <= 0);
        const unique = new Map<string, ClubRoom>();
        for (const room of templates) unique.set(this.roomFilterKey(room), room);
        const selectedKey = this.selectedRoomFilter ? this.roomFilterKey(this.selectedRoomFilter) : '';
        this.selectedRoomFilter = selectedKey ? unique.get(selectedKey) ?? null : null;
        for (const [key, room] of unique) {
            const item = instantiate(template);
            item.name = `Btn_Play_${key.replace(/[^A-Za-z0-9]/g, '')}`;
            item.active = true;
            this.setLabel(item, 'Label', this.roomDisplayName(room));
            const listener = () => {
                this.selectedRoomFilter = room;
                this.markSelected(item);
                this.renderRooms();
            };
            item.on(Button.EventType.CLICK, listener);
            this.roomFilterDisposers.push(() => {
                if (item.isValid) item.off(Button.EventType.CLICK, listener);
            });
            content.addChild(item);
            if (key === selectedKey) this.markSelected(item);
        }
        content.getComponent(Layout)?.updateLayout();
        if (!this.selectedRoomFilter && filter) this.markSelected(this.findDescendant(filter, 'Btn_All'));
    }

    private roomFilterKey(room: ClubRoom): string {
        const tagId = Number(room.tagId ?? room.configId ?? 0);
        if (tagId > 0) return `Tag${tagId}`;
        const templateCode = String(room.templateCode ?? room.clubTemplateCode ?? '').trim();
        if (templateCode) return `Template${templateCode}`;
        return `Game${Number(room.gameId ?? 0)}-${this.roomDisplayName(room)}`;
    }

    private clearRoomFilterListeners(): void {
        for (const dispose of this.roomFilterDisposers.splice(0)) dispose();
    }

    /** Waiting entry is opt-in by stable business code; every unlisted game stays direct. */
    private isWaitingEntry(room: ClubRoom): boolean {
        return this.roomGameCode(room) === 'LS201';
    }

    private roomGameCode(room: ClubRoom): string {
        const explicit = String(room.gameCode ?? room.game_code ?? '').trim().toUpperCase();
        if (explicit) return explicit;
        return String(this.gameNames.get(Number(room.gameId ?? 0)) ?? room.gameName ?? '').trim().toUpperCase();
    }

    private enterFullWaitingRoom(): void {
        const room = this.rooms.find((item) => {
            if (Number(item.roomId ?? 0) <= 0 || !this.isWaitingEntry(item)) return false;
            const positions = Array.isArray(item.posList) ? item.posList : [];
            const occupied = positions.filter((position) =>
                Number((position as Record<string, unknown> | undefined)?.pid ?? 0) > 0);
            return occupied.some((position) => Number((position as Record<string, unknown>).pid) === this.playerId)
                && Number(item.playerNum ?? 0) > 0 && occupied.length >= Number(item.playerNum);
        });
        const roomId = Number(room?.roomId ?? 0);
        if (!room || roomId <= 0) {
            this.waitingHandoffRoomId = 0;
            return;
        }
        if (this.waitingHandoffRoomId === roomId) return;
        this.waitingHandoffRoomId = roomId;
        this.mainNode.emit('legacy-club-join-room', {
            ...room,
            gameName: this.roomGameCode(room) || room.gameName,
            clubId: this.club?.id,
            unionId: this.club?.unionId,
            waitingEntry: true,
            forceEnter: true,
        });
        this.armWaitingHandoffRetry(roomId);
    }

    /**
     * A room-ready push is a durable condition, not a one-shot edge. Navigation can
     * temporarily lose its ticket or scene transition while the Hall membership is
     * already committed. Release the local duplicate guard and re-read the player's
     * authoritative room until the club form actually closes on successful handoff.
     */
    private armWaitingHandoffRetry(roomId: number): void {
        this.clearWaitingHandoffRetry();
        this.waitingHandoffRetryTimer = globalThis.setTimeout(() => {
            this.waitingHandoffRetryTimer = null;
            if (!this.activeForm || this.waitingHandoffRoomId !== roomId) return;
            this.waitingHandoffRoomId = 0;
            void this.enterCurrentWaitingRoomWhenFull(roomId);
        }, 1000);
    }

    private clearWaitingHandoffRetry(): void {
        if (this.waitingHandoffRetryTimer !== null) globalThis.clearTimeout(this.waitingHandoffRetryTimer);
        this.waitingHandoffRetryTimer = null;
    }

    private renderDeskPlayers(root: Node, room: ClubRoom, commonHeadPrefab: Prefab | null): void {
        const seats: Node[] = [];
        const visit = (node: Node): void => {
            // The desk is populated before it is attached to the scroll content, so
            // activeInHierarchy is false even for the selected prefab branch.
            if (!node.active) return;
            if (node.name === 'ClubDeskSeat') seats.push(node);
            for (const child of node.children) visit(child);
        };
        visit(root);
        const positions = Array.isArray(room.posList)
            ? room.posList as Array<Record<string, unknown> | undefined>
            : [];
        for (let index = 0; index < seats.length; index += 1) {
            const seat = seats[index];
            const authoredSeat = Math.trunc(Number(seat.parent?.name ?? -1));
            const seatNo = authoredSeat >= 0 ? authoredSeat : index;
            const player = positions.find((value) => Math.trunc(Number(value?.pos ?? -1)) === seatNo);
            const occupied = Number(player?.pid ?? 0) > 0;
            const emptyState = seat.getChildByName('EmptyState');
            const playerAnchor = seat.getChildByName('Direction')?.getChildByName('PlayerAnchor');
            let commonHead = playerAnchor?.getChildByName('CommonHead') ?? null;
            if (playerAnchor && !commonHead && commonHeadPrefab) {
                commonHead = instantiate(commonHeadPrefab);
                commonHead.name = 'CommonHead';
                commonHead.setPosition(0, 0, 0);
                playerAnchor.addChild(commonHead);
                for (const name of ['Game', 'List', 'Stat']) {
                    const variant = commonHead.getChildByName(name);
                    if (variant) variant.active = name === 'Stat';
                }
            }
            const playerState = commonHead?.getChildByName('Stat') ?? null;
            if (emptyState) emptyState.active = !occupied;
            if (playerState) {
                playerState.active = occupied;
                if (occupied) {
                    const playerId = Number(player?.pid ?? 0);
                    this.setDescendantLabel(playerState, 'Nickname', String(player?.name ?? ''));
                    const avatar = this.findDescendant(playerState, 'Avatar')?.getComponent(Sprite) ?? null;
                    const onlineState = this.findDescendant(playerState, 'OnlineState');
                    const online = player?.online ?? player?.isOnline ?? false;
                    if (onlineState) onlineState.active = online === true || Number(online) === 1;
                    void PlayerAvatarService.assign(avatar, playerId,
                        String(player?.headImageUrl ?? player?.iconUrl ?? player?.avatarUrl ?? ''));
                }
            }
        }
    }

    private roomDisplayName(room: ClubRoom): string {
        const roomName = String(room.roomName ?? '').trim();
        if (roomName) return roomName;
        const gameCode = this.resolveCatalogGameCode(room);
        const catalogName = gameCode ? CATALOG_GAME_METADATA[gameCode]?.displayName : undefined;
        return String(catalogName ?? room.gameName ?? room.gameCode ?? room.game_code ?? '');
    }

    private loadClubDeskPrefab(): Promise<Prefab | null> {
        if (this.clubDeskPrefab?.isValid) return Promise.resolve(this.clubDeskPrefab);
        if (this.clubDeskPrefabLoading) return this.clubDeskPrefabLoading;
        const pending = this.loadPrefab(CLUB_DESK_PREFAB.bundle, CLUB_DESK_PREFAB.path)
            .then((prefab) => { this.clubDeskPrefab = prefab; return prefab; })
            .finally(() => { this.clubDeskPrefabLoading = null; });
        this.clubDeskPrefabLoading = pending;
        return pending;
    }

    private loadCommonHeadPrefab(): Promise<Prefab | null> {
        if (this.commonHeadPrefab?.isValid) return Promise.resolve(this.commonHeadPrefab);
        if (this.commonHeadPrefabLoading) return this.commonHeadPrefabLoading;
        const pending = this.loadPrefab(COMMON_HEAD_PREFAB.bundle, COMMON_HEAD_PREFAB.path)
            .then((prefab) => { this.commonHeadPrefab = prefab; return prefab; })
            .finally(() => { this.commonHeadPrefabLoading = null; });
        this.commonHeadPrefabLoading = pending;
        return pending;
    }

    private async loadPrefab(bundleName: string, assetPath: string): Promise<Prefab | null> {
        const generation = this.assetLoadGeneration;
        try {
            const bundle = await this.assets.bundle(bundleName);
            const prefab = await this.assets.load(assetPath, Prefab, bundle);
            if (generation !== this.assetLoadGeneration) {
                this.assets.release(prefab);
                return null;
            }
            return prefab;
        } catch {
            return null;
        }
    }

    private selectClubDeskVariant(root: Node, room: ClubRoom): boolean {
        const variants = root.getChildByName('Variants');
        const gameCode = this.resolveCatalogGameCode(room);
        const playerCount = Math.trunc(Number(room.playerNum ?? 0));
        const selection = gameCode ? resolveClubDeskVariant(gameCode, playerCount) : null;
        if (!variants || !selection) return false;
        for (const shape of variants.children) shape.active = shape.name === selection.shapeName;
        const shape = variants.getChildByName(selection.shapeName);
        if (!shape) return false;
        let matched = false;
        for (const players of shape.children) {
            if (!players.name.startsWith('Players_')) continue;
            players.active = players.name === selection.playersName;
            matched ||= players.active;
        }
        return matched;
    }

    private resolveCatalogGameCode(room: ClubRoom): string {
        // Template packets vary between stable code, catalog id and catalog display name.
        // Every representation is resolved through the one authoritative Catalog; no aliases
        // or numeric-range classification are introduced here.
        for (const value of [room.gameCode, room.game_code, room.gameId, room.gameType, room.gameName]) {
            const text = String(value ?? '').trim();
            if (!text) continue;
            if (CATALOG_GAME_METADATA[text]) return text;
            const gameId = Number(text);
            const match = Object.entries(CATALOG_GAME_METADATA).find(([, metadata]) =>
                (Number.isSafeInteger(gameId) && gameId > 0 && metadata.gameId === gameId)
                || metadata.displayName === text);
            if (match) return match[0];
        }
        return '';
    }

    private async openRoomDetail(room: ClubRoom): Promise<void> {
        const key = String(room.roomKey ?? '');
        if (!key || this.roomDetailPending.has(key)) return;
        this.roomDetailPending.add(key);
        try {
            const unionId = Number(this.club?.unionId ?? 0);
            const packet = unionId > 0 ? 'union.CUnionRoomInfoDetails' : 'club.CClubRoomInfoDetails';
            const detail = await this.client.request<unknown>(packet, {
                clubId: this.club?.id,
                unionId: unionId || undefined,
                roomKey: room.roomKey,
            });
            await this.forms.show('ui/club/UIClubRoomJoin', detail);
        } catch {
            await this.forms.show('UIMessage_Drift', null, null, '获取房间详细配置失败');
        } finally {
            this.roomDetailPending.delete(key);
        }
    }

    /** Render the authoritative detail packet into the original 2.2.2 room-detail prefab. */
    private renderRoomDetail(form: LegacyForm, body: unknown): void {
        const room = body && typeof body === 'object' ? body as Record<string, unknown> : {};
        const rawCfg = room.roomCfg && typeof room.roomCfg === 'object'
            ? room.roomCfg as Record<string, unknown> : {};
        const base = rawCfg.baseCreateRoom && typeof rawCfg.baseCreateRoom === 'object'
            ? rawCfg.baseCreateRoom as Record<string, unknown> : {};
        const cfg = { ...base, ...rawCfg };
        const positions = Array.isArray(room.posList)
            ? room.posList.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object'))
            : [];
        const playerNum = Math.max(2, Number(room.playerNum ?? cfg.playerNum ?? cfg.playerCount ?? 4));
        const setCount = Number(room.setCount ?? cfg.setCount ?? cfg.roundCount ?? 0);
        const setId = Number(room.setId ?? 0);
        const gameId = Number(room.gameId ?? cfg.gameId ?? 0);
        const joinList = this.findDescendant(form.node, playerNum > 4 ? 'join_list' : 'join_list2');
        const otherList = this.findDescendant(form.node, playerNum > 4 ? 'join_list2' : 'join_list');
        if (joinList) joinList.active = true;
        if (otherList) otherList.active = false;

        this.setLabel(form.node, 'left/wanfaScrollView/view/roominfo/lb_clubname',
            String(room.name ?? this.club?.name ?? ''));
        this.setLabel(form.node, 'left/wanfaScrollView/view/roominfo/lb_roomkey',
            `房间号:${String(room.roomKey ?? '')}`);
        this.setLabel(form.node, 'left/wanfaScrollView/view/roominfo/lb_setcount', `局数:${setCount}`);
        this.setLabel(form.node, 'left/wanfaScrollView/view/roominfo/lb_gamename',
            this.gameNames.get(gameId) ?? String(room.gameName ?? room.gameType ?? ''));
        this.setLabel(form.node, 'left/wanfaScrollView/view/roominfo/lb_renshu',
            `人数:${positions.filter((item) => Number(item.pid ?? 0) > 0).length}/${playerNum}`);
        this.setLabel(form.node, 'left/wanfaScrollView/view/roominfo/rich_wanfa',
            String(room.roomName ?? cfg.roomName ?? ''));
        if (joinList) {
            this.setLabel(joinList, 'zhuozi/lb_state', setId > 0 ? '游戏中...' : '等待中...');
            for (let index = 0; index < 10; index += 1) {
                const user = joinList.getChildByName(`user${index}`);
                if (!user) continue;
                user.active = index < playerNum;
                const player = positions.find((item) => Number(item.pos ?? -1) === index)
                    ?? positions.find((item, positionIndex) => positionIndex === index);
                const occupied = Number(player?.pid ?? 0) > 0;
                const join = user.getChildByName('btn_join');
                if (join) join.active = !occupied;
                this.setLabel(user, 'lb_username', occupied ? String(player?.name ?? `玩家${player?.pid}`) : '');
            }
        }
    }

    private matchesClub(body: unknown): boolean {
        if (!body || typeof body !== 'object' || !this.club?.id) return true;
        const packet = body as { clubId?: unknown; unionId?: unknown };
        if (packet.clubId !== undefined && String(packet.clubId) !== String(this.club.id)) return false;
        if (packet.unionId !== undefined && this.club.unionId !== undefined
            && String(packet.unionId) !== String(this.club.unionId)) return false;
        return true;
    }

    private bindCurrentRoom(form: LegacyForm): void {
        this.blockInput(form.node);
        this.onClick(form.find('data/btn_exitroom'), () => { void this.exitCurrentRoom(); });
        this.onClick(form.find('data/btn_goroom'), () => this.goCurrentRoom());
        this.onClick(form.find('data/btn_showmore'), () => {
            const userList = form.find('data/mask/userlist');
            if (userList) userList.active = !userList.active;
        });
    }

    private showCurrentRoom(form: LegacyForm, room: ClubRoom): void {
        this.roomForm = form;
        this.currentRoom = room;
        this.setLabel(form.node, 'data/table/lb_roomName', String(room.roomName ?? ''));
        this.setLabel(form.node, 'data/table/game_name',
            String(room.gameName ?? this.gameNames.get(Number(room.gameId ?? 0)) ?? room.gameId ?? ''));
        this.setLabel(form.node, 'data/table/bg_key/key', String(room.tagId ?? room.roomKey ?? ''));
        this.setLabel(form.node, 'data/table/jushu', `第${room.setId ?? 0}/${room.setCount ?? 0}局  ${room.playerNum ?? 0}人`);
        const positions = Array.isArray(room.posList) ? room.posList as Array<Record<string, unknown>> : [];
        let seated = 0;
        for (let index = 0; index < 8; index += 1) {
            const player = positions[index];
            const user = form.find(`data/mask/userlist/user${index + 1}`);
            const occupied = Number(player?.pid ?? 0) > 0;
            if (user) user.active = occupied;
            if (occupied) {
                seated += 1;
                this.setLabel(form.node, `data/mask/userlist/user${index + 1}/lb_name`, String(player?.name ?? ''));
            }
        }
        const words = ['', '一', '两', '三', '四', '五', '六', '七', '八'];
        this.setLabel(form.node, 'data/btn_showmore/lb_num',
            seated === Number(room.playerNum ?? 0) ? '满座' : `${words[seated] ?? seated}人落座`);
    }

    private async exitCurrentRoom(): Promise<void> {
        const room = this.currentRoom;
        if (!room) return;
        if (Number(room.setId ?? 0) > 0) {
            await this.forms.show('UIMessage_Drift', null, null, '房间已经开始，请加入游戏发起解散');
            return;
        }
        const positions = Array.isArray(room.posList) ? room.posList as Array<Record<string, unknown>> : [];
        const player = positions.find((position) => Number(position.pid ?? 0) === this.playerId);
        const posIndex = Number(player?.pos ?? -1);
        if (posIndex < 0) {
            await this.forms.show('UIMessage_Drift', null, null, '退出房间失败,请进入房间操作：error01');
            return;
        }
        try {
            await this.client.request<unknown>('room.CBaseExitRoom', { roomID: room.roomId, posIndex });
            this.forms.close('ui/club/UIClubInRoom');
            this.mainNode.emit('legacy-out-room', {});
        } catch {
            await this.forms.show('UIMessage_Drift', null, null, '退出房间失败,请进入房间操作：error02');
        }
    }

    private goCurrentRoom(): void {
        const room = this.currentRoom;
        if (!room) return;
        const gameId = Number(room.gameId ?? room.gameType ?? 0);
        const clubId = Number(this.club?.id ?? room.clubId ?? 0);
        const unionId = Number(this.club?.unionId ?? room.unionId ?? 0);
        const entryOrigin = unionId > 0 ? 'UNION' : 'CLUB';
        this.saveQuickJoinSelection(room);
        this.refreshQuickJoinLabel();
        // The current-room popup describes an existing seat, not a complete game
        // handoff. Route it through Hall join so the one-time game ticket, route,
        // bundle and scene are resolved before the game runtime is opened.
        this.mainNode.emit('legacy-club-join-room', {
            ...room,
            gameId,
            gameName: this.gameNames.get(gameId) ?? room.gameName ?? room.gameCode,
            roomId: Number(room.roomId ?? room.roomID ?? 0),
            roomKey: room.roomKey,
            clubId,
            unionId,
            fromClub: true,
            entryOrigin,
            returnContext: { clubId, unionId },
        });
    }

    private clearRoomListeners(): void {
        for (const dispose of this.roomDisposers.splice(0)) dispose();
    }

    private clearQuickRoomListeners(): void {
        for (const dispose of this.quickRoomDisposers.splice(0)) dispose();
    }

    private setCollectionState(root: Node, state: 'loading' | 'content' | 'empty' | 'error'): void {
        const aliases: Record<typeof state, string[]> = {
            loading: ['loading', 'node_loading', 'loadingNode'],
            content: ['layout', 'view', 'content'],
            empty: ['empty', 'node_empty', 'emptyNode', 'noData'],
            error: ['error', 'node_error', 'errorNode'],
        };
        for (const [kind, names] of Object.entries(aliases)) {
            for (const name of names) {
                const node = this.findDescendant(root, name);
                if (node) node.active = kind === state;
            }
        }
    }

    private setLabel(root: Node, path: string, text: string): void {
        const label = this.find(root, path)?.getComponent(Label);
        if (label) label.string = text;
    }

    private setDescendantLabel(root: Node, name: string, text: string): void {
        if (root.name === name) {
            const label = root.getComponent(Label);
            if (label) label.string = text;
        }
        for (const child of root.children) this.setDescendantLabel(child, name, text);
    }

    private find(root: Node, path: string): Node | null {
        let current: Node | null = root;
        for (const part of path.split('/')) current = current?.getChildByName(part) ?? null;
        return current;
    }

    private findMainNode(form: LegacyForm, semanticName: string): Node | null {
        const semanticNode = this.findDescendant(form.node, semanticName);
        if (semanticNode) return semanticNode;
        const legacyPaths: Readonly<Record<string, string>> = {
            Bg: 'bg',
            Top: 'top',
            Bottom: 'bottom',
            RoomList: 'right_main',
            PlayFilter: 'left_wanfa',
            ClubSwitcher: 'left_main',
            Btn_Back: 'top/btn_back',
            Btn_ClubList: 'top/btn_jiemian',
            Lb_ClubName: 'top/clubName',
            Lb_ClubId: 'top/clubId',
            Lb_PlayName: 'top/lb_cityName',
            Player: 'top/userinfo',
            Btn_Event: 'top/right_btn/btn_union',
            Btn_Member: 'top/right_btn/btn_userlist',
            Btn_Score: 'top/right_btn/btn_ClubCentMsg',
            Btn_Room: 'top/right_btn/btn_roomlist',
            Btn_Skin: 'top/right_btn/btn_huanpi',
            Btn_Promoter: 'top/right_btn/btn_promoter',
            Btn_More: 'top/right_btn/moreNode/btn_more',
            Menu: 'top/right_btn/moreNode/childMore',
            Btn_BanTable: 'top/right_btn/moreNode/childMore/btn_jinzhitongzhuo',
            Btn_Wechat: 'top/right_btn/moreNode/childMore/btn_weixin',
            Btn_Msg: 'top/right_btn/moreNode/childMore/btn_message',
            Btn_Manage: 'top/right_btn/moreNode/childMore/btn_control',
            Btn_FindRoom: 'top/right_btn/moreNode/childMore/btn_findroom',
            Btn_Safe: 'top/right_btn/moreNode/childMore/btn_caseSprots',
            Btn_PromoterManage: 'top/right_btn/moreNode/childMore/btn_promoterOld',
            Btn_HideClubList: 'bottom/btn_ycqyq',
            Btn_ShowPlayFilter: 'bottom/btn_aoowh',
            Btn_ShowClubList: 'bottom/btn_aooqyq',
            Btn_QuickJoin: 'bottom/btn_ksjr',
            Btn_Record: 'bottom/btn_zhanji',
            Event: 'bottom/unionNode',
            Btn_EventRecord: 'bottom/unionNode/btn_unionRecord',
            Btn_EventRoom: 'bottom/unionNode/btn_unionRoomList',
            RoomFilter: 'bottom/wanfa_select',
            Btn_All: 'bottom/wanfa_select/btn_all',
            Btn_Play: 'bottom/wanfa_select/wanfa_list/view/content/btn_game',
            TableList: 'bottom/wanfa_select/table_list',
            Btn_CloseTable: 'bottom/wanfa_select/table_list/btn_closeTable',
            Btn_AllPlay: 'left_wanfa/btn_quanwan',
            Btn_Create: 'left_main/btn_create',
            Btn_Join: 'left_main/btn_join',
        };
        const legacyPath = legacyPaths[semanticName];
        return legacyPath ? form.find(legacyPath) : null;
    }

    private findDescendant(root: Node, name: string): Node | null {
        if (root.name === name) return root;
        for (const child of root.children) {
            const match = this.findDescendant(child, name);
            if (match) return match;
        }
        return null;
    }

    private findActiveDescendant(root: Node, name: string): Node | null {
        if (!root.active) return null;
        if (root.name === name) return root;
        for (const child of root.children) {
            const match = this.findActiveDescendant(child, name);
            if (match) return match;
        }
        return null;
    }

    private onClick(node: Node | null, listener: () => void): void {
        if (!node) return;
        this.listenClick(node, listener, this.disposers);
    }

    /** Node may be destroyed by form teardown before controller disposal. */
    private listenClick(node: Node, listener: () => void, bucket: Array<() => void>): void {
        node.on(Button.EventType.CLICK, listener);
        let active = true;
        bucket.push(() => {
            if (!active) return;
            active = false;
            if (node.isValid) node.off(Button.EventType.CLICK, listener);
        });
    }

    private onPointerClose(node: Node | null, path: string): void {
        if (!node) return;
        const close = (): void => this.forms.closeAfterPointer(path);
        node.on(Node.EventType.TOUCH_END, close);
        node.on(Node.EventType.MOUSE_UP, close);
        node.on(Button.EventType.CLICK, close);
        this.disposers.push(() => {
            if (!node.isValid) return;
            node.off(Node.EventType.TOUCH_END, close);
            node.off(Node.EventType.MOUSE_UP, close);
            node.off(Button.EventType.CLICK, close);
        });
    }

    private bindClubBack(node: Node | null, path: string): void {
        if (!node) return;
        this.onClick(node, () => { void this.handleClubBack(path); });
    }

    private async handleClubBack(path: string): Promise<void> {
        if (this.waitingBackPending) return;
        this.waitingBackPending = true;
        let current: ClubRoom;
        try {
            current = await this.client.requestLobby<ClubRoom>('room.CBaseRoomConfig', {});
        } catch (configError: unknown) {
            if (this.isNoActiveRoomError(configError)) {
                this.waitingBackPending = false;
                console.info('[ClubBack] no-active-room', {
                    clubId: this.clubId(), playerId: this.playerId, source: 'compat-error',
                });
                this.forms.closeAfterPointer(path);
                return;
            }
            try {
                current = await this.client.requestLobby<ClubRoom>('game.C1101GetRoomID', {});
                console.info('[ClubBack] active-room-fallback-used', {
                    clubId: this.clubId(), playerId: this.playerId,
                    reason: configError instanceof Error ? configError.message : String(configError),
                });
            } catch (fallbackError: unknown) {
                if (this.isNoActiveRoomError(fallbackError)) {
                    this.waitingBackPending = false;
                    console.info('[ClubBack] no-active-room', {
                        clubId: this.clubId(), playerId: this.playerId, source: 'fallback-compat-error',
                    });
                    this.forms.closeAfterPointer(path);
                    return;
                }
                const projected = this.projectedPlayerRoom();
                if (projected) {
                    current = projected;
                    console.warn('[ClubBack] active-room-local-fallback', {
                        clubId: this.clubId(), playerId: this.playerId,
                        roomId: Number(projected.roomId ?? projected.roomID ?? 0),
                        configError, fallbackError,
                    });
                } else {
                    this.waitingBackPending = false;
                    console.warn('[ClubBack] no-active-room', {
                        clubId: this.clubId(), playerId: this.playerId,
                        source: 'local-projection', configError, fallbackError,
                    });
                    this.forms.closeAfterPointer(path);
                    return;
                }
            }
        }
        const roomId = Number(current.roomId ?? current.roomID ?? 0);
        console.info('[ClubBack] active-room-checked', {
            clubId: this.clubId(), playerId: this.playerId, roomId,
        });
        if (roomId > 0) {
            try {
                await this.client.requestLobby<unknown>('room.CBaseExitRoom', { roomID: roomId });
                this.waitingHandoffRoomId = 0;
                await this.restoreAuthoritativeTemplates(this.clubId(), '退出等待房间后的桌面刷新');
                console.info('[ClubBack] room-exited', {
                    clubId: this.clubId(), playerId: this.playerId, roomId,
                });
                this.forms.closeAfterPointer(path);
            } catch (error: unknown) {
                console.error('[ClubBack] room-exit-failed', {
                    clubId: this.clubId(), playerId: this.playerId, roomId, error,
                });
                await this.forms.show('UIMessage_Drift', null, null,
                    error instanceof Error ? error.message : '退出等待房间失败，请重试');
            } finally {
                this.waitingBackPending = false;
            }
            return;
        }
        this.waitingBackPending = false;
        console.info('[ClubBack] no-active-room', {
            clubId: this.clubId(), playerId: this.playerId,
        });
        this.forms.closeAfterPointer(path);
    }

    /** Legacy room services report an empty membership as an error instead of roomID=0. */
    private isNoActiveRoomError(error: unknown): boolean {
        const message = error instanceof Error ? error.message : String(error ?? '');
        return /PLAYER_NOT_ROOM|玩家不在房间|player is not (?:in )?(?:a )?room|not a room member/i.test(message);
    }

    private projectedPlayerRoom(): ClubRoom | null {
        const containsPlayer = (room: ClubRoom): boolean => Number(room.roomId ?? room.roomID ?? 0) > 0
            && Array.isArray(room.posList)
            && room.posList.some((position) => position && typeof position === 'object'
                && Number((position as Record<string, unknown>).pid ?? 0) === this.playerId);
        if (this.currentRoom && containsPlayer(this.currentRoom)) return this.currentRoom;
        return this.rooms.find(containsPlayer) ?? null;
    }

    private blockInput(node: Node): void {
        const stop = (event: EventTouch): void => { event.propagationStopped = true; };
        for (const type of [Node.EventType.TOUCH_START, Node.EventType.TOUCH_MOVE,
            Node.EventType.TOUCH_END, Node.EventType.TOUCH_CANCEL]) node.on(type, stop);
        this.disposers.push(() => {
            if (!node.isValid) return;
            for (const type of [Node.EventType.TOUCH_START, Node.EventType.TOUCH_MOVE,
                Node.EventType.TOUCH_END, Node.EventType.TOUCH_CANCEL]) node.off(type, stop);
        });
    }
}
