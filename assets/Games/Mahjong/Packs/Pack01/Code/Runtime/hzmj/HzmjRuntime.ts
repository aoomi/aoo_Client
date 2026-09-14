import { ProtocolClient } from '../../../../../../../Common/Code/Runtime/network/ProtocolClient';
import {
    LegacyHzmjRoom,
    LegacyHzmjRoomManager,
    LegacyHzmjRoomPositionManager,
    LegacyHzmjRoomSet,
    LegacyHzmjSetPosition,
} from './model/index';
import { HzmjNetworkAdapter } from './network/HzmjNetworkAdapter';
import { HZMJ_OPERATION, operationsForPosition } from './HzmjOperationPolicy';

export interface HzmjRuntimeOptions {
    playerId: number;
    onRoomReady?: (room: LegacyHzmjRoom) => void;
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
    SetState_Init: 0,
    SetState_Playing: 1,
    SetState_End: 2,
    SetState_Waiting: 3,
    SetState_WaitingEx: 4,
    MJRoomJoinCount: 4,
    HZMJRoomJoinCount: 4,
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
    OpType_SQPass: 16,
    isCoinRoom: false,
    OpTypeStringDict: {
        1: 'OpType_Hu', 2: 'OpType_Peng', 3: 'OpType_Gang', 4: 'OpType_JieGang',
        5: 'OpType_AnGang', 6: 'OpType_Chi', 7: 'OpType_Out', 8: 'OpType_Pass',
        9: 'OpType_QiangGangHu', 10: 'OpType_BuHua', 16: 'OpType_SQPass',
    },
    SetStateStringDict: { 0: 0, 1: 1, 2: 2, 3: 3, 4: 4 },
    HuTypeStringDict: {},
};

/** Owns the migrated HZMJ room models, protocol handlers and reconnect lifecycle. */
export class HzmjRuntime {
    private readonly disposers: Array<() => void> = [];
    private readonly network: HzmjNetworkAdapter;
    private readonly roomPosition: LegacyHzmjRoomPositionManager;
    private readonly roomSet: LegacyHzmjRoomSet;
    private readonly room: LegacyHzmjRoom;
    private readonly manager: LegacyHzmjRoomManager;
    private generation = 0;
    private operationPending = false;
    private destroyed = false;
    private completedRoundId: unknown = null;

    public constructor(
        private readonly client: ProtocolClient,
        private readonly options: HzmjRuntimeOptions,
    ) {
        this.network = new HzmjNetworkAdapter(client);
        let roomPosition!: LegacyHzmjRoomPositionManager;
        let roomSet!: LegacyHzmjRoomSet;
        let room!: LegacyHzmjRoom;
        let sceneName = 'hall';
        const context: Record<string, any> = {
            subGameName: 'hzmj',
            hzmj_ComTool: () => ({}),
            hzmj_ShareDefine: () => shareDefine,
            hzmj_NetManager: () => this.network,
            hzmj_SysNotifyManager: () => ({
                ShowSysMsg: (message: string) => this.options.onMessage?.(message),
            }),
            hzmj_HeroManager: () => ({
                GetHeroID: () => this.options.playerId,
                GetHeroProperty: (property: string) => property === 'pid' ? this.options.playerId : undefined,
            }),
            hzmj_WeChatManager: () => ({ InitHeroHeadImage: () => undefined }),
            hzmj_SysDataManager: () => ({ GetTableDict: () => ({ HZMJRoom_WaitTick: 30_000 }) }),
            LocalDataManager: () => ({
                GetConfigProperty: (_table: string, property: string) => property === 'hzmj_is3DShow' ? 1 : 0,
                SetConfigProperty: () => undefined,
            }),
            HZMJSetPos: () => new LegacyHzmjSetPosition(context),
            hzmj_FormManager: () => ({
                ShowForm: (name: string) => {
                    if (name.includes('HZMJPlay')) this.options.onRoomReady?.(room);
                },
                CloseForm: () => undefined,
                GetFormComponentByFormName: () => null,
            }),
            hzmj_SceneManager: () => ({
                GetSceneType: () => sceneName,
                LoadScene: (name: string) => {
                    sceneName = name;
                    if (name === 'hzmjScene') this.options.onRoomReady?.(room);
                },
            }),
            hzmjClient: {
                OnEvent: (event: string, body: unknown) => this.options.onEvent?.(event, body),
                ExitGame: () => this.options.onExit?.('room-not-found'),
            },
            FormManager: () => ({ ShowForm: () => undefined, CloseForm: () => undefined }),
            HZMJRoomPosMgr: () => roomPosition,
            HZMJRoomSet: () => roomSet,
            HZMJRoom: () => room,
        };
        roomPosition = new LegacyHzmjRoomPositionManager(context);
        roomSet = new LegacyHzmjRoomSet(context);
        room = new LegacyHzmjRoom(context);
        this.roomPosition = roomPosition;
        this.roomSet = roomSet;
        this.room = room;
        this.manager = new LegacyHzmjRoomManager(context);
        this.disposers.push(this.client.onReconnect(() => this.restoreAfterReconnect()));
    }

    public async enterRoom(roomId: number): Promise<LegacyHzmjRoom> {
        if (!Number.isSafeInteger(roomId) || roomId <= 0) throw new Error('红中麻将房间ID无效');
        const generation = this.generation;
        await this.client.request('hzmj.CHZMJGetRoomInfo', { roomID: roomId });
        if (this.destroyed || generation !== this.generation) throw new Error('红中麻将房间请求已失效');
        if (Number(this.manager.GetEnterRoomID()) !== roomId) throw new Error('红中麻将完整房间信息未初始化');
        return this.room;
    }

    public startGame(roomId: number): Promise<unknown> {
        return this.client.request('room.CBaseStartGame', { roomID: roomId });
    }

    public ready(roomId = this.getRoomId()): Promise<unknown> {
        if (!Number.isSafeInteger(roomId) || roomId <= 0) throw new Error('红中麻将房间ID无效');
        return this.client.request('room.CBaseReadyRoom', { roomID: roomId });
    }

    public continueGame(roomId: number): Promise<unknown> {
        return this.client.request('room.CBaseContinueGame', { roomID: roomId });
    }

    public request<T = unknown>(event: string, payload?: unknown): Promise<T> {
        return this.client.request<T>(event, payload);
    }

    public getRoomId(): number {
        return Number(this.manager.GetEnterRoomID());
    }

    public sendChat(type: number, quickId: number, content = ''): Promise<unknown> {
        return this.request('hzmj.CHZMJChat', {
            type, quickID: quickId, targetID: this.getRoomId(), content,
        });
    }

    public startDissolve(): Promise<unknown> {
        return this.request('hzmj.CHZMJDissolveRoom', { roomID: this.getRoomId() });
    }

    public voteDissolve(agree: boolean): Promise<unknown> {
        return this.request(agree ? 'hzmj.CHZMJDissolveRoomAgree' : 'hzmj.CHZMJDissolveRoomRefuse', {
            roomID: this.getRoomId(),
        });
    }

    public roomRecord(): Promise<unknown> {
        return this.request('hzmj.CHZMJRoomRecord', { roomID: this.getRoomId() });
    }

    public playBackCode(roomId: number, tabId: number): Promise<unknown> {
        return this.request('hzmj.CHZMJGetPlayBackCode', { roomId, tabId });
    }

    public exit(reason = 'user-exit'): void {
        this.options.onExit?.(reason);
    }

    public async operate(cardId: number, operation: number): Promise<unknown> {
        if (this.destroyed) throw new Error('红中麻将牌局已关闭');
        if (this.operationPending) throw new Error('红中麻将操作正在提交');
        const set = this.room.GetRoomSet();
        const setId = set?.GetRoomSetProperty('setID');
        const round = set?.GetRoomSetProperty('setRound');
        if (!round) throw new Error('红中麻将当前操作轮次不存在');
        const clientPos = Number(this.roomPosition.GetClientPos());
        const allowed = operationsForPosition(round, clientPos);
        if (!allowed.includes(operation)) throw new Error('红中麻将当前不允许该操作');
        if (operation === HZMJ_OPERATION.OUT && (!Number.isSafeInteger(cardId) || cardId <= 0)) {
            throw new Error('红中麻将出牌无效');
        }
        if (round.waitID === this.completedRoundId) throw new Error('红中麻将本轮操作已提交');
        const generation = this.generation;
        this.operationPending = true;
        try {
            const response = await this.client.request('HZMJ.CHZMJOpCard', {
                roomID: this.manager.GetEnterRoomID(), setID: setId,
                roundID: round.waitID, cardID: cardId, opType: operation,
            });
            if (this.destroyed || generation !== this.generation) throw new Error('红中麻将操作响应已失效');
            this.completedRoundId = round.waitID;
            return response;
        } finally {
            if (generation === this.generation) this.operationPending = false;
        }
    }

    public getRoom(): LegacyHzmjRoom { return this.room; }
    public getRoomManager(): LegacyHzmjRoomManager { return this.manager; }
    public getRoomPositionManager(): LegacyHzmjRoomPositionManager { return this.roomPosition; }
    public getRoomSet(): LegacyHzmjRoomSet { return this.roomSet; }

    public destroy(): void {
        if (this.destroyed) return;
        this.destroyed = true;
        this.generation += 1;
        this.operationPending = false;
        this.completedRoundId = null;
        for (const dispose of this.disposers.splice(0)) dispose();
        this.network.UnAllRegNetPack();
        this.manager.OnReload();
    }

    private async restoreAfterReconnect(): Promise<void> {
        if (this.destroyed) return;
        const generation = ++this.generation;
        this.operationPending = false;
        this.completedRoundId = null;
        const roomId = Number(this.manager.GetEnterRoomID());
        if (!Number.isSafeInteger(roomId) || roomId <= 0) return;
        try {
            await this.client.request('hzmj.CHZMJGetRoomInfo', { roomID: roomId });
            if (this.destroyed || generation !== this.generation) return;
            if (Number(this.manager.GetEnterRoomID()) !== roomId) throw new Error('红中麻将重连房间信息不一致');
            this.options.onEvent?.('HZMJ_Reconnected', { roomID: roomId });
            this.options.onRoomReady?.(this.room);
        } catch (error: unknown) {
            if (this.destroyed || generation !== this.generation) return;
            this.options.onMessage?.(error instanceof Error ? error.message : '恢复红中麻将牌局失败');
            this.options.onExit?.('reconnect-room-failed');
        }
    }
}
