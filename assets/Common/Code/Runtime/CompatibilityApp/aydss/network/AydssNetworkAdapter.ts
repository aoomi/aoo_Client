export type AydssPacketHandler<T = unknown> = (packet: T) => void;
export interface AydssSocketPort {
    request<T = unknown>(event: string, payload?: unknown): Promise<T>;
    notify(event: string, payload?: unknown): void | Promise<void>;
    on(event: string, handler: AydssPacketHandler): (() => void) | void;
    off?(event: string, handler: AydssPacketHandler): void;
}
interface Entry { callback: AydssPacketHandler; target?: object; bound: AydssPacketHandler; dispose?: () => void }

/** Creator 3.8.8 bridge preserving the callback-style AYDSS 2.2.2 network contract. */
export class AydssNetworkAdapter {
    private readonly handlers = new Map<string, Entry[]>();
    public constructor(private readonly socket: AydssSocketPort) {}
    public RegNetPack<T = unknown>(event: string, callback: AydssPacketHandler<T>, target?: object): void {
        if (!event || typeof callback !== 'function') return;
        const key = event.trim().toLowerCase();
        const entries = this.handlers.get(key) ?? [];
        if (entries.some((item) => item.callback === callback && item.target === target)) return;
        const bound = (target ? callback.bind(target) : callback) as AydssPacketHandler;
        const result = this.socket.on(event, bound);
        entries.push({ callback: callback as AydssPacketHandler, target, bound, dispose: typeof result === 'function' ? result : undefined });
        this.handlers.set(key, entries);
    }
    public UnRegNetPack(event: string, callback?: AydssPacketHandler, target?: object): void {
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
        const request = this.socket.request<T>(event, this.authoritativePayload(event, payload));
        request.then((packet) => { const adapted = this.adaptResponse(event, packet) as T; callback?.(adapted); for (const item of this.handlers.get(event.trim().toLowerCase()) ?? []) item.bound(adapted); })
            .catch((reason) => error?.(reason));
        return request;
    }
    public notifyV2<T = unknown>(event: string, payload?: unknown, callback?: (packet: T) => void, error?: (reason: unknown) => void): Promise<T> { return this.requestV2(event, payload, callback, error); }
    public NotifyPack(event: string, payload?: unknown): void { void this.socket.notify(event, payload); }
    private authoritativePayload(event: string, payload: unknown): Record<string, unknown> {
        const source = payload && typeof payload === 'object' ? payload as Record<string, unknown> : {};
        const command = /GetRoomInfo/i.test(event) ? 'state' : /UnReady/i.test(event) ? 'unready'
            : /Ready/i.test(event) ? 'ready' : /StartGame/i.test(event) ? 'start'
                : /OpCard|PosAction/i.test(event) ? 'operation' : /EnterRoom/i.test(event) ? 'join' : 'state';
        return { roomId: source.roomId ?? source.roomID, roundNo: source.roundNo ?? 0,
            playVersion: source.playVersion ?? '1.0.0', command, action: event, payload: source };
    }
    private adaptResponse(event: string, packet: unknown): unknown {
        if (!/GetRoomInfo/i.test(event) || !packet || typeof packet !== 'object') return packet;
        const view = packet as Record<string, any>; const seats = view.seats ?? {};
        const posList = Object.entries(seats).map(([pos, value]) => { const seat = value as Record<string, any>;
            return { pos: Number(pos), pid: Number(seat.playerId), roomReady: Boolean(seat.ready), trusteeship: false, name: '', headImageUrl: '' }; });
        const setPosList = Object.entries(seats).map(([pos, value]) => { const seat = value as Record<string, any>;
            return { posID: Number(pos), shouCard: seat.cards ?? [], handCard: Number(seat.cardCount ?? 0), outCard: [], publicCardList: [], huCard: [], huDian: [] }; });
        return { ...view, roomID: Number(view.roomID ?? view.roomId), state: view.started ? 'Playing' : 'Init', prizeType: 'RoomCard',
            cfg: { clubId: 0, unionId: 0 }, posList, dissolve: {}, set: { state: view.started ? 'Playing' : 'Init', setPosList, setEnd: { endTime: 0 } } };
    }
    private dispose(event: string, item: Entry): void { if (item.dispose) item.dispose(); else this.socket.off?.(event, item.bound); }
}
