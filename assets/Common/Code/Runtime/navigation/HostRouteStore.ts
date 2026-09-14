import { BrowserKeyValueStorage, type KeyValueStorage } from '../core/Storage';
import type { HostRoute } from './Route';

const KEY_PREFIX = 'aoo.host-route.v1.';

/** Persists only the last presentation that reached a usable state. */
export class HostRouteStore {
    public constructor(private readonly storage: KeyValueStorage = new BrowserKeyValueStorage()) {}

    public load(accountId: string): HostRoute | null {
        try {
            const value = JSON.parse(this.storage.get(this.key(accountId)) ?? 'null') as unknown;
            return this.isRoute(value) ? value : null;
        } catch {
            return null;
        }
    }

    public save(accountId: string, route: HostRoute): void {
        if (!this.isRoute(route)) throw new Error('刷新恢复位置无效');
        this.storage.set(this.key(accountId), JSON.stringify(route));
    }

    public clear(accountId: string): void {
        this.storage.remove(this.key(accountId));
    }

    private key(accountId: string): string {
        const normalized = accountId.trim();
        if (!normalized) throw new Error('刷新恢复账号无效');
        return `${KEY_PREFIX}${encodeURIComponent(normalized)}`;
    }

    private isRoute(value: unknown): value is HostRoute {
        if (!value || typeof value !== 'object') return false;
        const route = value as Record<string, unknown>;
        if (route.name === 'login' || route.name === 'lobby') return true;
        if (route.name === 'club') return Number.isSafeInteger(route.clubId) && Number(route.clubId) > 0;
        return route.name === 'game'
            && typeof route.pluginId === 'string' && route.pluginId.length > 0
            && Number.isSafeInteger(route.roomId) && Number(route.roomId) > 0
            && this.isRoute(route.returnTo) && (route.returnTo as { name?: unknown }).name !== 'game';
    }
}

export const hostRouteStore = new HostRouteStore();
