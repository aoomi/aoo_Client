export interface KeyValueStorage {
    get(key: string): string | null;
    set(key: string, value: string): void;
    remove(key: string): void;
}

export class BrowserKeyValueStorage implements KeyValueStorage {
    public get(key: string): string | null {
        return globalThis.localStorage?.getItem(key) ?? null;
    }

    public set(key: string, value: string): void {
        globalThis.localStorage?.setItem(key, value);
    }

    public remove(key: string): void {
        globalThis.localStorage?.removeItem(key);
    }
}

export interface ScopedPreferenceIdentity {
    readonly accountId: string;
    readonly gameId: number;
    readonly playVersion: string;
    readonly schemaHash: string;
}

/** 统一客户端偏好存储：业务只提供完整作用域和 JSON 快照，不直接拼接 localStorage 键。 */
export class ScopedPreferenceStore {
    public constructor(private readonly storage: KeyValueStorage = new BrowserKeyValueStorage()) {}
    public load(identity: ScopedPreferenceIdentity): Record<string, unknown> | null {
        try {
            const value = JSON.parse(this.storage.get(this.key(identity)) ?? 'null');
            return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
        } catch { return null; }
    }
    public save(identity: ScopedPreferenceIdentity, value: Record<string, unknown>): void {
        this.storage.set(this.key(identity), JSON.stringify(value));
    }
    private key(identity: ScopedPreferenceIdentity): string {
        if (!/^[1-9]\d*$/.test(identity.accountId) || !Number.isSafeInteger(identity.gameId)
            || identity.gameId <= 0 || !identity.playVersion.trim() || !/^[0-9a-f]{64}$/.test(identity.schemaHash)) {
            throw new Error('用户偏好作用域无效');
        }
        return `preferences.scoped.v1.${identity.accountId}.${identity.gameId}.${identity.playVersion}.${identity.schemaHash}`;
    }
}
