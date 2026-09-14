/** Detects synchronous Store/UI/network feedback loops and bounds causal callback depth. */
export class CausalEventGuard {
    private readonly path: string[] = [];
    private readonly active = new Set<string>();
    public constructor(private readonly maxDepth = 32) {
        if (!Number.isSafeInteger(maxDepth) || maxDepth < 1 || maxDepth > 64) throw new Error('事件深度必须为 1..64');
    }
    public dispatch<T>(channel: string, causalId: string, callback: () => T): T {
        const key = `${channel.trim()}:${causalId.trim()}`;
        if (!channel.trim() || !causalId.trim()) throw new Error('事件通道和因果号不能为空');
        if (this.path.length >= this.maxDepth) throw new Error(`事件回调深度超限: ${this.path.join(' -> ')}`);
        if (this.active.has(key)) throw new Error(`检测到事件因果环: ${key}`);
        this.active.add(key); this.path.push(key);
        try { return callback(); }
        finally { this.path.pop(); this.active.delete(key); }
    }
}
