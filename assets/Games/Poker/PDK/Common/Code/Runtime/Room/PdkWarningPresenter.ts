import { assetManager, Node, sp, UITransform, Vec3 } from 'cc';

const BUNDLE = 'paodekuai-common';
const ASSET = 'Spine/shengyupaishu/ddz_szbj_ani';
const MOUNT_PATH = 'RoomCommon/Warning';

/** Reuses the single public warning mount at the centre of the player being warned. */
export class PdkWarningPresenter {
    private dataRequest: Promise<sp.SkeletonData> | null = null;
    private generation = 0;

    public constructor(private readonly root: Node) {
        const mount = this.find(MOUNT_PATH);
        if (mount) mount.active = false;
    }

    public async showAt(physicalSlot: number, remaining: number): Promise<void> {
        if (remaining !== 1 && remaining !== 2) return;
        const generation = ++this.generation;
        const data = await this.loadData();
        const mount = this.require(MOUNT_PATH);
        const head = this.require(`Players/Play_${physicalSlot}/Head`);
        if (generation !== this.generation || !mount.isValid || !head.isValid || !this.root.isValid) return;
        const parentTransform = mount.parent?.getComponent(UITransform);
        if (!parentTransform) throw new Error('跑得快公共 Warning 父节点缺少 UITransform');
        const centre = parentTransform.convertToNodeSpaceAR(head.worldPosition);
        mount.setPosition(new Vec3(centre.x, centre.y, mount.position.z));
        const skeleton = mount.getComponent(sp.Skeleton) ?? mount.addComponent(sp.Skeleton);
        skeleton.clearTracks();
        skeleton.skeletonData = data;
        mount.active = true;
        skeleton.setCompleteListener(() => {
            if (!mount.isValid || generation !== this.generation) return;
            mount.active = false;
            skeleton.setCompleteListener(null);
        });
        skeleton.setAnimation(0, `ddz_szbj_${remaining}_ani`, false);
    }

    public hide(): void {
        this.generation += 1;
        const mount = this.find(MOUNT_PATH);
        if (!mount?.isValid) return;
        const skeleton = mount.getComponent(sp.Skeleton);
        skeleton?.setCompleteListener(null);
        skeleton?.clearTracks();
        mount.active = false;
    }

    public destroy(): void {
        this.hide();
        this.dataRequest = null;
    }

    private find(path: string): Node | null {
        let current: Node | null = this.root;
        for (const segment of path.split('/').filter(Boolean)) current = current?.getChildByName(segment) ?? null;
        return current;
    }

    private require(path: string): Node {
        const node = this.find(path);
        if (!node) throw new Error(`PDK_CommonRoom 节点契约缺失: ${path}`);
        return node;
    }

    private loadData(): Promise<sp.SkeletonData> {
        if (this.dataRequest) return this.dataRequest;
        this.dataRequest = new Promise<sp.SkeletonData>((resolve, reject) => {
            const load = (bundle: NonNullable<ReturnType<typeof assetManager.getBundle>>): void => {
                bundle.load(ASSET, sp.SkeletonData, (error, data) => {
                    if (error || !data) reject(error ?? new Error(`跑得快报警动画资源缺失：${ASSET}`));
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
