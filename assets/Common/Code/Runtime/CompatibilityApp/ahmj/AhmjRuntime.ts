import { ProtocolClient } from '../../network/ProtocolClient';
import {
    LegacyAhmjRoom, LegacyAhmjRoomManager, LegacyAhmjRoomPositionManager,
    LegacyAhmjRoomSet, LegacyAhmjSetPosition,
} from './model';
import { AhmjNetworkAdapter } from './network/AhmjNetworkAdapter';

export interface AhmjRuntimeOptions {
    playerId: number;
    viewSetting?: number;
    onRoomReady?: (room: LegacyAhmjRoom) => void;
    onEvent?: (event: string, body: unknown) => void;
    onMessage?: (message: string) => void;
    onExit?: (reason: string) => void;
}

const shareDefine: Record<string, unknown> = {
    RoomState_Init: 0, RoomState_Playing: 1, RoomState_End: 2, RoomState_Waiting: 3,
    SetState_Init: 0, SetState_Playing: 1, SetState_End: 2, SetState_Waiting: 3,
    AHMJRoomJoinCount: 4, OpType_Out: 7,
    RoomStateStringDict: {}, SetStateStringDict: {}, HuTypeStringDict: {}, OpTypeStringDict: {},
};

/** Owns the preserved AHMJ room state machine and binds it to native 3.8.8 services. */
export class AhmjRuntime {
    private readonly network: AhmjNetworkAdapter;
    private readonly disposers: Array<() => void> = [];
    private readonly roomPosition: LegacyAhmjRoomPositionManager;
    private readonly roomSet: LegacyAhmjRoomSet;
    private readonly room: LegacyAhmjRoom;
    private readonly manager: LegacyAhmjRoomManager;

    public constructor(private readonly client: ProtocolClient, private readonly options: AhmjRuntimeOptions) {
        this.network = new AhmjNetworkAdapter(client);
        let roomPosition!: LegacyAhmjRoomPositionManager;
        let roomSet!: LegacyAhmjRoomSet;
        let room!: LegacyAhmjRoom;
        let sceneName = 'hall';
        const noopService = new Proxy({}, { get: () => () => undefined });
        const base: Record<string, any> = {
            subGameName: 'ahmj',
            ahmj_ComTool: () => noopService,
            ahmj_ShareDefine: () => shareDefine,
            ahmj_NetManager: () => this.network,
            ahmj_FormManager: () => ({
                ShowForm: (name: string) => { if (/AHMJ(?:2D|XY|WZ|YF)Play/.test(name)) this.options.onRoomReady?.(room); },
                CloseForm: () => undefined, GetFormComponentByFormName: () => null,
            }),
            ahmj_SysNotifyManager: () => ({ ShowSysMsg: (text: string) => this.options.onMessage?.(text) }),
            ahmj_HeroManager: () => ({ GetHeroID: () => this.options.playerId, GetHeroProperty: () => this.options.playerId }),
            ahmj_WeChatManager: () => noopService,
            ahmj_SysDataManager: () => ({ GetTableDict: () => ({ AHMJRoom_WaitTick: 30_000 }) }),
            LocalDataManager: () => ({
                GetConfigProperty: () => this.options.viewSetting ?? 1,
                SetConfigProperty: () => undefined,
            }),
            AHMJSetPos: () => new LegacyAhmjSetPosition(context),
            ahmj_SceneManager: () => ({
                GetSceneType: () => sceneName,
                LoadScene: (name: string) => { sceneName = name; if (name === 'ahmjScene') this.options.onRoomReady?.(room); },
            }),
            ahmjClient: {
                OnEvent: (event: string, body: unknown) => this.options.onEvent?.(event, body),
                ExitGame: () => this.options.onExit?.('room-not-found'),
            },
            FormManager: () => noopService,
            AHMJRoomPosMgr: () => roomPosition,
            AHMJRoomSet: () => roomSet,
            AHMJRoom: () => room,
        };
        const context = new Proxy(base, {
            get(target, property: string) {
                if (property in target) return target[property];
                return () => noopService;
            },
        });
        roomPosition = new LegacyAhmjRoomPositionManager(context);
        roomSet = new LegacyAhmjRoomSet(context);
        room = new LegacyAhmjRoom(context);
        this.roomPosition = roomPosition;
        this.roomSet = roomSet;
        this.room = room;
        this.manager = new LegacyAhmjRoomManager(context);
        this.disposers.push(client.onReconnect(() => this.restoreAfterReconnect()));
    }

    public async enterRoom(roomId: number): Promise<LegacyAhmjRoom> {
        if (!Number.isSafeInteger(roomId) || roomId <= 0) throw new Error('安福麻将房间ID无效');
        await this.client.request('ahmj.CAHMJGetRoomInfo', { roomID: roomId });
        if (Number(this.manager.GetEnterRoomID()) !== roomId) throw new Error('安福麻将完整房间信息未初始化');
        return this.room;
    }

    public request<T = unknown>(event: string, body?: unknown): Promise<T> { return this.client.request<T>(event, body); }
    public operate(cardId: number, opType: number, cardList: number[] = []): Promise<unknown> {
        const set = this.room.GetRoomSet();
        const round = set?.GetRoomSetProperty('setRound');
        if (!round) return Promise.reject(new Error('安福麻将当前操作轮次不存在'));
        return this.request('ahmj.CAHMJOpCard', {
            roomID: this.manager.GetEnterRoomID(), setID: set.GetRoomSetProperty('setID'),
            roundID: round.waitID, cardID: cardId, opType, cardList,
        });
    }
    public sendChat(type: number, quickId: number, content = ''): Promise<unknown> {
        return this.request('ahmj.CAHMJChat', { type, quickID: quickId, targetID: this.getRoomId(), content });
    }
    public startGame(): Promise<unknown> { return this.request('room.CBaseStartGame', { roomID: this.getRoomId() }); }
    public continueGame(): Promise<unknown> { return this.request('room.CBaseContinueGame', { roomID: this.getRoomId() }); }
    public ready(): Promise<unknown> {
        return this.request('ahmj.CAHMJReadyRoom', { roomID: this.getRoomId(), posIndex: this.roomPosition.GetClientPos() });
    }
    public unready(): Promise<unknown> {
        return this.request('ahmj.CAHMJUnReadyRoom', { roomID: this.getRoomId(), posIndex: this.roomPosition.GetClientPos() });
    }
    public buyHorse(value: number): Promise<unknown> { return this.request('ahmj.CAHMJMaiMa', { roomID: this.getRoomId(), maiMa: value }); }
    public choosePiao(value: number): Promise<unknown> { return this.request('ahmj.CAHMJPiaoHua', { roomID: this.getRoomId(), piaoHua: value }); }
    public startDissolve(): Promise<unknown> { return this.request('ahmj.CAHMJDissolveRoom', { roomID: this.getRoomId() }); }
    public voteDissolve(agree: boolean): Promise<unknown> {
        return this.request(agree ? 'ahmj.CAHMJDissolveRoomAgree' : 'ahmj.CAHMJDissolveRoomRefuse', { roomID: this.getRoomId() });
    }
    public exit(reason = 'user-exit'): void { this.options.onExit?.(reason); }
    public getRoomId(): number { return Number(this.manager.GetEnterRoomID()); }
    public getRoom(): LegacyAhmjRoom { return this.room; }
    public getRoomManager(): LegacyAhmjRoomManager { return this.manager; }
    public getRoomPositionManager(): LegacyAhmjRoomPositionManager { return this.roomPosition; }
    public getRoomSet(): LegacyAhmjRoomSet { return this.roomSet; }
    public destroy(): void {
        for (const dispose of this.disposers.splice(0)) dispose();
        this.network.UnAllRegNetPack();
        this.manager.OnReload();
    }
    private async restoreAfterReconnect(): Promise<void> {
        const roomId = this.getRoomId();
        if (!Number.isSafeInteger(roomId) || roomId <= 0) return;
        try {
            await this.client.request('ahmj.CAHMJGetRoomInfo', { roomID: roomId });
            this.options.onEvent?.('AHMJ_Reconnected', { roomID: roomId });
            this.options.onRoomReady?.(this.room);
        } catch (error: unknown) {
            this.options.onMessage?.(error instanceof Error ? error.message : '恢复安福麻将牌局失败');
            this.options.onExit?.('reconnect-room-failed');
        }
    }
}
