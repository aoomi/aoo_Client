import { assetManager, ImageAsset, Sprite, SpriteFrame, Texture2D } from 'cc';

interface CachedImage {
    frame: SpriteFrame;
    texture: Texture2D;
    refs: number;
}

export class LegacyRemoteImageService {
    private readonly cache = new Map<string, CachedImage>();
    private readonly pending = new Map<string, Promise<SpriteFrame>>();

    public load(url: string): Promise<SpriteFrame> {
        const normalized = this.normalize(url);
        if (!normalized) return Promise.reject(new Error('远程图片地址为空'));
        const cached = this.cache.get(normalized);
        if (cached) {
            cached.refs += 1;
            return Promise.resolve(cached.frame);
        }
        const pending = this.pending.get(normalized);
        if (pending) return pending;
        const request = new Promise<SpriteFrame>((resolve, reject) => {
            assetManager.loadRemote<ImageAsset>(normalized, { ext: this.extension(normalized) }, (error, image) => {
                this.pending.delete(normalized);
                if (error || !image) {
                    reject(error ?? new Error(`远程图片加载失败: ${normalized}`));
                    return;
                }
                const texture = new Texture2D();
                texture.image = image;
                const frame = new SpriteFrame();
                frame.texture = texture;
                this.cache.set(normalized, { frame, texture, refs: 1 });
                resolve(frame);
            });
        });
        this.pending.set(normalized, request);
        return request;
    }

    public async assign(sprite: Sprite, url: string): Promise<boolean> {
        const frame = await this.load(url);
        if (!sprite.node.isValid) {
            this.release(url);
            return false;
        }
        sprite.spriteFrame = frame;
        return true;
    }

    public release(url: string): void {
        const normalized = this.normalize(url);
        const cached = this.cache.get(normalized);
        if (!cached) return;
        cached.refs -= 1;
        if (cached.refs > 0) return;
        cached.frame.destroy();
        cached.texture.destroy();
        this.cache.delete(normalized);
    }

    public clear(): void {
        for (const image of this.cache.values()) {
            image.frame.destroy();
            image.texture.destroy();
        }
        this.cache.clear();
        this.pending.clear();
    }

    private normalize(url: string): string {
        const value = url.trim();
        if (!value) return '';
        if (value.includes('thirdwx.qlogo.cn') && !/[?&][^=]+=/u.test(value)) return `${value}?a.png`;
        return value;
    }

    private extension(url: string): '.png' | '.jpg' {
        return /\.png(?:\?|$)/iu.test(url) ? '.png' : '.jpg';
    }
}

export const legacyRemoteImageService = new LegacyRemoteImageService();
