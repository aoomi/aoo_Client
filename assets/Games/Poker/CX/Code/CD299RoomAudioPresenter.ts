import { AssetManager, AudioClip, AudioSource, Node, assetManager } from 'cc';
import { legacyLocalDataStore } from '../../../../Common/Code/Runtime/core/LegacyLocalDataStore';
import { legacyAudioService } from '../../../../Common/Code/Runtime/core/LegacyAudioService';
import type { CD299BetAction } from './CD299Protocol';

const CD299_AUDIO_BUNDLE = 'poker-cx';

export type CD299RoomSound = 'deal' | 'select' | CD299BetAction;

const EFFECT_PATHS: Readonly<Record<CD299RoomSound, string>> = Object.freeze({
    deal: 'Audio/fapai', select: 'Audio/xuanpai',
    DROP: 'Audio/diu', FOLLOW: 'Audio/gen', REST: 'Audio/xiu',
    RAISE: 'Audio/da', ALL_IN: 'Audio/qiao',
});

/** CD299-owned room music/effects using the migrated XQP clips and shared sound settings. */
export class CD299RoomAudioPresenter {
    private readonly host = new Node('CD299RoomAudio');
    private readonly music = this.host.addComponent(AudioSource);
    private readonly effect = this.host.addComponent(AudioSource);
    private readonly clips = new Map<string, Promise<AudioClip | null>>();
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
        const clip = await this.load('Audio/bg');
        if (!clip || !this.host.isValid) return false;
        this.music.clip = clip;
        this.music.volume = Number(legacyLocalDataStore.get('SysSetting', 'BackVolume', 1));
        this.music.play();
        return true;
    }

    public async play(sound: CD299RoomSound): Promise<boolean> {
        if (!this.host.isValid || legacyLocalDataStore.get('SysSetting', 'SpSound', 1) !== 1) return false;
        const clip = await this.load(EFFECT_PATHS[sound]);
        if (!clip || !this.host.isValid) return false;
        this.effect.playOneShot(clip, 1);
        return true;
    }

    public destroy(): void {
        this.disposeSettings();
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
            const loaded = assetManager.getBundle(CD299_AUDIO_BUNDLE);
            if (loaded) resolve(loaded);
            else assetManager.loadBundle(CD299_AUDIO_BUNDLE,
                (error, bundle) => resolve(error || !bundle ? null : bundle));
        });
        return this.bundlePromise;
    }
}
