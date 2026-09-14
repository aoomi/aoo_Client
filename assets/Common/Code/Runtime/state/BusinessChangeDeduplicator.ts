/** Correlates request responses and broadcasts that represent the same authoritative change. */
export class BusinessChangeDeduplicator {
    private readonly keys = new Set<string>();
    private readonly order: string[] = [];

    public constructor(private readonly capacity = 4096) {
        if (!Number.isSafeInteger(capacity) || capacity < 1) throw new Error('invalid deduplication capacity');
    }

    public accept(roomId: number, changeId: string): boolean {
        if (!Number.isSafeInteger(roomId) || roomId <= 0) throw new Error('invalid roomId');
        if (!changeId) throw new Error('missing authoritative change id');
        const key = `${roomId}:${changeId}`;
        if (this.keys.has(key)) return false;
        this.keys.add(key);
        this.order.push(key);
        while (this.order.length > this.capacity) this.keys.delete(this.order.shift()!);
        return true;
    }

    public fromRequest(roomId: number, requestId: string): boolean {
        return this.accept(roomId, `request:${requestId}`);
    }

    public fromEvent(roomId: number, eventSeq: number, requestId?: string): boolean {
        return this.accept(roomId, requestId ? `request:${requestId}` : `event:${eventSeq}`);
    }

    public clear(): void {
        this.keys.clear();
        this.order.length = 0;
    }
}
