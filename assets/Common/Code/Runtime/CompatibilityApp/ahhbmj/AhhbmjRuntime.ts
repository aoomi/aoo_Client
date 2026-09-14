import { ProtocolClient } from '../../network/ProtocolClient';
import {
    LegacyAhhbmjRoom, LegacyAhhbmjRoomManager, LegacyAhhbmjRoomPositionManager,
    LegacyAhhbmjRoomSet, LegacyAhhbmjSetPosition,
} from './model';
import { AhhbmjNetworkAdapter } from './network/AhhbmjNetworkAdapter';

export interface AhhbmjRuntimeOptions {
    playerId: number;
    viewSetting?: number;
    onRoomReady?: (room: LegacyAhhbmjRoom) => void;
    onEvent?: (event: string, body: unknown) => void;
    onMessage?: (message: string) => void;
    onExit?: (reason: string) => void;
}

const shareDefine: Record<string, unknown> = {
    RoomState_Init: 0, RoomState_Playing: 1, RoomState_End: 2, RoomState_Waiting: 3,
    SetState_Init: 0, SetState_Playing: 1, SetState_End: 2, SetState_Waiting: 3,
    AHHBMJRoomJoinCount: 4, OpType_Out: 7,
    RoomStateStringDict: {}, SetStateStringDict: {}, HuTypeStringDict: {}, OpTypeStringDict: {},
};

/** Owns the preserved AHHBMJ room state machine and binds it to native 3.8.8 services. */
export class AhhbmjRuntime {
    private readonly network: AhhbmjNetworkAdapter;
    private readonly disposers: Array<() => void> = [];
    private readonly roomPosition: LegacyAhhbmjRoomPositionManager;
    private readonly roomSet: LegacyAhhbmjRoomSet;
    private readonly room: LegacyAhhbmjRoom;
    private readonly manager: LegacyAhhbmjRoomManager;

    public constructor(private readonly client: ProtocolClient, private readonly options: AhhbmjRuntimeOptions) {
        this.network = new AhhbmjNetworkAdapter(client);
        let roomPosition!: LegacyAhhbmjRoomPositionManager;
        let roomSet!: LegacyAhhbmjRoomSet;
        let room!: LegacyAhhbmjRoom;
        let sceneName = 'hall';
        const noopService = new Proxy({}, { get: () => () => undefined });
        const base: Record<string, any> = {
            subGameName: 'ahhbmj',
            ahhbmj_ComTool: () => noopService,
            ahhbmj_ShareDefine: () => shareDefine,
            ahhbmj_NetManager: () => this.network,
            ahhbmj_FormManager: () => ({
                ShowForm: (name: string) => { if (/AHHBMJ(?:2D|XY|WZ|YF)Play/.test(name)) this.options.onRoomReady?.(room); },
                CloseForm: () => undefined, GetFormComponentByFormName: () => null,
            }),
            ahhbmj_SysNotifyManager: () => ({ ShowSysMsg: (text: string) => this.options.onMessage?.(text) }),
            ahhbmj_HeroManager: () => ({ GetHeroID: () => this.options.playerId, GetHeroProperty: () => this.options.playerId }),
            ahhbmj_WeChatManager: () => noopService,
            ahhbmj_SysDataManager: () => ({ GetTableDict: () => ({ AHHBMJRoom_WaitTick: 30_000 }) }),
            LocalDataManager: () => ({
                GetConfigProperty: () => this.options.viewSetting ?? 1,
                SetConfigProperty: () => undefined,
            }),
            AHHBMJSetPos: () => new LegacyAhhbmjSetPosition(context),
            ahhbmj_SceneManager: () => ({
                GetSceneType: () => sceneName,
                LoadScene: (name: string) => { sceneName = name; if (name === 'ahhbmjScene') this.options.onRoomReady?.(room); },
            }),
            ahhbmjClient: {
                OnEvent: (event: string, body: unknown) => this.options.onEvent?.(event, body),
                ExitGame: () => this.options.onExit?.('room-not-found'),
            },
            FormManager: () => noopService,
            AHHBMJRoomPosMgr: () => roomPosition,
            AHHBMJRoomSet: () => roomSet,
            AHHBMJRoom: () => room,
        };
        const context = new Proxy(base, {
            get(target, property: string) {
                if (property in target) return target[property];
                return () => noopService;
            },
        });
        roomPosition = new LegacyAhhbmjRoomPositionManager(context);
        roomSet = new LegacyAhhbmjRoomSet(context);
        room = new LegacyAhhbmjRoom(context);
        this.roomPosition = roomPosition;
        this.roomSet = roomSet;
        this.room = room;
        this.manager = new LegacyAhhbmjRoomManager(context);
        this.disposers.push(client.onReconnect(() => this.restoreAfterReconnect()));
    }

    public async enterRoom(roomId: number): Promise<LegacyAhhbmjRoom> {
        if (!Number.isSafeInteger(roomId) || roomId <= 0) throw new Error('安徽淮北麻将房间ID无效');
        await this.client.request('ahhbmj.CAHHBMJGetRoomInfo', { roomID: roomId });
        if (Number(this.manager.GetEnterRoomID()) !== roomId) throw new Error('安徽淮北麻将完整房间信息未初始化');
        return this.room;
    }

    public request<T = unknown>(event: string, body?: unknown): Promise<T> { return this.client.request<T>(event, body); }
    public operate(cardId: number, opType: number, cardList: number[] = []): Promise<unknown> {
        const set = this.room.GetRoomSet();
        const round = set?.GetRoomSetProperty('setRound');
        if (!round) return Promise.reject(new Error('安徽淮北麻将当前操作轮次不存在'));
        return this.request('AHHBMJ.CAHHBMJOpCard', {
            roomID: this.manager.GetEnterRoomID(), setID: set.GetRoomSetProperty('setID'),
            roundID: round.waitID, cardID: cardId, opType, cardList,
        });
    }
    public sendChat(type: number, quickId: number, content = ''): Promise<unknown> {
        return this.request('ahhbmj.CAHHBMJChat', { type, quickID: quickId, targetID: this.getRoomId(), content });
    }
    public startGame(): Promise<unknown> { return this.request('room.CBaseStartGame', { roomID: this.getRoomId() }); }
    public continueGame(): Promise<unknown> { return this.request('room.CBaseContinueGame', { roomID: this.getRoomId() }); }
    public ready(): Promise<unknown> {
        return this.request('ahhbmj.CAHHBMJReadyRoom', { roomID: this.getRoomId(), posIndex: this.roomPosition.GetClientPos() });
    }
    public unready(): Promise<unknown> {
        return this.request('ahhbmj.CAHHBMJUnReadyRoom', { roomID: this.getRoomId(), posIndex: this.roomPosition.GetClientPos() });
    }
    public buyHorse(value: number): Promise<unknown> { return this.request('ahhbmj.CAHHBMJMaiMa', { roomID: this.getRoomId(), maiMa: value }); }
    public choosePiao(value: number): Promise<unknown> { return this.request('ahhbmj.CAHHBMJPiaoHua', { roomID: this.getRoomId(), piaoHua: value }); }
    public choosePiaoFen(value: number): Promise<unknown> { return this.request('ahhbmj.CAHHBMJPiaoFen', { roomID: this.getRoomId(), piaoFen: value }); }
    public startDissolve(): Promise<unknown> { return this.request('ahhbmj.CAHHBMJDissolveRoom', { roomID: this.getRoomId() }); }
    public voteDissolve(agree: boolean): Promise<unknown> {
        return this.request(agree ? 'ahhbmj.CAHHBMJDissolveRoomAgree' : 'ahhbmj.CAHHBMJDissolveRoomRefuse', { roomID: this.getRoomId() });
    }
    public exit(reason = 'user-exit'): void { this.options.onExit?.(reason); }
    public getRoomId(): number { return Number(this.manager.GetEnterRoomID()); }
    public getRoom(): LegacyAhhbmjRoom { return this.room; }
    public getRoomManager(): LegacyAhhbmjRoomManager { return this.manager; }
    public getRoomPositionManager(): LegacyAhhbmjRoomPositionManager { return this.roomPosition; }
    public getRoomSet(): LegacyAhhbmjRoomSet { return this.roomSet; }
    public destroy(): void {
        for (const dispose of this.disposers.splice(0)) dispose();
        this.network.UnAllRegNetPack();
        this.manager.OnReload();
    }
    private async restoreAfterReconnect(): Promise<void> {
        const roomId = this.getRoomId();
        if (!Number.isSafeInteger(roomId) || roomId <= 0) return;
        try {
            await this.client.request('ahhbmj.CAHHBMJGetRoomInfo', { roomID: roomId });
            this.options.onEvent?.('AHHBMJ_Reconnected', { roomID: roomId });
            this.options.onRoomReady?.(this.room);
        } catch (error: unknown) {
            this.options.onMessage?.(error instanceof Error ? error.message : '恢复安徽淮北麻将牌局失败');
            this.options.onExit?.('reconnect-room-failed');
        }
    }
}
