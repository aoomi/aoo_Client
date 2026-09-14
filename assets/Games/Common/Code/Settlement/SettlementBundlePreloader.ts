import { AssetManager, assetManager } from 'cc';
import { CATALOG_FAMILY_BINDINGS } from '../Catalog/CatalogFamilyBindings';

export type SettlementCardCategory = 'LongCard' | 'Mahjong' | 'Poker' | 'WordCard';
export type SettlementKind = 'BigSettle' | 'SmallSettle';

const categoryByGameCode = new Map(CATALOG_FAMILY_BINDINGS.map((binding) => {
    const category: SettlementCardCategory | null = binding.family.startsWith('mahjong:') ? 'Mahjong'
        : binding.family.startsWith('poker:') ? 'Poker'
        : binding.family.startsWith('long-card:') ? 'LongCard'
        : binding.family.startsWith('word-card:') ? 'WordCard' : null;
    return [binding.code, category] as const;
}).filter((entry): entry is readonly [string, SettlementCardCategory] => entry[1] !== null));
const pdkGameCodes = new Set(CATALOG_FAMILY_BINDINGS
    .filter((binding) => binding.family === 'poker:pao-de-kuai')
    .map((binding) => binding.code.toLowerCase()));

function isPdkFamily(playFamily?: string): boolean {
    const family = playFamily?.trim().toLowerCase().replace('_', ':').replaceAll('_', '-') ?? '';
    return family === 'poker:pao-de-kuai';
}

function categoryForFamily(playFamily?: string): SettlementCardCategory | null {
    const family = playFamily?.trim().toLowerCase().replace('_', ':').replaceAll('_', '-') ?? '';
    if (family.startsWith('mahjong:')) return 'Mahjong';
    if (family.startsWith('poker:')) return 'Poker';
    if (family.startsWith('long-card:')) return 'LongCard';
    if (family.startsWith('word-card:')) return 'WordCard';
    return null;
}

/** Background settlement loading; failures never block room entry and are retried on display. */
export class SettlementBundlePreloader {
    private readonly pending = new Map<string, Promise<AssetManager.Bundle>>();

    public preloadForGame(gameCode: string, playFamily?: string): void {
        const normalizedGameCode = gameCode.trim().toLowerCase();
        if (pdkGameCodes.has(normalizedGameCode) || isPdkFamily(playFamily)) {
            void this.preloadPdk();
            return;
        }
        const category = categoryByGameCode.get(normalizedGameCode) ?? categoryForFamily(playFamily);
        if (!category) return;
        void this.preload(category);
    }

    public async preload(category: SettlementCardCategory): Promise<void> {
        try {
            await this.load(category, 'SmallSettle');
            await this.load(category, 'BigSettle');
        } catch (error) {
            console.warn('[SettlementBundlePreloader] background preload failed', category, error);
        }
    }

    public loadForDisplay(category: SettlementCardCategory, kind: SettlementKind): Promise<AssetManager.Bundle> {
        return this.load(category, kind);
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

    private async preloadPdk(): Promise<void> {
        try {
            await Promise.all([
                this.loadBundle('paodekuai-common'),
                this.loadBundle('poker-common'),
            ]);
        } catch (error) {
            console.warn('[SettlementBundlePreloader] background preload failed PDK', error);
        }
    }

    private load(category: SettlementCardCategory, kind: SettlementKind): Promise<AssetManager.Bundle> {
        if (category === 'Poker') return this.loadBundle('poker-common');
        const name = `${category.toLowerCase()}-${kind === 'SmallSettle' ? 'small-settle' : 'big-settle'}`;
        return this.loadBundle(name);
    }
}

export const settlementBundlePreloader = new SettlementBundlePreloader();
