/** Runtime console governor: errors/warnings remain intact; noisy info is sampled and rate-limited. */
export class RuntimeLogGovernor {
    private static installed = false;
    private static readonly windows = new Map<string, { start: number; count: number }>();

    public static install(maxPerMinute = 20): void {
        if (this.installed || maxPerMinute < 1) return;
        this.installed = true;
        const original = console.log.bind(console);
        console.log = (...args: unknown[]): void => {
            const signature = this.signature(args);
            if (/heartbeat|heart.?beat|poll(?:ing)?|轮询/i.test(signature)) return;
            const now = Date.now();
            const window = this.windows.get(signature);
            if (!window || now - window.start >= 60_000) {
                this.windows.set(signature, { start: now, count: 1 });
                original(...args);
                return;
            }
            if (window.count >= maxPerMinute) return;
            window.count += 1;
            original(...args);
        };
    }

    private static signature(args: readonly unknown[]): string {
        return args.map(value => typeof value === 'string' ? value : Object.prototype.toString.call(value))
            .join(' ').replace(/\b\d+\b/g, '<n>').slice(0, 256);
    }
}
