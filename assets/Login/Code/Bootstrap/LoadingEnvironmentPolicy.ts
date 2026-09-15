import type { RuntimePublicConfig } from '../../../Common/Code/Runtime/config/RuntimeEndpoints';
import { gatewayOrigin, testPreviewGatewayOrigin } from '../../../Common/Code/Runtime/network/GatewayEntryPolicy';

export interface LoadingEnvironmentStorage {
    readonly length: number;
    key(index: number): string | null;
    getItem?(key: string): string | null;
    setItem?(key: string, value: string): void;
    removeItem(key: string): void;
}

export interface LoadingIndexedDatabaseInfo {
    readonly name?: string;
}

export interface LoadingIndexedDatabaseFactory {
    databases?: () => Promise<readonly LoadingIndexedDatabaseInfo[]>;
    deleteDatabase(name: string): unknown;
}

export interface LoadingCacheStorage {
    keys(): Promise<string[]>;
    delete(name: string): Promise<boolean>;
}

export interface LoadingEnvironmentPlatform {
    location?: Pick<Location, 'protocol' | 'hostname' | 'port'>;
    localStorage?: LoadingEnvironmentStorage;
    sessionStorage?: LoadingEnvironmentStorage;
    indexedDB?: LoadingIndexedDatabaseFactory;
    cacheStorage?: LoadingCacheStorage;
    cleanupTimeoutMs?: number;
    bootState?: AooLoadingBootState;
}

export interface LoadingEnvironmentSelection {
    isTestEnvironment: boolean;
    isClearLocalData: boolean;
    gatewayAddresses: readonly string[];
}

export interface AooLocalDataCleanupResult {
    attempted: boolean;
    removedLocalStorageKeys: number;
    removedSessionStorageKeys: number;
    deletedIndexedDatabases: number;
    deletedCacheStores: number;
    failures: readonly string[];
}

export interface AppliedLoadingEnvironment {
    runtimeConfig: RuntimePublicConfig;
    environment: 'test' | 'production';
    selectedGateway: string | null;
    bootId: string;
    cleanupRanThisCall: boolean;
    autoRestoreBlocked: boolean;
    interactiveLoginAllowed: true;
    cleanup: AooLocalDataCleanupResult;
}

const AOO_LOCAL_STORAGE_EXACT_KEYS = new Set([
    'Account',
    'SysSetting',
    'DebugInfo',
    'myLocation',
    'myCityID',
    'ClubNewBg',
    'ClubNewTb',
    'ClubNewCuntom',
    'gatewayconfig',
    'bundle_script',
    'url_gateway',
    'dd_isdebug',
]);

const AOO_PRESERVED_LOCAL_STORAGE_KEYS = new Set([
    'aoo.deviceId',
]);

const AOO_LOCAL_STORAGE_PREFIXES = [
    'aoo.',
    'aoo:',
    'settings.',
    'legacy_last_club_',
    'mywanfa_',
    'password_',
] as const;

const KNOWN_AOO_INDEXED_DATABASES = [
    'aoo-client-data',
    'aoo-auth',
    'aoo-session',
    'aoo-room-state',
    'aoo-gameplay-cache',
    'aoo-region-cache',
    'aoo-template-cache',
    'aoo-download-cache',
    'aoo-media-cache',
    'aoo-hot-update-temp',
    'aoo-request-cache',
] as const;

const EMPTY_CLEANUP: AooLocalDataCleanupResult = Object.freeze({
    attempted: false,
    removedLocalStorageKeys: 0,
    removedSessionStorageKeys: 0,
    deletedIndexedDatabases: 0,
    deletedCacheStores: 0,
    failures: Object.freeze([]) as readonly string[],
});

const bootStateKey = Symbol.for('aoo.loading.environment.boot-state');
type LoadingBootRegistry = typeof globalThis & { [bootStateKey]?: AooLoadingBootState };

/**
 * One JavaScript application lifetime owns one boot state. Scene transitions,
 * component re-enables and retry callbacks share it; a full reload creates a
 * new global object and therefore a new bootId.
 */
export class AooLoadingBootState {
    public readonly bootId: string;
    private clearRequested = false;
    private cleanupPromise: Promise<AooLocalDataCleanupResult> | null = null;
    private authResetClaimed = false;
    private launchSelection: LoadingEnvironmentSelection | null = null;

    public constructor(bootId = createBootId()) {
        this.bootId = bootId;
    }

    public async clearOnce(
        requested: boolean,
        platform: LoadingEnvironmentPlatform,
    ): Promise<{ cleanup: AooLocalDataCleanupResult; ranThisCall: boolean }> {
        if (!requested) {
            return { cleanup: EMPTY_CLEANUP, ranThisCall: false };
        }
        this.clearRequested = true;
        const ranThisCall = this.cleanupPromise === null;
        if (!this.cleanupPromise) this.cleanupPromise = clearAooLocalData(platform);
        const cleanup = await this.cleanupPromise;
        return { cleanup, ranThisCall };
    }

    public shouldBlockAutomaticRestore(): boolean {
        return this.clearRequested;
    }

    /** Claims the in-memory stale-session reset exactly once in this boot. */
    public claimAutomaticRestoreReset(): boolean {
        if (!this.clearRequested || this.authResetClaimed) return false;
        this.authResetClaimed = true;
        return true;
    }

    /**
     * The editor-owned launch settings live only on BootStrap.  Components in
     * subsequent scenes must reuse that immutable decision instead of reading
     * their own serialized defaults (which can otherwise differ by scene).
     */
    public resolveLaunchSelection(
        isBootScene: boolean,
        selection: LoadingEnvironmentSelection,
    ): LoadingEnvironmentSelection | null {
        if (isBootScene) {
            this.launchSelection = Object.freeze({
                isTestEnvironment: selection.isTestEnvironment === true,
                isClearLocalData: selection.isClearLocalData === true,
                gatewayAddresses: Object.freeze([...selection.gatewayAddresses]),
            });
        }
        return this.launchSelection;
    }
}

export function currentAooLoadingBootState(): AooLoadingBootState {
    const registry = globalThis as LoadingBootRegistry;
    if (!registry[bootStateKey]) registry[bootStateKey] = new AooLoadingBootState();
    return registry[bootStateKey];
}

/**
 * Applies the three editor-owned loading options before RuntimeEndpoints and
 * automatic authentication are resolved. A requested reset always forces an
 * interactive login, including when a browser storage operation fails.
 */
export async function applyLoadingEnvironment(
    selection: LoadingEnvironmentSelection,
    currentConfig: RuntimePublicConfig,
    platform: LoadingEnvironmentPlatform = {},
): Promise<AppliedLoadingEnvironment> {
    // The Cocos bootstrap explicitly injects the process boot state. Keeping
    // the policy default isolated makes non-Cocos callers and tests deterministic.
    const bootState = platform.bootState ?? new AooLoadingBootState();
    // This is deliberately an explicit opt-in. Environment selection, Preview
    // mode and the boot state's prior history must never turn a false value
    // into a storage cleanup or an auto-login block.
    const clearRequested = selection.isClearLocalData === true;
    const clear = await bootState.clearOnce(clearRequested, platform);
    const environment = selection.isTestEnvironment ? 'test' : 'production';
    const selectedGateway = selectGatewayAddress(selection.gatewayAddresses, selection.isTestEnvironment);
    const configuredGateway = selectedGateway ?? currentConfig.apiBaseUrl;
    const apiBaseUrl = selection.isTestEnvironment
        ? testPreviewGatewayOrigin(configuredGateway, platform.location ?? globalThis.location)
        : configuredGateway;
    const previewLocation = platform.location ?? globalThis.location;
    const avatarBaseUrl = selection.isTestEnvironment && previewLocation?.hostname
        ? `http://${previewLocation.hostname}:8765/`
        : currentConfig.avatarBaseUrl;
    const runtimeConfig: RuntimePublicConfig = {
        ...currentConfig,
        environment,
        ...(apiBaseUrl ? { apiBaseUrl } : {}),
        ...(avatarBaseUrl ? { avatarBaseUrl } : {}),
    };
    return {
        runtimeConfig,
        environment,
        selectedGateway,
        bootId: bootState.bootId,
        cleanupRanThisCall: clear.ranThisCall,
        autoRestoreBlocked: clearRequested && bootState.shouldBlockAutomaticRestore(),
        interactiveLoginAllowed: true,
        cleanup: clear.cleanup,
    };
}

export async function clearAooLocalData(
    platform: LoadingEnvironmentPlatform,
): Promise<AooLocalDataCleanupResult> {
    const failures: string[] = [];
    const timeoutMs = Math.max(250, platform.cleanupTimeoutMs ?? 4_000);
    const removedLocalStorageKeys = removeAooStorageKeys(platform.localStorage, 'localStorage', failures);
    const removedSessionStorageKeys = removeAooStorageKeys(platform.sessionStorage, 'sessionStorage', failures);
    const deletedIndexedDatabases = await deleteAooIndexedDatabases(platform.indexedDB, timeoutMs, failures);
    const deletedCacheStores = await deleteAooCacheStores(platform.cacheStorage, timeoutMs, failures);
    return {
        attempted: true,
        removedLocalStorageKeys,
        removedSessionStorageKeys,
        deletedIndexedDatabases,
        deletedCacheStores,
        failures,
    };
}

export function isAooStorageKey(key: string): boolean {
    if (AOO_PRESERVED_LOCAL_STORAGE_KEYS.has(key)) return false;
    if (AOO_LOCAL_STORAGE_EXACT_KEYS.has(key)) return true;
    if (AOO_LOCAL_STORAGE_PREFIXES.some((prefix) => key.startsWith(prefix))) return true;
    if (/^[1-9]\d*$/.test(key)) return true; // LegacyLocalDataStore player slot.
    if (/^\d+_NoTipUnion$/.test(key)) return true;
    return /^[a-z0-9]+_\d+_[a-z][a-z0-9_]*$/i.test(key); // Club play-template option.
}

export function selectGatewayAddress(addresses: readonly string[], isTestEnvironment: boolean): string | null {
    const normalized = unique(addresses
        .map((value) => value.trim())
        .filter(Boolean)
        .map((value) => gatewayOrigin(value)));
    if (normalized.length === 0) return null;

    if (isTestEnvironment) {
        const loopback = normalized.find((url) => isLoopback(url.hostname));
        return (loopback ?? normalized[0]).toString();
    }

    const production = normalized.find((url) => url.protocol === 'https:' && !isLoopback(url.hostname));
    if (!production) throw new Error('正式环境的网关地址集合必须包含非本机 HTTPS apiBaseUrl');
    return production.toString();
}

function removeAooStorageKeys(
    storage: LoadingEnvironmentStorage | undefined,
    area: string,
    failures: string[],
): number {
    if (!storage) return 0;
    const keys: string[] = [];
    try {
        for (let index = 0; index < storage.length; index += 1) {
            const key = storage.key(index);
            if (key !== null && isAooStorageKey(key)) keys.push(key);
        }
    } catch (error: unknown) {
        failures.push(`${area}:enumerate:${errorMessage(error)}`);
    }
    let removed = 0;
    for (const key of keys) {
        try {
            storage.removeItem(key);
            removed += 1;
        } catch (error: unknown) {
            failures.push(`${area}:${key}:${errorMessage(error)}`);
        }
    }
    return removed;
}

async function deleteAooIndexedDatabases(
    factory: LoadingIndexedDatabaseFactory | undefined,
    timeoutMs: number,
    failures: string[],
): Promise<number> {
    if (!factory) return 0;
    const names = new Set<string>(KNOWN_AOO_INDEXED_DATABASES);
    if (factory.databases) {
        try {
            const databases = await withTimeout(factory.databases(), timeoutMs, 'IndexedDB 枚举超时');
            for (const database of databases) {
                if (database.name && isAooMutableBrowserStoreName(database.name)) names.add(database.name);
            }
        } catch (error: unknown) {
            failures.push(`indexedDB:enumerate:${errorMessage(error)}`);
        }
    }
    let deleted = 0;
    for (const name of names) {
        try {
            await deleteIndexedDatabase(factory, name, timeoutMs);
            deleted += 1;
        } catch (error: unknown) {
            failures.push(`indexedDB:${name}:${errorMessage(error)}`);
        }
    }
    return deleted;
}

async function deleteAooCacheStores(
    cacheStorage: LoadingCacheStorage | undefined,
    timeoutMs: number,
    failures: string[],
): Promise<number> {
    if (!cacheStorage) return 0;
    let names: string[];
    try {
        names = await withTimeout(cacheStorage.keys(), timeoutMs, 'CacheStorage 枚举超时');
    } catch (error: unknown) {
        failures.push(`cacheStorage:enumerate:${errorMessage(error)}`);
        return 0;
    }
    let deleted = 0;
    for (const name of names.filter(isAooMutableBrowserStoreName)) {
        try {
            const didDelete = await withTimeout(cacheStorage.delete(name), timeoutMs, `CacheStorage ${name} 删除超时`);
            if (!didDelete) throw new Error('删除返回 false');
            deleted += 1;
        } catch (error: unknown) {
            failures.push(`cacheStorage:${name}:${errorMessage(error)}`);
        }
    }
    return deleted;
}

function deleteIndexedDatabase(
    factory: LoadingIndexedDatabaseFactory,
    name: string,
    timeoutMs: number,
): Promise<void> {
    return withTimeout(new Promise<void>((resolve, reject) => {
        let request: {
            onsuccess?: (() => void) | null;
            onerror?: (() => void) | null;
            onblocked?: (() => void) | null;
            error?: unknown;
        };
        try {
            request = factory.deleteDatabase(name) as typeof request;
        } catch (error: unknown) {
            reject(error);
            return;
        }
        if (!request || typeof request !== 'object') {
            reject(new Error('deleteDatabase 未返回请求对象'));
            return;
        }
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error ?? new Error('删除失败'));
        request.onblocked = () => reject(new Error('删除被已打开数据库阻塞'));
    }), timeoutMs, `IndexedDB ${name} 删除超时`);
}

function isAooMutableBrowserStoreName(name: string): boolean {
    return /^(?:aoo|aoo-card-game)[-_.:](?:auth|session|business|room|gameplay|region|template|request|temp|download|hot-update|media|image|audio|client-data|runtime-data)(?:$|[-_.:])/i.test(name);
}

async function withTimeout<T>(task: Promise<T>, timeoutMs: number, message: string): Promise<T> {
    let timer: ReturnType<typeof globalThis.setTimeout> | undefined;
    try {
        return await Promise.race([
            task,
            new Promise<never>((_, reject) => {
                timer = globalThis.setTimeout(() => reject(new Error(message)), timeoutMs);
            }),
        ]);
    } finally {
        if (timer !== undefined) globalThis.clearTimeout(timer);
    }
}

function unique(urls: readonly URL[]): URL[] {
    const seen = new Set<string>();
    const result: URL[] = [];
    for (const url of urls) {
        const normalized = url.toString();
        if (seen.has(normalized)) continue;
        seen.add(normalized);
        result.push(url);
    }
    return result;
}

function isLoopback(hostname: string): boolean {
    return hostname === '127.0.0.1' || hostname === 'localhost' || hostname === '::1';
}

function errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

function createBootId(): string {
    return globalThis.crypto?.randomUUID?.() ?? `boot-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
