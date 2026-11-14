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
    readonly serverSeq: number | string;
    readonly stateVersion: number | string;
    readonly playVersion: string;
    readonly hasMore: boolean;
    readonly roomInstanceId: string;
    readonly lifecycleEpoch: string;
    readonly sessionId: string;
    readonly eventSequence: string;
    readonly eventId: string;
}

export interface RoomReconnectRuntimeContext {
    readonly gameId: number;
    readonly gameCode: string;
    readonly ownerId: string;
    readonly roomInstanceId: string;
    readonly lifecycleEpoch: string;
    readonly fencingToken: string;
    readonly sessionId: string;
    readonly stateVersion: number;
    readonly eventSequence: string;
    readonly eventId: string;
    readonly connectionGeneration: string;
    readonly releaseId: string;
    readonly indexGeneration: string;
    readonly regionCode: string;
    readonly sourceHash: string;
    readonly ruleContentHash: string;
    readonly componentContentHash: string;
    readonly cardCodecVersion: string;
    readonly eventInterpreterVersion: string;
    readonly protocolVersion: string;
    readonly snapshotSchemaVersion: string;
}

export interface RoomReconnectView<S> {
    recovering(): void;
    recovered(state: Readonly<S>): void;
    recoveryFailed(error: Error): void;
}

export interface RoomHandoffResponse {
    readonly accepted: boolean;
    readonly roomInstanceId: string;
    readonly lifecycleEpoch: string;
    readonly sessionId: string;
    readonly stateVersion: number | string;
    readonly eventSequence: string;
    readonly eventId: string;
    readonly connectionGeneration: string;
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
        } & RoomReconnectRuntimeContext,
    ) { }

    public reconnect(): Promise<Readonly<S>> {
        const lifecycleEpochError = this.lifecycleEpochError();
        if (lifecycleEpochError) return Promise.reject(lifecycleEpochError);
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
            const requestEventId = this.eventIdForCursor(cursor);
            const response = await this.client.request<RoomReconnectResponse<S>>('room.reconnect', {
                action: 'room.reconnect', roomId: this.context.roomId, lastServerSeq: cursor,
                reconnectToken: this.context.reconnectToken, playVersion: this.context.playVersion,
                expectedStateVersion,
                idempotencyKey: requestEventId,
                payload: {
                    sessionId: this.context.sessionId,
                    gameId: this.context.gameId,
                    gameCode: this.context.gameCode,
                    roomInstanceId: this.context.roomInstanceId,
                    lifecycleEpoch: this.context.lifecycleEpoch,
                    fencingToken: this.context.fencingToken,
                    stateVersion: String(this.context.stateVersion),
                    eventSequence: String(cursor),
                    eventId: requestEventId,
                    releaseId: this.context.releaseId,
                    indexGeneration: this.context.indexGeneration,
                    regionCode: this.context.regionCode,
                    sourceHash: this.context.sourceHash,
                    ruleContentHash: this.context.ruleContentHash,
                    componentContentHash: this.context.componentContentHash,
                    cardCodecVersion: this.context.cardCodecVersion,
                    eventInterpreterVersion: this.context.eventInterpreterVersion,
                    protocolVersion: this.context.protocolVersion,
                    snapshotSchemaVersion: this.context.snapshotSchemaVersion,
                },
            });
            this.validateResponse(response, cursor, requestEventId);
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
                cursor = this.safeNumber(response.serverSeq, 'ROOM_RECOVERY_SERVER_SEQUENCE_INVALID');
            } else {
                for (const event of response.events) {
                    this.store.applyRecoveryEvent(this.context.roomId, event.sequence,
                        (state) => this.reduce(state, event));
                    cursor = event.sequence;
                }
            }
            if (response.events.length === 0) cursor = this.safeNumber(response.serverSeq, 'ROOM_RECOVERY_SERVER_SEQUENCE_INVALID');
            expectedStateVersion = this.safeNumber(response.stateVersion, 'ROOM_STATE_VERSION_INVALID');
            if (!response.hasMore) {
                const recovered = this.store.snapshot();
                if (!recovered) throw new Error('ROOM_RECOVERY_EMPTY');
                const serverSeq = this.safeNumber(response.serverSeq, 'ROOM_RECOVERY_SERVER_SEQUENCE_INVALID');
                const stateVersion = this.safeNumber(response.stateVersion, 'ROOM_STATE_VERSION_INVALID');
                if (recovered.eventSeq !== serverSeq || recovered.stateVersion !== stateVersion) {
                    this.store.replaceSnapshot({ ...recovered, eventSeq: serverSeq,
                        stateVersion } as S);
                }
                return this.store.snapshot() as Readonly<S>;
            }
        }
        throw new Error('ROOM_RECOVERY_PAGE_LIMIT');
    }

    private validateResponse(response: RoomReconnectResponse<S>, cursor: number, requestEventId: string): void {
        if (response.playVersion !== this.context.playVersion) throw new Error('ROOM_PLAY_VERSION_CONFLICT');
        const stateVersion = this.safeNumber(response.stateVersion, 'ROOM_STATE_VERSION_INVALID');
        const serverSeq = this.safeNumber(response.serverSeq, 'ROOM_RECOVERY_CURSOR_INVALID');
        if (serverSeq < cursor) {
            throw new Error('ROOM_RECOVERY_CURSOR_INVALID');
        }
        let sequence = cursor;
        for (const event of response.events) {
            if (!Number.isSafeInteger(event.sequence) || event.sequence <= sequence) {
                throw new Error('ROOM_RECOVERY_EVENT_GAP');
            }
            sequence = event.sequence;
        }
        if (response.events.length > 0 && (serverSeq < sequence
            || (response.hasMore && serverSeq !== sequence))) {
            throw new Error('ROOM_RECOVERY_CURSOR_MISMATCH');
        }
        if (response.roomInstanceId !== this.context.roomInstanceId
            || response.lifecycleEpoch !== this.context.lifecycleEpoch
            || response.sessionId !== this.context.sessionId
            || response.eventSequence !== String(cursor)
            || response.eventId !== requestEventId
            || stateVersion < this.context.stateVersion) {
            throw new Error('ROOM_RECOVERY_RUNTIME_IDENTITY_CONFLICT');
        }
    }

    private safeNumber(value: number | string, code: string): number {
        const parsed = typeof value === 'string' && /^(0|[1-9]\d*)$/.test(value)
            ? Number(value) : typeof value === 'number' ? value : Number.NaN;
        if (!Number.isSafeInteger(parsed) || parsed < 0) throw new Error(code);
        return parsed;
    }

    private eventIdForCursor(cursor: number): string {
        const initial = Number(this.context.eventSequence);
        return Number.isSafeInteger(initial) && initial === cursor
            ? this.context.eventId : `${this.context.eventId}:${cursor}`;
    }

    public handoff(toSessionId: string, toConnectionGeneration: string): Promise<Readonly<Record<string, unknown>>> {
        const lifecycleEpochError = this.lifecycleEpochError();
        if (lifecycleEpochError) return Promise.reject(lifecycleEpochError);
        const target = String(toSessionId ?? '').trim();
        const generation = String(toConnectionGeneration ?? '').trim();
        if (!target || target === this.context.sessionId || !/^[1-9]\d*$/.test(generation)) {
            return Promise.reject(new Error('ROOM_HANDOFF_TARGET_INVALID'));
        }
        return this.client.request<RoomHandoffResponse>('room.handoff', {
            action: 'room.handoff', roomId: this.context.roomId,
            playVersion: this.context.playVersion,
            payload: {
                roomId: String(this.context.roomId), gameId: this.context.gameId,
                gameCode: this.context.gameCode, playVersion: this.context.playVersion,
                roomInstanceId: this.context.roomInstanceId, lifecycleEpoch: this.context.lifecycleEpoch,
                fencingToken: this.context.fencingToken, stateVersion: String(this.context.stateVersion),
                sessionId: this.context.sessionId, fromSessionId: this.context.sessionId,
                toSessionId: target, fromConnectionGeneration: this.context.connectionGeneration,
                toConnectionGeneration: generation, expectedStateVersion: String(this.context.stateVersion),
                ownerId: this.context.ownerId, eventSequence: this.context.eventSequence,
                eventId: this.context.eventId, requestId: this.context.eventId,
                releaseId: this.context.releaseId, indexGeneration: this.context.indexGeneration,
                regionCode: this.context.regionCode, sourceHash: this.context.sourceHash,
                ruleContentHash: this.context.ruleContentHash,
                componentContentHash: this.context.componentContentHash,
                cardCodecVersion: this.context.cardCodecVersion,
                eventInterpreterVersion: this.context.eventInterpreterVersion,
                protocolVersion: this.context.protocolVersion,
                snapshotSchemaVersion: this.context.snapshotSchemaVersion,
            },
        }).then(response => {
            this.validateHandoffResponse(response, target, generation);
            return response as unknown as Readonly<Record<string, unknown>>;
        });
    }

    private lifecycleEpochError(): Error | null {
        return typeof this.context.lifecycleEpoch === 'string'
            && /^(0|[1-9]\d*)$/.test(this.context.lifecycleEpoch)
            ? null : new Error('ROOM_RUNTIME_LIFECYCLE_EPOCH_INVALID');
    }

    private validateHandoffResponse(response: RoomHandoffResponse,
        targetSessionId: string, targetGeneration: string): void {
        const stateVersion = this.safeNumber(response?.stateVersion, 'ROOM_HANDOFF_STATE_VERSION_INVALID');
        if (response?.accepted !== true
            || response.roomInstanceId !== this.context.roomInstanceId
            || response.lifecycleEpoch !== this.context.lifecycleEpoch
            || response.sessionId !== targetSessionId
            || response.eventSequence !== this.context.eventSequence
            || response.eventId !== this.context.eventId
            || response.connectionGeneration !== targetGeneration
            || stateVersion < this.context.stateVersion) {
            throw new Error('ROOM_HANDOFF_RUNTIME_IDENTITY_CONFLICT');
        }
    }
}
