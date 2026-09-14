export type ScjymjPacketHandler<T = unknown> = (packet: T) => void;

export interface ScjymjSocketPort {
    request<T = unknown>(event: string, payload?: unknown): Promise<T>;
    notify(event: string, payload?: unknown): void | Promise<void>;
    on(event: string, handler: ScjymjPacketHandler): (() => void) | void;
    off?(event: string, handler: ScjymjPacketHandler): void;
}

interface RegisteredHandler {
    callback: ScjymjPacketHandler;
    target?: object;
    bound: ScjymjPacketHandler;
    dispose?: () => void;
}

/** Creator 3.8.8 bridge for the callback-style SCJYMJ 2.2 network API. */
export class ScjymjNetworkAdapter {
    private readonly handlers = new Map<string, RegisteredHandler[]>();

    public constructor(private readonly socket: ScjymjSocketPort) {}

    public RegNetPack<T = unknown>(event: string, callback: ScjymjPacketHandler<T>, target?: object): void {
        if (!event || typeof callback !== 'function') return;
        const key = this.normalizeEvent(event);
        const entries = this.handlers.get(key) ?? [];
        if (entries.some((entry) => entry.callback === callback && entry.target === target)) return;
        const bound = (target ? callback.bind(target) : callback) as ScjymjPacketHandler;
        const dispose = this.socket.on(event, bound);
        entries.push({ callback: callback as ScjymjPacketHandler, target, bound,
            dispose: typeof dispose === 'function' ? dispose : undefined });
        this.handlers.set(key, entries);
    }

    public UnRegNetPack<T = unknown>(event: string, callback?: ScjymjPacketHandler<T>, target?: object): void {
        const key = this.normalizeEvent(event);
        const retained: RegisteredHandler[] = [];
        for (const entry of this.handlers.get(key) ?? []) {
            const matches = (callback === undefined || entry.callback === callback)
                && (target === undefined || entry.target === target);
            if (matches) this.disposeHandler(event, entry);
            else retained.push(entry);
        }
        if (retained.length) this.handlers.set(key, retained);
        else this.handlers.delete(key);
    }

    public UnAllRegNetPack(target?: object): void {
        for (const [event, entries] of this.handlers) {
            const retained: RegisteredHandler[] = [];
            for (const entry of entries) {
                if (target === undefined || entry.target === target) this.disposeHandler(event, entry);
                else retained.push(entry);
            }
            if (retained.length) this.handlers.set(event, retained);
            else this.handlers.delete(event);
        }
    }

    public requestV2<T = unknown>(event: string, payload?: unknown, callback?: (packet: T) => void,
        errorCallback?: (error: unknown) => void): Promise<T> {
        const request = this.socket.request<T>(event, payload);
        request.then(callback).catch((error: unknown) => errorCallback?.(error));
        return request;
    }

    public notifyV2<T = unknown>(event: string, payload?: unknown, callback?: (packet: T) => void,
        errorCallback?: (error: unknown) => void): Promise<T> {
        return this.requestV2(event, payload, callback, errorCallback);
    }

    public NotifyPack(event: string, payload?: unknown): void {
        void this.socket.notify(event, payload);
    }

    private disposeHandler(event: string, entry: RegisteredHandler): void {
        if (entry.dispose) entry.dispose();
        else this.socket.off?.(event, entry.bound);
    }

    private normalizeEvent(event: string): string {
        return event.trim().toLowerCase();
    }
}
