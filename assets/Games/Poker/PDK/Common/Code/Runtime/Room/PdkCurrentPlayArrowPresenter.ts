import { assetManager, Node, sp, UITransform, Vec3 } from 'cc';

const BUNDLE = 'paodekuai-common';
const ASSET = 'Spine/jiantou/skeleton';

/** XQP-equivalent single animated marker for the latest physical played hand. */
export class PdkCurrentPlayArrowPresenter {
    private mount: Node | null = null;
    private authoredOffset: Vec3 | null = null;
    private dataRequest: Promise<sp.SkeletonData> | null = null;
    private generation = 0;

    public constructor(private readonly root: Node) {}

    public async showOver(target: Node): Promise<void> {
        const generation = ++this.generation;
        const data = await this.loadData();
        if (generation !== this.generation || !this.root.isValid || !target.isValid) return;
        const mount = this.ensureMount();
        const skeleton = mount.getComponent(sp.Skeleton) ?? mount.addComponent(sp.Skeleton);
        skeleton.skeletonData = data;
        skeleton.clearTracks();
        skeleton.setAnimation(0, 'animation', true);
        // Keep the marker centred above the complete latest played hand. The
        // authored Arrow position remains an optional fine-tuning offset, while
        // the baseline gap between the card top and arrow bottom is exactly 0 UI px.
        const mountTransform = mount.parent?.getComponent(UITransform);
        if (!mountTransform) throw new Error('RoomCommon 节点缺少 UITransform');
        const targetTransform = target.getComponent(UITransform);
        const arrowTransform = mount.getComponent(UITransform);
        if (!targetTransform || !arrowTransform) throw new Error('当前出牌箭头定位节点缺少 UITransform');
        const cardBounds = target.children
            .filter((child) => child.activeInHierarchy && !child.name.startsWith('PlayCount'))
            .map((child) => child.getComponent(UITransform)?.getBoundingBoxToWorld())
            .filter((bounds): bounds is NonNullable<typeof bounds> => Boolean(bounds));
        const fallback = targetTransform.getBoundingBoxToWorld();
        const left = cardBounds.length > 0 ? Math.min(...cardBounds.map((bounds) => bounds.x)) : fallback.x;
        const right = cardBounds.length > 0
            ? Math.max(...cardBounds.map((bounds) => bounds.x + bounds.width))
            : fallback.x + fallback.width;
        const top = cardBounds.length > 0
            ? Math.max(...cardBounds.map((bounds) => bounds.y + bounds.height))
            : fallback.y + fallback.height;
        const cardTopCenter = mountTransform.convertToNodeSpaceAR(new Vec3(
            (left + right) / 2,
            top,
            target.worldPosition.z,
        ));
        const offset = this.authoredOffset ?? Vec3.ZERO;
        const arrowHalfHeight = arrowTransform.contentSize.height * Math.abs(mount.scale.y) / 2;
        mount.setPosition(
            cardTopCenter.x + offset.x,
            cardTopCenter.y + arrowHalfHeight + offset.y,
            cardTopCenter.z + offset.z + 1,
        );
        mount.active = true;
    }

    public hide(): void {
        this.generation += 1;
        if (!this.mount?.isValid) return;
        this.mount.getComponent(sp.Skeleton)?.clearTracks();
        this.mount.active = false;
    }

    public destroy(): void {
        this.hide();
        this.mount = null;
        this.authoredOffset = null;
        this.dataRequest = null;
    }

    private ensureMount(): Node {
        if (this.mount?.isValid) return this.mount;
        const mount = this.root.getChildByName('RoomCommon')?.getChildByName('Arrow');
        if (!mount) throw new Error('PDK_CommonRoom 预制体缺少 RoomCommon/Arrow 节点');
        this.authoredOffset = mount.position.clone();
        this.mount = mount;
        return mount;
    }

    private loadData(): Promise<sp.SkeletonData> {
        if (this.dataRequest) return this.dataRequest;
        this.dataRequest = new Promise<sp.SkeletonData>((resolve, reject) => {
            const load = (bundle: NonNullable<ReturnType<typeof assetManager.getBundle>>): void => {
                bundle.load(ASSET, sp.SkeletonData, (error, data) => {
                    if (error || !data) reject(error ?? new Error(`跑得快当前出牌箭头资源缺失：${ASSET}`));
                    else resolve(data);
                });
            };
            const loaded = assetManager.getBundle(BUNDLE);
            if (loaded) load(loaded);
            else assetManager.loadBundle(BUNDLE, (error, bundle) => {
                if (error || !bundle) reject(error ?? new Error(`跑得快动画 Bundle ${BUNDLE} 不存在`));
                else load(bundle);
            });
        }).catch((error: unknown) => {
            this.dataRequest = null;
            throw error;
        });
        return this.dataRequest;
    }
}
