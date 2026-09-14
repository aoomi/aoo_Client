import type { HzmjRuntime } from './HzmjRuntime';
import { operationsForPosition } from './HzmjOperationPolicy';

export type HzmjPlayPhase = 'waiting' | 'playing' | 'settled' | 'ended';

export interface HzmjPlaySnapshot {
    phase: HzmjPlayPhase;
    hand: readonly number[];
    availableOperations: readonly number[];
    canDiscard: boolean;
    result: unknown;
}

/** Converts legacy room models and push packets into a deterministic native-view snapshot. */
export class HzmjPlayStateController {
    private phase: HzmjPlayPhase = 'waiting';
    private hand: number[] = [];
    private availableOperations: number[] = [];
    private result: unknown = null;

    public constructor(private readonly runtime: HzmjRuntime) {}

    public refreshFromRoom(): HzmjPlaySnapshot {
        const room = this.runtime.getRoom() as any;
        const setPosition = room.GetClientPlayerSetPos?.();
        const cards = this.numberList(setPosition?.GetSetPosProperty?.('shouCard'));
        const drawn = Number(setPosition?.GetSetPosProperty?.('handCard') ?? 0);
        if (drawn > 0) cards.push(drawn);
        this.hand = cards;
        this.availableOperations = this.operationsFromRoom();
        const roomState = Number(room.GetRoomProperty?.('state'));
        if (roomState === 1) this.phase = 'playing';
        else if (roomState === 2) this.phase = 'ended';
        return this.snapshot();
    }

    public consume(event: string, body: unknown): HzmjPlaySnapshot {
        const normalized = event.toLowerCase();
        if (normalized.endsWith('setstart')) {
            this.phase = 'playing';
            this.result = null;
        } else if (normalized.endsWith('startRound'.toLowerCase())) {
            this.availableOperations = this.operationsFrom(body);
        } else if (normalized.endsWith('posgetcard') || normalized.endsWith('posopcard')
            || normalized.endsWith('setposcard') || normalized.endsWith('applique')) {
            this.refreshFromRoom();
            this.availableOperations = this.operationsFrom(body);
        } else if (normalized.endsWith('setend')) {
            this.phase = 'settled';
            this.availableOperations = [];
            this.result = body;
        } else if (normalized.endsWith('roomend')) {
            this.phase = 'ended';
            this.availableOperations = [];
            this.result = body;
        }
        return this.snapshot();
    }

    private operationsFrom(body: unknown): number[] {
        if (!body || typeof body !== 'object') return this.operationsFromRoom();
        const packet = body as Record<string, unknown>;
        const round = (packet.setRound ?? packet.room_SetWait ?? packet) as Record<string, unknown>;
        const operations = operationsForPosition(round, this.clientPosition());
        return operations.length ? operations : this.operationsFromRoom();
    }

    private operationsFromRoom(): number[] {
        const round = this.runtime.getRoomSet().GetRoomSetProperty('setRound') as unknown;
        return operationsForPosition(round, this.clientPosition());
    }

    private clientPosition(): number {
        return Number(this.runtime.getRoomPositionManager().GetClientPos());
    }

    private numberList(value: unknown): number[] {
        return Array.isArray(value)
            ? value.map(Number).filter((card) => Number.isSafeInteger(card) && card > 0)
            : [];
    }

    private snapshot(): HzmjPlaySnapshot {
        return {
            phase: this.phase,
            hand: [...this.hand],
            availableOperations: [...this.availableOperations],
            canDiscard: this.availableOperations.includes(7),
            result: this.result,
        };
    }
}
