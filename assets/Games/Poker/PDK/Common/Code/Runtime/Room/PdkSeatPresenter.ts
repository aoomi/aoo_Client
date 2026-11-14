import { Node } from 'cc';

export type PdkPlayerCount = 2 | 3 | 4;
export interface PdkSeatEntry { readonly dataSeat: number; readonly physicalSlot: number; }
export interface PdkSeatPlayer {
    readonly pid?: number;
    readonly headImageUrl?: string;
    readonly name?: string;
    readonly nickName?: string;
    readonly displayName?: string;
    readonly totalScore?: number;
    readonly point?: number;
    readonly clubCent?: number | string;
    readonly roomReady?: boolean;
    readonly isReady?: boolean;
    readonly isContinue?: boolean;
    readonly trusteeship?: boolean;
    readonly isLostConnect?: boolean;
    readonly isShowLeave?: boolean;
    readonly ip?: string;
    readonly IP?: string;
    readonly ipAddress?: string;
    readonly gps?: string;
    readonly location?: string;
    readonly address?: string;
}
/**
 * Kept as a source-compatible shape for archived replay callers. Live room
 * Head state is owned by CommonRoom and never enters this presenter.
 */
export interface PdkHeadContext { readonly ownerId?: number; readonly showReady?: boolean; }

export interface PdkSeatLayoutProfile {
    readonly playerCount: PdkPlayerCount;
    readonly localDataSeat: number;
    readonly activePhysicalSlots: readonly number[];
    readonly entries: readonly PdkSeatEntry[];
    physicalSlotFor(dataSeat: number): number;
}

const ACTIVE_SLOTS: Readonly<Record<PdkPlayerCount, readonly number[]>> = Object.freeze({
    2: Object.freeze([0, 2]),
    3: Object.freeze([0, 1, 3]),
    4: Object.freeze([0, 1, 2, 3]),
});

export function requirePdkPlayerCount(value: unknown): PdkPlayerCount {
    const playerCount = Number(value);
    if (playerCount !== 2 && playerCount !== 3 && playerCount !== 4) throw new Error(`跑得快权威人数无效: ${String(value)}`);
    return playerCount;
}

export function createSeatEntries(playerCountValue: unknown, localSeatValue: unknown): readonly PdkSeatEntry[] {
    const playerCount = requirePdkPlayerCount(playerCountValue);
    const localSeat = Number(localSeatValue);
    if (!Number.isInteger(localSeat) || localSeat < 0 || localSeat >= playerCount) throw new Error(`跑得快本地座位无效: ${localSeat}`);
    return Array.from({ length: playerCount }, (_, dataSeat) => ({
        dataSeat,
        physicalSlot: ACTIVE_SLOTS[playerCount][(dataSeat - localSeat + playerCount) % playerCount],
    }));
}

/**
 * 数据座位必须围绕本机玩家旋转后再映射到固定物理挂点，否则重连或人数切换时，
 * 同一个玩家会在不同客户端落到不同方向，公开出牌区和倒计时也会随之错位。
 */
export function createPdkSeatLayoutProfile(playerCountValue: unknown, localSeatValue: unknown): PdkSeatLayoutProfile {
    const playerCount = requirePdkPlayerCount(playerCountValue);
    const localDataSeat = Number(localSeatValue);
    const entries = Object.freeze([...createSeatEntries(playerCount, localDataSeat)]);
    const physicalByDataSeat = new Map(entries.map((entry) => [entry.dataSeat, entry.physicalSlot]));
    return Object.freeze({
        playerCount,
        localDataSeat,
        activePhysicalSlots: ACTIVE_SLOTS[playerCount],
        entries,
        physicalSlotFor(dataSeat: number): number {
            const physicalSlot = physicalByDataSeat.get(dataSeat);
            if (physicalSlot === undefined) throw new Error(`跑得快数据座位越界: ${dataSeat}/${playerCount}`);
            return physicalSlot;
        },
    });
}

export class PdkSeatPresenter {
    private readonly physicalSlots = new Map<number, number>();

    public constructor(private readonly root: Node) {}

    public apply(playerCount: PdkPlayerCount, localSeat: number, _players: Readonly<Record<number, PdkSeatPlayer>>): readonly PdkSeatEntry[] {
        const entries = createSeatEntries(playerCount, localSeat);
        this.physicalSlots.clear();
        for (const entry of entries) this.physicalSlots.set(entry.dataSeat, entry.physicalSlot);
        const active = new Set(entries.map((entry) => entry.physicalSlot));
        for (let slot = 0; slot < 4; slot += 1) this.seat(slot).active = active.has(slot);
        for (const entry of entries) {
            const seat = this.seat(entry.physicalSlot);
            seat.active = true;
        }
        return entries;
    }

    public clear(): void {
        this.physicalSlots.clear();
    }
    /** CommonRoom owns readiness badges; retained as a no-op for old table adapters. */
    public hideReadyStates(): void {}

    /**
     * Archived replay forms still call this method while they migrate to the
     * CommonRoom seat contract. It deliberately does not create or mutate a
     * Head; live CommonRoom is the sole owner of that lifecycle.
     */
    public async renderHead(_dataSeat: number, _physicalSlot: number,
        _player: PdkSeatPlayer = {}, _context: PdkHeadContext = {}): Promise<Node | null> {
        return null;
    }
    public seat(slot: number): Node { return this.child(this.child(this.root, 'Players'), `Seat_${slot}`); }

    private child(parent: Node, name: string): Node {
        const node = parent.getChildByName(name)
            ?? (name.startsWith('Seat_') ? parent.getChildByName(`Play_${name.slice('Seat_'.length)}`) : null);
        if (!node) {
            const children = parent.children.map(child => child.name).join(',');
            throw new Error(`PDK_CommonRoom 座位节点缺失: ${name} (parent=${parent.name}; children=${children})`);
        }
        return node;
    }
}
