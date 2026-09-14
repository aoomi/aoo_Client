import { Asset, assetManager, AssetManager, AudioSource, Node } from 'cc';

/** Scene/form ownership boundary for Asset, SpriteFrame, AudioClip, SkeletonData, Bundle and Node. */
export class AooAssetScope {
    private readonly releases: Array<() => void> = [];
    private readonly identities = new Set<string>();
    private disposed = false;

    public ownLoadedAsset<T extends Asset>(identity: string, asset: T): T {
        this.ensureOpen(identity);
        asset.addRef();
        this.releases.push(() => asset.decRef());
        return asset;
    }

    public ownCreatedAsset<T extends Asset>(identity: string, asset: T): T {
        this.ensureOpen(identity);
        this.releases.push(() => { if (asset.isValid) asset.destroy(); });
        return asset;
    }

    public ownNode(identity: string, node: Node): Node {
        this.ensureOpen(identity);
        this.releases.push(() => { if (node.isValid) node.destroy(); });
        return node;
    }

    public ownAudioSource(identity: string, source: AudioSource): AudioSource {
        this.ensureOpen(identity);
        this.releases.push(() => { if (source.isValid) source.stop(); });
        return source;
    }

    public ownBundle(identity: string, bundle: AssetManager.Bundle): AssetManager.Bundle {
        this.ensureOpen(identity);
        this.releases.push(() => assetManager.removeBundle(bundle));
        return bundle;
    }

    public dispose(): void {
        if (this.disposed) return;
        this.disposed = true;
        const failures: unknown[] = [];
        for (let index = this.releases.length - 1; index >= 0; index -= 1) {
            try { this.releases[index](); } catch (error) { failures.push(error); }
        }
        this.releases.length = 0;
        this.identities.clear();
        if (failures.length > 0) {
            const failure = new Error('Aoo asset scope release failed') as Error & { causes?: unknown[] };
            failure.causes = failures;
            throw failure;
        }
    }

    public get ownedCount(): number { return this.identities.size; }

    private ensureOpen(identity: string): void {
        if (this.disposed) throw new Error('Aoo asset scope is disposed');
        if (!identity || this.identities.has(identity)) throw new Error(`Duplicate asset ownership: ${identity}`);
        this.identities.add(identity);
    }
}
