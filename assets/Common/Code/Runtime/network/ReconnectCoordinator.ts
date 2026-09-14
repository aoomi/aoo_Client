export type ConnectionState = 'DISCONNECTED' | 'AUTHENTICATING' | 'CONNECTING' | 'CONNECTED'
    | 'RECONNECTING' | 'RECOVERING' | 'READY' | 'LOGGED_OUT' | 'TERMINAL';

export type ConnectionKind = 'HALL' | 'GAME';
export type RequestReplayPolicy = 'QUERY_REPLAYABLE' | 'IDEMPOTENT_KEYED' | 'NON_REPLAYABLE';

export interface ConnectionAttempt<T> {
    readonly signal: AbortSignal;
    readonly generation: number;
    readonly reconnecting: boolean;
    authenticate(): Promise<void>;
    connect(): Promise<T>;
    recover(value: T): Promise<void>;
}

export interface ConnectionSlotSnapshot {
    readonly kind: ConnectionKind;
    readonly generation: number;
    readonly state: ConnectionState;
    readonly attempt: number;
}

type SlotListener = (snapshot: ConnectionSlotSnapshot) => void;

/** Owns one logical connection. Every replacement invalidates all work from the prior generation. */
export class ConnectionSlot<T> {
    private generation = 0;
    private state: ConnectionState = 'DISCONNECTED';
    private attempt = 0;
    private controller: AbortController | null = null;
    private pending: Promise<T> | null = null;
    private value: T | null = null;
    private readonly listeners = new Set<SlotListener>();
    private disposer: ((value: T) => void) | null = null;

    public constructor(public readonly kind: ConnectionKind) {}

    public snapshot(): ConnectionSlotSnapshot {
        return Object.freeze({ kind: this.kind, generation: this.generation, state: this.state, attempt: this.attempt });
    }

    public current(): T | null { return this.state === 'READY' ? this.value : null; }

    /** Candidate transport is visible only to the coordinator-owned recovery phase. */
    public candidate(generation: number): T | null {
        return generation === this.generation && this.state === 'RECOVERING' ? this.value : null;
    }

    public setDisposer(disposer: (value: T) => void): void { this.disposer = disposer; }

    public adopt(value: T): void {
        if (this.pending) throw new Error('CONNECTION_ATTEMPT_IN_PROGRESS');
        const previous = this.value;
        this.controller?.abort();
        this.controller = new AbortController();
        this.generation += 1;
        this.value = value;
        this.attempt = 0;
        if (previous && previous !== value) this.disposer?.(previous);
        this.transition('READY');
    }

    public onState(listener: SlotListener): () => void {
        this.listeners.add(listener);
        listener(this.snapshot());
        return () => this.listeners.delete(listener);
    }

    public establish(factory: (context: { signal: AbortSignal; generation: number; reconnecting: boolean }) => ConnectionAttempt<T>,
        reconnecting = false): Promise<T> {
        if (this.pending) return this.pending;
        const previous = this.value;
        this.value = null;
        if (previous) this.disposer?.(previous);
        const generation = ++this.generation;
        this.controller?.abort();
        const controller = new AbortController();
        this.controller = controller;
        this.attempt = reconnecting ? this.attempt + 1 : 1;
        this.transition(reconnecting ? 'RECONNECTING' : 'AUTHENTICATING');
        const context = { signal: controller.signal, generation, reconnecting };
        const attempt = factory(context);
        const run = this.run(attempt, generation, controller);
        this.pending = run;
        void run.then(() => this.clearPending(run), () => this.clearPending(run));
        return run;
    }

    public disconnect(state: 'DISCONNECTED' | 'LOGGED_OUT' | 'TERMINAL' = 'DISCONNECTED'): void {
        this.generation += 1;
        this.controller?.abort();
        this.controller = null;
        this.pending = null;
        const value = this.value;
        this.value = null;
        if (value) this.disposer?.(value);
        this.attempt = 0;
        this.transition(state);
    }

    public assertGeneration(generation: number): void {
        if (generation !== this.generation || this.controller?.signal.aborted) throw new Error('CONNECTION_GENERATION_CANCELLED');
    }

    private async run(attempt: ConnectionAttempt<T>, generation: number, controller: AbortController): Promise<T> {
        try {
            await attempt.authenticate();
            this.assertGeneration(generation);
            this.transition('CONNECTING');
            const value = await attempt.connect();
            this.assertGeneration(generation);
            this.transition('CONNECTED');
            this.value = value;
            this.transition('RECOVERING');
            await attempt.recover(value);
            this.assertGeneration(generation);
            this.attempt = 0;
            this.transition('READY');
            return value;
        } catch (error: unknown) {
            if (generation === this.generation) {
                const failed = this.value;
                this.value = null;
                if (failed) this.disposer?.(failed);
                if (!controller.signal.aborted) this.transition('DISCONNECTED');
            }
            throw error;
        }
    }

    private clearPending(pending: Promise<T>): void { if (this.pending === pending) this.pending = null; }

    private transition(state: ConnectionState): void {
        this.state = state;
        const snapshot = this.snapshot();
        for (const listener of this.listeners) listener(snapshot);
    }
}

/** The only owner allowed to schedule Hall or Game reconnection attempts. */
export class ReconnectCoordinator<H, G> {
    public readonly hall = new ConnectionSlot<H>('HALL');
    public readonly game = new ConnectionSlot<G>('GAME');
    private readonly retryControllers = new Map<ConnectionKind, AbortController>();
    private ticketRefresh: Promise<string> | null = null;

    public singleFlightTicket(refresh: () => Promise<string>): Promise<string> {
        if (this.ticketRefresh) return this.ticketRefresh;
        const pending = refresh();
        this.ticketRefresh = pending;
        void pending.then(() => this.clearTicket(pending), () => this.clearTicket(pending));
        return pending;
    }

    public async retry<T>(slot: ConnectionSlot<T>, connect: (reconnecting: boolean) => Promise<T>, maxAttempts = 8): Promise<T> {
        this.cancelRetry(slot.kind);
        const controller = new AbortController();
        this.retryControllers.set(slot.kind, controller);
        let lastError: unknown = new Error('CONNECTION_RETRY_EXHAUSTED');
        try {
            for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
                if (controller.signal.aborted) throw new Error('CONNECTION_RETRY_CANCELLED');
                if (attempt > 0) await this.delay(this.backoff(attempt), controller.signal);
                try { return await connect(attempt > 0); }
                catch (error: unknown) {
                    if (controller.signal.aborted) throw new Error('CONNECTION_RETRY_CANCELLED');
                    lastError = error;
                }
            }
            if (this.retryControllers.get(slot.kind) === controller) slot.disconnect('TERMINAL');
            throw lastError;
        } finally {
            if (this.retryControllers.get(slot.kind) === controller) this.retryControllers.delete(slot.kind);
        }
    }

    public logout(): void {
        this.cancelRetry('HALL');
        this.cancelRetry('GAME');
        this.ticketRefresh = null;
        this.game.disconnect('LOGGED_OUT');
        this.hall.disconnect('LOGGED_OUT');
    }

    public cancelHall(state: 'DISCONNECTED' | 'LOGGED_OUT' | 'TERMINAL' = 'DISCONNECTED'): void {
        this.cancelRetry('HALL');
        this.hall.disconnect(state);
    }

    public cancelGame(state: 'DISCONNECTED' | 'LOGGED_OUT' | 'TERMINAL' = 'DISCONNECTED'): void {
        this.cancelRetry('GAME');
        this.game.disconnect(state);
    }

    public requireReplayKey(policy: RequestReplayPolicy, idempotencyKey?: string): void {
        if (policy === 'IDEMPOTENT_KEYED' && !idempotencyKey?.trim()) throw new Error('IDEMPOTENCY_KEY_REQUIRED');
        if (policy === 'NON_REPLAYABLE') throw new Error('REQUEST_INTERRUPTED_NOT_REPLAYABLE');
    }

    private clearTicket(pending: Promise<string>): void { if (this.ticketRefresh === pending) this.ticketRefresh = null; }

    private cancelRetry(kind: ConnectionKind): void {
        this.retryControllers.get(kind)?.abort();
        this.retryControllers.delete(kind);
    }

    private backoff(attempt: number): number {
        const base = Math.min(8_000, 500 * (2 ** Math.max(0, attempt - 1)));
        return base + Math.floor(Math.random() * Math.max(1, Math.floor(base * 0.25)));
    }

    private delay(milliseconds: number, signal: AbortSignal): Promise<void> {
        return new Promise((resolve, reject) => {
            const timer = globalThis.setTimeout(done, milliseconds);
            const abort = () => { globalThis.clearTimeout(timer); signal.removeEventListener('abort', abort); reject(new Error('CONNECTION_RETRY_CANCELLED')); };
            function done(): void { signal.removeEventListener('abort', abort); resolve(); }
            signal.addEventListener('abort', abort, { once: true });
        });
    }
}
