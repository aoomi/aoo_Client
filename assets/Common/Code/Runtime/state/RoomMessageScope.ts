export interface ScopedRoomMessage {
    readonly roomId: number;
    readonly playVersion: string;
    readonly connectionGeneration: number;
}

/** Rejects callbacks from an old socket, room or play-version scope before any state/UI side effect. */
export class RoomMessageScope {
    private active = true;

    public constructor(
        public readonly roomId: number,
        public readonly playVersion: string,
        public readonly connectionGeneration: number,
    ) {
        if (!Number.isSafeInteger(roomId) || roomId <= 0) throw new Error('invalid roomId');
        if (!playVersion) throw new Error('missing playVersion');
        if (!Number.isSafeInteger(connectionGeneration) || connectionGeneration < 0) throw new Error('invalid generation');
    }

    public accepts(message: ScopedRoomMessage): boolean {
        return this.active && message.roomId === this.roomId && message.playVersion === this.playVersion
            && message.connectionGeneration === this.connectionGeneration;
    }

    public close(): void {
        this.active = false;
    }
}
