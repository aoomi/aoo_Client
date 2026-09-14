export type Cleanup = () => void;

/** Owns callbacks created by a screen/popup and makes teardown idempotent. */
export class LifecycleScope {
    private generation = 0;
    private active = false;
    private readonly cleanups = new Set<Cleanup>();

    public open(): number {
        this.close();
        this.active = true;
        return ++this.generation;
    }

    public isAlive(generation = this.generation): boolean {
        return this.active && generation === this.generation;
    }

    public own(cleanup: Cleanup): Cleanup {
        if (!this.active) throw new Error('lifecycle scope is not active');
        this.cleanups.add(cleanup);
        return () => {
            if (this.cleanups.delete(cleanup)) cleanup();
        };
    }

    public guard<T extends unknown[]>(callback: (...args: T) => void): (...args: T) => void {
        const generation = this.generation;
        return (...args: T) => {
            if (this.isAlive(generation)) callback(...args);
        };
    }

    public close(): void {
        this.active = false;
        const pending = [...this.cleanups].reverse();
        this.cleanups.clear();
        const errors: unknown[] = [];
        for (const cleanup of pending) {
            try {
                cleanup();
            } catch (error: unknown) {
                errors.push(error);
            }
        }
        if (errors.length > 0) throw new AggregateError(errors, 'lifecycle cleanup failed');
    }
}

export class SingleFlight {
    private readonly running = new Set<string>();

    public async run<T>(key: string, operation: () => Promise<T>): Promise<T> {
        if (this.running.has(key)) throw new Error(`operation already running: ${key}`);
        this.running.add(key);
        try {
            return await operation();
        } finally {
            this.running.delete(key);
        }
    }

    public isRunning(key: string): boolean {
        return this.running.has(key);
    }
}

export interface PoolableView<T> {
    reset(value: T): void;
    release(): void;
    destroy?(): void;
}

export class ResettablePool<T, V extends PoolableView<T>> {
    private readonly available: V[] = [];
    private readonly leased = new Set<V>();

    public constructor(private readonly factory: () => V, private readonly capacity = 32) {
        if (!Number.isSafeInteger(capacity) || capacity < 0) throw new Error('pool capacity must be a non-negative integer');
    }

    public acquire(value: T): V {
        const view = this.available.pop() ?? this.factory();
        view.reset(value);
        this.leased.add(view);
        return view;
    }

    public release(view: V): void {
        if (!this.leased.delete(view)) return;
        view.release();
        if (this.available.length < this.capacity) this.available.push(view);
        else view.destroy?.();
    }

    public releaseAll(): void {
        for (const view of [...this.leased]) this.release(view);
    }

    public clear(): void {
        for (const view of [...this.leased]) {
            this.leased.delete(view);
            view.release();
            view.destroy?.();
        }
        for (const view of this.available.splice(0)) view.destroy?.();
    }
}
