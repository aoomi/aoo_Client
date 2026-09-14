import { assetManager, director, Director, Node, sp } from 'cc';
import {
    PDK_ANIMATION_BUNDLE,
    pdkAnimationDefinition,
    resolvePdkAnimationFolderKey,
    type PdkAnimationFolderKey,
} from './PdkAnimationRegistry';

const LOAD_TIMEOUT_MS = 10_000;

export class PdkAnimationResolver {
    private bundlePromise: Promise<ReturnType<typeof assetManager.getBundle>> | null = null;
    private readonly dataPromises = new Map<PdkAnimationFolderKey, Promise<sp.SkeletonData>>();
    private readonly activeMounts = new Set<Node>();
    private readonly effectSuppressors = new Map<Node, () => void>();
    private generation = 0;

    public constructor(private readonly findMount: (path: string) => Node | null) {}

    public async play(folderKeyOrAlias: string, physicalSlot = 0): Promise<void> {
        const folderKey = resolvePdkAnimationFolderKey(folderKeyOrAlias);
        const definition = pdkAnimationDefinition(folderKey);
        const generation = this.generation;
        // Seat 0 uses the prefab's shared Play_CardSpine mount; opponent seats
        // retain their individually authored card-pattern mounts and positions.
        const mountPath = physicalSlot === 0
            ? 'Players/Play_0/Spine/Play_CardSpine'
            : `Players/Play_${physicalSlot}/Spine/${definition.mountPath}`;
        const mount = this.findMount(mountPath);
        if (!mount?.isValid) throw new Error(`跑得快动画挂载点缺失：${mountPath}`);
        const data = await this.loadData(folderKey);
        if (generation !== this.generation || !mount.isValid) return;

        const skeleton = mount.getComponent(sp.Skeleton) ?? mount.addComponent(sp.Skeleton);
        skeleton.clearTracks();
        skeleton.skeletonData = data;
        const animationName = (physicalSlot === 1 || physicalSlot === 2)
            ? definition.sideAnimationName ?? definition.animationName
            : definition.animationName;
        if (!data.getRuntimeData()?.animations?.some((animation) => animation.name === animationName)) {
            throw new Error(`跑得快动画动作缺失：${definition.assetPath}/${animationName}`);
        }
        mount.active = true;
        this.activeMounts.add(mount);
        this.suppressLightAndShadowEffects(mount, skeleton, data);
        skeleton.setCompleteListener(() => {
            this.removeEffectSuppressor(mount);
            if (mount.isValid && generation === this.generation) mount.active = false;
            this.activeMounts.delete(mount);
        });
        skeleton.setAnimation(0, animationName, false);
    }

    public clear(): void {
        this.generation += 1;
        for (const mount of this.activeMounts) {
            if (!mount.isValid) continue;
            const skeleton = mount.getComponent(sp.Skeleton);
            skeleton?.setCompleteListener(null);
            skeleton?.clearTracks();
            mount.active = false;
            this.removeEffectSuppressor(mount);
        }
        this.activeMounts.clear();
    }

    private suppressLightAndShadowEffects(mount: Node, skeleton: sp.Skeleton, data: sp.SkeletonData): void {
        this.removeEffectSuppressor(mount);
        const names = (data.getRuntimeData()?.slots ?? [])
            .map((slot) => String(slot.name ?? ''))
            .filter((name) => /glow|halo|guang|gx_|lizi|diquan|shadow|ying/i.test(name));
        if (names.length === 0) return;
        const suppress = (): void => {
            for (const name of names) {
                const slot = skeleton.findSlot(name);
                if (slot?.color) slot.color.a = 0;
            }
        };
        this.effectSuppressors.set(mount, suppress);
        director.on(Director.EVENT_AFTER_UPDATE, suppress, this);
        suppress();
    }

    private removeEffectSuppressor(mount: Node): void {
        const suppress = this.effectSuppressors.get(mount);
        if (!suppress) return;
        director.off(Director.EVENT_AFTER_UPDATE, suppress, this);
        this.effectSuppressors.delete(mount);
    }

    public destroy(): void {
        this.clear();
        this.dataPromises.clear();
        this.bundlePromise = null;
    }

    private loadData(folderKey: PdkAnimationFolderKey): Promise<sp.SkeletonData> {
        const cached = this.dataPromises.get(folderKey);
        if (cached) return cached;
        const loading = this.loadDataOnce(folderKey).catch((error: unknown) => {
            this.dataPromises.delete(folderKey);
            throw error;
        });
        this.dataPromises.set(folderKey, loading);
        return loading;
    }

    private async loadDataOnce(folderKey: PdkAnimationFolderKey): Promise<sp.SkeletonData> {
        const bundle = await this.loadBundle();
        if (!bundle) throw new Error(`跑得快动画 Bundle ${PDK_ANIMATION_BUNDLE} 不存在`);
        return this.loadAsset(bundle, pdkAnimationDefinition(folderKey).assetPath, sp.SkeletonData);
    }

    private loadBundle(): Promise<ReturnType<typeof assetManager.getBundle>> {
        if (this.bundlePromise) return this.bundlePromise;
        this.bundlePromise = this.withTimeout(new Promise((resolve, reject) => {
            const loaded = assetManager.getBundle(PDK_ANIMATION_BUNDLE);
            if (loaded) { resolve(loaded); return; }
            assetManager.loadBundle(PDK_ANIMATION_BUNDLE, (error, bundle) => {
                if (error || !bundle) reject(error ?? new Error(`Bundle ${PDK_ANIMATION_BUNDLE} 不存在`));
                else resolve(bundle);
            });
        }), `跑得快动画 Bundle ${PDK_ANIMATION_BUNDLE} 加载超时`);
        return this.bundlePromise;
    }

    private loadAsset<T>(bundle: NonNullable<ReturnType<typeof assetManager.getBundle>>, path: string, type: new (...args: never[]) => T): Promise<T> {
        return this.withTimeout(new Promise<T>((resolve, reject) => {
            const load = bundle.load as unknown as (
                assetPath: string,
                assetType: new (...args: never[]) => T,
                callback: (error: Error | null, asset: T | null) => void,
            ) => void;
            load.call(bundle, path, type, (error: Error | null, asset: T | null) => {
                if (error || !asset) reject(error ?? new Error(`跑得快动画资源缺失：${path}`));
                else resolve(asset);
            });
        }), `跑得快动画资源加载超时：${path}`);
    }

    private withTimeout<T>(operation: Promise<T>, message: string): Promise<T> {
        return new Promise<T>((resolve, reject) => {
            const timer = globalThis.setTimeout(() => reject(new Error(message)), LOAD_TIMEOUT_MS);
            operation.then(
                value => { globalThis.clearTimeout(timer); resolve(value); },
                error => { globalThis.clearTimeout(timer); reject(error); },
            );
        });
    }
}
