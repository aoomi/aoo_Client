export interface LongCardTransport {
    request<T>(message: string, payload: unknown): Promise<T>;
    on(message: string, handler: (payload: unknown) => void): () => void;
}

export type FanLimit = 0 | 3 | 4;
export type OverFanBase = 0 | 1 | 2 | 5 | 10;

/** Exact game-private fields from old CZGCP_CreateRoom. */
export interface ZgcpRuleSelections {
    fanshushangxian: FanLimit;
    chaofanjiadi: OverFanBase;
}

/** Exact game-private fields from old CZGDSS_CreateRoom. */
export interface ZgdssRuleSelections {
    fanshushangxian: FanLimit;
    chaofanjiadi: OverFanBase;
    laizishuliang: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
}

/** The adapter deliberately treats game state as opaque server authority. */
export interface ZigongAuthoritativeSnapshot {
    readonly roomId: number;
    readonly gameCode: 'zgcp' | 'zgdss';
    readonly stateVersion: number;
    readonly [field: string]: unknown;
}

abstract class ZigongLongCardAdapter<Rules extends object> {
    private sequence = 0;
    private current?: ZigongAuthoritativeSnapshot;
    private cancelPush?: () => void;
    protected readonly wire: LongCardTransport;
    protected readonly roomId: number;
    protected readonly code: 'zgcp' | 'zgdss';
    protected readonly rules: Readonly<Rules>;

    protected constructor(wire: LongCardTransport, roomId: number, code: 'zgcp' | 'zgdss', rules: Rules) {
        if (!Number.isInteger(roomId) || roomId <= 0) throw new Error('invalid Zigong long-card room');
        this.wire = wire;
        this.roomId = roomId;
        this.code = code;
        this.rules = Object.freeze({ ...rules });
    }

    /** Passed to room creation; later gameplay commands cannot rewrite rules. */
    immutableRules(): Readonly<Rules> { return this.rules; }
    snapshot(): ZigongAuthoritativeSnapshot | undefined { return this.current; }

    connect(onSnapshot: (snapshot: ZigongAuthoritativeSnapshot) => void): void {
        if (this.cancelPush) return;
        this.cancelPush = this.wire.on(`longcard.${this.code}.response`, (raw) => onSnapshot(this.accept(raw)));
    }

    disconnect(): void { this.cancelPush?.(); this.cancelPush = undefined; }
    state(seatId = 0): Promise<ZigongAuthoritativeSnapshot> { return this.send(seatId, 'state', {}); }
    join(seatId: number): Promise<ZigongAuthoritativeSnapshot> { return this.send(seatId, 'join', {}); }
    ready(seatId: number): Promise<ZigongAuthoritativeSnapshot> { return this.send(seatId, 'ready', {}); }
    start(): Promise<ZigongAuthoritativeSnapshot> { return this.send(0, 'start', {}); }
    protected operate(seatId: number, opType: number, cards: readonly number[] = []): Promise<ZigongAuthoritativeSnapshot> {
        return this.send(seatId, 'operation', { opType, cardID: [...cards] });
    }

    protected sendGameAction(seatId: number, action: string, payload: Readonly<Record<string, unknown>>): Promise<ZigongAuthoritativeSnapshot> {
        return this.send(seatId, action, payload);
    }

    private async send(seatId: number, action: string, payload: Readonly<Record<string, unknown>>): Promise<ZigongAuthoritativeSnapshot> {
        const raw = await this.wire.request<unknown>(`longcard.${this.code}.dispatch`, {
            roomId: this.roomId,
            playVersion: '1.0.0',
            sequence: ++this.sequence,
            seatId,
            action,
            payload,
        });
        return this.accept(raw);
    }

    private accept(raw: unknown): ZigongAuthoritativeSnapshot {
        if (!raw || typeof raw !== 'object') throw new Error('invalid Zigong long-card response');
        const view = raw as ZigongAuthoritativeSnapshot;
        if (view.roomId !== this.roomId || view.gameCode !== this.code || !Number.isInteger(view.stateVersion)) {
            throw new Error('mismatched Zigong long-card response');
        }
        if (this.current && view.stateVersion < this.current.stateVersion) return this.current;
        this.current = view;
        return view;
    }
}

/** 自贡长牌: 84 long cards; server owns 14-point legality, tuo/fan and settlement. */
export class ZgcpGameplayAdapter extends ZigongLongCardAdapter<ZgcpRuleSelections> {
    constructor(wire: LongCardTransport, roomId: number, rules: ZgcpRuleSelections) {
        super(wire, roomId, 'zgcp', rules);
    }
    piao(seatId: number, value: 0 | 1) { return this.sendPiao(seatId, value); }
    discard(seatId: number, card: number) { return this.operate(seatId, 7, [card]); }
    chi(seatId: number, cards: readonly number[]) { return this.operate(seatId, 6, cards); }
    peng(seatId: number, cards: readonly number[]) { return this.operate(seatId, 2, cards); }
    steal(seatId: number, cards: readonly number[]) { return this.operate(seatId, 96, cards); }
    ba(seatId: number, cards: readonly number[]) { return this.operate(seatId, 99, cards); }
    call(seatId: number) { return this.operate(seatId, 124); }
    hu(seatId: number, card?: number) { return this.operate(seatId, 1, card === undefined ? [] : [card]); }
    pass(seatId: number) { return this.operate(seatId, 8); }
    private sendPiao(seatId: number, value: 0 | 1) { return this.sendGameAction(seatId, 'piao', { piaoHua: value }); }
}

/** 自贡斗十四: poker-card variant with 0..8 wildcards and an explicit FAN action. */
export class ZgdssGameplayAdapter extends ZigongLongCardAdapter<ZgdssRuleSelections> {
    constructor(wire: LongCardTransport, roomId: number, rules: ZgdssRuleSelections) {
        super(wire, roomId, 'zgdss', rules);
    }
    discard(seatId: number, card: number) { return this.operate(seatId, 7, [card]); }
    fan(seatId: number) { return this.operate(seatId, 125); }
    chi(seatId: number, cards: readonly number[]) { return this.operate(seatId, 6, cards); }
    peng(seatId: number, cards: readonly number[]) { return this.operate(seatId, 2, cards); }
    steal(seatId: number, cards: readonly number[]) { return this.operate(seatId, 96, cards); }
    ba(seatId: number, cards: readonly number[]) { return this.operate(seatId, 99, cards); }
    call(seatId: number) { return this.operate(seatId, 124); }
    hu(seatId: number, card?: number) { return this.operate(seatId, 1, card === undefined ? [] : [card]); }
    pass(seatId: number) { return this.operate(seatId, 8); }
}
