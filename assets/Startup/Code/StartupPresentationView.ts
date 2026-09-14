import { presentationTransition, type InitialPresentationBoundary } from '../../Common/Code/Runtime/ui/PresentationTransitionCoordinator';
import { SpriteFrame, Texture2D } from 'cc';
import { AssetLoader } from '../../Common/Code/UI/Infrastructure';

const StartupPresentationAssetCatalog = Object.freeze({
    bundle: 'Startup',
    backgroundSpriteFrame: 'Texture/StartupBg/spriteFrame',
});

class StartupPresentationView implements InitialPresentationBoundary {
    private root: HTMLElement | null = null;
    private released = false;
    private readonly assetLoader = new AssetLoader();
    private backgroundLoading: Promise<void> | null = null;
    private displayedProgress = 0;
    private targetProgress = 0;
    private progressFrame: number | null = null;
    private progressTimestamp = 0;

    public constructor() {
        presentationTransition.attachInitialPresentation(this);
    }

    public update(_message: string, progress: number, failed: boolean): boolean {
        const root = this.resolveRoot();
        if (!root) return false;
        this.released = false;
        void this.prepareBackground();
        root.hidden = false;
        root.setAttribute('aria-hidden', 'false');
        const status = root.querySelector<HTMLElement>('.aoo-startup-status');
        const fill = root.querySelector<HTMLElement>('.aoo-startup-progress > i');
        if (status) status.textContent = failed ? _message : '正在加载中......';
        this.targetProgress = Math.max(this.targetProgress, Math.min(0.95, this.clamp(progress)));
        if (fill) this.startProgressAnimation(fill);
        return true;
    }

    public isVisible(): boolean {
        const root = this.resolveRoot();
        return Boolean(root && !this.released);
    }

    public release(): void {
        const root = this.resolveRoot();
        if (!root) return;
        this.released = true;
        this.stopProgressAnimation();
        const fill = root.querySelector<HTMLElement>('.aoo-startup-progress > i');
        if (fill) fill.style.transform = 'scaleX(1)';
        // The target scene has already painted. Keep 100% for exactly one
        // compositor frame, then reveal that prepared scene without a pause.
        globalThis.requestAnimationFrame?.(() => {
            if (!this.released) return;
            root.hidden = true;
            root.setAttribute('aria-hidden', 'true');
        }) ?? globalThis.setTimeout(() => {
            if (!this.released) return;
            root.hidden = true;
            root.setAttribute('aria-hidden', 'true');
        }, 16);
    }

    private resolveRoot(): HTMLElement | null {
        if (this.root?.isConnected) return this.root;
        const root = globalThis.document?.getElementById('aoo-startup-cover') as HTMLElement | null;
        if (!root) return null;
        root.style.backgroundPosition = 'center';
        root.style.backgroundRepeat = 'no-repeat';
        root.style.backgroundSize = 'cover';
        const fill = root.querySelector<HTMLElement>('.aoo-startup-progress > i');
        if (fill) {
            this.displayedProgress = this.readScaleX(fill);
            fill.style.animation = 'none';
            fill.style.transform = `scaleX(${this.displayedProgress})`;
        }
        this.root = root;
        return root;
    }

    private startProgressAnimation(fill: HTMLElement): void {
        if (this.progressFrame !== null) return;
        const animate = (timestamp: number): void => {
            this.progressFrame = null;
            if (this.released || !fill.isConnected) return this.stopProgressAnimation();
            const elapsed = this.progressTimestamp > 0 ? Math.min(50, timestamp - this.progressTimestamp) : 16;
            this.progressTimestamp = timestamp;
            // Sparse network stages must never make the bar look frozen. Move
            // asymptotically toward 98.5% and reserve completion for release().
            const ceiling = Math.max(this.targetProgress, 0.985);
            const gap = Math.max(0, ceiling - this.displayedProgress);
            if (gap > 0.00001) {
                const rate = Math.max(0.00002, gap * 0.001);
                this.displayedProgress = Math.min(ceiling, this.displayedProgress + elapsed * rate);
                fill.style.transform = `scaleX(${this.displayedProgress})`;
            }
            this.progressFrame = globalThis.requestAnimationFrame?.(animate) ?? null;
        };
        this.progressFrame = globalThis.requestAnimationFrame?.(animate) ?? null;
    }

    private stopProgressAnimation(): void {
        if (this.progressFrame !== null) globalThis.cancelAnimationFrame?.(this.progressFrame);
        this.progressFrame = null;
        this.progressTimestamp = 0;
    }

    private readScaleX(fill: HTMLElement): number {
        const transform = globalThis.getComputedStyle?.(fill).transform ?? '';
        const match = /^matrix\(([^,]+),/.exec(transform);
        const value = match ? Number(match[1]) : 0;
        return this.clamp(Number.isFinite(value) ? value : 0);
    }

    private prepareBackground(): Promise<void> {
        if (this.backgroundLoading) return this.backgroundLoading;
        this.backgroundLoading = (async () => {
            const bundle = await this.assetLoader.bundle(StartupPresentationAssetCatalog.bundle);
            const frame = await this.assetLoader.load(
                StartupPresentationAssetCatalog.backgroundSpriteFrame,
                SpriteFrame,
                bundle,
            );
            const nativeUrl = (frame.texture as Texture2D).image?.nativeUrl;
            const root = this.resolveRoot();
            if (root && nativeUrl) root.style.backgroundImage = `url("${nativeUrl}")`;
        })().catch(error => {
            this.backgroundLoading = null;
            console.warn('[AooStartupPresentation] background unavailable', error);
        });
        return this.backgroundLoading;
    }

    private clamp(value: number): number {
        return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
    }
}

export const startupPresentationView = new StartupPresentationView();
