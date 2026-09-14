import { ProtocolClient } from '../../network/ProtocolClient';
import {
    LegacyBdjhmjRoom, LegacyBdjhmjRoomManager, LegacyBdjhmjRoomPositionManager,
    LegacyBdjhmjRoomSet, LegacyBdjhmjSetPosition,
} from './model';
import { BdjhmjNetworkAdapter } from './network/BdjhmjNetworkAdapter';

export interface BdjhmjRuntimeOptions {
    playerId: number;
    viewSetting?: number;
    onRoomReady?: (room: LegacyBdjhmjRoom) => void;
    onEvent?: (event: string, body: unknown) => void;
    onMessage?: (message: string) => void;
    onExit?: (reason: string) => void;
}

const shareDefine: Record<string, unknown> = {
    RoomState_Init: 0, RoomState_Playing: 1, RoomState_End: 2, RoomState_Waiting: 3,
    SetState_Init: 0, SetState_Playing: 1, SetState_End: 2, SetState_Waiting: 3,
    BDJHMJRoomJoinCount: 4, OpType_Out: 7,
    RoomStateStringDict: {}, SetStateStringDict: {}, HuTypeStringDict: {}, OpTypeStringDict: {},
};

/** Owns the preserved BDJHMJ room state machine and binds it to native 3.8.8 services. */
export class BdjhmjRuntime {
    private readonly network: BdjhmjNetworkAdapter;
    private readonly disposers: Array<() => void> = [];
    private readonly roomPosition: LegacyBdjhmjRoomPositionManager;
    private readonly roomSet: LegacyBdjhmjRoomSet;
    private readonly room: LegacyBdjhmjRoom;
    private readonly manager: LegacyBdjhmjRoomManager;

    public constructor(private readonly client: ProtocolClient, private readonly options: BdjhmjRuntimeOptions) {
        this.network = new BdjhmjNetworkAdapter(client);
        let roomPosition!: LegacyBdjhmjRoomPositionManager;
        let roomSet!: LegacyBdjhmjRoomSet;
        let room!: LegacyBdjhmjRoom;
        let sceneName = 'hall';
        const noopService = new Proxy({}, { get: () => () => undefined });
        const base: Record<string, any> = {
            subGameName: 'bdjhmj',
            bdjhmj_ComTool: () => noopService,
            bdjhmj_ShareDefine: () => shareDefine,
            bdjhmj_NetManager: () => this.network,
            bdjhmj_FormManager: () => ({
                ShowForm: (name: string) => { if (/BDJHMJ(?:2D|XY|WZ|YF)Play/.test(name)) this.options.onRoomReady?.(room); },
                CloseForm: () => undefined, GetFormComponentByFormName: () => null,
            }),
            bdjhmj_SysNotifyManager: () => ({ ShowSysMsg: (text: string) => this.options.onMessage?.(text) }),
            bdjhmj_HeroManager: () => ({ GetHeroID: () => this.options.playerId, GetHeroProperty: () => this.options.playerId }),
            bdjhmj_WeChatManager: () => noopService,
            bdjhmj_SysDataManager: () => ({ GetTableDict: () => ({ BDJHMJRoom_WaitTick: 30_000 }) }),
            LocalDataManager: () => ({
                GetConfigProperty: () => this.options.viewSetting ?? 1,
                SetConfigProperty: () => undefined,
            }),
            BDJHMJSetPos: () => new LegacyBdjhmjSetPosition(context),
            bdjhmj_SceneManager: () => ({
                GetSceneType: () => sceneName,
                LoadScene: (name: string) => { sceneName = name; if (name === 'bdjhmjScene') this.options.onRoomReady?.(room); },
            }),
            bdjhmjClient: {
                OnEvent: (event: string, body: unknown) => this.options.onEvent?.(event, body),
                ExitGame: () => this.options.onExit?.('room-not-found'),
            },
            FormManager: () => noopService,
            BDJHMJRoomPosMgr: () => roomPosition,
            BDJHMJRoomSet: () => roomSet,
            BDJHMJRoom: () => room,
        };
        const context = new Proxy(base, {
            get(target, property: string) {
                if (property in target) return target[property];
                return () => noopService;
            },
        });
        roomPosition = new LegacyBdjhmjRoomPositionManager(context);
        roomSet = new LegacyBdjhmjRoomSet(context);
        room = new LegacyBdjhmjRoom(context);
        this.roomPosition = roomPosition;
        this.roomSet = roomSet;
        this.room = room;
        this.manager = new LegacyBdjhmjRoomManager(context);
        this.disposers.push(client.onReconnect(() => this.restoreAfterReconnect()));
    }

    public async enterRoom(roomId: number): Promise<LegacyBdjhmjRoom> {
        if (!Number.isSafeInteger(roomId) || roomId <= 0) throw new Error('安福麻将房间ID无效');
        await this.client.request('bdjhmj.CBDJHMJGetRoomInfo', { roomID: roomId });
        if (Number(this.manager.GetEnterRoomID()) !== roomId) throw new Error('安福麻将完整房间信息未初始化');
        return this.room;
    }

    public request<T = unknown>(event: string, body?: unknown): Promise<T> { return this.client.request<T>(event, body); }
    public operate(cardId: number, opType: number, cardList: number[] = []): Promise<unknown> {
        const set = this.room.GetRoomSet();
        const round = set?.GetRoomSetProperty('setRound');
        if (!round) return Promise.reject(new Error('安福麻将当前操作轮次不存在'));
        return this.request('bdjhmj.CBDJHMJOpCard', {
            roomID: this.manager.GetEnterRoomID(), setID: set.GetRoomSetProperty('setID'),
            roundID: round.waitID, cardID: cardId, opType, cardList,
        });
    }
    public sendChat(type: number, quickId: number, content = ''): Promise<unknown> {
        return this.request('bdjhmj.CBDJHMJChat', { type, quickID: quickId, targetID: this.getRoomId(), content });
    }
    public startGame(): Promise<unknown> { return this.request('room.CBaseStartGame', { roomID: this.getRoomId() }); }
    public continueGame(): Promise<unknown> { return this.request('room.CBaseContinueGame', { roomID: this.getRoomId() }); }
    public ready(): Promise<unknown> {
        return this.request('bdjhmj.CBDJHMJReadyRoom', { roomID: this.getRoomId(), posIndex: this.roomPosition.GetClientPos() });
    }
    public unready(): Promise<unknown> {
        return this.request('bdjhmj.CBDJHMJUnReadyRoom', { roomID: this.getRoomId(), posIndex: this.roomPosition.GetClientPos() });
    }
    public buyHorse(value: number): Promise<unknown> { return this.request('bdjhmj.CBDJHMJMaiMa', { roomID: this.getRoomId(), maiMa: value }); }
    public choosePiao(value: number): Promise<unknown> { return this.request('bdjhmj.CBDJHMJPiaoHua', { roomID: this.getRoomId(), piaoHua: value }); }
    public startDissolve(): Promise<unknown> { return this.request('bdjhmj.CBDJHMJDissolveRoom', { roomID: this.getRoomId() }); }
    public voteDissolve(agree: boolean): Promise<unknown> {
        return this.request(agree ? 'bdjhmj.CBDJHMJDissolveRoomAgree' : 'bdjhmj.CBDJHMJDissolveRoomRefuse', { roomID: this.getRoomId() });
    }
    public exit(reason = 'user-exit'): void { this.options.onExit?.(reason); }
    public getRoomId(): number { return Number(this.manager.GetEnterRoomID()); }
    public getRoom(): LegacyBdjhmjRoom { return this.room; }
    public getRoomManager(): LegacyBdjhmjRoomManager { return this.manager; }
    public getRoomPositionManager(): LegacyBdjhmjRoomPositionManager { return this.roomPosition; }
    public getRoomSet(): LegacyBdjhmjRoomSet { return this.roomSet; }
    public destroy(): void {
        for (const dispose of this.disposers.splice(0)) dispose();
        this.network.UnAllRegNetPack();
        this.manager.OnReload();
    }
    private async restoreAfterReconnect(): Promise<void> {
        const roomId = this.getRoomId();
        if (!Number.isSafeInteger(roomId) || roomId <= 0) return;
        try {
            await this.client.request('bdjhmj.CBDJHMJGetRoomInfo', { roomID: roomId });
            this.options.onEvent?.('BDJHMJ_Reconnected', { roomID: roomId });
            this.options.onRoomReady?.(this.room);
        } catch (error: unknown) {
            this.options.onMessage?.(error instanceof Error ? error.message : '恢复安福麻将牌局失败');
            this.options.onExit?.('reconnect-room-failed');
        }
    }
}
