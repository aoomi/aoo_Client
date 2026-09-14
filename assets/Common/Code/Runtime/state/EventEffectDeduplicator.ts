/** Bounded idempotency guard for UI effects derived from authoritative room events. */
export class EventEffectDeduplicator {
    private readonly seen = new Set<string>();
    private readonly order: string[] = [];

    public constructor(private readonly capacity = 2048) {
        if (!Number.isSafeInteger(capacity) || capacity < 1) throw new Error('invalid deduplication capacity');
    }

    public run(roomId: number, eventSeq: number, effectKey: string, effect: () => void): boolean {
        if (!Number.isSafeInteger(roomId) || roomId <= 0) throw new Error('invalid roomId');
        if (!Number.isSafeInteger(eventSeq) || eventSeq < 0) throw new Error('invalid eventSeq');
        if (!effectKey) throw new Error('missing effectKey');
        const key = `${roomId}:${eventSeq}:${effectKey}`;
        if (this.seen.has(key)) return false;
        this.seen.add(key);
        this.order.push(key);
        while (this.order.length > this.capacity) this.seen.delete(this.order.shift()!);
        effect();
        return true;
    }

    public clear(): void {
        this.seen.clear();
        this.order.length = 0;
    }
}
