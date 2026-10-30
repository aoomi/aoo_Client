/**
 * Cancellation-safe lease for an asynchronously loaded CommonHead prefab.
 * The caller that owns the room renderer cancels the lease during destroy;
 * a load completing afterwards is released exactly once instead of becoming
 * an untracked retained asset.
 */
export class CommonRoomHeadAssetLease<T> {
    private active = true;
    private accepted: T | null = null;
    private released = false;
    private readonly releaseAsset: (asset: T) => void;

    public constructor(releaseAsset: (asset: T) => void) {
        this.releaseAsset = releaseAsset;
    }

    public accept(asset: T): boolean {
        if (!this.active || this.released) {
            this.releaseOnce(asset);
            return false;
        }
        this.accepted = asset;
        return true;
    }

    public isActive(): boolean {
        return this.active && !this.released;
    }

    /** Cancel pending work and release a prefab that was accepted already. */
    public cancel(): void {
        this.active = false;
        if (this.accepted !== null) this.releaseOnce(this.accepted);
        this.accepted = null;
    }

    /** Transfer a successfully mounted prefab to the renderer AssetLoader. */
    public detach(): void {
        this.accepted = null;
        this.active = false;
    }

    private releaseOnce(asset: T): void {
        if (this.released) return;
        this.released = true;
        this.releaseAsset(asset);
    }
}
