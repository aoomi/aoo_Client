/** One request namespace per page/runtime connection; retries keep the generated id. */
export class GameRequestIdentity {
    private sequence = 0;
    private readonly scope = globalThis.crypto?.randomUUID?.()
        ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
    public constructor(private readonly prefix: string, private readonly roomId: number) {
        if (!prefix.trim() || !Number.isSafeInteger(roomId) || roomId <= 0) throw new Error('invalid game request identity');
    }
    public next(): string { return `${this.prefix}-${this.roomId}-${this.scope}-${++this.sequence}`; }
}
