import { assetManager, AssetManager } from 'cc';
import { settlementBundlePreloader } from '../../../../../Games/Common/Code/Settlement/SettlementBundlePreloader';
import { legacyPlatformEvents } from './LegacyPlatformEvents';

export type LegacySubgameProgress = (progress: number, finished: number, total: number) => void;

export class LegacySubgameBundleService {
    private readonly bundles = new Map<string, AssetManager.Bundle>();
    private readonly loading = new Map<string, Promise<AssetManager.Bundle>>();

    public has(name: string): boolean {
        return this.bundles.has(this.normalize(name)) || assetManager.getBundle(this.normalize(name)) !== null;
    }

    public load(name: string, source?: string, progress?: LegacySubgameProgress): Promise<AssetManager.Bundle> {
        const key = this.normalize(name);
        settlementBundlePreloader.preloadForGame(key);
        const loaded = this.bundles.get(key) ?? assetManager.getBundle(key);
        if (loaded) return Promise.resolve(loaded);
        const pending = this.loading.get(key);
        if (pending) return pending;
        const target = source || key;
        const promise = new Promise<AssetManager.Bundle>((resolve, reject) => {
            assetManager.loadBundle(target, (finished: number, total: number) => {
                progress?.(total > 0 ? finished / total : 0, finished, total);
                legacyPlatformEvents.emit('legacy-subgame-progress', { name: key, finished, total });
            }, (error, bundle) => {
                this.loading.delete(key);
                if (error || !bundle) {
                    legacyPlatformEvents.emit('legacy-subgame-error', { name: key, message: error?.message ?? 'bundle unavailable' });
                    reject(error ?? new Error(`子游戏 Bundle 不可用: ${key}`));
                    return;
                }
                this.bundles.set(key, bundle);
                legacyPlatformEvents.emit('OnUpdateGameEnd', { name: key });
                resolve(bundle);
            });
        });
        this.loading.set(key, promise);
        return promise;
    }

    public release(name: string): void {
        const key = this.normalize(name);
        const bundle = this.bundles.get(key);
        if (!bundle) return;
        bundle.releaseAll();
        assetManager.removeBundle(bundle);
        this.bundles.delete(key);
    }

    private normalize(name: string): string {
        return name.trim().toLowerCase() === 'sss_zz' || name.trim().toLowerCase() === 'sss_dr'
            ? 'sss'
            : name.trim().toLowerCase();
    }
}

export const legacySubgameBundleService = new LegacySubgameBundleService();
