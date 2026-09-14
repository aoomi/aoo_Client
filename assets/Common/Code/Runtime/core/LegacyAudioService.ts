import { AudioClip, AudioSource, Node, resources } from 'cc';
import { legacyLocalDataStore } from './LegacyLocalDataStore';

export interface LegacyAudioSettings {
    musicEnabled: boolean;
    effectsEnabled: boolean;
    musicVolume: number;
    effectsVolume: number;
}

export class LegacyAudioService {
    private readonly node = new Node('LegacyAudioService');
    private readonly music = this.node.addComponent(AudioSource);
    private readonly effects = this.node.addComponent(AudioSource);
    private readonly clips = new Map<string, AudioClip>();
    private readonly settingsListeners = new Set<(settings: LegacyAudioSettings) => void>();

    public attach(parent: Node): void {
        if (!this.node.parent) parent.addChild(this.node);
        this.applySettings();
    }

    /** Keeps the audio host alive while its current scene is being replaced. */
    public detach(): void {
        if (this.node.isValid) this.node.removeFromParent();
    }

    public async playMusic(path: string, loop = true): Promise<boolean> {
        if (legacyLocalDataStore.get('SysSetting', 'BackMusic', 1) !== 1) return false;
        const clip = await this.load(path);
        this.music.clip = clip;
        this.music.loop = loop;
        this.music.play();
        return true;
    }

    public async playEffect(path: string): Promise<boolean> {
        if (legacyLocalDataStore.get('SysSetting', 'SpSound', 1) !== 1) return false;
        this.effects.playOneShot(await this.load(path), 1);
        return true;
    }

    public stopMusic(): void { this.music.stop(); }
    public pauseMusic(): void { this.music.pause(); }
    public resumeMusic(): void { this.music.play(); }

    public applySettings(): void {
        const settings = this.readSettings();
        this.music.volume = settings.musicVolume;
        this.effects.volume = settings.effectsVolume;
        if (!settings.musicEnabled) this.music.stop();
        if (!settings.effectsEnabled) this.effects.stop();
        for (const listener of this.settingsListeners) listener(settings);
    }

    public onSettingsChanged(listener: (settings: LegacyAudioSettings) => void): () => void {
        this.settingsListeners.add(listener);
        listener(this.readSettings());
        return () => this.settingsListeners.delete(listener);
    }

    public dispose(): void {
        this.music.stop();
        this.effects.stop();
        this.clips.clear();
        this.settingsListeners.clear();
        this.node.destroy();
    }

    private readSettings(): LegacyAudioSettings {
        return {
            musicEnabled: legacyLocalDataStore.get('SysSetting', 'BackMusic', 1) === 1,
            effectsEnabled: legacyLocalDataStore.get('SysSetting', 'SpSound', 1) === 1,
            musicVolume: Number(legacyLocalDataStore.get('SysSetting', 'BackVolume', 1)),
            effectsVolume: Number(legacyLocalDataStore.get('SysSetting', 'SpVolume', 1)),
        };
    }

    private load(path: string): Promise<AudioClip> {
        const cached = this.clips.get(path);
        if (cached) return Promise.resolve(cached);
        return new Promise((resolve, reject) => resources.load(path, AudioClip, (error, clip) => {
            if (error || !clip) { reject(error ?? new Error(`音频不存在: ${path}`)); return; }
            this.clips.set(path, clip);
            resolve(clip);
        }));
    }
}

export const legacyAudioService = new LegacyAudioService();
