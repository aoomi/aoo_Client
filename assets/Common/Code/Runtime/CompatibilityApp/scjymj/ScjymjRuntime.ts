import { ProtocolClient } from '../../network/ProtocolClient';
import {
    LegacyScjymjRoom,
    LegacyScjymjRoomManager,
    LegacyScjymjRoomPositionManager,
    LegacyScjymjRoomSet,
    LegacyScjymjSetPosition,
} from './model';
import { ScjymjNetworkAdapter } from './network/ScjymjNetworkAdapter';

export interface ScjymjRuntimeOptions {
    playerId: number;
    onRoomReady?: (room: LegacyScjymjRoom) => void;
    onEvent?: (event: string, body: unknown) => void;
    onMessage?: (message: string) => void;
    onExit?: (reason: string) => void;
}

const shareDefine = {
    RoomState_Init: 0,
    RoomState_Playing: 1,
    RoomState_End: 2,
    RoomState_Waiting: 3,
    RoomState_WaitingEx: 4,
    RoomStateStringDict: { Init: 0, Playing: 1, End: 2, Waiting: 3, WaitingEx: 4 },
    SetState_Init: 0,
    SetState_Playing: 1,
    SetState_End: 2,
    SetState_Waiting: 3,
    SetState_WaitingEx: 4,
    SetStateStringDict: { Init: 0, Playing: 1, End: 2, Waiting: 3, WaitingEx: 4 },
    MJRoomJoinCount: 4,
    SCJYMJRoomJoinCount: 4,
    OpType_Hu: 1,
    OpType_Peng: 2,
    OpType_Gang: 3,
    OpType_JieGang: 4,
    OpType_AnGang: 5,
    OpType_Chi: 6,
    OpType_Out: 7,
    OpType_Pass: 8,
    OpType_QiangGangHu: 9,
    OpType_BuHua: 10,
    OpType_DanYou: 11,
    OpType_ShuangYou: 12,
    OpType_SanYou: 13,
    OpType_QiangJin: 14,
    OpType_SanJinDao: 15,
    OpType_SQPass: 16,
    OpType_SiJinDao: 17,
    OpType_WuJinDao: 18,
    OpType_LiuJinDao: 19,
    OpType_See: 20,
    OpType_AnSee: 21,
    OpType_ShiSanYao: 22,
    OpType_TingYouJin: 23,
    OpType_DDHu: 24,
    OpType_TianHu: 25,
    OpType_PingHu: 26,
    OpType_Ting: 27,
    OpType_JinQue: 28,
    OpType_JinLong: 29,
    OpType_GuangYou: 34,
    OpType_KouPai: 76,
    OpType_BaoGang: 94,
    OpTypeStringDict: {
        Hu: 1, Peng: 2, Gang: 3, JieGang: 4, AnGang: 5, Chi: 6, Out: 7, Pass: 8,
        QiangGangHu: 9, BuHua: 10, DanYou: 11, ShuangYou: 12, SanYou: 13, QiangJin: 14,
        SanJinDao: 15, SQPass: 16, SiJinDao: 17, WuJinDao: 18, LiuJinDao: 19, See: 20,
        AnSee: 21, ShiSanYao: 22, TingYouJin: 23, DDHu: 24, TianHu: 25, PingHu: 26,
        Ting: 27, JinQue: 28, JinLong: 29, GuangYou: 34, KouPai: 76, BaoGang: 94,
    },
    isCoinRoom: false,
};

/** Creator 3.8.8 lifecycle owner for the migrated SCJYMJ room model. */
export class ScjymjRuntime {
    private readonly disposers: Array<() => void> = [];
    private readonly network: ScjymjNetworkAdapter;
    private readonly roomPosition: LegacyScjymjRoomPositionManager;
    private readonly roomSet: LegacyScjymjRoomSet;
    private readonly room: LegacyScjymjRoom;
    private readonly manager: LegacyScjymjRoomManager;

    public constructor(
        private readonly client: ProtocolClient,
        private readonly options: ScjymjRuntimeOptions,
    ) {
        this.network = new ScjymjNetworkAdapter(client);
        let roomPosition!: LegacyScjymjRoomPositionManager;
        let roomSet!: LegacyScjymjRoomSet;
        let room!: LegacyScjymjRoom;
        const context: Record<string, unknown> = {
            subGameName: 'scjymj',
            scjymj_ComTool: () => ({}),
            scjymj_ShareDefine: () => shareDefine,
            scjymj_NetManager: () => this.network,
            scjymj_SysNotifyManager: () => ({
                ShowSysMsg: (message: string) => this.options.onMessage?.(message),
            }),
            scjymj_HeroManager: () => ({
                GetHeroID: () => this.options.playerId,
                GetHeroProperty: (property: string) => property === 'pid' ? this.options.playerId : undefined,
            }),
            scjymj_WeChatManager: () => ({
                InitHeroHeadImage: (_pid: number, _headImageUrl: string) => undefined,
            }),
            scjymj_SysDataManager: () => ({
                GetTableDict: (table: string) => table === 'PropertyInfo'
                    ? { SCJYMJRoom_WaitTick: 30_000 }
                    : {},
            }),
            LocalDataManager: () => ({
                GetConfigProperty: (_table: string, _property: string) => 0,
            }),
            SCJYMJSetPos: () => new LegacyScjymjSetPosition(context),
            scjymj_FormManager: () => ({
                ShowForm: (name: string) => {
                    if (name.includes('SCJYMJPlay')) this.options.onRoomReady?.(room);
                },
                CloseForm: () => undefined,
            }),
            scjymj_SceneManager: () => ({
                LoadScene: (name: string) => {
                    if (name === 'scjymjScene') this.options.onRoomReady?.(room);
                },
            }),
            scjymjClient: {
                OnEvent: (event: string, body: unknown) => this.options.onEvent?.(event, body),
                ExitGame: () => this.options.onExit?.('room-not-found'),
            },
            SCJYMJRoomPosMgr: () => roomPosition,
            SCJYMJRoomSet: () => roomSet,
            SCJYMJRoom: () => room,
        };
        roomPosition = new LegacyScjymjRoomPositionManager(context);
        roomSet = new LegacyScjymjRoomSet(context);
        room = new LegacyScjymjRoom(context);
        this.roomPosition = roomPosition;
        this.roomSet = roomSet;
        this.room = room;
        this.manager = new LegacyScjymjRoomManager(context);
        this.disposers.push(this.client.onReconnect(() => this.restoreAfterReconnect()));
    }

    public async enterRoom(roomId: number): Promise<LegacyScjymjRoom> {
        if (!Number.isSafeInteger(roomId) || roomId <= 0) throw new Error('SCJYMJ 房间ID无效');
        await this.client.request('scjymj.CSCJYMJGetRoomInfo', { roomID: roomId });
        if (Number(this.manager.GetEnterRoomID()) !== roomId) throw new Error('SCJYMJ 完整房间信息未初始化');
        return this.room;
    }

    public getRoom(): LegacyScjymjRoom { return this.room; }
    public getRoomManager(): LegacyScjymjRoomManager { return this.manager; }
    public getRoomPositionManager(): LegacyScjymjRoomPositionManager { return this.roomPosition; }
    public getRoomSet(): LegacyScjymjRoomSet { return this.roomSet; }

    public destroy(): void {
        for (const dispose of this.disposers.splice(0)) dispose();
        this.network.UnAllRegNetPack();
        this.manager.OnReload();
    }

    private async restoreAfterReconnect(): Promise<void> {
        const roomId = Number(this.manager.GetEnterRoomID());
        if (!Number.isSafeInteger(roomId) || roomId <= 0) return;
        try {
            await this.client.request('scjymj.CSCJYMJGetRoomInfo', { roomID: roomId });
            if (Number(this.manager.GetEnterRoomID()) !== roomId) throw new Error('SCJYMJ 重连房间信息不一致');
            this.options.onEvent?.('SCJYMJ_Reconnected', { roomID: roomId });
            this.options.onRoomReady?.(this.room);
        } catch (error: unknown) {
            this.options.onMessage?.(error instanceof Error ? error.message : '恢复简阳麻将牌局失败');
            this.options.onExit?.('reconnect-room-failed');
        }
    }
}
