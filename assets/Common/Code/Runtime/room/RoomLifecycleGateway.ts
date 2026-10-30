export interface RoomLifecycleHandoff {
    readonly roomId: number;
}

export interface RoomHistoryPage {
    readonly items: unknown[];
    readonly nextBeforeRoomId: number;
    readonly hasMore: boolean;
    readonly totalCount?: number;
    readonly bigWinnerCount?: number;
}

/** Common Club/Lobby room boundary. Lobby is canonical; Hall remains a compatibility implementation name. */
export interface RoomLifecycleGateway {
    activeRoom(): Promise<RoomLifecycleHandoff | null>;
    roomDetails(roomId: number): Promise<Record<string, unknown>>;
    leave(roomId: number): Promise<unknown>;
    history(beforeRoomId?: number, limit?: number, startAt?: number, endAt?: number,
        clubId?: number): Promise<RoomHistoryPage>;
}

/** Canonical internal type name; protocol and compatibility callers may use RoomLifecycleGateway. */
export type LobbyRoomLifecycleGateway = RoomLifecycleGateway;
