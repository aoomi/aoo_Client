import { ProtocolClient } from '../../network/ProtocolClient';
import {
    LegacyAsmjRoom, LegacyAsmjRoomManager, LegacyAsmjRoomPositionManager,
    LegacyAsmjRoomSet, LegacyAsmjSetPosition,
} from './model';
import { AsmjNetworkAdapter } from './network/AsmjNetworkAdapter';

export interface AsmjRuntimeOptions {
    playerId: number;
    viewSetting?: number;
    onRoomReady?: (room: LegacyAsmjRoom) => void;
    onEvent?: (event: string, body: unknown) => void;
    onMessage?: (message: string) => void;
    onExit?: (reason: string) => void;
}

const shareDefine: Record<string, unknown> = {
    RoomState_Init: 0, RoomState_Playing: 1, RoomState_End: 2, RoomState_Waiting: 3,
    SetState_Init: 0, SetState_Playing: 1, SetState_End: 2, SetState_Waiting: 3,
    ASMJRoomJoinCount: 4, OpType_Out: 7,
    RoomStateStringDict: {}, SetStateStringDict: {}, HuTypeStringDict: {}, OpTypeStringDict: {},
};

/** Owns the preserved ASMJ room state machine and binds it to native 3.8.8 services. */
export class AsmjRuntime {
    private readonly network: AsmjNetworkAdapter;
    private readonly disposers: Array<() => void> = [];
    private readonly roomPosition: LegacyAsmjRoomPositionManager;
    private readonly roomSet: LegacyAsmjRoomSet;
    private readonly room: LegacyAsmjRoom;
    private readonly manager: LegacyAsmjRoomManager;

    public constructor(private readonly client: ProtocolClient, private readonly options: AsmjRuntimeOptions) {
        this.network = new AsmjNetworkAdapter(client);
        let roomPosition!: LegacyAsmjRoomPositionManager;
        let roomSet!: LegacyAsmjRoomSet;
        let room!: LegacyAsmjRoom;
        let sceneName = 'hall';
        const noopService = new Proxy({}, { get: () => () => undefined });
        const base: Record<string, any> = {
            subGameName: 'asmj',
            asmj_ComTool: () => noopService,
            asmj_ShareDefine: () => shareDefine,
            asmj_NetManager: () => this.network,
            asmj_FormManager: () => ({
                ShowForm: (name: string) => { if (/ASMJ(?:2D|XY|WZ|YF)Play/.test(name)) this.options.onRoomReady?.(room); },
                CloseForm: () => undefined, GetFormComponentByFormName: () => null,
            }),
            asmj_SysNotifyManager: () => ({ ShowSysMsg: (text: string) => this.options.onMessage?.(text) }),
            asmj_HeroManager: () => ({ GetHeroID: () => this.options.playerId, GetHeroProperty: () => this.options.playerId }),
            asmj_WeChatManager: () => noopService,
            asmj_SysDataManager: () => ({ GetTableDict: () => ({ ASMJRoom_WaitTick: 30_000 }) }),
            LocalDataManager: () => ({
                GetConfigProperty: () => this.options.viewSetting ?? 1,
                SetConfigProperty: () => undefined,
            }),
            ASMJSetPos: () => new LegacyAsmjSetPosition(context),
            asmj_SceneManager: () => ({
                GetSceneType: () => sceneName,
                LoadScene: (name: string) => { sceneName = name; if (name === 'asmjScene') this.options.onRoomReady?.(room); },
            }),
            asmjClient: {
                OnEvent: (event: string, body: unknown) => this.options.onEvent?.(event, body),
                ExitGame: () => this.options.onExit?.('room-not-found'),
            },
            FormManager: () => noopService,
            ASMJRoomPosMgr: () => roomPosition,
            ASMJRoomSet: () => roomSet,
            ASMJRoom: () => room,
        };
        const context = new Proxy(base, {
            get(target, property: string) {
                if (property in target) return target[property];
                return () => noopService;
            },
        });
        roomPosition = new LegacyAsmjRoomPositionManager(context);
        roomSet = new LegacyAsmjRoomSet(context);
        room = new LegacyAsmjRoom(context);
        this.roomPosition = roomPosition;
        this.roomSet = roomSet;
        this.room = room;
        this.manager = new LegacyAsmjRoomManager(context);
        this.disposers.push(client.onReconnect(() => this.restoreAfterReconnect()));
    }

    public async enterRoom(roomId: number): Promise<LegacyAsmjRoom> {
        if (!Number.isSafeInteger(roomId) || roomId <= 0) throw new Error('安福麻将房间ID无效');
        await this.client.request('asmj.CASMJGetRoomInfo', { roomID: roomId });
        if (Number(this.manager.GetEnterRoomID()) !== roomId) throw new Error('安福麻将完整房间信息未初始化');
        return this.room;
    }

    public request<T = unknown>(event: string, body?: unknown): Promise<T> { return this.client.request<T>(event, body); }
    public operate(cardId: number, opType: number, cardList: number[] = []): Promise<unknown> {
        const set = this.room.GetRoomSet();
        const round = set?.GetRoomSetProperty('setRound');
        if (!round) return Promise.reject(new Error('安福麻将当前操作轮次不存在'));
        return this.request('asmj.CASMJOpCard', {
            roomID: this.manager.GetEnterRoomID(), setID: set.GetRoomSetProperty('setID'),
            roundID: round.waitID, cardID: cardId, opType, cardList,
        });
    }
    public sendChat(type: number, quickId: number, content = ''): Promise<unknown> {
        return this.request('asmj.CASMJChat', { type, quickID: quickId, targetID: this.getRoomId(), content });
    }
    public startGame(): Promise<unknown> { return this.request('room.CBaseStartGame', { roomID: this.getRoomId() }); }
    public continueGame(): Promise<unknown> { return this.request('room.CBaseContinueGame', { roomID: this.getRoomId() }); }
    public ready(): Promise<unknown> {
        return this.request('asmj.CASMJReadyRoom', { roomID: this.getRoomId(), posIndex: this.roomPosition.GetClientPos() });
    }
    public unready(): Promise<unknown> {
        return this.request('asmj.CASMJUnReadyRoom', { roomID: this.getRoomId(), posIndex: this.roomPosition.GetClientPos() });
    }
    public buyHorse(value: number): Promise<unknown> { return this.request('asmj.CASMJMaiMa', { roomID: this.getRoomId(), maiMa: value }); }
    public choosePiao(value: number): Promise<unknown> { return this.request('asmj.CASMJPiaoHua', { roomID: this.getRoomId(), piaoHua: value }); }
    public startDissolve(): Promise<unknown> { return this.request('asmj.CASMJDissolveRoom', { roomID: this.getRoomId() }); }
    public voteDissolve(agree: boolean): Promise<unknown> {
        return this.request(agree ? 'asmj.CASMJDissolveRoomAgree' : 'asmj.CASMJDissolveRoomRefuse', { roomID: this.getRoomId() });
    }
    public exit(reason = 'user-exit'): void { this.options.onExit?.(reason); }
    public getRoomId(): number { return Number(this.manager.GetEnterRoomID()); }
    public getRoom(): LegacyAsmjRoom { return this.room; }
    public getRoomManager(): LegacyAsmjRoomManager { return this.manager; }
    public getRoomPositionManager(): LegacyAsmjRoomPositionManager { return this.roomPosition; }
    public getRoomSet(): LegacyAsmjRoomSet { return this.roomSet; }
    public destroy(): void {
        for (const dispose of this.disposers.splice(0)) dispose();
        this.network.UnAllRegNetPack();
        this.manager.OnReload();
    }
    private async restoreAfterReconnect(): Promise<void> {
        const roomId = this.getRoomId();
        if (!Number.isSafeInteger(roomId) || roomId <= 0) return;
        try {
            await this.client.request('asmj.CASMJGetRoomInfo', { roomID: roomId });
            this.options.onEvent?.('ASMJ_Reconnected', { roomID: roomId });
            this.options.onRoomReady?.(this.room);
        } catch (error: unknown) {
            this.options.onMessage?.(error instanceof Error ? error.message : '恢复安福麻将牌局失败');
            this.options.onExit?.('reconnect-room-failed');
        }
    }
}
