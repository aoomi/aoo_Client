import { ProtocolClient } from '../../network/ProtocolClient';
import { LegacyA3pkGameLogic, LegacyA3pkRoom, LegacyA3pkRoomManager, LegacyA3pkRoomPositionManager, LegacyA3pkRoomSet } from './model';
import { A3pkNetworkAdapter } from './network/A3pkNetworkAdapter';

export interface A3pkRuntimeOptions {
    playerId: number;
    onRoomReady?: (room: LegacyA3pkRoom) => void;
    onEvent?: (event: string, body: unknown) => void;
    onMessage?: (message: string) => void;
    onExit?: (reason: string) => void;
}

const shareDefine: Record<string, unknown> = {
    RoomState_Init: 0, RoomState_Playing: 1, RoomState_End: 2, RoomState_Waiting: 3, RoomState_WaitingEx: 4,
    RoomStateStringDict: { Init: 0, Playing: 1, End: 2, Waiting: 3, WaitingEx: 4 },
    SetState_Init: 0, SetState_Playing: 1, SetState_End: 2, SetState_Waiting: 3,
    SetStateStringDict: { Init: 0, Playing: 1, End: 2, Waiting: 3 },
    A3PKRoomJoinCount: 4, RoomJoinCount: 4, isCoinRoom: false,
};

/** Lifecycle owner for the complete Creator 2.2.2 A3PK room state and protocol model. */
export class A3pkRuntime {
    private readonly network: A3pkNetworkAdapter;
    private readonly roomPosition: LegacyA3pkRoomPositionManager;
    private readonly roomSet: LegacyA3pkRoomSet;
    private readonly room: LegacyA3pkRoom;
    private readonly manager: LegacyA3pkRoomManager;
    private readonly logic: LegacyA3pkGameLogic;
    private readonly disposers: Array<() => void> = [];

    public constructor(private readonly client: ProtocolClient, private readonly options: A3pkRuntimeOptions) {
        this.network = new A3pkNetworkAdapter(client);
        let roomPosition!: LegacyA3pkRoomPositionManager;
        let roomSet!: LegacyA3pkRoomSet;
        let room!: LegacyA3pkRoom;
        let logic!: LegacyA3pkGameLogic;
        const noopManager = () => ({});
        const context: Record<string, any> = {
            subGameName: 'a3pk',
            a3pk_ComTool: noopManager, a3pk_ShareDefine: () => shareDefine, a3pk_NetManager: () => this.network,
            a3pk_FormManager: () => ({ ShowForm: () => this.options.onRoomReady?.(room), CloseForm: () => undefined }),
            a3pk_SysNotifyManager: () => ({ ShowSysMsg: (message: string) => this.options.onMessage?.(message) }),
            a3pk_HeroManager: () => ({ GetHeroID: () => this.options.playerId, GetHeroProperty: (key: string) => key === 'pid' ? this.options.playerId : undefined }),
            a3pk_GameManager: noopManager, a3pk_ConfirmManager: noopManager, a3pk_SoundManager: noopManager,
            a3pk_WeChatManager: noopManager, a3pk_SysDataManager: () => ({ GetTableDict: () => ({ A3PKRoom_WaitTick: 30_000 }) }),
            LocalDataManager: () => ({ GetConfigProperty: () => 0 }),
            a3pk_SceneManager: () => ({ LoadScene: () => this.options.onRoomReady?.(room) }),
            a3pkClient: { OnEvent: (event: string, body: unknown) => this.options.onEvent?.(event, body), ExitGame: () => this.options.onExit?.('room-not-found'), RegEvent: () => undefined },
            A3PKRoomPosMgr: () => roomPosition, A3PKRoomSet: () => roomSet, A3PKRoom: () => room,
            LogicA3PKGame: () => logic,
        };
        roomPosition = new LegacyA3pkRoomPositionManager(context);
        roomSet = new LegacyA3pkRoomSet(context);
        room = new LegacyA3pkRoom(context);
        logic = new LegacyA3pkGameLogic(context);
        this.roomPosition = roomPosition; this.roomSet = roomSet; this.room = room; this.logic = logic;
        this.manager = new LegacyA3pkRoomManager(context);
        this.disposers.push(this.client.onReconnect(() => this.restoreAfterReconnect()));
    }
    public async enterRoom(roomId: number): Promise<LegacyA3pkRoom> {
        if (!Number.isSafeInteger(roomId) || roomId <= 0) throw new Error('A3PK 房间ID无效');
        await this.client.request('a3pk.CA3PKGetRoomInfo', { roomID: roomId });
        return this.room;
    }
    public request<T = unknown>(event: string, payload?: unknown): Promise<T> { return this.client.request<T>(event, payload); }
    public getRoom(): LegacyA3pkRoom { return this.room; }
    public getRoomManager(): LegacyA3pkRoomManager { return this.manager; }
    public getRoomSet(): LegacyA3pkRoomSet { return this.roomSet; }
    public getRoomPositionManager(): LegacyA3pkRoomPositionManager { return this.roomPosition; }
    public getGameLogic(): LegacyA3pkGameLogic { return this.logic; }
    public destroy(): void { for (const dispose of this.disposers.splice(0)) dispose(); this.network.UnAllRegNetPack(); this.manager.OnReload(); }
    private async restoreAfterReconnect(): Promise<void> {
        const roomId = Number(this.manager.GetEnterRoomID?.() ?? 0); if (!roomId) return;
        try { await this.client.request('a3pk.CA3PKGetRoomInfo', { roomID: roomId }); this.options.onEvent?.('A3PK_Reconnected', { roomID: roomId }); this.options.onRoomReady?.(this.room); }
        catch (error: unknown) { this.options.onMessage?.(error instanceof Error ? error.message : '恢复 A3PK 牌局失败'); this.options.onExit?.('reconnect-room-failed'); }
    }
}
