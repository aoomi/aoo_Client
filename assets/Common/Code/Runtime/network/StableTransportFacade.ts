import { ConnectionSlot, type RequestReplayPolicy } from './ReconnectCoordinator';
import { resolveRequestPolicy } from './RequestReplayPolicy';

export interface ProtocolTransport {
    request<T>(msgId: string, body: unknown, timeoutMs?: number): Promise<T>;
    notify(msgId: string, body: unknown): void;
    on(event: string, listener: (body: unknown) => void): () => void;
    onActivity(listener: () => void): () => void;
    onClose(listener: (event: CloseEvent) => void): () => void;
    isConnected(): boolean;
    connect(url: string, timeoutMs?: number): Promise<void>;
    close(): void;
    setWsTicket(ticket: string): void;
    updateReconnectEndpoint(url: string): void;
    bindRoomAuthority(roomId: number | string, playVersion: string): void;
    confirmSessionReplacement(source: string, reasonCode?: string): void;
}

export interface TransportRequestOptions {
    readonly policy: RequestReplayPolicy;
    readonly idempotencyKey?: string;
    readonly timeoutMs?: number;
}

interface Subscription {
    readonly event: string;
    readonly listener: (body: unknown) => void;
    dispose: (() => void) | null;
    generation: number;
}

/** A stable business-facing reference which follows the active slot generation. */
export class StableTransportFacade<T extends ProtocolTransport> {
    private readonly subscriptions = new Set<Subscription>();
    private readonly activityListeners = new Set<() => void>();
    private readonly reconnectListeners = new Set<() => void | Promise<void>>();
    private recoveryGeneration = -1;
    private readonly closeListeners = new Set<(event: CloseEvent) => void>();
    private activityDisposer: (() => void) | null = null;
    private activityGeneration = -1;
    private closeDisposer: (() => void) | null = null;
    private closeGeneration = -1;
    private readonly stateDisposer: () => void;

    public constructor(private readonly slot: ConnectionSlot<T>) {
        this.stateDisposer = slot.onState((snapshot) => {
            if (snapshot.state === 'READY') this.bind(snapshot.generation);
            else this.unbind();
        });
    }

    public isConnected(): boolean { return this.slot.current()?.isConnected() === true; }

    public async connect(url: string, timeoutMs?: number): Promise<void> {
        const client = this.requireClient();
        await client.connect(url, timeoutMs);
        this.unbind();
        this.bind(this.slot.snapshot().generation);
    }

    public close(): void {
        // Hall lifetime belongs to NetworkRuntime, never to a lobby form or game switcher.
        if (this.slot.kind === 'HALL') return;
        this.slot.disconnect();
    }

    public setWsTicket(ticket: string): void { this.requireClient().setWsTicket(ticket); }

    public updateReconnectEndpoint(url: string): void { this.requireClient().updateReconnectEndpoint(url); }

    public bindRoomAuthority(roomId: number | string, playVersion: string): void {
        this.requireClient().bindRoomAuthority(roomId, playVersion);
    }

    public confirmSessionReplacement(source: string, reasonCode?: string): void {
        this.requireClient().confirmSessionReplacement(source, reasonCode);
    }

    public request<TResponse>(msgId: string, body: unknown, timeoutMs = 8000): Promise<TResponse> {
        return this.requestWithPolicy<TResponse>(msgId, body, { ...resolveRequestPolicy(msgId, body), timeoutMs });
    }

    public async requestWithPolicy<TResponse>(msgId: string, body: unknown,
        options: TransportRequestOptions): Promise<TResponse> {
        return this.dispatchWithPolicy<TResponse>(msgId, body, options, false);
    }

    private async dispatchWithPolicy<TResponse>(msgId: string, body: unknown,
        options: TransportRequestOptions, replayed: boolean): Promise<TResponse> {
        if (options.policy === 'IDEMPOTENT_KEYED' && !options.idempotencyKey?.trim()) {
            throw new Error('IDEMPOTENCY_KEY_REQUIRED');
        }
        let client = this.activeClient();
        if (!client && options.policy !== 'NON_REPLAYABLE' && !replayed) {
            await this.waitUntilReady(options.timeoutMs ?? 8000);
            client = this.activeClient();
        }
        if (!client) throw new Error(options.policy === 'NON_REPLAYABLE'
            ? 'REQUEST_INTERRUPTED_NOT_REPLAYABLE' : 'CONNECTION_NOT_READY');
        const snapshot = this.slot.snapshot();
        const requestBody = options.policy === 'IDEMPOTENT_KEYED' && body && typeof body === 'object'
            ? { ...(body as Record<string, unknown>), idempotencyKey: options.idempotencyKey }
            : body;
        try {
            const response = await client.request<TResponse>(msgId, requestBody, options.timeoutMs ?? 8000);
            this.slot.assertGeneration(snapshot.generation);
            return response;
        } catch (error) {
            const changed = this.slot.snapshot().generation !== snapshot.generation;
            if (!replayed && changed && options.policy !== 'NON_REPLAYABLE') {
                await this.waitUntilReady(options.timeoutMs ?? 8000);
                return this.dispatchWithPolicy<TResponse>(msgId, body, options, true);
            }
            if (changed && options.policy === 'NON_REPLAYABLE') throw new Error('REQUEST_INTERRUPTED_NOT_REPLAYABLE');
            throw error;
        }
    }

    public notify(msgId: string, body: unknown): void {
        const client = this.slot.current();
        if (!client) throw new Error('REQUEST_INTERRUPTED_NOT_REPLAYABLE');
        client.notify(msgId, body);
    }

    public on(event: string, listener: (body: unknown) => void): () => void {
        const subscription: Subscription = { event, listener, dispose: null, generation: -1 };
        this.subscriptions.add(subscription);
        this.bindSubscription(subscription, this.slot.snapshot().generation);
        return () => {
            subscription.dispose?.();
            subscription.dispose = null;
            this.subscriptions.delete(subscription);
        };
    }

    public onActivity(listener: () => void): () => void {
        this.activityListeners.add(listener);
        this.bind(this.slot.snapshot().generation);
        return () => this.activityListeners.delete(listener);
    }

    public onReconnect(listener: () => void | Promise<void>): () => void {
        this.reconnectListeners.add(listener);
        return () => this.reconnectListeners.delete(listener);
    }

    /** Invoked only by ConnectionOwnership while the candidate generation is RECOVERING. */
    public async recoverGeneration(generation: number): Promise<void> {
        if (!this.slot.candidate(generation)) throw new Error('CONNECTION_GENERATION_CANCELLED');
        this.recoveryGeneration = generation;
        try {
            for (const listener of this.reconnectListeners) await listener();
            this.slot.assertGeneration(generation);
        } finally {
            if (this.recoveryGeneration === generation) this.recoveryGeneration = -1;
        }
    }

    public onClose(listener: (event: CloseEvent) => void): () => void {
        this.closeListeners.add(listener);
        this.bind(this.slot.snapshot().generation);
        return () => this.closeListeners.delete(listener);
    }

    public dispose(): void {
        this.stateDisposer();
        this.unbind();
        this.subscriptions.clear();
        this.activityListeners.clear();
        this.reconnectListeners.clear();
        this.closeListeners.clear();
    }

    private bind(generation: number): void {
        for (const subscription of this.subscriptions) this.bindSubscription(subscription, generation);
        const client = this.slot.current();
        if (!client) return;
        if (this.activityGeneration !== generation) {
            this.activityDisposer?.();
            this.activityGeneration = generation;
            this.activityDisposer = client.onActivity(() => {
                if (this.slot.snapshot().generation !== generation) return;
                for (const listener of this.activityListeners) listener();
            });
        }
        if (this.closeGeneration !== generation) {
            this.closeDisposer?.();
            this.closeGeneration = generation;
            this.closeDisposer = client.onClose((event) => {
                if (this.slot.snapshot().generation !== generation) return;
                for (const listener of this.closeListeners) listener(event);
            });
        }
    }

    private bindSubscription(subscription: Subscription, generation: number): void {
        const client = this.slot.current();
        if (!client || subscription.generation === generation) return;
        subscription.dispose?.();
        subscription.generation = generation;
        subscription.dispose = client.on(subscription.event, (body) => {
            if (this.slot.snapshot().generation === generation) subscription.listener(body);
        });
    }

    private unbind(): void {
        this.activityDisposer?.();
        this.activityDisposer = null;
        this.activityGeneration = -1;
        this.closeDisposer?.();
        this.closeDisposer = null;
        this.closeGeneration = -1;
        for (const subscription of this.subscriptions) {
            subscription.dispose?.();
            subscription.dispose = null;
            subscription.generation = -1;
        }
    }

    private requireClient(): T {
        const client = this.activeClient();
        if (!client) throw new Error('CONNECTION_NOT_READY');
        return client;
    }

    private activeClient(): T | null {
        return this.slot.current() ?? (this.recoveryGeneration >= 0
            ? this.slot.candidate(this.recoveryGeneration) : null);
    }

    private waitUntilReady(timeoutMs: number): Promise<void> {
        if (this.slot.current()) return Promise.resolve();
        return new Promise((resolve, reject) => {
            let settled = false;
            const timer = globalThis.setTimeout(() => done(new Error('CONNECTION_NOT_READY')), timeoutMs);
            let dispose: () => void = () => undefined;
            dispose = this.slot.onState((snapshot) => {
                if (snapshot.state === 'READY') void Promise.resolve().then(() => done());
                else if (snapshot.state === 'TERMINAL' || snapshot.state === 'LOGGED_OUT') {
                    void Promise.resolve().then(() => done(new Error('CONNECTION_NOT_READY')));
                }
            });
            function done(error?: Error): void {
                if (settled) return;
                settled = true;
                globalThis.clearTimeout(timer);
                dispose();
                if (error) reject(error);
                else resolve();
            }
        });
    }
}
