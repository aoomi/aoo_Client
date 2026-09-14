import { sys } from 'cc';

export type LegacyLoginChannel = 'company' | 'wechat-web' | 'wechat-app' | 'mobile' | 'line' | 'facebook';

export interface LegacyChannelIdentity {
    channel: LegacyLoginChannel;
    openId?: string;
    unionId?: string;
    accessToken?: string;
    accountId?: number;
    expiresAt?: number;
}

export class LegacyChannelIdentityStore {
    private readonly key = 'aoo.channel.identities.v1';

    public get(channel: LegacyLoginChannel): LegacyChannelIdentity | null {
        const identity = this.read()[channel] ?? null;
        if (identity?.expiresAt && identity.expiresAt <= Date.now()) {
            this.remove(channel);
            return null;
        }
        return identity;
    }

    public set(identity: LegacyChannelIdentity): void {
        const all = this.read();
        all[identity.channel] = { ...identity };
        sys.localStorage.setItem(this.key, JSON.stringify(all));
    }

    public remove(channel: LegacyLoginChannel): void {
        const all = this.read();
        delete all[channel];
        sys.localStorage.setItem(this.key, JSON.stringify(all));
    }

    public clear(): void {
        sys.localStorage.removeItem(this.key);
    }

    private read(): Partial<Record<LegacyLoginChannel, LegacyChannelIdentity>> {
        try {
            const raw = sys.localStorage.getItem(this.key);
            return raw ? JSON.parse(raw) as Partial<Record<LegacyLoginChannel, LegacyChannelIdentity>> : {};
        } catch {
            sys.localStorage.removeItem(this.key);
            return {};
        }
    }
}

export const legacyChannelIdentityStore = new LegacyChannelIdentityStore();
