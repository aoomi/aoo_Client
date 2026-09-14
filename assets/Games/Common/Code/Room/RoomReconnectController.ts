import { ProtocolClient } from '../../../../Common/Code/Runtime/network/ProtocolClient';
import {
    AuthoritativeRoomState, AuthoritativeRoomStore,
} from '../../../../Common/Code/Runtime/state/AuthoritativeRoomStore';

export interface RoomRecoveryEvent {
    readonly sequence: number;
    readonly messageId: string;
    readonly payload: unknown;
}

export interface RoomReconnectResponse<S> {
    readonly viewerSnapshot: S;
    readonly events: ReadonlyArray<RoomRecoveryEvent>;
    readonly serverSeq: number;
    readonly stateVersion: number;
    readonly playVersion: string;
    readonly hasMore: boolean;
}

export interface RoomReconnectView<S> {
    recovering(): void;
    recovered(state: Readonly<S>): void;
    recoveryFailed(error: Error): void;
}

export type RoomRecoveryReducer<S> = (state: Readonly<S>, event: RoomRecoveryEvent) => S;

/** The sole production recovery controller for player and observer room views. */
export class RoomReconnectController<S extends AuthoritativeRoomState> {
    private recoveringPromise: Promise<Readonly<S>> | null = null;

    public constructor(
        private readonly client: ProtocolClient,
        private readonly store: AuthoritativeRoomStore<S>,
        private readonly view: RoomReconnectView<S>,
        private readonly reduce: RoomRecoveryReducer<S>,
        private readonly context: {
            readonly roomId: number;
            readonly playVersion: string;
            readonly reconnectToken: string;
        },
    ) { }

    public reconnect(): Promise<Readonly<S>> {
        if (this.recoveringPromise) return this.recoveringPromise;
        this.view.recovering();
        const run = this.recoverPages().then((state) => {
            this.view.recovered(state);
            return state;
        }).catch((reason: unknown) => {
            const error = reason instanceof Error ? reason : new Error(String(reason));
            this.view.recoveryFailed(error);
            throw error;
        }).finally(() => { this.recoveringPromise = null; });
        this.recoveringPromise = run;
        return run;
    }

    private async recoverPages(): Promise<Readonly<S>> {
        const previous = this.store.snapshot();
        let cursor = previous?.roomId === this.context.roomId ? previous.eventSeq : 0;
        let expectedStateVersion = previous?.roomId === this.context.roomId ? previous.stateVersion : 0;
        let initialized = previous?.roomId === this.context.roomId;
        for (let page = 0; page < 100; page += 1) {
            const response = await this.client.request<RoomReconnectResponse<S>>('room.reconnect', {
                action: 'reconnect', roomId: this.context.roomId, lastServerSeq: cursor,
                reconnectToken: this.context.reconnectToken, playVersion: this.context.playVersion,
                expectedStateVersion,
            });
            this.validateResponse(response, cursor);
            if (!initialized) {
                const snapshot = {
                    ...response.viewerSnapshot,
                    roomId: this.context.roomId,
                    playVersion: response.playVersion,
                    eventSeq: response.serverSeq,
                    stateVersion: response.stateVersion,
                } as S;
                this.store.replaceSnapshot(snapshot);
                initialized = true;
                cursor = response.serverSeq;
            } else {
                for (const event of response.events) {
                    this.store.applyRecoveryEvent(this.context.roomId, event.sequence,
                        (state) => this.reduce(state, event));
                    cursor = event.sequence;
                }
            }
            if (response.events.length === 0) cursor = response.serverSeq;
            expectedStateVersion = response.stateVersion;
            if (!response.hasMore) {
                const recovered = this.store.snapshot();
                if (!recovered) throw new Error('ROOM_RECOVERY_EMPTY');
                if (recovered.eventSeq !== response.serverSeq || recovered.stateVersion !== response.stateVersion) {
                    this.store.replaceSnapshot({ ...recovered, eventSeq: response.serverSeq,
                        stateVersion: response.stateVersion } as S);
                }
                return this.store.snapshot() as Readonly<S>;
            }
        }
        throw new Error('ROOM_RECOVERY_PAGE_LIMIT');
    }

    private validateResponse(response: RoomReconnectResponse<S>, cursor: number): void {
        if (response.playVersion !== this.context.playVersion) throw new Error('ROOM_PLAY_VERSION_CONFLICT');
        if (!Number.isSafeInteger(response.stateVersion) || response.stateVersion < 0) {
            throw new Error('ROOM_STATE_VERSION_INVALID');
        }
        if (!Number.isSafeInteger(response.serverSeq) || response.serverSeq < cursor) {
            throw new Error('ROOM_RECOVERY_CURSOR_INVALID');
        }
        let sequence = cursor;
        for (const event of response.events) {
            if (!Number.isSafeInteger(event.sequence) || event.sequence <= sequence) {
                throw new Error('ROOM_RECOVERY_EVENT_GAP');
            }
            sequence = event.sequence;
        }
        if (response.events.length > 0 && (response.serverSeq < sequence
            || (response.hasMore && response.serverSeq !== sequence))) {
            throw new Error('ROOM_RECOVERY_CURSOR_MISMATCH');
        }
    }
}
