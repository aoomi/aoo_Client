import { assetManager, AssetManager, Node, sp, tween, Tween, UITransform, Vec3 } from 'cc';

const MAGIC_SPINE_BUNDLE = 'games-common';
const MAGIC_EFFECT_SCALE = 0.65;
let emojiSkeletonRequest: Promise<sp.SkeletonData> | null = null;

interface MagicExpressionDefinition {
    readonly asset: string;
    readonly launchAnimation: string;
    readonly impactAnimation: string;
}

/** UI 编号是稳定协议值；全部魔法表情使用牢笼的显示比例并命中头像正中心。 */
export const MAGIC_EXPRESSION_DEFINITIONS: Readonly<Record<number, MagicExpressionDefinition>> = Object.freeze({
    1: { asset: 'bingtong/daoju_bingtong', launchAnimation: 'bingtong1', impactAnimation: 'bingtong2' },
    2: { asset: 'dao/daoju_dao', launchAnimation: 'dao1', impactAnimation: 'dao4' },
    3: { asset: 'dapao/daoju_dapao', launchAnimation: 'dapao1', impactAnimation: 'dapao2' },
    4: { asset: 'daquan/daoju_daquan', launchAnimation: 'daquan1', impactAnimation: 'daquan3' },
    5: { asset: 'diugutou/daoju_diugutou', launchAnimation: 'diugutou1', impactAnimation: 'diugutou3' },
    6: { asset: 'xianhua/hd_meigui01', launchAnimation: 'fly', impactAnimation: 'animation' },
    7: { asset: 'jiangbei/daoju_jiangbei', launchAnimation: 'jiangbei1', impactAnimation: 'jiangbei3' },
    8: { asset: 'diujidan/daoju_diujidan', launchAnimation: 'egg1', impactAnimation: 'egg2' },
    9: { asset: 'laolong/daoju_laolong', launchAnimation: 'laolong1', impactAnimation: 'laolong2' },
    10: { asset: 'maozi/daoju_maozi', launchAnimation: 'maozi1', impactAnimation: 'maozi2' },
    11: { asset: 'meichao/daoju_meichao', launchAnimation: 'meichao1', impactAnimation: 'meichao2' },
    12: { asset: 'piujiu/hd_ganbei01', launchAnimation: 'fly', impactAnimation: 'animation' },
    // 原静态图节点误命名为 shuiqiang；用户指定的 Magic 目录中对应资源是 shoulei。
    13: { asset: 'shoulei/daoju_shoulei', launchAnimation: 'shoulei1', impactAnimation: 'shoulei4' },
    14: { asset: 'tuoxie/daoju_tuoxie', launchAnimation: 'shoe1', impactAnimation: 'shoe2' },
    15: { asset: 'zhuaji/daoju_zhuaji', launchAnimation: 'zhuaji1', impactAnimation: 'zhuaji2' },
});

/** 普通表情与 2.22 保持一致，渲染到牌桌公共特效层，避免被头像遮罩裁剪。 */
export class EmojiExpressionPresenter {
    private readonly active = new Map<number, Node>();
    private generation = 0;

    public constructor(
        private readonly root: Node,
        private readonly resolveHead: (dataSeat: number) => Node | null,
    ) {}

    public async play(dataSeat: number, emojiId: number): Promise<void> {
        const head = this.resolveHead(dataSeat);
        const rootTransform = this.root.getComponent(UITransform);
        if (!head?.isValid || !rootTransform) throw new Error('表情头像位置不可用');
        const generation = this.generation;
        const skeletonData = await EmojiExpressionPresenter.load();
        if (generation !== this.generation || !this.root.isValid || !head.isValid) return;
        this.hide(dataSeat);
        const effect = new Node(`EmojiExpression${String(emojiId).padStart(2, '0')}Effect`);
        effect.layer = this.root.layer;
        const skeleton = effect.addComponent(sp.Skeleton);
        skeleton.premultipliedAlpha = false;
        skeleton.skeletonData = skeletonData;
        this.root.addChild(effect);
        effect.setSiblingIndex(this.root.children.length - 1);
        effect.setPosition(rootTransform.convertToNodeSpaceAR(head.worldPosition));
        skeleton.setAnimation(0, `emoji_${emojiId}`, false);
        this.active.set(dataSeat, effect);
    }

    public hide(dataSeat: number): void {
        const effect = this.active.get(dataSeat);
        if (effect?.isValid) effect.destroy();
        this.active.delete(dataSeat);
    }

    public clear(): void {
        this.generation += 1;
        for (const effect of this.active.values()) if (effect.isValid) effect.destroy();
        this.active.clear();
    }

    private static load(): Promise<sp.SkeletonData> {
        if (emojiSkeletonRequest) return emojiSkeletonRequest;
        emojiSkeletonRequest = new Promise<sp.SkeletonData>((resolve, reject) => {
            const load = (bundle: AssetManager.Bundle): void => {
                bundle.load('Spine/Emoji/emoji_super', sp.SkeletonData, (error, data) => {
                    if (error || !data) reject(error ?? new Error('普通表情资源加载失败'));
                    else resolve(data);
                });
            };
            const cached = assetManager.getBundle(MAGIC_SPINE_BUNDLE);
            if (cached) load(cached);
            else assetManager.loadBundle(MAGIC_SPINE_BUNDLE, (error, bundle) => {
                if (error || !bundle) reject(error ?? new Error(`公共资源包加载失败: ${MAGIC_SPINE_BUNDLE}`));
                else load(bundle);
            });
        }).catch((error: unknown) => {
            emojiSkeletonRequest = null;
            throw error;
        });
        return emojiSkeletonRequest;
    }
}

/** 在牌桌坐标系内按各资源倍率播放魔法表情，起点和终点取双方公共头像的实时世界坐标。 */
export class MagicExpressionPresenter {
    private readonly active = new Set<Node>();
    private readonly dataRequests = new Map<string, Promise<sp.SkeletonData>>();
    private generation = 0;

    public constructor(
        private readonly root: Node,
        private readonly resolveHead: (dataSeat: number) => Node | null,
    ) {}

    public async play(sourceSeat: number, targetSeat: number, expressionId: number): Promise<void> {
        const definition = MAGIC_EXPRESSION_DEFINITIONS[expressionId];
        if (!definition) throw new Error(`魔法表情编号无效: ${expressionId}`);
        const source = this.resolveHead(sourceSeat);
        const target = this.resolveHead(targetSeat);
        const rootTransform = this.root.getComponent(UITransform);
        if (!source?.isValid || !target?.isValid || !rootTransform) throw new Error('魔法表情头像位置不可用');
        const generation = this.generation;
        const skeletonData = await this.load(definition.asset);
        if (generation !== this.generation || !this.root.isValid || !source.isValid || !target.isValid) return;

        const effect = new Node(`MagicExpression${String(expressionId).padStart(2, '0')}Effect`);
        const skeleton = effect.addComponent(sp.Skeleton);
        // Magic 图集使用直通 Alpha；开启预乘会把透明像素的白色 RGB 混入画面，形成白色矩形阴影。
        skeleton.premultipliedAlpha = false;
        skeleton.skeletonData = skeletonData;
        this.root.addChild(effect);
        const effectScale = MAGIC_EFFECT_SCALE;
        effect.setScale(effectScale, effectScale, 1);
        effect.setSiblingIndex(this.root.children.length - 1);
        const sourcePosition = rootTransform.convertToNodeSpaceAR(source.worldPosition);
        const targetPosition = rootTransform.convertToNodeSpaceAR(target.worldPosition);
        effect.setPosition(sourcePosition);
        this.active.add(effect);

        let impactStarted = false;
        skeleton.setCompleteListener(() => {
            if (!impactStarted || !effect.isValid) return;
            this.active.delete(effect);
            effect.destroy();
        });
        skeleton.setAnimation(0, definition.launchAnimation, false);
        tween(effect)
            .to(0.55, { position: new Vec3(targetPosition.x, targetPosition.y, targetPosition.z) }, { easing: 'quadInOut' })
            .call(() => {
                if (!effect.isValid || generation !== this.generation) return;
                impactStarted = true;
                skeleton.setAnimation(0, definition.impactAnimation, false);
            })
            .start();
    }

    public clear(): void {
        this.generation += 1;
        for (const effect of this.active) {
            if (!effect.isValid) continue;
            Tween.stopAllByTarget(effect);
            effect.destroy();
        }
        this.active.clear();
    }

    private load(asset: string): Promise<sp.SkeletonData> {
        const existing = this.dataRequests.get(asset);
        if (existing) return existing;
        const request = new Promise<sp.SkeletonData>((resolve, reject) => {
            const resourcePath = `Spine/Magic/${asset}`;
            const cached = assetManager.getBundle(MAGIC_SPINE_BUNDLE);
            if (cached) cached.load(resourcePath, sp.SkeletonData, (error, data) => {
                if (error || !data) reject(error ?? new Error(`魔法表情资源加载失败: ${resourcePath}`));
                else resolve(data);
            });
            else assetManager.loadBundle(MAGIC_SPINE_BUNDLE, (error, bundle) => {
                if (error || !bundle) reject(error ?? new Error(`公共资源包加载失败: ${MAGIC_SPINE_BUNDLE}`));
                else bundle.load(resourcePath, sp.SkeletonData, (assetError, data) => {
                    if (assetError || !data) reject(assetError ?? new Error(`魔法表情资源加载失败: ${resourcePath}`));
                    else resolve(data);
                });
            });
        }).catch((error: unknown) => {
            this.dataRequests.delete(asset);
            throw error;
        });
        this.dataRequests.set(asset, request);
        return request;
    }
}
