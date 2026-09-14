import { ProtocolClient } from '../../network/ProtocolClient';
import {
    LegacyBamjRoom, LegacyBamjRoomManager, LegacyBamjRoomPositionManager,
    LegacyBamjRoomSet, LegacyBamjSetPosition,
} from './model';
import { BamjNetworkAdapter } from './network/BamjNetworkAdapter';

export interface BamjRuntimeOptions {
    playerId: number;
    viewSetting?: number;
    onRoomReady?: (room: LegacyBamjRoom) => void;
    onEvent?: (event: string, body: unknown) => void;
    onMessage?: (message: string) => void;
    onExit?: (reason: string) => void;
}

const shareDefine: Record<string, unknown> = {
    RoomState_Init: 0, RoomState_Playing: 1, RoomState_End: 2, RoomState_Waiting: 3,
    SetState_Init: 0, SetState_Playing: 1, SetState_End: 2, SetState_Waiting: 3,
    BAMJRoomJoinCount: 4, OpType_Out: 7,
    RoomStateStringDict: {}, SetStateStringDict: {}, HuTypeStringDict: {}, OpTypeStringDict: {},
};

/** Owns the preserved BAMJ room state machine and binds it to native 3.8.8 services. */
export class BamjRuntime {
    private readonly network: BamjNetworkAdapter;
    private readonly disposers: Array<() => void> = [];
    private readonly roomPosition: LegacyBamjRoomPositionManager;
    private readonly roomSet: LegacyBamjRoomSet;
    private readonly room: LegacyBamjRoom;
    private readonly manager: LegacyBamjRoomManager;

    public constructor(private readonly client: ProtocolClient, private readonly options: BamjRuntimeOptions) {
        this.network = new BamjNetworkAdapter(client);
        let roomPosition!: LegacyBamjRoomPositionManager;
        let roomSet!: LegacyBamjRoomSet;
        let room!: LegacyBamjRoom;
        let sceneName = 'hall';
        const noopService = new Proxy({}, { get: () => () => undefined });
        const base: Record<string, any> = {
            subGameName: 'bamj',
            bamj_ComTool: () => noopService,
            bamj_ShareDefine: () => shareDefine,
            bamj_NetManager: () => this.network,
            bamj_FormManager: () => ({
                ShowForm: (name: string) => { if (/BAMJ(?:2D|XY|WZ|YF)Play/.test(name)) this.options.onRoomReady?.(room); },
                CloseForm: () => undefined, GetFormComponentByFormName: () => null,
            }),
            bamj_SysNotifyManager: () => ({ ShowSysMsg: (text: string) => this.options.onMessage?.(text) }),
            bamj_HeroManager: () => ({ GetHeroID: () => this.options.playerId, GetHeroProperty: () => this.options.playerId }),
            bamj_WeChatManager: () => noopService,
            bamj_SysDataManager: () => ({ GetTableDict: () => ({ BAMJRoom_WaitTick: 30_000 }) }),
            LocalDataManager: () => ({
                GetConfigProperty: () => this.options.viewSetting ?? 1,
                SetConfigProperty: () => undefined,
            }),
            BAMJSetPos: () => new LegacyBamjSetPosition(context),
            bamj_SceneManager: () => ({
                GetSceneType: () => sceneName,
                LoadScene: (name: string) => { sceneName = name; if (name === 'bamjScene') this.options.onRoomReady?.(room); },
            }),
            bamjClient: {
                OnEvent: (event: string, body: unknown) => this.options.onEvent?.(event, body),
                ExitGame: () => this.options.onExit?.('room-not-found'),
            },
            FormManager: () => noopService,
            BAMJRoomPosMgr: () => roomPosition,
            BAMJRoomSet: () => roomSet,
            BAMJRoom: () => room,
        };
        const context = new Proxy(base, {
            get(target, property: string) {
                if (property in target) return target[property];
                return () => noopService;
            },
        });
        roomPosition = new LegacyBamjRoomPositionManager(context);
        roomSet = new LegacyBamjRoomSet(context);
        room = new LegacyBamjRoom(context);
        this.roomPosition = roomPosition;
        this.roomSet = roomSet;
        this.room = room;
        this.manager = new LegacyBamjRoomManager(context);
        this.disposers.push(client.onReconnect(() => this.restoreAfterReconnect()));
    }

    public async enterRoom(roomId: number): Promise<LegacyBamjRoom> {
        if (!Number.isSafeInteger(roomId) || roomId <= 0) throw new Error('安福麻将房间ID无效');
        await this.client.request('bamj.CBAMJGetRoomInfo', { roomID: roomId });
        if (Number(this.manager.GetEnterRoomID()) !== roomId) throw new Error('安福麻将完整房间信息未初始化');
        return this.room;
    }

    public request<T = unknown>(event: string, body?: unknown): Promise<T> { return this.client.request<T>(event, body); }
    public operate(cardId: number, opType: number, cardList: number[] = []): Promise<unknown> {
        const set = this.room.GetRoomSet();
        const round = set?.GetRoomSetProperty('setRound');
        if (!round) return Promise.reject(new Error('安福麻将当前操作轮次不存在'));
        return this.request('bamj.CBAMJOpCard', {
            roomID: this.manager.GetEnterRoomID(), setID: set.GetRoomSetProperty('setID'),
            roundID: round.waitID, cardID: cardId, opType, cardList,
        });
    }
    public sendChat(type: number, quickId: number, content = ''): Promise<unknown> {
        return this.request('bamj.CBAMJChat', { type, quickID: quickId, targetID: this.getRoomId(), content });
    }
    public startGame(): Promise<unknown> { return this.request('room.CBaseStartGame', { roomID: this.getRoomId() }); }
    public continueGame(): Promise<unknown> { return this.request('room.CBaseContinueGame', { roomID: this.getRoomId() }); }
    public ready(): Promise<unknown> {
        return this.request('bamj.CBAMJReadyRoom', { roomID: this.getRoomId(), posIndex: this.roomPosition.GetClientPos() });
    }
    public unready(): Promise<unknown> {
        return this.request('bamj.CBAMJUnReadyRoom', { roomID: this.getRoomId(), posIndex: this.roomPosition.GetClientPos() });
    }
    public buyHorse(value: number): Promise<unknown> { return this.request('bamj.CBAMJMaiMa', { roomID: this.getRoomId(), maiMa: value }); }
    public choosePiao(value: number): Promise<unknown> { return this.request('bamj.CBAMJPiaoHua', { roomID: this.getRoomId(), piaoHua: value }); }
    public startDissolve(): Promise<unknown> { return this.request('bamj.CBAMJDissolveRoom', { roomID: this.getRoomId() }); }
    public voteDissolve(agree: boolean): Promise<unknown> {
        return this.request(agree ? 'bamj.CBAMJDissolveRoomAgree' : 'bamj.CBAMJDissolveRoomRefuse', { roomID: this.getRoomId() });
    }
    public exit(reason = 'user-exit'): void { this.options.onExit?.(reason); }
    public getRoomId(): number { return Number(this.manager.GetEnterRoomID()); }
    public getRoom(): LegacyBamjRoom { return this.room; }
    public getRoomManager(): LegacyBamjRoomManager { return this.manager; }
    public getRoomPositionManager(): LegacyBamjRoomPositionManager { return this.roomPosition; }
    public getRoomSet(): LegacyBamjRoomSet { return this.roomSet; }
    public destroy(): void {
        for (const dispose of this.disposers.splice(0)) dispose();
        this.network.UnAllRegNetPack();
        this.manager.OnReload();
    }
    private async restoreAfterReconnect(): Promise<void> {
        const roomId = this.getRoomId();
        if (!Number.isSafeInteger(roomId) || roomId <= 0) return;
        try {
            await this.client.request('bamj.CBAMJGetRoomInfo', { roomID: roomId });
            this.options.onEvent?.('BAMJ_Reconnected', { roomID: roomId });
            this.options.onRoomReady?.(this.room);
        } catch (error: unknown) {
            this.options.onMessage?.(error instanceof Error ? error.message : '恢复安福麻将牌局失败');
            this.options.onExit?.('reconnect-room-failed');
        }
    }
}
