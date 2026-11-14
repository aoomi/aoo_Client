import type { CommonRoomFormHost } from './RoomNetworkControllerMount';

export interface RoomSettlementHistoryEntry {
    /** Opaque authoritative identity supplied by the game adapter. */
    readonly identity: string;
    /** Opaque renderer input. Common must not inspect or transform this value. */
    readonly payload: unknown;
}

export interface RoomSettlementHistoryRenderer {
    open(
        entries: readonly RoomSettlementHistoryEntry[],
        close: () => void,
        source?: 'room-button' | 'terminal',
    ): Promise<void> | void;
    close(): void;
    destroy(): void;
}

/** Gameplay supplies payload preparation; Common owns the settlement window. */
export interface CommonRoomSettlementWindowPort {
    readonly path: string;
    readonly prepare: (
        entries: readonly RoomSettlementHistoryEntry[],
        context?: Readonly<{ source: 'room-button' | 'terminal' }>,
    ) => Promise<unknown> | unknown;
}

/** Common-owned renderer that never lets gameplay own the shared form lifecycle. */
export class CommonRoomSettlementWindowRenderer implements RoomSettlementHistoryRenderer {
    private generation = 0;
    private destroyed = false;

    public constructor(
        private readonly formHost: CommonRoomFormHost,
        private readonly port: CommonRoomSettlementWindowPort,
        private readonly report: (error: unknown) => void = () => undefined,
    ) {}

    public async open(
        entries: readonly RoomSettlementHistoryEntry[],
        _close: () => void,
        source: 'room-button' | 'terminal' = 'room-button',
    ): Promise<void> {
        if (this.destroyed) throw new Error('COMMON_ROOM_SETTLEMENT_WINDOW_DESTROYED');
        const generation = ++this.generation;
        const payload = await this.port.prepare(entries, { source });
        if (this.destroyed || generation !== this.generation) return;
        const form = await this.formHost.show(this.port.path, payload);
        if (!form?.node.isValid) {
            const error = new Error('COMMON_ROOM_SETTLEMENT_WINDOW_REQUIRED');
            this.report(error);
            throw error;
        }
    }

    public close(): void {
        this.generation += 1;
        if (!this.destroyed) this.formHost.close(this.port.path);
    }

    public destroy(): void {
        if (this.destroyed) return;
        this.destroyed = true;
        this.generation += 1;
        this.formHost.close(this.port.path);
    }
}

/** Buffers authoritative settlement events before the shared room shell mounts. */
export class RoomSettlementHistoryFeed {
    private readonly entries: RoomSettlementHistoryEntry[] = [];
    private readonly identities = new Set<string>();
    private readonly listeners = new Set<(entry: RoomSettlementHistoryEntry) => void>();
    private readonly controlListeners = new Set<(
        action: 'open' | 'close', source?: 'room-button' | 'terminal'
    ) => void>();

    public constructor(private readonly limit = 64) {
        if (!Number.isSafeInteger(limit) || limit < 1) throw new Error('ROOM_SETTLEMENT_HISTORY_LIMIT_INVALID');
    }

    public record(entry: RoomSettlementHistoryEntry): boolean {
        const identity = String(entry.identity ?? '').trim();
        if (!identity) throw new Error('ROOM_SETTLEMENT_HISTORY_IDENTITY_REQUIRED');
        if (this.identities.has(identity)) return false;
        const saved = Object.freeze({ identity, payload: entry.payload });
        this.entries.push(saved);
        this.identities.add(identity);
        while (this.entries.length > this.limit) {
            const removed = this.entries.shift();
            if (removed) this.identities.delete(removed.identity);
        }
        for (const listener of this.listeners) listener(saved);
        return true;
    }

    public snapshot(): readonly RoomSettlementHistoryEntry[] {
        return Object.freeze([...this.entries]);
    }

    public subscribe(listener: (entry: RoomSettlementHistoryEntry) => void): () => void {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }

    /** Gameplay may request a presentation transition; Common performs it. */
    public requestOpen(source: 'room-button' | 'terminal' = 'room-button'): void {
        for (const listener of this.controlListeners) listener('open', source);
    }

    /** Gameplay may request dismissal; Common performs the actual form close. */
    public requestClose(): void {
        for (const listener of this.controlListeners) listener('close');
    }

    public subscribeControl(listener: (action: 'open' | 'close', source?: 'room-button' | 'terminal') => void): () => void {
        this.controlListeners.add(listener);
        return () => this.controlListeners.delete(listener);
    }

    public clear(): void {
        this.entries.length = 0;
        this.identities.clear();
        this.listeners.clear();
        this.controlListeners.clear();
    }
}

/** Session-scoped settlement history with identity dedupe and one renderer window. */
export class RoomSettlementHistory {
    private readonly entries: RoomSettlementHistoryEntry[] = [];
    private readonly identities = new Set<string>();
    private openPending: Promise<void> | null = null;
    private opened = false;
    private destroyed = false;
    private generation = 0;

    public constructor(
        private readonly renderer: RoomSettlementHistoryRenderer,
        private readonly limit = 64,
    ) {
        if (!Number.isSafeInteger(limit) || limit < 1) throw new Error('ROOM_SETTLEMENT_HISTORY_LIMIT_INVALID');
    }

    public record(entry: RoomSettlementHistoryEntry): boolean {
        this.assertAlive();
        const identity = entry.identity.trim();
        if (!identity) throw new Error('ROOM_SETTLEMENT_HISTORY_IDENTITY_REQUIRED');
        if (this.identities.has(identity)) return false;
        this.entries.push(Object.freeze({ identity, payload: entry.payload }));
        this.identities.add(identity);
        while (this.entries.length > this.limit) {
            const removed = this.entries.shift();
            if (removed) this.identities.delete(removed.identity);
        }
        return true;
    }

    public toggle(): Promise<void> {
        if (this.opened || this.openPending) {
            this.close();
            return Promise.resolve();
        }
        return this.open();
    }

    public open(source: 'room-button' | 'terminal' = 'room-button'): Promise<void> {
        this.assertAlive();
        if (this.opened) return Promise.resolve();
        if (this.openPending) return this.openPending;
        const generation = this.generation;
        const snapshot = Object.freeze([...this.entries]);
        const operation = Promise.resolve(this.renderer.open(snapshot, () => this.close(), source))
            .then(() => { if (!this.destroyed && generation === this.generation) this.opened = true; })
            .finally(() => { if (this.openPending === operation) this.openPending = null; });
        this.openPending = operation;
        return operation;
    }

    public close(): void {
        if (!this.opened && !this.openPending) return;
        this.generation += 1;
        this.opened = false;
        this.openPending = null;
        this.renderer.close();
    }

    public clear(): void {
        this.entries.length = 0;
        this.identities.clear();
        this.close();
    }

    public destroy(): void {
        if (this.destroyed) return;
        this.destroyed = true;
        this.generation += 1;
        this.entries.length = 0;
        this.identities.clear();
        this.openPending = null;
        this.opened = false;
        this.renderer.destroy();
    }

    private assertAlive(): void {
        if (this.destroyed) throw new Error('ROOM_SETTLEMENT_HISTORY_DESTROYED');
    }
}
