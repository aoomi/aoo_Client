import { instantiate, Node, Prefab, UITransform } from 'cc';
import { CommonHeadController } from '../../../../Common/Code/UI/CommonHeadController';
import { AssetLoader } from '../../../../Common/Code/UI/Infrastructure';
import { COMMON_ASSET_BUNDLE, COMMON_HEAD_ASSET } from '../../../../Common/Code/Runtime/ui/CommonPrefabRegistry';
import { CommonRoomHeadAssetLease } from './CommonRoomHeadAssetLease';

export type CommonRoomHeadVariant = 'Game' | 'List';

export interface CommonRoomHeadMount {
    readonly node: Node;
    readonly controller: CommonHeadController;
    readonly variant: Node;
}

/**
 * Capability port exposed by Common to gameplay renderers.  The renderer owns
 * prefab loading, per-mount revisions and cleanup; gameplay only supplies the
 * target node, variant and player-facing data after the mount resolves.
 */
export interface CommonRoomHeadPort {
    mount(
        mount: Node,
        variant: CommonRoomHeadVariant,
        isCurrent?: () => boolean,
    ): Promise<CommonRoomHeadMount>;
    release(mount: Node): void;
    destroy(): void;
}

/** Common-owned stateful lifecycle for every CommonHead instance. */
export class CommonRoomHeadRenderer implements CommonRoomHeadPort {
    private readonly assets = new AssetLoader();
    private readonly revisions = new WeakMap<Node, number>();
    private readonly mounts = new Set<Node>();
    private readonly pendingLeases = new Set<CommonRoomHeadAssetLease<Prefab>>();
    private destroyed = false;

    public async mount(
        mount: Node,
        variant: CommonRoomHeadVariant,
        isCurrent: () => boolean = () => true,
    ): Promise<CommonRoomHeadMount> {
        if (this.destroyed) throw new Error('COMMON_ROOM_HEAD_RENDERER_DESTROYED');
        const revision = (this.revisions.get(mount) ?? 0) + 1;
        this.revisions.set(mount, revision);
        const current = (): boolean => !this.destroyed && mount.isValid
            && this.revisions.get(mount) === revision && isCurrent();
        const lease = new CommonRoomHeadAssetLease<Prefab>(asset => this.assets.release(asset));
        this.pendingLeases.add(lease);
        try {
            const mounted = await mountCommonRoomHead(mount, this.assets, variant, current, lease);
            if (!current()) throw new Error('COMMON_ROOM_HEAD_MOUNT_CANCELLED');
            lease.detach();
            this.mounts.add(mount);
            return mounted;
        } catch (error) {
            lease.cancel();
            throw error;
        } finally {
            this.pendingLeases.delete(lease);
        }
    }

    public release(mount: Node): void {
        this.revisions.set(mount, (this.revisions.get(mount) ?? 0) + 1);
        this.mounts.delete(mount);
        if (!mount.isValid) return;
        for (const child of [...mount.children]) {
            if (child.isValid) child.destroy();
        }
    }

    public destroy(): void {
        if (this.destroyed) return;
        this.destroyed = true;
        for (const lease of this.pendingLeases) lease.cancel();
        this.pendingLeases.clear();
        for (const mount of this.mounts) this.release(mount);
        this.mounts.clear();
        this.assets.releaseAll();
    }
}

/**
 * Common-owned CommonHead resource lifecycle. Gameplay code may provide the
 * data and choose a presentation variant, but it cannot instantiate or own
 * the shared head prefab itself.
 */
export async function mountCommonRoomHead(
    mount: Node,
    assets: AssetLoader,
    variant: CommonRoomHeadVariant,
    isCurrent: () => boolean = () => true,
    lease?: CommonRoomHeadAssetLease<Prefab>,
): Promise<CommonRoomHeadMount> {
    if (!mount.isValid) throw new Error('COMMON_ROOM_HEAD_MOUNT_INVALID');
    let head = mount.getChildByName('CommonHead');
    if (!head?.isValid) {
        const bundle = await assets.bundle(COMMON_ASSET_BUNDLE);
        if (!mount.isValid || !isCurrent() || (lease && !lease.isActive())) {
            throw new Error('COMMON_ROOM_HEAD_MOUNT_CANCELLED');
        }
        const prefab = await assets.load(COMMON_HEAD_ASSET, Prefab, bundle);
        if (lease && !lease.accept(prefab)) throw new Error('COMMON_ROOM_HEAD_MOUNT_CANCELLED');
        if (!mount.isValid || !isCurrent()) {
            if (lease) lease.cancel();
            else assets.release(prefab);
            throw new Error('COMMON_ROOM_HEAD_MOUNT_CANCELLED');
        }
        for (const child of [...mount.children]) child.destroy();
        head = instantiate(prefab);
        head.name = 'CommonHead';
        mount.addChild(head);
    }
    const controller = head.getComponent(CommonHeadController);
    if (!controller) throw new Error('COMMON_ROOM_HEAD_CONTROLLER_MISSING');
    const selected = controller.useVariant(variant);
    const mountSize = mount.getComponent(UITransform)?.contentSize;
    const variantSize = selected.getComponent(UITransform)?.contentSize;
    if (mountSize && variantSize && variantSize.width > 0 && variantSize.height > 0) {
        const scale = Math.min(mountSize.width / variantSize.width, mountSize.height / variantSize.height);
        head.setScale(scale, scale, 1);
        head.setPosition(-selected.position.x * scale, -selected.position.y * scale, 0);
    }
    return Object.freeze({ node: head, controller, variant: selected });
}
