import { AssetManager, AudioClip, AudioSource, assetManager } from 'cc';

export const QUICK_TEXT_AUDIO_BUNDLE = 'games-common-audio';

export type QuickTextGender = 'Boy' | 'Girl';
export type QuickTextRegion = 'CD' | 'NJ' | 'LS';

export interface QuickTextAudioRequest {
    readonly quickTextId: number;
    readonly gender: QuickTextGender;
    readonly region?: QuickTextRegion;
}

export interface QuickTextAudioRoute {
    readonly bundleName: typeof QUICK_TEXT_AUDIO_BUNDLE;
    readonly candidates: readonly string[];
}

const MIN_QUICK_TEXT_ID = 1;
const MAX_QUICK_TEXT_ID = 10;

/** Region audio is optional. Loading always falls back to the matching Mandarin voice. */
export function resolveQuickTextAudioRoute(request: QuickTextAudioRequest): QuickTextAudioRoute {
    if (!Number.isInteger(request.quickTextId)
        || request.quickTextId < MIN_QUICK_TEXT_ID
        || request.quickTextId > MAX_QUICK_TEXT_ID) {
        throw new Error(`快捷文字 ID 无效: ${request.quickTextId}`);
    }

    const fileName = `quick-text-${String(request.quickTextId).padStart(2, '0')}`;
    const mandarinPath = `Chat/Mandarin/${request.gender}/${fileName}`;
    const candidates = request.region
        ? [`Chat/Dialect/${request.region}/${request.gender}/${fileName}`, mandarinPath]
        : [mandarinPath];
    return { bundleName: QUICK_TEXT_AUDIO_BUNDLE, candidates };
}

/** Shared quick-text player. Missing regional clips are resolved by the catalog fallback order. */
export class QuickTextAudioPlayer {
    private bundlePromise: Promise<AssetManager.Bundle> | null = null;

    public constructor(private readonly source: AudioSource) {}

    public async play(request: QuickTextAudioRequest): Promise<string> {
        const route = resolveQuickTextAudioRoute(request);
        const bundle = await this.loadBundle(route.bundleName);
        let lastError: Error | null = null;
        for (const path of route.candidates) {
            try {
                const clip = await this.loadClip(bundle, path);
                this.source.playOneShot(clip);
                return path;
            } catch (error: unknown) {
                lastError = error instanceof Error ? error : new Error(String(error));
            }
        }
        throw lastError ?? new Error('快捷文字语音不存在');
    }

    private loadBundle(name: string): Promise<AssetManager.Bundle> {
        const loaded = assetManager.getBundle(name);
        if (loaded) return Promise.resolve(loaded);
        if (!this.bundlePromise) {
            this.bundlePromise = new Promise((resolve, reject) => {
                assetManager.loadBundle(name, (error, bundle) => {
                    if (error || !bundle) reject(error ?? new Error(`音频 Bundle 不存在: ${name}`));
                    else resolve(bundle);
                });
            });
        }
        return this.bundlePromise;
    }

    private loadClip(bundle: AssetManager.Bundle, path: string): Promise<AudioClip> {
        return new Promise((resolve, reject) => {
            bundle.load(path, AudioClip, (error, clip) => {
                if (error || !clip) reject(error ?? new Error(`快捷文字语音不存在: ${path}`));
                else resolve(clip);
            });
        });
    }
}
