import type { BamjRuntime } from './BamjRuntime';

export type BamjPlayPhase = 'waiting' | 'playing' | 'settled' | 'ended';

export interface BamjPlaySnapshot {
    phase: BamjPlayPhase;
    hand: readonly number[];
    availableOperations: readonly number[];
    result: unknown;
}

/** Converts legacy room models and push packets into a deterministic native-view snapshot. */
export class BamjPlayStateController {
    private phase: BamjPlayPhase = 'waiting';
    private hand: number[] = [];
    private availableOperations: number[] = [];
    private result: unknown = null;

    public constructor(private readonly runtime: BamjRuntime) {}

    public refreshFromRoom(): BamjPlaySnapshot {
        const room = this.runtime.getRoom() as any;
        const setPosition = room.GetClientPlayerSetPos?.();
        const cards = this.numberList(setPosition?.GetSetPosProperty?.('shouCard'));
        const drawn = Number(setPosition?.GetSetPosProperty?.('handCard') ?? 0);
        if (drawn > 0) cards.push(drawn);
        this.hand = cards;
        const roomState = Number(room.GetRoomProperty?.('state'));
        if (roomState === 1) this.phase = 'playing';
        else if (roomState === 2) this.phase = 'ended';
        return this.snapshot();
    }

    public consume(event: string, body: unknown): BamjPlaySnapshot {
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
        if (!body || typeof body !== 'object') return [];
        const packet = body as Record<string, unknown>;
        const setPos = (packet.set_Pos ?? packet.setPos ?? packet.room_SetWait ?? packet) as Record<string, unknown>;
        const values = setPos?.opTypeList ?? setPos?.opList ?? setPos?.opType;
        if (Array.isArray(values)) return this.numberList(values);
        const operation = Number(values ?? 0);
        return operation > 0 ? [operation] : [];
    }

    private numberList(value: unknown): number[] {
        return Array.isArray(value)
            ? value.map(Number).filter((card) => Number.isSafeInteger(card) && card > 0)
            : [];
    }

    private snapshot(): BamjPlaySnapshot {
        return {
            phase: this.phase,
            hand: [...this.hand],
            availableOperations: [...this.availableOperations],
            result: this.result,
        };
    }
}
