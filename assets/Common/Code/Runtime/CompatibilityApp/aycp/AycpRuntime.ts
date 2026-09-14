import { ProtocolClient } from '../../network/ProtocolClient';
import { LegacyAycpRoom, LegacyAycpRoomManager, LegacyAycpRoomPositionManager, LegacyAycpRoomSet, LegacyAycpSetPosition } from './model';
import { AycpNetworkAdapter } from './network/AycpNetworkAdapter';

export interface AycpRuntimeOptions {
    playerId: number;
    onRoomReady?: (room: LegacyAycpRoom) => void;
    onEvent?: (event: string, body: unknown) => void;
    onMessage?: (message: string) => void;
    onExit?: (reason: string) => void;
}
const shareDefine: Record<string, any> = {
    RoomState_Init: 0, RoomState_Playing: 1, RoomState_End: 2, RoomState_Waiting: 3, RoomState_WaitingEx: 4,
    RoomStateStringDict: { Init: 0, Playing: 1, End: 2, Waiting: 3, WaitingEx: 4 },
    SetState_Init: 0, SetState_Playing: 1, SetState_End: 2, SetState_Waiting: 3,
    SetStateStringDict: { Init: 0, Playing: 1, End: 2, Waiting: 3 }, AYCPRoomJoinCount: 4, RoomJoinCount: 4, isCoinRoom: false,
};
const pokerCard = {
    GetCardValue: (card: number) => Math.abs(Number(card)) % 100,
    GetCardColor: (card: number) => Math.floor(Math.abs(Number(card)) / 100),
};

/** Lifecycle owner for the migrated AYCP 2.2.2 room state and long-card protocol. */
export class AycpRuntime {
    private readonly network: AycpNetworkAdapter;
    private readonly roomPosition: LegacyAycpRoomPositionManager;
    private readonly roomSet: LegacyAycpRoomSet;
    private readonly room: LegacyAycpRoom;
    private readonly manager: LegacyAycpRoomManager;
    private readonly disposers: Array<() => void> = [];
    public constructor(private readonly client: ProtocolClient, private readonly options: AycpRuntimeOptions) {
        this.network = new AycpNetworkAdapter(client);
        let roomPosition!: LegacyAycpRoomPositionManager; let roomSet!: LegacyAycpRoomSet; let room!: LegacyAycpRoom; let manager!: LegacyAycpRoomManager;
        const noop = () => ({}); const table = (key: string) => key === 'PropertyInfo' ? {} : key === 'AYCPRoom_WaitTick' ? 30_000 : {};
        const context: Record<string, any> = {
            subGameName: 'aycp', aycp_ComTool: noop, aycp_ShareDefine: () => shareDefine, aycp_NetManager: () => this.network,
            aycp_FormManager: () => ({ ShowForm: () => this.options.onRoomReady?.(room), CloseForm: () => undefined, GetFormComponentByFormName: () => null }),
            aycp_SysNotifyManager: () => ({ ShowSysMsg: (message: string) => this.options.onMessage?.(message) }),
            aycp_HeroManager: () => ({ GetHeroID: () => this.options.playerId, GetHeroProperty: (key: string) => key === 'pid' ? this.options.playerId : undefined }),
            aycp_GameManager: noop, aycp_ConfirmManager: noop, aycp_SoundManager: noop, aycp_WeChatManager: noop,
            aycp_SysDataManager: () => ({ GetTableDict: table }), LocalDataManager: () => ({ GetConfigProperty: () => 0 }),
            aycp_SceneManager: () => ({ LoadScene: () => this.options.onRoomReady?.(room) }),
            aycpClient: { OnEvent: (event: string, body: unknown) => this.options.onEvent?.(event, body), ExitGame: () => this.options.onExit?.('room-not-found'), RegEvent: () => undefined },
            AYCPRoomPosMgr: () => roomPosition, AYCPRoomSet: () => roomSet, AYCPRoom: () => room, AYCPRoomMgr: () => manager,
            AYCPSetPos: () => new LegacyAycpSetPosition(context), AYCPPokerCard: () => pokerCard,
        };
        roomPosition = new LegacyAycpRoomPositionManager(context); roomSet = new LegacyAycpRoomSet(context); room = new LegacyAycpRoom(context);
        this.roomPosition = roomPosition; this.roomSet = roomSet; this.room = room; manager = new LegacyAycpRoomManager(context); this.manager = manager;
        this.disposers.push(this.client.onReconnect(() => this.restoreAfterReconnect()));
    }
    public async enterRoom(roomId: number): Promise<LegacyAycpRoom> {
        if (!Number.isSafeInteger(roomId) || roomId <= 0) throw new Error('AYCP 房间ID无效');
        await this.client.request('aycp.CAYCPGetRoomInfo', { roomID: roomId }); return this.room;
    }
    public request<T = unknown>(event: string, payload?: unknown): Promise<T> { return this.client.request<T>(event, payload); }
    public getRoom(): LegacyAycpRoom { return this.room; }
    public getRoomManager(): LegacyAycpRoomManager { return this.manager; }
    public getRoomSet(): LegacyAycpRoomSet { return this.roomSet; }
    public getRoomPositionManager(): LegacyAycpRoomPositionManager { return this.roomPosition; }
    public destroy(): void { for (const dispose of this.disposers.splice(0)) dispose(); this.network.UnAllRegNetPack(); this.manager.OnReload(); }
    private async restoreAfterReconnect(): Promise<void> {
        const roomId = Number(this.manager.GetEnterRoomID?.() ?? 0); if (!roomId) return;
        try { await this.client.request('aycp.CAYCPGetRoomInfo', { roomID: roomId }); this.options.onEvent?.('AYCP_Reconnected', { roomID: roomId }); this.options.onRoomReady?.(this.room); }
        catch (error: unknown) { this.options.onMessage?.(error instanceof Error ? error.message : '恢复 AYCP 牌局失败'); this.options.onExit?.('reconnect-room-failed'); }
    }
}
