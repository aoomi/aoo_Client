import { ProtocolClient } from '../../network/ProtocolClient';
import {
    LegacyAk159mjRoom, LegacyAk159mjRoomManager, LegacyAk159mjRoomPositionManager,
    LegacyAk159mjRoomSet, LegacyAk159mjSetPosition,
} from './model';
import { Ak159mjNetworkAdapter } from './network/Ak159mjNetworkAdapter';

export interface Ak159mjRuntimeOptions {
    playerId: number;
    viewSetting?: number;
    onRoomReady?: (room: LegacyAk159mjRoom) => void;
    onEvent?: (event: string, body: unknown) => void;
    onMessage?: (message: string) => void;
    onExit?: (reason: string) => void;
}

const shareDefine: Record<string, unknown> = {
    RoomState_Init: 0, RoomState_Playing: 1, RoomState_End: 2, RoomState_Waiting: 3,
    SetState_Init: 0, SetState_Playing: 1, SetState_End: 2, SetState_Waiting: 3,
    AK159MJRoomJoinCount: 4, OpType_Out: 7,
    RoomStateStringDict: {}, SetStateStringDict: {}, HuTypeStringDict: {}, OpTypeStringDict: {},
};

/** Owns the preserved AK159MJ room state machine and binds it to native 3.8.8 services. */
export class Ak159mjRuntime {
    private readonly network: Ak159mjNetworkAdapter;
    private readonly disposers: Array<() => void> = [];
    private readonly roomPosition: LegacyAk159mjRoomPositionManager;
    private readonly roomSet: LegacyAk159mjRoomSet;
    private readonly room: LegacyAk159mjRoom;
    private readonly manager: LegacyAk159mjRoomManager;

    public constructor(private readonly client: ProtocolClient, private readonly options: Ak159mjRuntimeOptions) {
        this.network = new Ak159mjNetworkAdapter(client);
        let roomPosition!: LegacyAk159mjRoomPositionManager;
        let roomSet!: LegacyAk159mjRoomSet;
        let room!: LegacyAk159mjRoom;
        let sceneName = 'hall';
        const noopService = new Proxy({}, { get: () => () => undefined });
        const base: Record<string, any> = {
            subGameName: 'ak159mj',
            ak159mj_ComTool: () => noopService,
            ak159mj_ShareDefine: () => shareDefine,
            ak159mj_NetManager: () => this.network,
            ak159mj_FormManager: () => ({
                ShowForm: (name: string) => { if (/AK159MJ(?:2D|XY|WZ|YF)Play/.test(name)) this.options.onRoomReady?.(room); },
                CloseForm: () => undefined, GetFormComponentByFormName: () => null,
            }),
            ak159mj_SysNotifyManager: () => ({ ShowSysMsg: (text: string) => this.options.onMessage?.(text) }),
            ak159mj_HeroManager: () => ({ GetHeroID: () => this.options.playerId, GetHeroProperty: () => this.options.playerId }),
            ak159mj_WeChatManager: () => noopService,
            ak159mj_SysDataManager: () => ({ GetTableDict: () => ({ AK159MJRoom_WaitTick: 30_000 }) }),
            LocalDataManager: () => ({
                GetConfigProperty: () => this.options.viewSetting ?? 1,
                SetConfigProperty: () => undefined,
            }),
            AK159MJSetPos: () => new LegacyAk159mjSetPosition(context),
            ak159mj_SceneManager: () => ({
                GetSceneType: () => sceneName,
                LoadScene: (name: string) => { sceneName = name; if (name === 'ak159mjScene') this.options.onRoomReady?.(room); },
            }),
            ak159mjClient: {
                OnEvent: (event: string, body: unknown) => this.options.onEvent?.(event, body),
                ExitGame: () => this.options.onExit?.('room-not-found'),
            },
            FormManager: () => noopService,
            AK159MJRoomPosMgr: () => roomPosition,
            AK159MJRoomSet: () => roomSet,
            AK159MJRoom: () => room,
        };
        const context = new Proxy(base, {
            get(target, property: string) {
                if (property in target) return target[property];
                return () => noopService;
            },
        });
        roomPosition = new LegacyAk159mjRoomPositionManager(context);
        roomSet = new LegacyAk159mjRoomSet(context);
        room = new LegacyAk159mjRoom(context);
        this.roomPosition = roomPosition;
        this.roomSet = roomSet;
        this.room = room;
        this.manager = new LegacyAk159mjRoomManager(context);
        this.disposers.push(client.onReconnect(() => this.restoreAfterReconnect()));
    }

    public async enterRoom(roomId: number): Promise<LegacyAk159mjRoom> {
        if (!Number.isSafeInteger(roomId) || roomId <= 0) throw new Error('陕西安康159麻将房间ID无效');
        await this.client.request('ak159mj.CAK159MJGetRoomInfo', { roomID: roomId });
        if (Number(this.manager.GetEnterRoomID()) !== roomId) throw new Error('陕西安康159麻将完整房间信息未初始化');
        return this.room;
    }

    public request<T = unknown>(event: string, body?: unknown): Promise<T> { return this.client.request<T>(event, body); }
    public operate(cardId: number, opType: number, cardList: number[] = []): Promise<unknown> {
        const set = this.room.GetRoomSet();
        const round = set?.GetRoomSetProperty('setRound');
        if (!round) return Promise.reject(new Error('陕西安康159麻将当前操作轮次不存在'));
        return this.request('AK159MJ.CAK159MJOpCard', {
            roomID: this.manager.GetEnterRoomID(), setID: set.GetRoomSetProperty('setID'),
            roundID: round.waitID, cardID: cardId, opType, cardList,
        });
    }
    public sendChat(type: number, quickId: number, content = ''): Promise<unknown> {
        return this.request('ak159mj.CAK159MJChat', { type, quickID: quickId, targetID: this.getRoomId(), content });
    }
    public startGame(): Promise<unknown> { return this.request('room.CBaseStartGame', { roomID: this.getRoomId() }); }
    public continueGame(): Promise<unknown> { return this.request('room.CBaseContinueGame', { roomID: this.getRoomId() }); }
    public ready(): Promise<unknown> {
        return this.request('ak159mj.CAK159MJReadyRoom', { roomID: this.getRoomId(), posIndex: this.roomPosition.GetClientPos() });
    }
    public unready(): Promise<unknown> {
        return this.request('ak159mj.CAK159MJUnReadyRoom', { roomID: this.getRoomId(), posIndex: this.roomPosition.GetClientPos() });
    }
    public buyHorse(value: number): Promise<unknown> { return this.request('ak159mj.CAK159MJMaiMa', { roomID: this.getRoomId(), maiMa: value }); }
    public choosePiao(value: number): Promise<unknown> { return this.request('ak159mj.CAK159MJPiaoHua', { roomID: this.getRoomId(), piaoHua: value }); }
    public chooseXiaPao(value: number): Promise<unknown> { return this.request('ak159mj.CAK159MJXiaPao', { roomID: this.getRoomId(), xiaPao: value }); }
    public startDissolve(): Promise<unknown> { return this.request('ak159mj.CAK159MJDissolveRoom', { roomID: this.getRoomId() }); }
    public voteDissolve(agree: boolean): Promise<unknown> {
        return this.request(agree ? 'ak159mj.CAK159MJDissolveRoomAgree' : 'ak159mj.CAK159MJDissolveRoomRefuse', { roomID: this.getRoomId() });
    }
    public exit(reason = 'user-exit'): void { this.options.onExit?.(reason); }
    public getRoomId(): number { return Number(this.manager.GetEnterRoomID()); }
    public getRoom(): LegacyAk159mjRoom { return this.room; }
    public getRoomManager(): LegacyAk159mjRoomManager { return this.manager; }
    public getRoomPositionManager(): LegacyAk159mjRoomPositionManager { return this.roomPosition; }
    public getRoomSet(): LegacyAk159mjRoomSet { return this.roomSet; }
    public destroy(): void {
        for (const dispose of this.disposers.splice(0)) dispose();
        this.network.UnAllRegNetPack();
        this.manager.OnReload();
    }
    private async restoreAfterReconnect(): Promise<void> {
        const roomId = this.getRoomId();
        if (!Number.isSafeInteger(roomId) || roomId <= 0) return;
        try {
            await this.client.request('ak159mj.CAK159MJGetRoomInfo', { roomID: roomId });
            this.options.onEvent?.('AK159MJ_Reconnected', { roomID: roomId });
            this.options.onRoomReady?.(this.room);
        } catch (error: unknown) {
            this.options.onMessage?.(error instanceof Error ? error.message : '恢复陕西安康159麻将牌局失败');
            this.options.onExit?.('reconnect-room-failed');
        }
    }
}
