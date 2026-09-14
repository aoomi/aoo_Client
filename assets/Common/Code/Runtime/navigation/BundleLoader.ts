import { assetManager, type AssetManager } from 'cc';

/** Returns an already registered bundle or loads it once before scene navigation. */
export function getOrLoadBundle(name: string): Promise<AssetManager.Bundle> {
    const existing = assetManager.getBundle(name);
    if (existing) return Promise.resolve(existing);
    return new Promise((resolve, reject) => {
        assetManager.loadBundle(name, (error, bundle) => {
            if (error || !bundle) reject(error ?? new Error(`Bundle unavailable: ${name}`));
            else resolve(bundle);
        });
    });
}
