import { ProtocolClient } from '../../network/ProtocolClient';
import {
    LegacyAypdkRoom,
    LegacyAypdkRoomManager,
    LegacyAypdkRoomPositionManager,
    LegacyAypdkRoomSet,
} from './model';

export interface AypdkRuntimeOptions {
    playerId: number;
    onRoomReady?: (room: LegacyAypdkRoom) => void;
    onEvent?: (event: string, body: unknown) => void;
    onMessage?: (message: string) => void;
    onExit?: (reason: string) => void;
    isActualGameScene?: () => boolean;
}

interface LegacyNetManagerFacade {
    RegNetPack(event: string, callback: (body: unknown) => void, target: unknown): void;
    requestV2(
        event: string,
        body: unknown,
        success?: (body: unknown) => void,
        failure?: (error: unknown) => void,
    ): void;
}

const shareDefine = {
    RoomState_Init: 0,
    RoomState_Playing: 1,
    RoomState_End: 2,
    RoomState_Waiting: 3,
    RoomState_WaitingEx: 4,
    RoomStateStringDict: { Init: 0, Playing: 1, End: 2, Waiting: 3, WaitingEx: 4 },
    SetState_Init: 0,
    SetState_Playing: 1,
    SetState_End: 2,
    SetState_Waiting: 3,
    SetState_WaitingEx: 4,
    SetStateStringDict: { Init: 0, Playing: 1, End: 2, Waiting: 3, WaitingEx: 4 },
    isCoinRoom: false,
};

/** Connects the mechanically migrated 2.2.2 room layer to the 3.8 network client. */
export class AypdkRuntime {
    private readonly disposers: Array<() => void> = [];
    private readonly roomPos: LegacyAypdkRoomPositionManager;
    private readonly roomSet: LegacyAypdkRoomSet;
    private readonly room: LegacyAypdkRoom;
    private readonly manager: LegacyAypdkRoomManager;
    private sceneType = '';

    public constructor(
        private readonly client: ProtocolClient,
        private readonly options: AypdkRuntimeOptions,
    ) {
        let roomPos!: LegacyAypdkRoomPositionManager;
        let roomSet!: LegacyAypdkRoomSet;
        let room!: LegacyAypdkRoom;
        const netManager: LegacyNetManagerFacade = {
            RegNetPack: (event, callback, target) => {
                this.disposers.push(this.client.on(event, (body) => callback.call(target, body)));
            },
            requestV2: (event, body, success, failure) => {
                void this.client.request<unknown>(event, body).then(
                    (packet) => success?.(packet),
                    (error) => failure?.(error),
                );
            },
        };
        const heroManager = {
            GetHeroID: () => this.options.playerId,
            GetHeroProperty: (property: string) => property === 'pid' ? this.options.playerId : undefined,
        };
        const sceneManager = {
            GetSceneType: () => this.sceneType,
            LoadScene: (name: string) => {
                this.sceneType = name;
                if (name === 'aypdkScene') this.options.onRoomReady?.(room);
            },
        };
        const formManager = {
            ShowForm: (name: string) => {
                if (name === 'game/AYPDK/UIAYPDK_Play') this.options.onRoomReady?.(room);
            },
            CloseForm: () => undefined,
        };
        const runtimeClient = {
            OnEvent: (event: string, body: unknown) => this.options.onEvent?.(event, body),
            ExitGame: () => this.options.onExit?.('room-not-found'),
        };
        const context: Record<string, unknown> = {
            subGameName: 'aypdk',
            __isActualGameScene: () => this.options.isActualGameScene?.() ?? false,
            aypdk_ComTool: () => ({}),
            aypdk_ShareDefine: () => shareDefine,
            aypdk_NetManager: () => netManager,
            aypdk_SysNotifyManager: () => ({
                ShowSysMsg: (message: string) => this.options.onMessage?.(message),
            }),
            aypdk_HeroManager: () => heroManager,
            aypdk_WeChatManager: () => ({
                InitHeroHeadImageByDict: () => undefined,
                InitHeroHeadImage: () => undefined,
            }),
            aypdk_SysDataManager: () => ({ GetTableDict: () => ({}) }),
            aypdk_SceneManager: () => sceneManager,
            aypdk_FormManager: () => formManager,
            aypdkClient: runtimeClient,
            AYPDKRoomPosMgr: () => roomPos,
            AYPDKRoomSet: () => roomSet,
            AYPDKRoom: () => room,
        };
        roomPos = new LegacyAypdkRoomPositionManager(context);
        roomSet = new LegacyAypdkRoomSet(context);
        room = new LegacyAypdkRoom(context);
        this.roomPos = roomPos;
        this.roomSet = roomSet;
        this.room = room;
        this.manager = new LegacyAypdkRoomManager(context);
        this.registerCommonRoomEvents();
        this.disposers.push(this.client.onReconnect(() => this.restoreRoomAfterReconnect()));
    }

    public async enterRoom(roomId: number): Promise<LegacyAypdkRoom> {
        if (!Number.isSafeInteger(roomId) || roomId <= 0) throw new Error('AYPDK 房间ID无效');
        await this.client.request<unknown>('aypdk.CAYPDKGetRoomInfo', { roomID: roomId });
        if (Number(this.manager.GetEnterRoomID()) !== roomId) {
            throw new Error('AYPDK 完整房间信息未初始化');
        }
        return this.room;
    }

    public getRoom(): LegacyAypdkRoom {
        return this.room;
    }

    public getRoomManager(): LegacyAypdkRoomManager {
        return this.manager;
    }

    public getRoomPosManager(): LegacyAypdkRoomPositionManager {
        return this.roomPos;
    }

    public getRoomSet(): LegacyAypdkRoomSet {
        return this.roomSet;
    }

    public request<T = unknown>(event: string, body: unknown): Promise<T> {
        return this.client.request<T>(event, body);
    }

    public on(event: string, listener: (body: unknown) => void): () => void {
        return this.client.on(event, listener);
    }

    public destroy(): void {
        for (const dispose of this.disposers.splice(0)) dispose();
        this.manager.OnReload();
    }

    private registerCommonRoomEvents(): void {
        const emit = (event: string, body: unknown) => this.options.onEvent?.(event, body);
        const listen = (packet: string, handler: (body: any) => void) => {
            this.disposers.push(this.client.on(packet, handler));
        };
        listen('SAYPDK_PosContinueGame', (body) => {
            this.room.OnPosContinueGame(body.pos);
            emit('AYPDK_PosContinueGame', body);
        });
        listen('SAYPDK_PosReadyChg', (body) => {
            if (this.roomPos.OnPosReadyChg(body.pos, body.isReady)) emit('AYPDK_PosReadyChg', body);
        });
        listen('SAYPDK_PosUpdate', (body) => {
            if (this.roomPos.OnPosUpdate(body.pos, body.posInfo)) emit('AYPDK_PosUpdate', body);
        });
        listen('SAYPDK_PosLeave', (body) => {
            const clientPos = this.roomPos.GetClientPos();
            this.room.OnPosLeave(body.pos);
            if (Number(body.ownerID) > 0) this.room.UpdateOwnerID(body.ownerID);
            emit('AYPDK_PosLeave', body);
            if (Number(body.pos) === Number(clientPos) && !body.beKick) this.options.onExit?.('user-exit');
        });
        listen('SAYPDK_Dissolve', (body) => emit('AYPDK_DissolveRoom', body));
        listen('SAYPDK_StartVoteDissolve', (body) => {
            emit('AYPDK_StartVoteDissolve', this.room.OnStartVoteDissolve(body.createPos, body.endSec));
        });
        listen('SAYPDK_PosDealVote', (body) => emit('PosDealVote', this.room.OnPosDealVote(body.pos, body.agreeDissolve)));
        listen('SAYPDK_LostConnect', (body) => {
            const players = this.roomPos.GetRoomAllPlayerInfo();
            for (const key of Object.keys(players)) {
                if (Number(players[key]?.pid) === Number(body.pid)) {
                    this.roomPos.SetPlayerOfflineState(key, body.isLostConnect, body.isShowLeave);
                    break;
                }
            }
            emit('PlayerOffline', body);
        });
        listen('SAYPDK_Trusteeship', (body) => {
            const players = this.roomPos.GetRoomAllPlayerInfo();
            const player = players[body.pos];
            if (player && (!body.pid || Number(player.pid) === Number(body.pid))) player.trusteeship = Boolean(body.trusteeship);
            emit('SPlayer_Trusteeship', body);
        });
        listen('SAYPDK_SendGift', (body) => emit('GameGift', body));
    }

    private async restoreRoomAfterReconnect(): Promise<void> {
        const roomId = Number(this.manager.GetEnterRoomID());
        if (!Number.isSafeInteger(roomId) || roomId <= 0) return;
        try {
            await this.client.request('aypdk.CAYPDKGetRoomInfo', { roomID: roomId });
            if (Number(this.manager.GetEnterRoomID()) !== roomId) throw new Error('重连房间信息不一致');
            this.options.onEvent?.('AYPDK_Reconnected', { roomID: roomId });
            this.options.onRoomReady?.(this.room);
        } catch (error: unknown) {
            this.options.onMessage?.(error instanceof Error ? error.message : '恢复牌局失败');
            this.options.onExit?.('reconnect-room-failed');
        }
    }
}
