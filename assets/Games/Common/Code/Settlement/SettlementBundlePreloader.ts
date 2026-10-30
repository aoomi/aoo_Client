import { AssetManager, assetManager } from 'cc';
import {
    settlementBundleName,
    settlementPreloadBundleNames,
    type SettlementCardCategory,
    type SettlementKind,
} from './SettlementAssetService';

export type { SettlementCardCategory, SettlementKind } from './SettlementAssetService';

/** Background settlement loading; failures never block room entry and are retried on display. */
export class SettlementBundlePreloader {
    private readonly pending = new Map<string, Promise<AssetManager.Bundle>>();

    public preloadForGame(gameCode: string, playFamily?: string): void {
        const bundleNames = settlementPreloadBundleNames(gameCode, playFamily);
        if (bundleNames.length === 0) return;
        void this.preloadBundles(bundleNames, gameCode);
    }

    public async preload(category: SettlementCardCategory): Promise<void> {
        await this.preloadBundles([
            settlementBundleName(category, 'SmallSettle'),
            settlementBundleName(category, 'BigSettle'),
        ], category);
    }

    public loadForDisplay(category: SettlementCardCategory, kind: SettlementKind): Promise<AssetManager.Bundle> {
        return this.loadBundle(settlementBundleName(category, kind));
    }

    public loadBundle(bundleName: string): Promise<AssetManager.Bundle> {
        const existing = assetManager.getBundle(bundleName);
        if (existing) return Promise.resolve(existing);
        const active = this.pending.get(bundleName);
        if (active) return active;
        const task = new Promise<AssetManager.Bundle>((resolve, reject) => {
            assetManager.loadBundle(bundleName, (error, bundle) => {
                this.pending.delete(bundleName);
                if (error || !bundle) reject(error ?? new Error(`结算 Bundle 不可用: ${bundleName}`));
                else resolve(bundle);
            });
        });
        this.pending.set(bundleName, task);
        return task;
    }

    private async preloadBundles(bundleNames: readonly string[], label: string): Promise<void> {
        try {
            await Promise.all(bundleNames.map((bundleName) => this.loadBundle(bundleName)));
        } catch (error) {
            console.warn('[SettlementBundlePreloader] background preload failed', label, error);
        }
    }
}

export const settlementBundlePreloader = new SettlementBundlePreloader();
