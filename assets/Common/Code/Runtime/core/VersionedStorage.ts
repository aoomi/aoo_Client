import { KeyValueStorage } from './Storage';

export interface StoredEnvelope<T> {
    readonly version: number;
    readonly expiresAt?: number;
    readonly value: T;
}

export interface StorageMigration<T> {
    readonly from: number;
    readonly migrate: (value: unknown) => T;
}

const SENSITIVE_KEY = /(token|secret|password|credential|authorization|cookie)/i;

/** Namespaced, expiring storage which fails closed when browser storage is unavailable. */
export class VersionedStorage {
    public constructor(
        private readonly storage: KeyValueStorage,
        private readonly namespace: string,
        private readonly version: number,
        private readonly now: () => number = Date.now,
    ) {
        if (!namespace || version < 1) throw new Error('invalid storage schema');
    }

    public read<T>(key: string, migrations: readonly StorageMigration<T>[] = []): T | undefined {
        const raw = this.safeGet(this.fullKey(key));
        if (!raw) return undefined;
        try {
            const envelope = JSON.parse(raw) as StoredEnvelope<unknown>;
            if (envelope.expiresAt !== undefined && envelope.expiresAt <= this.now()) {
                this.remove(key);
                return undefined;
            }
            if (envelope.version === this.version) return envelope.value as T;
            const migration = migrations.find(item => item.from === envelope.version);
            if (!migration) {
                this.remove(key);
                return undefined;
            }
            const value = migration.migrate(envelope.value);
            this.write(key, value);
            return value;
        } catch {
            this.remove(key);
            return undefined;
        }
    }

    public write<T>(key: string, value: T, ttlMs?: number): boolean {
        if (SENSITIVE_KEY.test(key)) throw new Error(`sensitive storage key rejected: ${key}`);
        if (ttlMs !== undefined && !Number.isFinite(ttlMs)) throw new Error('invalid storage ttl');
        const envelope: StoredEnvelope<T> = {
            version: this.version,
            expiresAt: ttlMs === undefined ? undefined : this.now() + Math.max(0, ttlMs),
            value,
        };
        try {
            this.storage.set(this.fullKey(key), JSON.stringify(envelope));
            return true;
        } catch {
            return false;
        }
    }

    public remove(key: string): void {
        try { this.storage.remove(this.fullKey(key)); } catch { /* unavailable/private storage */ }
    }

    private fullKey(key: string): string {
        if (!/^[a-z][a-z0-9_.-]*$/i.test(key)) throw new Error('invalid storage key');
        return `${this.namespace}:v${this.version}:${key}`;
    }

    private safeGet(key: string): string | null {
        try { return this.storage.get(key); } catch { return null; }
    }
}
