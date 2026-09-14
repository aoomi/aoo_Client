import { ProtocolClient } from '../../network/ProtocolClient';
import { LegacyAydssRoom, LegacyAydssRoomManager, LegacyAydssRoomPositionManager, LegacyAydssRoomSet, LegacyAydssSetPosition } from './model';
import { AydssNetworkAdapter } from './network/AydssNetworkAdapter';

export interface AydssRuntimeOptions {
    playerId: number;
    onRoomReady?: (room: LegacyAydssRoom) => void;
    onEvent?: (event: string, body: unknown) => void;
    onMessage?: (message: string) => void;
    onExit?: (reason: string) => void;
}
const shareDefine: Record<string, any> = {
    RoomState_Init: 0, RoomState_Playing: 1, RoomState_End: 2, RoomState_Waiting: 3, RoomState_WaitingEx: 4,
    RoomStateStringDict: { Init: 0, Playing: 1, End: 2, Waiting: 3, WaitingEx: 4 },
    SetState_Init: 0, SetState_Playing: 1, SetState_End: 2, SetState_Waiting: 3,
    SetStateStringDict: { Init: 0, Playing: 1, End: 2, Waiting: 3 }, AYDSSRoomJoinCount: 4, RoomJoinCount: 4, isCoinRoom: false,
};
const pokerCard = {
    GetCardValue: (card: number) => Math.abs(Number(card)) % 100,
    GetCardColor: (card: number) => Math.floor(Math.abs(Number(card)) / 100),
};

/** Lifecycle owner for the migrated AYDSS 2.2.2 room state and long-card protocol. */
export class AydssRuntime {
    private readonly network: AydssNetworkAdapter;
    private readonly roomPosition: LegacyAydssRoomPositionManager;
    private readonly roomSet: LegacyAydssRoomSet;
    private readonly room: LegacyAydssRoom;
    private readonly manager: LegacyAydssRoomManager;
    private readonly disposers: Array<() => void> = [];
    public constructor(private readonly client: ProtocolClient, private readonly options: AydssRuntimeOptions) {
        this.network = new AydssNetworkAdapter(client);
        let roomPosition!: LegacyAydssRoomPositionManager; let roomSet!: LegacyAydssRoomSet; let room!: LegacyAydssRoom; let manager!: LegacyAydssRoomManager;
        const noop = () => ({}); const table = (key: string) => key === 'PropertyInfo' ? {} : key === 'AYDSSRoom_WaitTick' ? 30_000 : {};
        const context: Record<string, any> = {
            subGameName: 'aydss', aydss_ComTool: noop, aydss_ShareDefine: () => shareDefine, aydss_NetManager: () => this.network,
            aydss_FormManager: () => ({ ShowForm: () => this.options.onRoomReady?.(room), CloseForm: () => undefined, GetFormComponentByFormName: () => null }),
            aydss_SysNotifyManager: () => ({ ShowSysMsg: (message: string) => this.options.onMessage?.(message) }),
            aydss_HeroManager: () => ({ GetHeroID: () => this.options.playerId, GetHeroProperty: (key: string) => key === 'pid' ? this.options.playerId : undefined }),
            aydss_GameManager: noop, aydss_ConfirmManager: noop, aydss_SoundManager: noop, aydss_WeChatManager: noop,
            aydss_SysDataManager: () => ({ GetTableDict: table }), LocalDataManager: () => ({ GetConfigProperty: () => 0 }),
            aydss_SceneManager: () => ({ LoadScene: () => this.options.onRoomReady?.(room) }),
            aydssClient: { OnEvent: (event: string, body: unknown) => this.options.onEvent?.(event, body), ExitGame: () => this.options.onExit?.('room-not-found'), RegEvent: () => undefined },
            AYDSSRoomPosMgr: () => roomPosition, AYDSSRoomSet: () => roomSet, AYDSSRoom: () => room, AYDSSRoomMgr: () => manager,
            AYDSSSetPos: () => new LegacyAydssSetPosition(context), AYDSSPokerCard: () => pokerCard,
        };
        roomPosition = new LegacyAydssRoomPositionManager(context); roomSet = new LegacyAydssRoomSet(context); room = new LegacyAydssRoom(context);
        this.roomPosition = roomPosition; this.roomSet = roomSet; this.room = room; manager = new LegacyAydssRoomManager(context); this.manager = manager;
        this.disposers.push(this.client.onReconnect(() => this.restoreAfterReconnect()));
    }
    public async enterRoom(roomId: number): Promise<LegacyAydssRoom> {
        if (!Number.isSafeInteger(roomId) || roomId <= 0) throw new Error('AYDSS 房间ID无效');
        await this.network.requestV2('aydss.CAYDSSGetRoomInfo', { roomID: roomId }); return this.room;
    }
    public request<T = unknown>(event: string, payload?: unknown): Promise<T> { return this.network.requestV2<T>(event, payload); }
    public getRoom(): LegacyAydssRoom { return this.room; }
    public getRoomManager(): LegacyAydssRoomManager { return this.manager; }
    public getRoomSet(): LegacyAydssRoomSet { return this.roomSet; }
    public getRoomPositionManager(): LegacyAydssRoomPositionManager { return this.roomPosition; }
    public destroy(): void { for (const dispose of this.disposers.splice(0)) dispose(); this.network.UnAllRegNetPack(); this.manager.OnReload(); }
    private async restoreAfterReconnect(): Promise<void> {
        const roomId = Number(this.manager.GetEnterRoomID?.() ?? 0); if (!roomId) return;
        try { await this.network.requestV2('aydss.CAYDSSGetRoomInfo', { roomID: roomId }); this.options.onEvent?.('AYDSS_Reconnected', { roomID: roomId }); this.options.onRoomReady?.(this.room); }
        catch (error: unknown) { this.options.onMessage?.(error instanceof Error ? error.message : '恢复 AYDSS 牌局失败'); this.options.onExit?.('reconnect-room-failed'); }
    }
}
