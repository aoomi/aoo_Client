import { EventTarget } from 'cc';

export enum ScjymjRoomState {
    Init = 0,
    Playing = 1,
    End = 2,
}

export interface ScjymjDissolveState {
    endSec?: number;
    posAgreeList?: number[];
}

export interface ScjymjPlayRoomPort {
    GetRoomProperty<T = unknown>(key: string): T;
    GetRoomConfigByProperty<T = unknown>(key: string): T;
    GetRoomDataInfo(): { posList?: Array<{ trusteeship?: boolean }> };
    GetRoomPosMgr(): {
        GetClientPos(): number;
        GetRoomAllPlayerInfo(): Record<string, unknown>;
    };
    GetClientPlayerSetPos(): unknown;
}

export interface ScjymjRoomHeader {
    roomId: string;
    currentSet: number;
    totalSet: number;
    playerCount: number;
}

export interface ScjymjGetCardPacket {
    pos: number;
    isNormal: boolean;
    isBaiDa?: boolean;
}

export const ScjymjPlayEvents = {
    RoomInit: 'room-init',
    RoomPlaying: 'room-playing',
    RoomEnd: 'room-end',
    RoomHeaderChanged: 'room-header-changed',
    DissolveChanged: 'dissolve-changed',
    TrusteeshipChanged: 'trusteeship-changed',
    SetStarted: 'set-started',
    CardDrawn: 'card-drawn',
    RemainingCardsChanged: 'remaining-cards-changed',
    Error: 'error',
} as const;

/** Shared, view-independent state machine for the 3D, 2D and XY tables. */
export class ScjymjPlayStateController {
    public events = new EventTarget();
    private room: ScjymjPlayRoomPort | null = null;
    private remainingCards: number[] = [];

    public enter(room: ScjymjPlayRoomPort, remainingCards: number[]): void {
        this.room = room;
        this.remainingCards = [...remainingCards];
        this.emitHeader();

        const state = Number(room.GetRoomProperty('state'));
        if (state === ScjymjRoomState.Init) {
            this.events.emit(ScjymjPlayEvents.RoomInit, room);
        } else if (state === ScjymjRoomState.Playing) {
            this.restorePlayingState(room);
            this.events.emit(ScjymjPlayEvents.RoomPlaying, room);
        } else if (state === ScjymjRoomState.End) {
            this.events.emit(ScjymjPlayEvents.RoomEnd, room);
        } else {
            this.events.emit(ScjymjPlayEvents.Error, new Error(`Unknown SCJYMJ room state: ${state}`));
        }

        this.emitDissolve(room.GetRoomProperty<ScjymjDissolveState | null>('dissolve'));
        this.emitRemainingCards();
    }

    public leave(): void {
        this.room = null;
        this.remainingCards.length = 0;
        this.events = new EventTarget();
    }

    public onSetStart(): void {
        if (!this.room) return;
        this.emitHeader();
        this.events.emit(ScjymjPlayEvents.SetStarted, this.room);
    }

    public onPosGetCard(packet: ScjymjGetCardPacket): void {
        if (!this.room) return;
        if (!this.room.GetClientPlayerSetPos()) {
            this.events.emit(ScjymjPlayEvents.Error, new Error('SCJYMJ client set position is unavailable'));
            return;
        }
        if (this.remainingCards.length === 0) {
            this.events.emit(ScjymjPlayEvents.Error, new Error('SCJYMJ card wall is empty'));
            return;
        }

        if (packet.isNormal) this.remainingCards.shift();
        else this.remainingCards.pop();
        this.events.emit(ScjymjPlayEvents.CardDrawn, packet);
        this.emitRemainingCards();
    }

    public replaceRemainingCards(cards: number[]): void {
        this.remainingCards = [...cards];
        this.emitRemainingCards();
    }

    private restorePlayingState(room: ScjymjPlayRoomPort): void {
        const clientPos = room.GetRoomPosMgr().GetClientPos();
        const positions = room.GetRoomDataInfo().posList ?? [];
        this.events.emit(ScjymjPlayEvents.TrusteeshipChanged, Boolean(positions[clientPos]?.trusteeship));
    }

    private emitHeader(): void {
        if (!this.room) return;
        const players = this.room.GetRoomPosMgr().GetRoomAllPlayerInfo();
        const header: ScjymjRoomHeader = {
            roomId: String(this.room.GetRoomProperty('key') ?? ''),
            currentSet: Number(this.room.GetRoomProperty('setID') ?? 0),
            totalSet: Number(this.room.GetRoomConfigByProperty('setCount') ?? 0),
            playerCount: Object.keys(players).length,
        };
        this.events.emit(ScjymjPlayEvents.RoomHeaderChanged, header);
    }

    private emitDissolve(dissolve: ScjymjDissolveState | null): void {
        if (!dissolve) return;
        if (dissolve.endSec || (dissolve.posAgreeList?.length ?? 0) > 0) {
            this.events.emit(ScjymjPlayEvents.DissolveChanged, dissolve);
        }
    }

    private emitRemainingCards(): void {
        this.events.emit(ScjymjPlayEvents.RemainingCardsChanged, this.remainingCards.length);
    }
}
