import { ProtocolClient } from '../../network/ProtocolClient';
import {
    LegacyAfmjRoom, LegacyAfmjRoomManager, LegacyAfmjRoomPositionManager,
    LegacyAfmjRoomSet, LegacyAfmjSetPosition,
} from './model';
import { AfmjNetworkAdapter } from './network/AfmjNetworkAdapter';

export interface AfmjRuntimeOptions {
    playerId: number;
    viewSetting?: number;
    onRoomReady?: (room: LegacyAfmjRoom) => void;
    onEvent?: (event: string, body: unknown) => void;
    onMessage?: (message: string) => void;
    onExit?: (reason: string) => void;
}

const shareDefine: Record<string, unknown> = {
    RoomState_Init: 0, RoomState_Playing: 1, RoomState_End: 2, RoomState_Waiting: 3,
    SetState_Init: 0, SetState_Playing: 1, SetState_End: 2, SetState_Waiting: 3,
    AFMJRoomJoinCount: 4, OpType_Out: 7,
    RoomStateStringDict: {}, SetStateStringDict: {}, HuTypeStringDict: {}, OpTypeStringDict: {},
};

/** Owns the preserved AFMJ room state machine and binds it to native 3.8.8 services. */
export class AfmjRuntime {
    private readonly network: AfmjNetworkAdapter;
    private readonly disposers: Array<() => void> = [];
    private readonly roomPosition: LegacyAfmjRoomPositionManager;
    private readonly roomSet: LegacyAfmjRoomSet;
    private readonly room: LegacyAfmjRoom;
    private readonly manager: LegacyAfmjRoomManager;

    public constructor(private readonly client: ProtocolClient, private readonly options: AfmjRuntimeOptions) {
        this.network = new AfmjNetworkAdapter(client);
        let roomPosition!: LegacyAfmjRoomPositionManager;
        let roomSet!: LegacyAfmjRoomSet;
        let room!: LegacyAfmjRoom;
        let sceneName = 'hall';
        const noopService = new Proxy({}, { get: () => () => undefined });
        const base: Record<string, any> = {
            subGameName: 'afmj',
            afmj_ComTool: () => noopService,
            afmj_ShareDefine: () => shareDefine,
            afmj_NetManager: () => this.network,
            afmj_FormManager: () => ({
                ShowForm: (name: string) => { if (/AFMJ(?:2D|XY|WZ|YF)Play/.test(name)) this.options.onRoomReady?.(room); },
                CloseForm: () => undefined, GetFormComponentByFormName: () => null,
            }),
            afmj_SysNotifyManager: () => ({ ShowSysMsg: (text: string) => this.options.onMessage?.(text) }),
            afmj_HeroManager: () => ({ GetHeroID: () => this.options.playerId, GetHeroProperty: () => this.options.playerId }),
            afmj_WeChatManager: () => noopService,
            afmj_SysDataManager: () => ({ GetTableDict: () => ({ AFMJRoom_WaitTick: 30_000 }) }),
            LocalDataManager: () => ({
                GetConfigProperty: () => this.options.viewSetting ?? 1,
                SetConfigProperty: () => undefined,
            }),
            AFMJSetPos: () => new LegacyAfmjSetPosition(context),
            afmj_SceneManager: () => ({
                GetSceneType: () => sceneName,
                LoadScene: (name: string) => { sceneName = name; if (name === 'afmjScene') this.options.onRoomReady?.(room); },
            }),
            afmjClient: {
                OnEvent: (event: string, body: unknown) => this.options.onEvent?.(event, body),
                ExitGame: () => this.options.onExit?.('room-not-found'),
            },
            FormManager: () => noopService,
            AFMJRoomPosMgr: () => roomPosition,
            AFMJRoomSet: () => roomSet,
            AFMJRoom: () => room,
        };
        const context = new Proxy(base, {
            get(target, property: string) {
                if (property in target) return target[property];
                return () => noopService;
            },
        });
        roomPosition = new LegacyAfmjRoomPositionManager(context);
        roomSet = new LegacyAfmjRoomSet(context);
        room = new LegacyAfmjRoom(context);
        this.roomPosition = roomPosition;
        this.roomSet = roomSet;
        this.room = room;
        this.manager = new LegacyAfmjRoomManager(context);
        this.disposers.push(client.onReconnect(() => this.restoreAfterReconnect()));
    }

    public async enterRoom(roomId: number): Promise<LegacyAfmjRoom> {
        if (!Number.isSafeInteger(roomId) || roomId <= 0) throw new Error('安福麻将房间ID无效');
        await this.client.request('afmj.CAFMJGetRoomInfo', { roomID: roomId });
        if (Number(this.manager.GetEnterRoomID()) !== roomId) throw new Error('安福麻将完整房间信息未初始化');
        return this.room;
    }

    public request<T = unknown>(event: string, body?: unknown): Promise<T> { return this.client.request<T>(event, body); }
    public operate(cardId: number, opType: number, cardList: number[] = []): Promise<unknown> {
        const set = this.room.GetRoomSet();
        const round = set?.GetRoomSetProperty('setRound');
        if (!round) return Promise.reject(new Error('安福麻将当前操作轮次不存在'));
        return this.request('afmj.CAFMJOpCard', {
            roomID: this.manager.GetEnterRoomID(), setID: set.GetRoomSetProperty('setID'),
            roundID: round.waitID, cardID: cardId, opType, cardList,
        });
    }
    public sendChat(type: number, quickId: number, content = ''): Promise<unknown> {
        return this.request('afmj.CAFMJChat', { type, quickID: quickId, targetID: this.getRoomId(), content });
    }
    public startGame(): Promise<unknown> { return this.request('room.CBaseStartGame', { roomID: this.getRoomId() }); }
    public continueGame(): Promise<unknown> { return this.request('room.CBaseContinueGame', { roomID: this.getRoomId() }); }
    public ready(): Promise<unknown> {
        return this.request('afmj.CAFMJReadyRoom', { roomID: this.getRoomId(), posIndex: this.roomPosition.GetClientPos() });
    }
    public unready(): Promise<unknown> {
        return this.request('afmj.CAFMJUnReadyRoom', { roomID: this.getRoomId(), posIndex: this.roomPosition.GetClientPos() });
    }
    public buyHorse(value: number): Promise<unknown> { return this.request('afmj.CAFMJMaiMa', { roomID: this.getRoomId(), maiMa: value }); }
    public choosePiao(value: number): Promise<unknown> { return this.request('afmj.CAFMJPiaoHua', { roomID: this.getRoomId(), piaoHua: value }); }
    public startDissolve(): Promise<unknown> { return this.request('afmj.CAFMJDissolveRoom', { roomID: this.getRoomId() }); }
    public voteDissolve(agree: boolean): Promise<unknown> {
        return this.request(agree ? 'afmj.CAFMJDissolveRoomAgree' : 'afmj.CAFMJDissolveRoomRefuse', { roomID: this.getRoomId() });
    }
    public exit(reason = 'user-exit'): void { this.options.onExit?.(reason); }
    public getRoomId(): number { return Number(this.manager.GetEnterRoomID()); }
    public getRoom(): LegacyAfmjRoom { return this.room; }
    public getRoomManager(): LegacyAfmjRoomManager { return this.manager; }
    public getRoomPositionManager(): LegacyAfmjRoomPositionManager { return this.roomPosition; }
    public getRoomSet(): LegacyAfmjRoomSet { return this.roomSet; }
    public destroy(): void {
        for (const dispose of this.disposers.splice(0)) dispose();
        this.network.UnAllRegNetPack();
        this.manager.OnReload();
    }
    private async restoreAfterReconnect(): Promise<void> {
        const roomId = this.getRoomId();
        if (!Number.isSafeInteger(roomId) || roomId <= 0) return;
        try {
            await this.client.request('afmj.CAFMJGetRoomInfo', { roomID: roomId });
            this.options.onEvent?.('AFMJ_Reconnected', { roomID: roomId });
            this.options.onRoomReady?.(this.room);
        } catch (error: unknown) {
            this.options.onMessage?.(error instanceof Error ? error.message : '恢复安福麻将牌局失败');
            this.options.onExit?.('reconnect-room-failed');
        }
    }
}
