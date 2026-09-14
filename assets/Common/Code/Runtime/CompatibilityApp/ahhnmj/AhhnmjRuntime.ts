import { ProtocolClient } from '../../network/ProtocolClient';
import {
    LegacyAhhnmjRoom, LegacyAhhnmjRoomManager, LegacyAhhnmjRoomPositionManager,
    LegacyAhhnmjRoomSet, LegacyAhhnmjSetPosition,
} from './model';
import { AhhnmjNetworkAdapter } from './network/AhhnmjNetworkAdapter';

export interface AhhnmjRuntimeOptions {
    playerId: number;
    viewSetting?: number;
    onRoomReady?: (room: LegacyAhhnmjRoom) => void;
    onEvent?: (event: string, body: unknown) => void;
    onMessage?: (message: string) => void;
    onExit?: (reason: string) => void;
}

const shareDefine: Record<string, unknown> = {
    RoomState_Init: 0, RoomState_Playing: 1, RoomState_End: 2, RoomState_Waiting: 3,
    SetState_Init: 0, SetState_Playing: 1, SetState_End: 2, SetState_Waiting: 3,
    AHHNMJRoomJoinCount: 4, OpType_Out: 7,
    RoomStateStringDict: {}, SetStateStringDict: {}, HuTypeStringDict: {}, OpTypeStringDict: {},
};

/** Owns the preserved AHHNMJ room state machine and binds it to native 3.8.8 services. */
export class AhhnmjRuntime {
    private readonly network: AhhnmjNetworkAdapter;
    private readonly disposers: Array<() => void> = [];
    private readonly roomPosition: LegacyAhhnmjRoomPositionManager;
    private readonly roomSet: LegacyAhhnmjRoomSet;
    private readonly room: LegacyAhhnmjRoom;
    private readonly manager: LegacyAhhnmjRoomManager;

    public constructor(private readonly client: ProtocolClient, private readonly options: AhhnmjRuntimeOptions) {
        this.network = new AhhnmjNetworkAdapter(client);
        let roomPosition!: LegacyAhhnmjRoomPositionManager;
        let roomSet!: LegacyAhhnmjRoomSet;
        let room!: LegacyAhhnmjRoom;
        let sceneName = 'hall';
        const noopService = new Proxy({}, { get: () => () => undefined });
        const base: Record<string, any> = {
            subGameName: 'ahhnmj',
            ahhnmj_ComTool: () => noopService,
            ahhnmj_ShareDefine: () => shareDefine,
            ahhnmj_NetManager: () => this.network,
            ahhnmj_FormManager: () => ({
                ShowForm: (name: string) => { if (/AHHNMJ(?:2D|XY|WZ|YF)Play/.test(name)) this.options.onRoomReady?.(room); },
                CloseForm: () => undefined, GetFormComponentByFormName: () => null,
            }),
            ahhnmj_SysNotifyManager: () => ({ ShowSysMsg: (text: string) => this.options.onMessage?.(text) }),
            ahhnmj_HeroManager: () => ({ GetHeroID: () => this.options.playerId, GetHeroProperty: () => this.options.playerId }),
            ahhnmj_WeChatManager: () => noopService,
            ahhnmj_SysDataManager: () => ({ GetTableDict: () => ({ AHHNMJRoom_WaitTick: 30_000 }) }),
            LocalDataManager: () => ({
                GetConfigProperty: () => this.options.viewSetting ?? 1,
                SetConfigProperty: () => undefined,
            }),
            AHHNMJSetPos: () => new LegacyAhhnmjSetPosition(context),
            ahhnmj_SceneManager: () => ({
                GetSceneType: () => sceneName,
                LoadScene: (name: string) => { sceneName = name; if (name === 'ahhnmjScene') this.options.onRoomReady?.(room); },
            }),
            ahhnmjClient: {
                OnEvent: (event: string, body: unknown) => this.options.onEvent?.(event, body),
                ExitGame: () => this.options.onExit?.('room-not-found'),
            },
            FormManager: () => noopService,
            AHHNMJRoomPosMgr: () => roomPosition,
            AHHNMJRoomSet: () => roomSet,
            AHHNMJRoom: () => room,
        };
        const context = new Proxy(base, {
            get(target, property: string) {
                if (property in target) return target[property];
                return () => noopService;
            },
        });
        roomPosition = new LegacyAhhnmjRoomPositionManager(context);
        roomSet = new LegacyAhhnmjRoomSet(context);
        room = new LegacyAhhnmjRoom(context);
        this.roomPosition = roomPosition;
        this.roomSet = roomSet;
        this.room = room;
        this.manager = new LegacyAhhnmjRoomManager(context);
        this.disposers.push(client.onReconnect(() => this.restoreAfterReconnect()));
    }

    public async enterRoom(roomId: number): Promise<LegacyAhhnmjRoom> {
        if (!Number.isSafeInteger(roomId) || roomId <= 0) throw new Error('安徽淮南麻将房间ID无效');
        await this.client.request('ahhnmj.CAHHNMJGetRoomInfo', { roomID: roomId });
        if (Number(this.manager.GetEnterRoomID()) !== roomId) throw new Error('安徽淮南麻将完整房间信息未初始化');
        return this.room;
    }

    public request<T = unknown>(event: string, body?: unknown): Promise<T> { return this.client.request<T>(event, body); }
    public operate(cardId: number, opType: number, cardList: number[] = []): Promise<unknown> {
        const set = this.room.GetRoomSet();
        const round = set?.GetRoomSetProperty('setRound');
        if (!round) return Promise.reject(new Error('安徽淮南麻将当前操作轮次不存在'));
        return this.request('AHHNMJ.CAHHNMJOpCard', {
            roomID: this.manager.GetEnterRoomID(), setID: set.GetRoomSetProperty('setID'),
            roundID: round.waitID, cardID: cardId, opType, cardList,
        });
    }
    public sendChat(type: number, quickId: number, content = ''): Promise<unknown> {
        return this.request('ahhnmj.CAHHNMJChat', { type, quickID: quickId, targetID: this.getRoomId(), content });
    }
    public startGame(): Promise<unknown> { return this.request('room.CBaseStartGame', { roomID: this.getRoomId() }); }
    public continueGame(): Promise<unknown> { return this.request('room.CBaseContinueGame', { roomID: this.getRoomId() }); }
    public ready(): Promise<unknown> {
        return this.request('ahhnmj.CAHHNMJReadyRoom', { roomID: this.getRoomId(), posIndex: this.roomPosition.GetClientPos() });
    }
    public unready(): Promise<unknown> {
        return this.request('ahhnmj.CAHHNMJUnReadyRoom', { roomID: this.getRoomId(), posIndex: this.roomPosition.GetClientPos() });
    }
    public buyHorse(value: number): Promise<unknown> { return this.request('ahhnmj.CAHHNMJMaiMa', { roomID: this.getRoomId(), maiMa: value }); }
    public choosePiao(value: number): Promise<unknown> { return this.request('ahhnmj.CAHHNMJPiaoHua', { roomID: this.getRoomId(), piaoHua: value }); }
    public chooseJiaoZui(value: number): Promise<unknown> { return this.request('AHHNMJ.CAHHNMJJiaoZui', { roomID: this.getRoomId(), jiaoZui: value }); }
    public chooseNao(value: number): Promise<unknown> { return this.request('AHHNMJ.CAHHNMJNao', { roomID: this.getRoomId(), nao: value }); }
    public startDissolve(): Promise<unknown> { return this.request('ahhnmj.CAHHNMJDissolveRoom', { roomID: this.getRoomId() }); }
    public voteDissolve(agree: boolean): Promise<unknown> {
        return this.request(agree ? 'ahhnmj.CAHHNMJDissolveRoomAgree' : 'ahhnmj.CAHHNMJDissolveRoomRefuse', { roomID: this.getRoomId() });
    }
    public exit(reason = 'user-exit'): void { this.options.onExit?.(reason); }
    public getRoomId(): number { return Number(this.manager.GetEnterRoomID()); }
    public getRoom(): LegacyAhhnmjRoom { return this.room; }
    public getRoomManager(): LegacyAhhnmjRoomManager { return this.manager; }
    public getRoomPositionManager(): LegacyAhhnmjRoomPositionManager { return this.roomPosition; }
    public getRoomSet(): LegacyAhhnmjRoomSet { return this.roomSet; }
    public destroy(): void {
        for (const dispose of this.disposers.splice(0)) dispose();
        this.network.UnAllRegNetPack();
        this.manager.OnReload();
    }
    private async restoreAfterReconnect(): Promise<void> {
        const roomId = this.getRoomId();
        if (!Number.isSafeInteger(roomId) || roomId <= 0) return;
        try {
            await this.client.request('ahhnmj.CAHHNMJGetRoomInfo', { roomID: roomId });
            this.options.onEvent?.('AHHNMJ_Reconnected', { roomID: roomId });
            this.options.onRoomReady?.(this.room);
        } catch (error: unknown) {
            this.options.onMessage?.(error instanceof Error ? error.message : '恢复安徽淮南麻将牌局失败');
            this.options.onExit?.('reconnect-room-failed');
        }
    }
}
