import { AssetManager, AudioClip, AudioSource, Node, assetManager } from 'cc';
import { legacyLocalDataStore } from '../../../../../../../Common/Code/Runtime/core/LegacyLocalDataStore';
import { legacyAudioService } from '../../../../../../../Common/Code/Runtime/core/LegacyAudioService';

export const PDK_GAME_AUDIO_BUNDLE = 'paodekuai-common';
export type PdkVoiceGender = 'Boy' | 'Girl';

const RANK_NAMES: Readonly<Record<number, string>> = Object.freeze({
    4: '4', 5: '5', 6: '6', 7: '7', 8: '8', 9: '9', 10: '10',
    11: 'j', 12: 'q', 13: 'k', 14: 'a',
});

const PATTERN_AUDIO: Readonly<Record<number, string>> = Object.freeze({
    1: 'pass_0',
    4: 'shunzi',
    6: 'sandaiyi',
    7: 'sandaier',
    9: 'sidaier',
    11: 'zhadan',
    12: 'feiji',
    13: 'feiji',
    14: 'liandui',
    15: 'sandaidui',
    16: 'feiji',
    17: 'feiji',
    18: 'feiji',
    19: 'feiji',
    20: 'sidaierdui',
});

function cardRank(card: number): number {
    const normalized = card > 500 ? card - 500 : card;
    return normalized >= 100 ? normalized % 100 : normalized & 0x0f;
}

function repeatedRank(cards: readonly number[], minimumCount: number): number | null {
    const counts = new Map<number, number>();
    for (const card of cards) {
        const rank = cardRank(Number(card));
        counts.set(rank, (counts.get(rank) ?? 0) + 1);
    }
    return [...counts.entries()]
        .filter(([, count]) => count >= minimumCount)
        .map(([rank]) => rank)
        .sort((left, right) => right - left)[0] ?? null;
}

/** Returns null when this supplied audio set has no exact announcement for the play. */
export function pdkGameAudioPath(opCardType: number, cards: readonly number[], gender: PdkVoiceGender): string | null {
    let file: string | null = PATTERN_AUDIO[opCardType] ?? null;
    if (opCardType === 2) {
        const rank = RANK_NAMES[cardRank(Number(cards[0]))];
        file = rank ? `ge${rank}_0` : null;
    } else if (opCardType === 3) {
        const rank = repeatedRank(cards, 2);
        file = rank === null ? null : RANK_NAMES[rank] ? `dui${RANK_NAMES[rank]}_0` : null;
    } else if (opCardType === 5) {
        const rank = repeatedRank(cards, 3);
        file = rank === null ? null : RANK_NAMES[rank] ? `sange${RANK_NAMES[rank]}_0` : null;
    }
    return file ? `Audio/Game/${gender}/${file}` : null;
}

export function pdkVoiceGender(player: Record<string, unknown> | null | undefined): PdkVoiceGender {
    const raw = player?.sex ?? player?.gender ?? player?.userSex;
    const normalized = String(raw ?? '').trim().toLowerCase();
    if (raw === 2 || normalized === '2' || normalized === 'girl' || normalized === 'female' || normalized === '女') return 'Girl';
    return 'Boy';
}

export class PdkGameAudioPresenter {
    private readonly host = new Node('PdkGameAudio');
    private readonly source = this.host.addComponent(AudioSource);
    private readonly clips = new Map<string, Promise<AudioClip>>();
    private bundlePromise: Promise<AssetManager.Bundle> | null = null;
    private readonly disposeSettings: () => void;

    public constructor(parent: Node) {
        parent.addChild(this.host);
        this.disposeSettings = legacyAudioService.onSettingsChanged((settings) => {
            this.source.volume = settings.effectsVolume;
            if (!settings.effectsEnabled) this.source.stop();
        });
    }

    public async play(opCardType: number, cards: readonly number[], gender: PdkVoiceGender): Promise<boolean> {
        if (!this.host.isValid || legacyLocalDataStore.get('SysSetting', 'SpSound', 1) !== 1) return false;
        const path = pdkGameAudioPath(opCardType, cards, gender);
        if (!path) return false;
        const clip = await this.load(path);
        if (!this.host.isValid) return false;
        this.source.playOneShot(clip, 1);
        return true;
    }

    public destroy(): void {
        this.disposeSettings();
        this.source.stop();
        this.clips.clear();
        if (this.host.isValid) this.host.destroy();
    }

    private load(path: string): Promise<AudioClip> {
        const cached = this.clips.get(path);
        if (cached) return cached;
        const request = this.bundle().then((bundle) => new Promise<AudioClip>((resolve, reject) => {
            bundle.load(path, AudioClip, (error, clip) => {
                if (error || !clip) reject(error ?? new Error(`跑得快出牌语音不存在: ${path}`));
                else resolve(clip);
            });
        }));
        this.clips.set(path, request);
        request.catch(() => this.clips.delete(path));
        return request;
    }

    private bundle(): Promise<AssetManager.Bundle> {
        if (this.bundlePromise) return this.bundlePromise;
        this.bundlePromise = new Promise((resolve, reject) => {
            assetManager.loadBundle(PDK_GAME_AUDIO_BUNDLE, (error, bundle) => {
                if (error || !bundle) reject(error ?? new Error(`跑得快出牌语音 Bundle 不存在: ${PDK_GAME_AUDIO_BUNDLE}`));
                else resolve(bundle);
            });
        });
        this.bundlePromise.catch(() => { this.bundlePromise = null; });
        return this.bundlePromise;
    }
}
