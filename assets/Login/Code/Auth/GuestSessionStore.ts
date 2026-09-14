import type { KeyValueStorage } from '../../../Common/Code/Runtime/core/Storage';

const STORAGE_KEY = 'aoo.auth.session.v2';

export interface GuestSession {
    account: string;
    token: string;
    accessToken?: string;
    refreshToken?: string;
    accessExpiresAt?: string | number;
    refreshExpiresAt?: string | number;
    accountId?: string;
    guestCredential?: string;
    profile?: Record<string, unknown>;
}

export class GuestSessionStore {
    public constructor(private readonly storage: KeyValueStorage) {}

    public load(): GuestSession | null {
        const value = this.storage.get(STORAGE_KEY);
        if (!value) return null;
        try {
            const parsed = JSON.parse(value) as Partial<GuestSession>;
            if (typeof parsed.account !== 'string' || typeof parsed.token !== 'string') return null;
            const session: GuestSession = { account: parsed.account, token: parsed.token };
            if (typeof parsed.accessToken === 'string') session.accessToken = parsed.accessToken;
            if (typeof parsed.refreshToken === 'string') session.refreshToken = parsed.refreshToken;
            if (this.isExpiryValue(parsed.accessExpiresAt)) session.accessExpiresAt = parsed.accessExpiresAt;
            if (this.isExpiryValue(parsed.refreshExpiresAt)) session.refreshExpiresAt = parsed.refreshExpiresAt;
            if (typeof parsed.accountId === 'string') session.accountId = parsed.accountId;
            if (typeof parsed.guestCredential === 'string') session.guestCredential = parsed.guestCredential;
            if (parsed.profile && typeof parsed.profile === 'object') session.profile = parsed.profile;
            return session;
        } catch {
            this.clear();
            return null;
        }
    }

    public save(session: GuestSession): void {
        this.storage.set(STORAGE_KEY, JSON.stringify(session));
    }

    public clear(): void {
        this.storage.remove(STORAGE_KEY);
    }

    private isExpiryValue(value: unknown): value is string | number {
        return (typeof value === 'string' && value.length > 0)
            || (typeof value === 'number' && Number.isFinite(value));
    }
}
