import { AssetManager, AudioClip, AudioSource, Node, assetManager } from 'cc';
import { legacyLocalDataStore } from '../../../../../../../Common/Code/Runtime/core/LegacyLocalDataStore';
import { legacyAudioService } from '../../../../../../../Common/Code/Runtime/core/LegacyAudioService';

export const PDK_ROOM_AUDIO_BUNDLE = 'paodekuai-common';
export type PdkRoomSound = 'baojing' | 'chupai' | 'daojishi' | 'fapai' | 'lose' | 'win' | 'xipai' | 'xuanpai' | 'zhuang' | 'zuoxia';

/**
 * Owns PDK room music and operation effects. Missing bundles/clips are an allowed
 * deployment state: every public playback entry degrades to a silent false result.
 */
export class PdkRoomAudioPresenter {
    private readonly host = new Node('PdkRoomAudio');
    private readonly music = this.host.addComponent(AudioSource);
    private readonly effect = this.host.addComponent(AudioSource);
    private readonly clips = new Map<string, Promise<AudioClip | null>>();
    private readonly timers = new Set<ReturnType<typeof setTimeout>>();
    private readonly disposeSettings: () => void;
    private bundlePromise: Promise<AssetManager.Bundle | null> | null = null;

    public constructor(parent: Node) {
        parent.addChild(this.host);
        this.music.loop = true;
        this.disposeSettings = legacyAudioService.onSettingsChanged((settings) => {
            this.music.volume = settings.musicVolume;
            this.effect.volume = settings.effectsVolume;
            if (!settings.musicEnabled) this.music.stop();
            if (!settings.effectsEnabled) this.effect.stop();
        });
    }

    public async playMusic(): Promise<boolean> {
        if (!this.host.isValid || legacyLocalDataStore.get('SysSetting', 'BackMusic', 1) !== 1) return false;
        const clip = await this.load('Audio/Room/bg');
        if (!clip || !this.host.isValid) return false;
        this.music.clip = clip;
        this.music.volume = Number(legacyLocalDataStore.get('SysSetting', 'BackVolume', 1));
        this.music.play();
        return true;
    }

    public async play(sound: PdkRoomSound, delayMs = 0): Promise<boolean> {
        if (delayMs > 0) {
            return new Promise((resolve) => {
                const timer = globalThis.setTimeout(() => {
                    this.timers.delete(timer);
                    void this.play(sound).then(resolve, () => resolve(false));
                }, delayMs);
                this.timers.add(timer);
            });
        }
        if (!this.host.isValid || legacyLocalDataStore.get('SysSetting', 'SpSound', 1) !== 1) return false;
        const clip = await this.load(`Audio/Room/${sound}`);
        if (!clip || !this.host.isValid) return false;
        this.effect.playOneShot(clip, 1);
        return true;
    }

    public destroy(): void {
        this.disposeSettings();
        for (const timer of this.timers) globalThis.clearTimeout(timer);
        this.timers.clear();
        this.music.stop();
        this.effect.stop();
        this.clips.clear();
        if (this.host.isValid) this.host.destroy();
    }

    private load(path: string): Promise<AudioClip | null> {
        const cached = this.clips.get(path);
        if (cached) return cached;
        const request = this.bundle().then((bundle) => {
            if (!bundle) return null;
            return new Promise<AudioClip | null>((resolve) => {
                bundle.load(path, AudioClip, (error, clip) => resolve(error || !clip ? null : clip));
            });
        }, () => null);
        this.clips.set(path, request);
        return request;
    }

    private bundle(): Promise<AssetManager.Bundle | null> {
        if (this.bundlePromise) return this.bundlePromise;
        this.bundlePromise = new Promise((resolve) => {
            assetManager.loadBundle(PDK_ROOM_AUDIO_BUNDLE, (error, bundle) => resolve(error || !bundle ? null : bundle));
        });
        return this.bundlePromise;
    }
}
