import { Asset, AssetManager, AudioClip, AudioSource, Node, assetManager, resources } from 'cc';
import { LifecycleScope } from '../Runtime/core/LifecycleScope';

export class UiEventBus<Events extends Record<string, unknown>> {
    private readonly listeners = new Map<keyof Events, Set<(value: never) => void>>();
    public on<K extends keyof Events>(name: K, listener: (value: Events[K]) => void): () => void {
        const listeners = this.listeners.get(name) ?? new Set();
        listeners.add(listener as (value: never) => void); this.listeners.set(name, listeners);
        return () => { listeners.delete(listener as (value: never) => void); };
    }
    public emit<K extends keyof Events>(name: K, value: Events[K]): void { for (const listener of this.listeners.get(name) ?? []) listener(value as never); }
    public clear(): void { this.listeners.clear(); }
}

export class AssetLoader {
    private static readonly LOAD_TIMEOUT_MS = 15_000;
    private readonly retained = new Map<Asset, number>();
    public async load<T extends Asset>(path: string, type: new (...args: any[]) => T, bundle?: AssetManager.Bundle): Promise<T> {
        const asset = await new Promise<T>((resolve, reject) => {
            let settled = false;
            const timeout = globalThis.setTimeout(() => {
                if (settled) return;
                settled = true;
                reject(new Error(`asset load timeout: ${path}`));
            }, AssetLoader.LOAD_TIMEOUT_MS);
            const callback = (error: Error | null, result: T): void => {
                if (settled) return;
                settled = true;
                globalThis.clearTimeout(timeout);
                if (error || !result) reject(error ?? new Error(`asset missing: ${path}`));
                else resolve(result);
            };
            if (bundle) bundle.load(path, type, callback);
            else resources.load(path, type, callback);
        });
        asset.addRef();
        this.retained.set(asset, (this.retained.get(asset) ?? 0) + 1);
        return asset;
    }
    public async bundle(name: string): Promise<AssetManager.Bundle> {
        return new Promise((resolve, reject) => {
            let settled = false;
            const timeout = globalThis.setTimeout(() => {
                if (settled) return;
                settled = true;
                reject(new Error(`bundle load timeout: ${name}`));
            }, AssetLoader.LOAD_TIMEOUT_MS);
            assetManager.loadBundle(name, (error, result) => {
                if (settled) return;
                settled = true;
                globalThis.clearTimeout(timeout);
                if (error || !result) reject(error ?? new Error(`bundle missing: ${name}`));
                else resolve(result);
            });
        });
    }
    public release(asset: Asset): void {
        const count = this.retained.get(asset) ?? 0;
        if (count <= 0) return;
        asset.decRef();
        if (count === 1) this.retained.delete(asset);
        else this.retained.set(asset, count - 1);
    }
    public releaseAll(): void {
        for (const [asset, count] of this.retained) {
            for (let index = 0; index < count; index += 1) asset.decRef();
        }
        this.retained.clear();
    }
}

export interface SoundSettings { music: boolean; effects: boolean; musicVolume: number; effectsVolume: number; }

export class SoundCenter {
    private readonly host = new Node('SoundCenter');
    private readonly music = this.host.addComponent(AudioSource);
    private readonly effects = this.host.addComponent(AudioSource);
    public constructor(private readonly loader: AssetLoader, private settings: SoundSettings) { this.apply(settings); }
    public attach(parent: Node): void { if (!this.host.parent) parent.addChild(this.host); }
    public apply(settings: SoundSettings): void { this.settings = settings; this.music.volume = settings.musicVolume; this.effects.volume = settings.effectsVolume; if (!settings.music) this.music.stop(); }
    public async playMusic(path: string, loop = true): Promise<void> { if (!this.settings.music) return; this.music.clip = await this.loader.load(path, AudioClip); this.music.loop = loop; this.music.play(); }
    public async playEffect(path: string): Promise<void> { if (this.settings.effects) this.effects.playOneShot(await this.loader.load(path, AudioClip), this.settings.effectsVolume); }
    public dispose(): void { this.music.stop(); this.effects.stop(); this.host.destroy(); }
}

/** Base owner for timers/listeners/assets created by a UI controller. */
export abstract class ScopedUiController {
    protected readonly lifecycle = new LifecycleScope();
    protected openScope(): number { return this.lifecycle.open(); }
    public dispose(): void { this.lifecycle.close(); }
}
