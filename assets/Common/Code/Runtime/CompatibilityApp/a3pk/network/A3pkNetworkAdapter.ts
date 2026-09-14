export type A3pkPacketHandler<T = unknown> = (packet: T) => void;
export interface A3pkSocketPort {
    request<T = unknown>(event: string, payload?: unknown): Promise<T>;
    notify(event: string, payload?: unknown): void | Promise<void>;
    on(event: string, handler: A3pkPacketHandler): (() => void) | void;
    off?(event: string, handler: A3pkPacketHandler): void;
}
interface Entry { callback: A3pkPacketHandler; target?: object; bound: A3pkPacketHandler; dispose?: () => void }

/** Creator 3.8.8 bridge preserving the callback-style A3PK 2.2.2 network contract. */
export class A3pkNetworkAdapter {
    private readonly handlers = new Map<string, Entry[]>();
    public constructor(private readonly socket: A3pkSocketPort) {}
    public RegNetPack<T = unknown>(event: string, callback: A3pkPacketHandler<T>, target?: object): void {
        if (!event || typeof callback !== 'function') return;
        const key = event.trim().toLowerCase();
        const entries = this.handlers.get(key) ?? [];
        if (entries.some((item) => item.callback === callback && item.target === target)) return;
        const bound = (target ? callback.bind(target) : callback) as A3pkPacketHandler;
        const result = this.socket.on(event, bound);
        entries.push({ callback: callback as A3pkPacketHandler, target, bound, dispose: typeof result === 'function' ? result : undefined });
        this.handlers.set(key, entries);
    }
    public UnRegNetPack(event: string, callback?: A3pkPacketHandler, target?: object): void {
        const key = event.trim().toLowerCase();
        const keep: Entry[] = [];
        for (const item of this.handlers.get(key) ?? []) {
            if ((callback === undefined || item.callback === callback) && (target === undefined || item.target === target)) this.dispose(event, item);
            else keep.push(item);
        }
        if (keep.length) this.handlers.set(key, keep); else this.handlers.delete(key);
    }
    public UnAllRegNetPack(target?: object): void {
        for (const [event, entries] of this.handlers) {
            const keep = entries.filter((item) => {
                if (target !== undefined && item.target !== target) return true;
                this.dispose(event, item); return false;
            });
            if (keep.length) this.handlers.set(event, keep); else this.handlers.delete(event);
        }
    }
    public requestV2<T = unknown>(event: string, payload?: unknown, callback?: (packet: T) => void, error?: (reason: unknown) => void): Promise<T> {
        const request = this.socket.request<T>(event, payload); request.then(callback).catch((reason) => error?.(reason)); return request;
    }
    public notifyV2<T = unknown>(event: string, payload?: unknown, callback?: (packet: T) => void, error?: (reason: unknown) => void): Promise<T> {
        return this.requestV2(event, payload, callback, error);
    }
    public NotifyPack(event: string, payload?: unknown): void { void this.socket.notify(event, payload); }
    private dispose(event: string, item: Entry): void { if (item.dispose) item.dispose(); else this.socket.off?.(event, item.bound); }
}
