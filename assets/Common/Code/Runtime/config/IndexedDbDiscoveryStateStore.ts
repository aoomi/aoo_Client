import type { DiscoveryState } from './TrustedConfigurationDiscovery';

/** Native per-origin durable CAS for verified discovery state; never a business cache.
 * The issuer namespace and IDBFactory must be explicitly supplied by approved startup code.
 * Browser data deletion/origin migration is outside this local persistence guarantee.
 */
export class IndexedDbDiscoveryStateStore {
    public static readonly databaseName = 'aoo-trust-discovery-v1';
    private readonly objectStore = 'states';
    private connection?: IDBDatabase;
    private opening?: Promise<IDBDatabase>;
    private closed = false;

    public constructor(
        private readonly factory: IDBFactory,
        private readonly issuerNamespace: string,
        private readonly timeoutMs = 5000,
    ) {
        if (!factory || typeof factory.open !== 'function' || !/^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,127}$/.test(issuerNamespace)
            || !Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 30000) {
            throw new Error('DISCOVERY_STATE_STORE_CONFIGURATION_REJECTED');
        }
    }

    public async read(): Promise<DiscoveryState | undefined> {
        const database = await this.open();
        return this.transaction<DiscoveryState | undefined>(database, 'readonly', (store, _transaction, finish) => {
            const request = store.get(this.issuerNamespace);
            request.onsuccess = () => {
                try { finish(request.result === undefined ? undefined : this.snapshot(request.result)); }
                catch (error) { finish(undefined, error); }
            };
        });
    }

    public async compareAndSwap(expectedRevision: number | undefined, next: DiscoveryState): Promise<boolean> {
        if (expectedRevision !== undefined && (!Number.isSafeInteger(expectedRevision) || expectedRevision < 1)) {
            throw new Error('DISCOVERY_STATE_REVISION_REJECTED');
        }
        // Snapshot before the first await so caller mutation cannot alter a pending write.
        const candidate = this.snapshot(next);
        const database = await this.open();
        return this.transaction<boolean>(database, 'readwrite', (store, _transaction, finish) => {
            const read = store.get(this.issuerNamespace);
            read.onsuccess = () => {
                try {
                    const current = read.result === undefined ? undefined : this.snapshot(read.result);
                    if (current?.revision !== expectedRevision) { finish(false); return; }
                    this.monotonic(current, candidate);
                    store.put(candidate, this.issuerNamespace);
                    finish(true);
                } catch (error) { finish(false, error); }
            };
        });
    }

    /** Terminal disposal. Reopen with a new adapter; trust state is never removed. */
    public close(): void {
        this.closed = true;
        this.connection?.close();
        this.connection = undefined;
    }

    private open(): Promise<IDBDatabase> {
        if (this.closed) return Promise.reject(new Error('DISCOVERY_STATE_STORE_CLOSED'));
        if (this.connection) return Promise.resolve(this.connection);
        if (this.opening) return this.opening;
        this.opening = new Promise<IDBDatabase>((resolve, reject) => {
            let settled = false;
            let request: IDBOpenDBRequest;
            const timer = setTimeout(() => finish(undefined, new Error('DISCOVERY_STATE_OPEN_TIMEOUT')), this.timeoutMs);
            const finish = (database?: IDBDatabase, error?: unknown) => {
                if (settled) { database?.close(); return; }
                settled = true; clearTimeout(timer);
                if (error !== undefined || !database || this.closed) {
                    database?.close(); reject(error ?? new Error('DISCOVERY_STATE_STORE_CLOSED')); return;
                }
                database.onversionchange = () => this.close();
                this.connection = database;
                resolve(database);
            };
            try {
                request = this.factory.open(IndexedDbDiscoveryStateStore.databaseName, 1);
                request.onupgradeneeded = () => {
                    try {
                        if (settled || this.closed) { request.transaction?.abort(); return; }
                        if (!request.result.objectStoreNames.contains(this.objectStore)) request.result.createObjectStore(this.objectStore);
                    } catch { request.transaction?.abort(); }
                };
                request.onsuccess = () => finish(request.result);
                request.onerror = () => finish(undefined, new Error('DISCOVERY_STATE_OPEN_FAILED'));
                request.onblocked = () => finish(undefined, new Error('DISCOVERY_STATE_OPEN_BLOCKED'));
            } catch (error) { finish(undefined, error); }
        }).finally(() => { this.opening = undefined; });
        return this.opening;
    }

    private transaction<T>(database: IDBDatabase, mode: IDBTransactionMode,
        work: (store: IDBObjectStore, transaction: IDBTransaction, finish: (value: T, error?: unknown) => void) => void,
    ): Promise<T> {
        return new Promise<T>((resolve, reject) => {
            let transaction: IDBTransaction;
            let result: T; let hasResult = false; let failure: unknown; let settled = false;
            const complete = (error?: unknown) => {
                if (settled) return;
                settled = true; clearTimeout(timer);
                if (error !== undefined || !hasResult) reject(error ?? new Error('DISCOVERY_STATE_TRANSACTION_FAILED'));
                else resolve(result);
            };
            const timer = setTimeout(() => {
                failure = new Error('DISCOVERY_STATE_TRANSACTION_TIMEOUT');
                try { transaction?.abort(); } catch { /* no active transaction */ }
                complete(failure);
            }, this.timeoutMs);
            try {
                transaction = database.transaction(this.objectStore, mode);
                transaction.oncomplete = () => complete(failure);
                transaction.onabort = () => complete(failure ?? new Error('DISCOVERY_STATE_TRANSACTION_ABORTED'));
                transaction.onerror = () => { failure = new Error('DISCOVERY_STATE_TRANSACTION_FAILED'); };
                work(transaction.objectStore(this.objectStore), transaction, (value, error) => {
                    result = value; hasResult = true;
                    if (error !== undefined) {
                        failure = error;
                        try { transaction.abort(); } catch { complete(failure); }
                    }
                });
            } catch (error) { complete(error); }
        });
    }

    private snapshot(raw: unknown): DiscoveryState {
        if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('DISCOVERY_STATE_CORRUPT');
        const state = raw as DiscoveryState;
        const fields = ['revision','highestConfigVersion','trustVersion','keys','revokedKeyIds'];
        if (state.acceptedEnvelope !== undefined) fields.push('acceptedEnvelope');
        if (Object.keys(state).sort().join('|') !== fields.sort().join('|')
            || !Number.isSafeInteger(state.revision) || state.revision < 1
            || !Number.isSafeInteger(state.highestConfigVersion) || state.highestConfigVersion < 0
            || !Number.isSafeInteger(state.trustVersion) || state.trustVersion < 0
            || !Array.isArray(state.keys) || state.keys.length < 1 || state.keys.length > 64
            || !Array.isArray(state.revokedKeyIds) || state.revokedKeyIds.length > 64
            || state.revokedKeyIds.some(id => typeof id !== 'string' || !id || id.length > 2048)
            || new Set(state.revokedKeyIds).size !== state.revokedKeyIds.length
            || state.keys.some(key => !this.validKey(key) || state.revokedKeyIds.includes(key.keyId))
            || new Set(state.keys.map(key => key.keyId)).size !== state.keys.length
            || (state.acceptedEnvelope !== undefined && (typeof state.acceptedEnvelope !== 'string' || !state.acceptedEnvelope
                || state.acceptedEnvelope.length > 1048576))
            || (state.highestConfigVersion > 0 && state.acceptedEnvelope === undefined)) {
            throw new Error('DISCOVERY_STATE_CORRUPT');
        }
        if (state.acceptedEnvelope !== undefined) {
            this.cacheIdentity(state.acceptedEnvelope);
            if (JSON.parse(state.acceptedEnvelope).payload.version !== state.highestConfigVersion) throw new Error('DISCOVERY_STATE_CACHE_CORRUPT');
        }
        return JSON.parse(JSON.stringify(state)) as DiscoveryState;
    }

    private validKey(key: DiscoveryState['keys'][number]): boolean {
        if (!key || typeof key !== 'object' || Object.keys(key).sort().join('|') !== 'expiresAt|issuer|keyId|notBefore|publicKey|purposes'
            || typeof key.keyId !== 'string' || !key.keyId || key.keyId.length > 2048
            || typeof key.issuer !== 'string' || !key.issuer || key.issuer.length > 2048
            || !Array.isArray(key.purposes) || !key.purposes.length || key.purposes.length > 2
            || new Set(key.purposes).size !== key.purposes.length
            || key.purposes.some(p => p !== 'aoo-runtime-discovery' && p !== 'aoo-discovery-trust')
            || !Number.isSafeInteger(key.notBefore) || key.notBefore < 0
            || !Number.isSafeInteger(key.expiresAt) || key.expiresAt <= key.notBefore
            || !key.publicKey || Object.keys(key.publicKey).sort().join('|') !== 'crv|kty|x|y'
            || key.publicKey.kty !== 'EC' || key.publicKey.crv !== 'P-256'
            || !/^[A-Za-z0-9_-]{43}$/.test(key.publicKey.x ?? '') || !/^[A-Za-z0-9_-]{43}$/.test(key.publicKey.y ?? '')) return false;
        return true;
    }

    private monotonic(current: DiscoveryState | undefined, next: DiscoveryState): void {
        if (next.revision !== (current?.revision ?? 0) + 1
            || (current && (next.highestConfigVersion < current.highestConfigVersion || next.trustVersion < current.trustVersion
                || current.revokedKeyIds.some(id => !next.revokedKeyIds.includes(id))
                || (next.trustVersion === current.trustVersion
                    && (JSON.stringify(next.keys) !== JSON.stringify(current.keys)
                        || JSON.stringify([...next.revokedKeyIds].sort()) !== JSON.stringify([...current.revokedKeyIds].sort())))
                || (next.highestConfigVersion === current.highestConfigVersion
                    && this.cacheIdentity(next.acceptedEnvelope) !== this.cacheIdentity(current.acceptedEnvelope))))) {
            throw new Error('DISCOVERY_STATE_MONOTONICITY_REJECTED');
        }
    }

    private cacheIdentity(raw: string | undefined): string | undefined {
        if (raw === undefined) return undefined;
        try {
            const value = JSON.parse(raw);
            if (!value || value.schemaVersion !== 1 || typeof value.keyId !== 'string' || !value.keyId
                || typeof value.signature !== 'string' || !value.signature || !value.payload || typeof value.payload !== 'object') {
                throw new Error();
            }
            // Accepted resolver supplies canonical envelope bytes; signature nonce variation
            // does not change the signed identity at a fixed configuration version.
            return JSON.stringify({schemaVersion:value.schemaVersion,keyId:value.keyId,payload:value.payload});
        } catch { throw new Error('DISCOVERY_STATE_CACHE_CORRUPT'); }
    }
}
