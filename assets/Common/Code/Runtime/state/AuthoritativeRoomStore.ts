export interface AuthoritativeRoomState {
    readonly roomId: number;
    readonly playVersion: string;
    readonly eventSeq: number;
    readonly stateVersion: number;
}

export type RoomStateListener<S extends AuthoritativeRoomState> = (state: Readonly<S> | undefined) => void;

/** Single mutation boundary for one player's server-projected room state. */
export class AuthoritativeRoomStore<S extends AuthoritativeRoomState> {
    private current?: Readonly<S>;
    private readonly listeners = new Set<RoomStateListener<S>>();

    public snapshot(): Readonly<S> | undefined {
        return this.current;
    }

    public replaceSnapshot(snapshot: S): void {
        this.validateIdentity(snapshot);
        if (this.current?.roomId === snapshot.roomId && snapshot.eventSeq < this.current.eventSeq) {
            throw new Error('stale room snapshot');
        }
        if (this.current?.roomId === snapshot.roomId && snapshot.stateVersion < this.current.stateVersion) {
            throw new Error('stale room state version');
        }
        this.current = Object.freeze({ ...snapshot });
        this.publish();
    }

    public applyEvent(roomId: number, eventSeq: number, reducer: (state: Readonly<S>) => S): boolean {
        const current = this.current;
        if (!current || current.roomId !== roomId || eventSeq <= current.eventSeq) return false;
        if (eventSeq !== current.eventSeq + 1) throw new Error('room event sequence gap');
        const next = reducer(current);
        this.validateIdentity(next);
        if (next.roomId !== roomId || next.playVersion !== current.playVersion || next.eventSeq !== eventSeq
            || next.stateVersion < current.stateVersion) {
            throw new Error('room reducer changed immutable identity or event sequence');
        }
        this.current = Object.freeze({ ...next });
        this.publish();
        return true;
    }

    /** Applies a perspective-filtered recovery event; hidden events may create global sequence gaps. */
    public applyRecoveryEvent(roomId: number, eventSeq: number, reducer: (state: Readonly<S>) => S): boolean {
        const current = this.current;
        if (!current || current.roomId !== roomId || eventSeq <= current.eventSeq) return false;
        const next = reducer(current);
        this.validateIdentity(next);
        if (next.roomId !== roomId || next.playVersion !== current.playVersion || next.eventSeq !== eventSeq
            || next.stateVersion < current.stateVersion) {
            throw new Error('room recovery reducer changed immutable identity, sequence or version');
        }
        this.current = Object.freeze({ ...next });
        this.publish();
        return true;
    }

    public clear(roomId?: number): void {
        if (roomId !== undefined && this.current?.roomId !== roomId) return;
        this.current = undefined;
        this.publish();
    }

    public subscribe(listener: RoomStateListener<S>): () => void {
        this.listeners.add(listener);
        listener(this.current);
        return () => this.listeners.delete(listener);
    }

    private validateIdentity(state: AuthoritativeRoomState): void {
        if (!Number.isSafeInteger(state.roomId) || state.roomId <= 0) throw new Error('invalid roomId');
        if (!state.playVersion) throw new Error('missing playVersion');
        if (!Number.isSafeInteger(state.eventSeq) || state.eventSeq < 0) throw new Error('invalid eventSeq');
        if (!Number.isSafeInteger(state.stateVersion) || state.stateVersion < 0) throw new Error('invalid stateVersion');
    }

    private publish(): void {
        for (const listener of this.listeners) listener(this.current);
    }
}
