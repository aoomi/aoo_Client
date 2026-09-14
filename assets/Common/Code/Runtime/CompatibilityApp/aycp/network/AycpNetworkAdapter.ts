export type AycpPacketHandler<T = unknown> = (packet: T) => void;
export interface AycpSocketPort {
    request<T = unknown>(event: string, payload?: unknown): Promise<T>;
    notify(event: string, payload?: unknown): void | Promise<void>;
    on(event: string, handler: AycpPacketHandler): (() => void) | void;
    off?(event: string, handler: AycpPacketHandler): void;
}
interface Entry { callback: AycpPacketHandler; target?: object; bound: AycpPacketHandler; dispose?: () => void }

/** Creator 3.8.8 bridge preserving the callback-style AYCP 2.2.2 network contract. */
export class AycpNetworkAdapter {
    private readonly handlers = new Map<string, Entry[]>();
    public constructor(private readonly socket: AycpSocketPort) {}
    public RegNetPack<T = unknown>(event: string, callback: AycpPacketHandler<T>, target?: object): void {
        if (!event || typeof callback !== 'function') return;
        const key = event.trim().toLowerCase();
        const entries = this.handlers.get(key) ?? [];
        if (entries.some((item) => item.callback === callback && item.target === target)) return;
        const bound = (target ? callback.bind(target) : callback) as AycpPacketHandler;
        const result = this.socket.on(event, bound);
        entries.push({ callback: callback as AycpPacketHandler, target, bound, dispose: typeof result === 'function' ? result : undefined });
        this.handlers.set(key, entries);
    }
    public UnRegNetPack(event: string, callback?: AycpPacketHandler, target?: object): void {
        const key = event.trim().toLowerCase(); const keep: Entry[] = [];
        for (const item of this.handlers.get(key) ?? []) {
            if ((callback === undefined || item.callback === callback) && (target === undefined || item.target === target)) this.dispose(event, item);
            else keep.push(item);
        }
        if (keep.length) this.handlers.set(key, keep); else this.handlers.delete(key);
    }
    public UnAllRegNetPack(target?: object): void {
        for (const [event, entries] of this.handlers) {
            const keep = entries.filter((item) => { if (target !== undefined && item.target !== target) return true; this.dispose(event, item); return false; });
            if (keep.length) this.handlers.set(event, keep); else this.handlers.delete(event);
        }
    }
    public requestV2<T = unknown>(event: string, payload?: unknown, callback?: (packet: T) => void, error?: (reason: unknown) => void): Promise<T> {
        const request = this.socket.request<T>('longcard.aycp.dispatch', {
            command: this.command(event),
            action: event.includes('.') ? event.slice(event.lastIndexOf('.') + 1) : event,
            payload: payload && typeof payload === 'object' ? payload : {},
        });
        request.then(callback).catch((reason) => error?.(reason)); return request;
    }
    public notifyV2<T = unknown>(event: string, payload?: unknown, callback?: (packet: T) => void, error?: (reason: unknown) => void): Promise<T> { return this.requestV2(event, payload, callback, error); }
    private command(event: string): string {
        if (/GetRoomInfo/i.test(event)) return 'state';
        if (/UnReady/i.test(event)) return 'unready';
        if (/ReadyRoom/i.test(event)) return 'ready';
        if (/StartGame/i.test(event)) return 'start';
        if (/OpPiao|PiaoHua/i.test(event)) return 'piao';
        if (/OpCard/i.test(event)) return 'operation';
        if (/EnterRoom|Join/i.test(event)) return 'join';
        throw new Error(`unsupported AYCP authoritative event: ${event}`);
    }
    private dispose(event: string, item: Entry): void { if (item.dispose) item.dispose(); else this.socket.off?.(event, item.bound); }
}
