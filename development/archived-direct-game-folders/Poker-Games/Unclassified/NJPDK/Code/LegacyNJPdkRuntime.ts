import { LegacyWebSocketClient } from '../../../../../../core/runtime/network/LegacyWebSocketClient';
import {
    LegacyNJPdkRoom,
    LegacyNJPdkRoomManager,
    LegacyNJPdkRoomPosManager,
    LegacyNJPdkRoomSet,
} from './model';

export interface LegacyNJPdkRuntimeOptions {
    playerId: number;
    onRoomReady?: (room: LegacyNJPdkRoom) => void;
    onEvent?: (event: string, body: unknown) => void;
    onMessage?: (message: string) => void;
    onExit?: (reason: string) => void;
    isActualGameScene?: () => boolean;
}

interface LegacyNetManagerFacade {
    RegNetPack(event: string, callback: (body: unknown) => void, target: unknown): void;
    SendPack(
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

/** Connects the mechanically migrated 2.4.8 room layer to the 3.8 network client. */
export class LegacyNJPdkRuntime {
    private readonly disposers: Array<() => void> = [];
    private readonly roomPos: LegacyNJPdkRoomPosManager;
    private readonly roomSet: LegacyNJPdkRoomSet;
    private readonly room: LegacyNJPdkRoom;
    private readonly manager: LegacyNJPdkRoomManager;
    private sceneType = '';

    public constructor(
        private readonly client: LegacyWebSocketClient,
        private readonly options: LegacyNJPdkRuntimeOptions,
    ) {
        let roomPos!: LegacyNJPdkRoomPosManager;
        let roomSet!: LegacyNJPdkRoomSet;
        let room!: LegacyNJPdkRoom;
        const netManager: LegacyNetManagerFacade = {
            RegNetPack: (event, callback, target) => {
                this.disposers.push(this.client.on(event, (body) => callback.call(target, body)));
            },
            SendPack: (event, body, success, failure) => {
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
                if (name === 'njpdkScene') this.options.onRoomReady?.(room);
            },
        };
        const formManager = {
            ShowForm: (name: string) => {
                if (name === 'game/NJPDK/UINJPDK_Play') this.options.onRoomReady?.(room);
            },
            CloseForm: () => undefined,
        };
        const runtimeClient = {
            OnEvent: (event: string, body: unknown) => this.options.onEvent?.(event, body),
            ExitGame: () => this.options.onExit?.('room-not-found'),
        };
        const context: Record<string, unknown> = {
            subGameName: 'njpdk',
            __isActualGameScene: () => this.options.isActualGameScene?.() ?? false,
            njpdk_ComTool: () => ({}),
            njpdk_ShareDefine: () => shareDefine,
            njpdk_NetManager: () => netManager,
            njpdk_SysNotifyManager: () => ({
                ShowSysMsg: (message: string) => this.options.onMessage?.(message),
            }),
            njpdk_HeroManager: () => heroManager,
            njpdk_WeChatManager: () => ({
                InitHeroHeadImageByDict: () => undefined,
                InitHeroHeadImage: () => undefined,
            }),
            njpdk_SysDataManager: () => ({ GetTableDict: () => ({}) }),
            njpdk_SceneManager: () => sceneManager,
            njpdk_FormManager: () => formManager,
            njpdkClient: runtimeClient,
            NJPDKRoomPosMgr: () => roomPos,
            NJPDKRoomSet: () => roomSet,
            NJPDKRoom: () => room,
        };
        roomPos = new LegacyNJPdkRoomPosManager(context);
        roomSet = new LegacyNJPdkRoomSet(context);
        room = new LegacyNJPdkRoom(context);
        this.roomPos = roomPos;
        this.roomSet = roomSet;
        this.room = room;
        this.manager = new LegacyNJPdkRoomManager(context);
        this.registerCommonRoomEvents();
        this.disposers.push(this.client.onReconnect(() => { void this.restoreRoomAfterReconnect(); }));
    }

    public async enterRoom(roomId: number): Promise<LegacyNJPdkRoom> {
        if (!Number.isSafeInteger(roomId) || roomId <= 0) throw new Error('NJPDK 房间ID无效');
        await this.client.request<unknown>('njpdk.CNJPDKGetRoomInfo', { roomID: roomId });
        if (Number(this.manager.GetEnterRoomID()) !== roomId) {
            throw new Error('NJPDK 完整房间信息未初始化');
        }
        return this.room;
    }

    public getRoom(): LegacyNJPdkRoom {
        return this.room;
    }

    public getRoomManager(): LegacyNJPdkRoomManager {
        return this.manager;
    }

    public getRoomPosManager(): LegacyNJPdkRoomPosManager {
        return this.roomPos;
    }

    public getRoomSet(): LegacyNJPdkRoomSet {
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
        listen('SNJPDK_PosContinueGame', (body) => {
            this.room.OnPosContinueGame(body.pos);
            emit('NJPDK_PosContinueGame', body);
        });
        listen('SNJPDK_PosReadyChg', (body) => {
            if (this.roomPos.OnPosReadyChg(body.pos, body.isReady)) emit('NJPDK_PosReadyChg', body);
        });
        listen('SNJPDK_PosUpdate', (body) => {
            if (this.roomPos.OnPosUpdate(body.pos, body.posInfo)) emit('NJPDK_PosUpdate', body);
        });
        listen('SNJPDK_PosLeave', (body) => {
            const clientPos = this.roomPos.GetClientPos();
            this.room.OnPosLeave(body.pos);
            if (Number(body.ownerID) > 0) this.room.UpdateOwnerID(body.ownerID);
            emit('NJPDK_PosLeave', body);
            if (Number(body.pos) === Number(clientPos) && !body.beKick) this.options.onExit?.('user-exit');
        });
        listen('SNJPDK_Dissolve', (body) => emit('NJPDK_DissolveRoom', body));
        listen('SNJPDK_StartVoteDissolve', (body) => {
            emit('NJPDK_StartVoteDissolve', this.room.OnStartVoteDissolve(body.createPos, body.endSec));
        });
        listen('SNJPDK_PosDealVote', (body) => emit('PosDealVote', this.room.OnPosDealVote(body.pos, body.agreeDissolve)));
        listen('SNJPDK_LostConnect', (body) => {
            const players = this.roomPos.GetRoomAllPlayerInfo();
            for (const key of Object.keys(players)) {
                if (Number(players[key]?.pid) === Number(body.pid)) {
                    this.roomPos.SetPlayerOfflineState(key, body.isLostConnect, body.isShowLeave);
                    break;
                }
            }
            emit('PlayerOffline', body);
        });
        listen('SNJPDK_Trusteeship', (body) => {
            const players = this.roomPos.GetRoomAllPlayerInfo();
            const player = players[body.pos];
            if (player && (!body.pid || Number(player.pid) === Number(body.pid))) player.trusteeship = Boolean(body.trusteeship);
            emit('SPlayer_Trusteeship', body);
        });
        listen('SNJPDK_SendGift', (body) => emit('GameGift', body));
    }

    private async restoreRoomAfterReconnect(): Promise<void> {
        const roomId = Number(this.manager.GetEnterRoomID());
        if (!Number.isSafeInteger(roomId) || roomId <= 0) return;
        try {
            await this.client.request('njpdk.CNJPDKGetRoomInfo', { roomID: roomId });
            if (Number(this.manager.GetEnterRoomID()) !== roomId) throw new Error('重连房间信息不一致');
            this.options.onEvent?.('NJPDK_Reconnected', { roomID: roomId });
            this.options.onRoomReady?.(this.room);
        } catch (error: unknown) {
            this.options.onMessage?.(error instanceof Error ? error.message : '恢复牌局失败');
            this.options.onExit?.('reconnect-room-failed');
        }
    }
}
