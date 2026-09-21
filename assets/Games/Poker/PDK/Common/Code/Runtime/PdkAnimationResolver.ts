import { assetManager, director, Director, Node, sp, Texture2D } from 'cc';
import {
    PDK_ANIMATION_BUNDLE,
    pdkAnimationDefinition,
    resolvePdkAnimationFolderKey,
    type PdkAnimationFolderKey,
} from './PdkAnimationRegistry';

const LOAD_TIMEOUT_MS = 10_000;

export interface PdkAnimationPlaybackContext {
    readonly roomId?: number;
    readonly playerId?: number;
    readonly operationId?: string;
    readonly stateVersion?: number;
    readonly opType?: number;
}

export class PdkAnimationResolver {
    private bundlePromise: Promise<ReturnType<typeof assetManager.getBundle>> | null = null;
    private readonly dataPromises = new Map<PdkAnimationFolderKey, Promise<sp.SkeletonData>>();
    private readonly activeMounts = new Set<Node>();
    private readonly effectSuppressors = new Map<Node, () => void>();
    /** A newer play on the same physical mount owns completion and cleanup. */
    private readonly mountRevisions = new Map<Node, number>();
    private generation = 0;

    public constructor(private readonly findMount: (path: string) => Node | null) {}

    public async play(
        folderKeyOrAlias: string,
        physicalSlot = 0,
        context: PdkAnimationPlaybackContext = {},
    ): Promise<void> {
        const folderKey = resolvePdkAnimationFolderKey(folderKeyOrAlias);
        const definition = pdkAnimationDefinition(folderKey);
        const generation = this.generation;
        // Every seat owns one authoritative card-pattern mount in the current
        // common-room prefab. Switching SkeletonData on this stable node keeps
        // presentation code independent from the removed per-pattern mounts.
        const mountPath = `Players/Play_${physicalSlot}/Spine/Play_CardSpine`;
        const mount = this.findMount(mountPath);
        if (!mount?.isValid) throw new Error(`跑得快动画挂载点缺失：${mountPath}`);
        const revision = (this.mountRevisions.get(mount) ?? 0) + 1;
        this.mountRevisions.set(mount, revision);
        const diagnostic = {
            roomId: Number(context.roomId ?? 0),
            playerId: Number(context.playerId ?? 0),
            operationId: String(context.operationId ?? ''),
            stateVersion: Number(context.stateVersion ?? -1),
            opType: Number(context.opType ?? 0),
            folderKey,
            bundleName: PDK_ANIMATION_BUNDLE,
            assetPath: definition.assetPath,
            animationName: (physicalSlot === 1 || physicalSlot === 2)
                ? definition.sideAnimationName ?? definition.animationName
                : definition.animationName,
            physicalSlot,
            mountPath,
        };
        let data: sp.SkeletonData;
        try {
            data = await this.loadData(folderKey);
        } catch (error: unknown) {
            console.error('[PdkAnimation]', {
                event: 'LOAD_FAILED',
                ...diagnostic,
                error: error instanceof Error ? error.message : String(error),
            });
            throw error;
        }
        if (generation !== this.generation || !mount.isValid
            || this.mountRevisions.get(mount) !== revision) return;

        const skeleton = mount.getComponent(sp.Skeleton) ?? mount.addComponent(sp.Skeleton);
        skeleton.clearTracks();
        skeleton.skeletonData = data;
        const animationName = diagnostic.animationName;
        if (!data.getRuntimeData()?.animations?.some((animation) => animation.name === animationName)) {
            throw new Error(`跑得快动画动作缺失：${definition.assetPath}/${animationName}`);
        }
        mount.active = true;
        this.activeMounts.add(mount);
        this.suppressLightAndShadowEffects(mount, skeleton, data);
        skeleton.setCompleteListener(() => {
            if (this.mountRevisions.get(mount) !== revision) return;
            this.removeEffectSuppressor(mount);
            if (mount.isValid && generation === this.generation) mount.active = false;
            this.activeMounts.delete(mount);
        });
        skeleton.setAnimation(0, animationName, false);
        console.info('[PdkAnimation]', { event: 'PLAY_STARTED', ...diagnostic });
    }

    public clear(): void {
        this.generation += 1;
        for (const mount of this.activeMounts) {
            if (!mount.isValid) continue;
            const skeleton = mount.getComponent(sp.Skeleton);
            skeleton?.setCompleteListener(() => undefined);
            skeleton?.clearTracks();
            mount.active = false;
            this.removeEffectSuppressor(mount);
            this.mountRevisions.set(mount, (this.mountRevisions.get(mount) ?? 0) + 1);
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
        this.mountRevisions.clear();
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
        const definition = pdkAnimationDefinition(folderKey);
        const data = await this.loadAsset(bundle, definition.assetPath, sp.SkeletonData);
        if (data.textures.length > 0 && data.textureNames.length > 0) return data;

        // These legacy Spine files are loaded dynamically rather than through a
        // prefab dependency. Creator therefore serializes their atlas text but
        // leaves the runtime Texture2D arrays empty, which renders a magenta
        // missing-texture quad. The texture subasset is part of the same bundle
        // and path, so bind that authoritative dependency before Spine creates
        // and caches its runtime data.
        const textureName = data.atlasText.split(/\r?\n/)
            .map((line) => line.trim())
            .find((line) => /\.(?:png|jpe?g|webp)$/i.test(line));
        if (!textureName) throw new Error(`跑得快动画图集未声明纹理：${definition.assetPath}`);
        const texture = await this.loadAsset(bundle, `${definition.assetPath}/texture`, Texture2D);
        data.textures = [texture];
        data.textureNames = [textureName];
        data.reset();
        console.info('[PdkAnimation]', {
            event: 'TEXTURE_BOUND',
            folderKey,
            assetPath: definition.assetPath,
            textureName,
            textureUuid: texture.uuid,
        });
        return data;
    }

    private loadBundle(): Promise<ReturnType<typeof assetManager.getBundle>> {
        if (this.bundlePromise) return this.bundlePromise;
        const loading = this.withTimeout(new Promise<ReturnType<typeof assetManager.getBundle>>((resolve, reject) => {
            const loaded = assetManager.getBundle(PDK_ANIMATION_BUNDLE);
            if (loaded) { resolve(loaded); return; }
            assetManager.loadBundle(PDK_ANIMATION_BUNDLE, (error, bundle) => {
                if (error || !bundle) reject(error ?? new Error(`Bundle ${PDK_ANIMATION_BUNDLE} 不存在`));
                else resolve(bundle);
            });
        }), `跑得快动画 Bundle ${PDK_ANIMATION_BUNDLE} 加载超时`).catch((error: unknown) => {
            // A transient preview/network failure must not poison every later
            // animation request with the same permanently rejected Promise.
            this.bundlePromise = null;
            throw error;
        });
        this.bundlePromise = loading;
        return loading;
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
