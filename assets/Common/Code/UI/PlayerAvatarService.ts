import { assetManager, ImageAsset, Sprite, SpriteFrame, Texture2D } from 'cc';

const LOCAL_AVATAR_PORT = 8765;
const AVATAR_FILE_COUNT = 10000;
const frames = new Map<string, Promise<SpriteFrame>>();

function avatarBaseUrl(): string {
    const configured = globalThis.__aoo_RUNTIME_CONFIG__?.avatarBaseUrl?.trim();
    if (configured) return configured.endsWith('/') ? configured : `${configured}/`;
    return '';
}

function unavailableImplicitLocalAvatar(value: string): boolean {
    if (globalThis.__aoo_RUNTIME_CONFIG__?.avatarBaseUrl?.trim()) return false;
    try {
        const url = new URL(value);
        return url.port === String(LOCAL_AVATAR_PORT)
            && (url.hostname === 'localhost' || url.hostname === '127.0.0.1');
    } catch {
        return false;
    }
}

function avatarFileNumber(playerId: number): number {
    const normalized = Number.isSafeInteger(playerId) && playerId > 0 ? playerId : 1;
    return ((normalized - 1) % AVATAR_FILE_COUNT) + 1;
}

/** 优先使用玩家头像；仅在明确配置公共头像目录时，才按玩家 ID 生成备用头像地址。 */
export class PlayerAvatarService {
    public static url(playerId: number, preferredUrl = ''): string {
        const preferred = preferredUrl.trim();
        if (preferred && !unavailableImplicitLocalAvatar(preferred)) return preferred;
        const base = avatarBaseUrl();
        return base ? new URL(`tx${avatarFileNumber(playerId)}.png`, base).toString() : '';
    }

    public static frame(playerId: number, preferredUrl = ''): Promise<SpriteFrame> {
        const fallbackUrl = this.url(playerId);
        const url = this.url(playerId, preferredUrl);
        if (!url) return Promise.reject(new Error('未配置头像资源服务器地址 avatarBaseUrl'));
        return loadFrame(url).catch((error: unknown) => {
            if (!fallbackUrl || fallbackUrl === url) throw error;
            return loadFrame(fallbackUrl);
        });
    }

    public static async assign(sprite: Sprite | null, playerId: number, preferredUrl = ''): Promise<boolean> {
        if (!sprite?.node.isValid || !Number.isSafeInteger(playerId) || playerId <= 0) return false;
        const frame = await this.frame(playerId, preferredUrl).catch(() => null);
        if (!frame || !sprite.node.isValid) return false;
        sprite.spriteFrame = frame;
        return true;
    }
}

function loadFrame(url: string): Promise<SpriteFrame> {
    const cached = frames.get(url);
    if (cached) return cached;
    const request = new Promise<SpriteFrame>((resolve, reject) => {
        const extension = /\.png(?:$|\?)/iu.test(url) ? '.png' : '.jpg';
        assetManager.loadRemote<ImageAsset>(url, { ext: extension }, (error, image) => {
            if (error || !image) {
                reject(error ?? new Error(`玩家头像加载失败: ${url}`));
                return;
            }
            const texture = new Texture2D();
            texture.image = image;
            const frame = new SpriteFrame();
            frame.texture = texture;
            resolve(frame);
        });
    }).catch((error: unknown) => {
        frames.delete(url);
        throw error;
    });
    frames.set(url, request);
    return request;
}
