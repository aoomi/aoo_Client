export interface BufferedRoomMessage<T> {
    readonly roomId: number;
    readonly playVersion: string;
    readonly eventSeq: number;
    readonly connectionGeneration: number;
    readonly payload: T;
}

/** Bounded, scoped and ordered buffer used only while a room scene is not ready. */
export class SceneMessageBuffer<T> {
    private readonly messages = new Map<number, BufferedRoomMessage<T>>();

    public constructor(
        private readonly roomId: number,
        private readonly playVersion: string,
        private readonly connectionGeneration: number,
        private readonly capacity = 512,
    ) {
        if (!Number.isSafeInteger(roomId) || roomId <= 0) throw new Error('invalid roomId');
        if (!playVersion) throw new Error('missing playVersion');
        if (!Number.isSafeInteger(connectionGeneration) || connectionGeneration < 0) throw new Error('invalid generation');
        if (!Number.isSafeInteger(capacity) || capacity < 1) throw new Error('invalid buffer capacity');
    }

    public enqueue(message: BufferedRoomMessage<T>): boolean {
        if (message.roomId !== this.roomId || message.playVersion !== this.playVersion
            || message.connectionGeneration !== this.connectionGeneration) return false;
        if (!Number.isSafeInteger(message.eventSeq) || message.eventSeq < 0) return false;
        if (this.messages.has(message.eventSeq)) return false;
        if (this.messages.size >= this.capacity) throw new Error('scene message buffer overflow');
        this.messages.set(message.eventSeq, message);
        return true;
    }

    public drainAfter(lastAppliedSeq: number, consumer: (message: BufferedRoomMessage<T>) => void): number {
        let expected = lastAppliedSeq + 1;
        for (let drained = 0; drained < this.capacity; drained += 1) {
            const message = this.messages.get(expected);
            if (!message) break;
            this.messages.delete(expected);
            consumer(message);
            expected += 1;
        }
        for (const sequence of [...this.messages.keys()]) if (sequence <= lastAppliedSeq) this.messages.delete(sequence);
        return expected - 1;
    }

    public clear(): void {
        this.messages.clear();
    }
}
