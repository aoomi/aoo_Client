import { Camera, Director, director, RenderTexture, Texture2D } from 'cc';
import { AssetLoader } from '../../UI/Infrastructure';
import { SceneTransitionAssetCatalog } from './SceneTransitionAssetCatalog';

export type PresentationProgressKind = 'MEASURED' | 'STAGE';

/** User-perceived wait threshold; change here to tune every visible navigation surface. */
export const NAVIGATION_REVEAL_DELAY_MS = 500;

export interface PresentationTransitionOptions {
    readonly name: string;
    readonly message: string;
    readonly progress?: number;
    readonly progressKind?: PresentationProgressKind;
    readonly showAfterMs?: number;
    /** Keep the current rendered scene visible; failures still reveal the error cover. */
    readonly showDuringProgress?: boolean;
    /** Freeze the last painted game frame until the target scene commits its first frame. */
    readonly retainCurrentFrame?: boolean;
    /** Only the boot route may hand initial presentation ownership to the rendered target. */
    readonly releaseInitialPresentation?: boolean;
    readonly timeoutMs?: number;
}

export interface PresentationReadiness {
    readonly describe?: () => string;
    readonly ready?: () => boolean;
}

export interface InitialPresentationBoundary {
    /** Returns true only when this boundary owns a visible presentation surface. */
    update(message: string, progress: number, failed: boolean): boolean;
    isVisible(): boolean;
    release(): void;
}

type TransitionDom = {
    root: HTMLElement;
    message: HTMLElement | null;
    fill: HTMLElement | null;
    retry: HTMLButtonElement | null;
};

type TransitionRecord = {
    id: number;
    options: PresentationTransitionOptions;
    progress: number;
    progressKind: PresentationProgressKind;
    message: string;
    visible: boolean;
    failed: boolean;
    showTimer?: ReturnType<typeof globalThis.setTimeout>;
    timeoutTimer?: ReturnType<typeof globalThis.setTimeout>;
};

export class PresentationTransition {
    private active = true;

    public constructor(
        private readonly owner: PresentationTransitionCoordinator,
        private readonly id: number,
    ) {}

    public update(message: string, progress?: number, progressKind?: PresentationProgressKind): void {
        if (!this.active) return;
        this.owner.update(this.id, message, progress, progressKind);
    }

    public isCurrent(): boolean {
        return this.active && this.owner.isCurrent(this.id);
    }

    public async commitAfterPresentation(readiness: PresentationReadiness = {}): Promise<void> {
        if (!this.active) return;
        await this.owner.commitAfterPresentation(this.id, readiness);
        this.active = false;
    }

    /** Wait until the source frame is actually retained before callers tear it down. */
    public async retainCurrentPresentation(): Promise<void> {
        if (!this.active) return;
        await this.owner.waitForRetainedFrame(this.id);
    }

    public fail(error: unknown, retry?: () => void): void {
        if (!this.active) return;
        this.owner.fail(this.id, error, retry);
    }

    public cancel(): void {
        if (!this.active) return;
        this.active = false;
        this.owner.cancel(this.id);
    }
}

/**
 * Process-wide presentation transaction coordinator.
 *
 * The progress/error cover is ordinary DOM/native launch presentation. Silent
 * scene handoffs may retain the already-painted game frame until the target has
 * rendered; all transactions remain reference-counted.
 */
export class PresentationTransitionCoordinator {
    private readonly records = new Map<number, TransitionRecord>();
    private nextId = 0;
    private dom: TransitionDom | null = null;
    private retainedFrame: HTMLCanvasElement | null = null;
    private readbackFrame: HTMLCanvasElement | null = null;
    private captureScheduled = false;
    private captureTexture: RenderTexture | null = null;
    private captureCameras: Array<{ camera: Camera; target: RenderTexture | null }> = [];
    private retry: (() => void) | null = null;
    private displayedProgress = 0;
    private targetProgress = 0;
    private progressFrame: number | null = null;
    private progressTimestamp = 0;
    private initialPresentation: InitialPresentationBoundary | null = null;
    private initialPresentationActive = false;
    private readonly assetLoader = new AssetLoader();
    private backgroundLoading: Promise<void> | null = null;

    public attachInitialPresentation(presentation: InitialPresentationBoundary): void {
        this.initialPresentation = presentation;
    }

    public begin(options: PresentationTransitionOptions): PresentationTransition {
        const id = ++this.nextId;
        const record: TransitionRecord = {
            id,
            options,
            progress: this.clamp(options.progress ?? 0),
            progressKind: options.progressKind ?? 'STAGE',
            message: options.message,
            visible: false,
            failed: false,
        };
        this.records.set(id, record);
        // Background decoding is cosmetic and may take about one second on a
        // cold reconnect. The fallback colour must own the frame immediately;
        // waiting for the texture here exposes the newly-cleared room canvas.
        void this.prepareTransitionBackground();
        // A visible outer navigation already owns every composited pixel. An
        // inner room transaction must not capture its source scene (notably
        // LoginScene), otherwise releasing the navigation cover can expose that
        // stale snapshot for one browser-compositor frame before the room canvas.
        const visibleOwnerActive = [...this.records.values()].some(item => item.id !== id
            && item.options.showDuringProgress !== false);
        if (options.retainCurrentFrame && !visibleOwnerActive) this.captureCurrentFrame();
        // A nested prefab/network transaction must stay behind an active silent
        // handoff; otherwise its delayed loading cover flashes over the retained frame.
        const silentHandoff = [...this.records.values()].some(item => item.options.retainCurrentFrame
            && item.options.showDuringProgress === false);
        const initialPresentationVisible = this.initialPresentationActive
            || (this.initialPresentation?.isVisible() ?? false);
        if (options.showDuringProgress !== false && !silentHandoff && !initialPresentationVisible) {
            const showAfterMs = Math.max(0, options.showAfterMs ?? NAVIGATION_REVEAL_DELAY_MS);
            const reveal = (): void => {
                if (this.records.has(id)) this.show(record);
            };
            if (showAfterMs === 0) reveal();
            else record.showTimer = globalThis.setTimeout(reveal, showAfterMs);
        }
        this.armTimeout(record);
        this.log('begin', record);
        return new PresentationTransition(this, id);
    }

    /** Updates the HTML first-frame cover before the Cocos runtime owns a transaction. */
    public updateInitial(message: string, progress: number): boolean {
        this.initialPresentationActive = true;
        return this.initialPresentation?.update(message, this.clamp(progress), false) ?? false;
    }

    public isCurrent(id: number): boolean {
        return this.records.has(id);
    }

    public async waitForRetainedFrame(id: number): Promise<void> {
        const record = this.records.get(id);
        if (!record?.options.retainCurrentFrame) return;
        // captureCurrentFrame commits on Director.EVENT_AFTER_DRAW. Keep the
        // source UI alive until that draw has happened; otherwise room cleanup
        // turns the retained image into the camera's black clear frame.
        for (let frame = 0; frame < 4 && this.records.has(id); frame += 1) {
            if (this.retainedFrame && !this.retainedFrame.hidden) return;
            await this.nextFrame();
        }
    }

    public update(id: number, message: string, progress?: number, progressKind?: PresentationProgressKind): void {
        const record = this.records.get(id);
        if (!record || record.failed) return;
        record.message = message;
        if (progress !== undefined) record.progress = Math.max(record.progress, this.clamp(progress));
        if (progressKind) record.progressKind = progressKind;
        // timeoutMs is an inactivity deadline. Resource preload, scene launch and
        // mounting form one continuous transaction, so measurable/stage progress
        // must renew the deadline instead of failing a healthy slow first load.
        this.armTimeout(record);
        if (record.visible) this.renderCurrent();
        this.log('progress', record);
    }

    public async commitAfterPresentation(id: number, readiness: PresentationReadiness): Promise<void> {
        const record = this.records.get(id);
        if (!record || record.failed) return;
        await this.waitUntilReady(id, readiness, record.options.timeoutMs ?? 12_000);
        await this.afterEngineDraw(id);
        await this.afterBrowserPaint(id);
        await this.completeProgress(id);
        this.finish(id, 'commit');
    }

    public fail(id: number, error: unknown, retry?: () => void): void {
        const record = this.records.get(id);
        if (!record) return;
        this.clearTimers(record);
        record.failed = true;
        this.releaseCurrentFrame();
        record.visible = true;
        record.message = error instanceof Error ? error.message : String(error);
        this.retry = () => {
            this.cancel(id);
            retry?.();
        };
        this.show(record);
        this.renderCurrent();
        this.log('failure', record);
    }

    public cancel(id: number): void {
        this.finish(id, 'cancel');
    }

    private show(record: TransitionRecord): void {
        if (!this.records.has(record.id)) return;
        record.visible = true;
        const dom = this.ensureDom();
        if (dom) {
            dom.root.hidden = false;
            dom.root.classList.remove('is-revealing');
            dom.root.classList.add('is-visible');
            dom.root.setAttribute('aria-hidden', 'false');
            this.renderCurrent();
        }
        this.log('visible', record);
    }

    private finish(id: number, outcome: 'commit' | 'cancel'): void {
        const record = this.records.get(id);
        if (!record) return;
        this.clearTimers(record);
        this.records.delete(id);
        this.log(outcome, record);
        // A committed visible navigation has already waited for the target scene
        // and its first browser paint. Never let a nested silent transaction keep
        // the source-scene snapshot alive after that cover is removed: on cached
        // account recovery this otherwise exposes LoginScene for one frame before
        // the already-presented room canvas.
        if (outcome === 'commit' && record.visible && record.options.showDuringProgress !== false) {
            this.releaseCurrentFrame();
        }
        // The startup cover belongs to the authenticated route, not to deferred
        // warmups. Once that route has presented its target, release Startup
        // immediately even when silent preload records are still running.
        if (outcome === 'commit' && record.options.releaseInitialPresentation) {
            this.initialPresentationActive = false;
            this.initialPresentation?.release();
        }
        if (this.records.size > 0) {
            // Reference counting may leave a silent room handoff alive after a
            // visible form/navigation transaction commits. A silent record must
            // retain the captured frame, but it must never inherit the finished
            // record's DOM cover; otherwise room entry remains blocked behind the
            // last navigation progress screen until the unrelated record ends.
            if ([...this.records.values()].some(item => item.visible)) {
                this.renderCurrent();
            } else {
                this.hideDomCover();
                this.stopProgressAnimation();
                this.displayedProgress = 0;
                this.targetProgress = 0;
            }
            return;
        }
        this.releaseCurrentFrame();
        this.retry = null;
        this.stopProgressAnimation();
        this.displayedProgress = 0;
        this.targetProgress = 0;
        // A silent handoff may never have created or shown the common cover.
        // Do not create one while finishing: a newly inserted, default-visible
        // DOM layer would flash for one frame immediately before the target UI.
        this.hideDomCover();
    }

    private hideDomCover(): void {
        const dom = this.dom?.root.isConnected ? this.dom : null;
        if (!dom) return;
        dom.root.classList.remove('is-visible');
        dom.root.setAttribute('aria-hidden', 'true');
        // Readiness, an engine draw and a browser paint have already completed.
        // Remove the cover atomically; fading it over the live target makes the
        // target appear and dim again, which users perceive as a final-frame flash.
        dom.root.hidden = true;
        dom.root.classList.remove('is-revealing');
    }

    private async waitUntilReady(id: number, readiness: PresentationReadiness, timeoutMs: number): Promise<void> {
        if (!readiness.ready) return;
        const deadline = Date.now() + Math.max(1, timeoutMs);
        while (this.records.has(id) && Date.now() < deadline) {
            if (readiness.ready()) return;
            await this.nextFrame();
        }
        throw new Error(`目标界面未就绪：${readiness.describe?.() ?? 'readiness=false'}`);
    }

    private afterEngineDraw(id: number): Promise<void> {
        return new Promise((resolve, reject) => {
            if (!this.records.has(id)) return resolve();
            let timer: ReturnType<typeof globalThis.setTimeout> | undefined;
            const done = (): void => {
                director.off(Director.EVENT_AFTER_DRAW, done);
                if (timer) globalThis.clearTimeout(timer);
                resolve();
            };
            director.once(Director.EVENT_AFTER_DRAW, done);
            timer = globalThis.setTimeout(() => {
                director.off(Director.EVENT_AFTER_DRAW, done);
                reject(new Error('目标界面首帧提交超时'));
            }, 12_000);
        });
    }

    private async afterBrowserPaint(id: number): Promise<void> {
        if (!this.records.has(id)) return;
        await this.nextFrame();
        await new Promise<void>(resolve => globalThis.setTimeout(resolve, 0));
    }

    private nextFrame(): Promise<void> {
        return new Promise(resolve => globalThis.requestAnimationFrame?.(() => resolve()) ?? globalThis.setTimeout(resolve, 16));
    }

    private captureCurrentFrame(): void {
        if (this.captureScheduled || this.retainedFrame && !this.retainedFrame.hidden) return;
        const documentRef = globalThis.document;
        const source = documentRef?.querySelector<HTMLCanvasElement>('canvas:not([data-aoo-retained-frame])') ?? null;
        const scene = director.getScene();
        if (!source || !scene) return;
        const cameras = scene.getComponentsInChildren(Camera).filter(camera => camera.enabledInHierarchy);
        if (!cameras.length) return;
        const texture = new RenderTexture();
        // GPU readback is synchronous. A full design-resolution copy stalls the
        // interaction thread, while the retained frame is displayed only at the
        // current viewport size. Preserve aspect but cap the snapshot pixels.
        const scale = Math.min(1, 960 / Math.max(1, source.width), 540 / Math.max(1, source.height));
        texture.reset({
            width: Math.max(1, Math.round(source.width * scale)),
            height: Math.max(1, Math.round(source.height * scale)),
        });
        this.captureTexture = texture;
        this.captureCameras = cameras.map(camera => ({ camera, target: camera.targetTexture }));
        for (const { camera } of this.captureCameras) camera.targetTexture = texture;
        this.captureScheduled = true;
        director.once(Director.EVENT_AFTER_DRAW, this.captureAfterDraw, this);
    }

    private captureAfterDraw(): void {
        this.captureScheduled = false;
        this.restoreCaptureCameras();
        if (![...this.records.values()].some(record => record.options.retainCurrentFrame)) return this.disposeCaptureTexture();
        const documentRef = globalThis.document;
        const source = documentRef?.querySelector<HTMLCanvasElement>('canvas:not([data-aoo-retained-frame])') ?? null;
        const texture = this.captureTexture;
        if (!documentRef?.body || !source || !texture) return this.disposeCaptureTexture();
        const pixels = texture.readPixels();
        if (!pixels || !this.hasVisiblePixels(pixels)) return this.disposeCaptureTexture();
        const frame = this.retainedFrame ?? documentRef.createElement('canvas');
        frame.dataset.aooRetainedFrame = 'true';
        const rect = source.getBoundingClientRect();
        frame.width = texture.width;
        frame.height = texture.height;
        frame.setAttribute('aria-hidden', 'true');
        frame.style.cssText = `position:fixed;left:${rect.left}px;top:${rect.top}px;width:${rect.width}px;height:${rect.height}px;z-index:2147483646;pointer-events:none`;
        this.paintPixels(frame, pixels, documentRef);
        this.disposeCaptureTexture();
        if (!frame.isConnected) documentRef.body.appendChild(frame);
        frame.hidden = false;
        this.retainedFrame = frame;
    }

    private hasVisiblePixels(pixels: Uint8Array): boolean {
        const stride = Math.max(4, Math.floor(pixels.length / 4_096 / 4) * 4);
        let sampled = 0;
        let visible = 0;
        for (let index = 0; index < pixels.length; index += stride) {
            sampled += 1;
            if (pixels[index + 3] > 0 && pixels[index] + pixels[index + 1] + pixels[index + 2] > 30) visible += 1;
        }
        return visible / Math.max(1, sampled) >= 0.01;
    }

    private paintPixels(frame: HTMLCanvasElement, pixels: Uint8Array, documentRef: Document): void {
        const target = frame.getContext('2d');
        if (!target) return;
        const scratch = this.readbackFrame ?? documentRef.createElement('canvas');
        scratch.width = frame.width;
        scratch.height = frame.height;
        const scratchContext = scratch.getContext('2d');
        if (!scratchContext) return;
        const image = scratchContext.createImageData(frame.width, frame.height);
        image.data.set(pixels);
        scratchContext.putImageData(image, 0, 0);
        target.save();
        target.translate(0, frame.height);
        target.scale(1, -1);
        target.drawImage(scratch, 0, 0);
        target.restore();
        this.readbackFrame = scratch;
    }

    private restoreCaptureCameras(): void {
        for (const { camera, target } of this.captureCameras) {
            if (camera.isValid) camera.targetTexture = target;
        }
        this.captureCameras = [];
    }

    private disposeCaptureTexture(): void {
        this.captureTexture?.destroy();
        this.captureTexture = null;
    }

    private releaseCurrentFrame(): void {
        if (this.captureScheduled) director.off(Director.EVENT_AFTER_DRAW, this.captureAfterDraw, this);
        this.captureScheduled = false;
        this.restoreCaptureCameras();
        this.disposeCaptureTexture();
        if (this.retainedFrame) this.retainedFrame.hidden = true;
    }

    private ensureDom(): TransitionDom | null {
        if (this.dom?.root.isConnected) return this.dom;
        const documentRef = globalThis.document;
        if (!documentRef?.body) return null;
        this.ensureStyles(documentRef);
        let root = documentRef.getElementById('aoo-scene-transition-cover') as HTMLElement | null;
        if (!root) {
            root = documentRef.createElement('div');
            root.id = 'aoo-scene-transition-cover';
            root.className = 'aoo-scene-transition-cover';
            root.hidden = true;
            root.setAttribute('aria-hidden', 'true');
            root.innerHTML = '<div class="aoo-scene-transition-card"><div class="aoo-scene-transition-status">正在加载中......</div><div class="aoo-scene-transition-progress"><i></i></div><button class="aoo-scene-transition-retry" type="button">返回并重试</button></div>';
            documentRef.body.appendChild(root);
        }
        const retry = root.querySelector('.aoo-scene-transition-retry') as HTMLButtonElement | null;
        if (retry && retry.dataset.bound !== 'true') {
            retry.dataset.bound = 'true';
            retry.addEventListener('click', () => this.retry?.());
        }
        this.dom = {
            root,
            message: root.querySelector('.aoo-scene-transition-status'),
            fill: root.querySelector('.aoo-scene-transition-progress > i'),
            retry,
        };
        return this.dom;
    }

    /** Preview does not load web build-template CSS, so the runtime-owned cover must style itself. */
    private ensureStyles(documentRef: Document): void {
        if (documentRef.getElementById('aoo-scene-transition-runtime-style')) return;
        const style = documentRef.createElement('style');
        style.id = 'aoo-scene-transition-runtime-style';
        style.textContent = `
#aoo-scene-transition-cover{position:fixed;inset:0;z-index:2147483647;display:grid;place-items:center;background:#F2F1ED center/cover no-repeat;color:#5d6268;font:14px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;pointer-events:auto}
#aoo-scene-transition-cover[hidden]{display:none!important}
.aoo-scene-transition-card{position:fixed;left:50%;bottom:30px;width:min(1200px,calc(100vw - 48px));transform:translateX(-50%);text-align:center}
.aoo-scene-transition-status{margin-bottom:18px;font-size:16px;color:#fff;text-shadow:-0.5px -0.5px 0 #000,0.5px -0.5px 0 #000,-0.5px 0.5px 0 #000,0.5px 0.5px 0 #000}
.aoo-scene-transition-progress{height:6px;overflow:hidden;border-radius:999px;background:rgba(0,0,0,.38);box-shadow:inset 0 0 0 1px rgba(0,0,0,.22)}
.aoo-scene-transition-progress>i{display:block;width:100%;height:100%;transform:scaleX(0);transform-origin:left;background:#e8b341;will-change:transform}
.aoo-scene-transition-retry{position:absolute;top:calc(100% + 36px);left:50%;transform:translateX(-50%);padding:9px 22px;border:0;border-radius:999px;background:#e8b341;color:#fff}
`;
        (documentRef.head ?? documentRef.documentElement).appendChild(style);
    }

    private prepareTransitionBackground(): Promise<void> {
        if (this.backgroundLoading) return this.backgroundLoading;
        this.backgroundLoading = (async () => {
            const bundle = await this.assetLoader.bundle(SceneTransitionAssetCatalog.bundle);
            const texture = await this.assetLoader.load(
                SceneTransitionAssetCatalog.backgroundTexture,
                Texture2D,
                bundle,
            );
            const nativeUrl = texture.image?.nativeUrl;
            const root = this.ensureDom();
            if (root && nativeUrl) {
                root.root.style.backgroundImage = `url("${this.resolveBundleNativeUrl(nativeUrl, bundle.base)}")`;
            }
        })().catch(error => {
            this.backgroundLoading = null;
            console.warn('[AooPresentationTransition] scene background unavailable', error);
        });
        return this.backgroundLoading;
    }

    private resolveBundleNativeUrl(nativeUrl: string, bundleBase: string): string {
        const documentBase = globalThis.document?.baseURI ?? globalThis.location?.href;
        if (!documentBase || /^(?:data:|blob:|https?:)/i.test(nativeUrl)) return nativeUrl;
        if (nativeUrl.startsWith('/') || nativeUrl.startsWith('assets/')) {
            return new URL(nativeUrl, documentBase).href;
        }
        const normalizedBundleBase = bundleBase.endsWith('/') ? bundleBase : `${bundleBase}/`;
        const absoluteBundleBase = new URL(normalizedBundleBase, documentBase);
        const relativeNativeUrl = nativeUrl.startsWith('native/') ? nativeUrl : `native/${nativeUrl}`;
        return new URL(relativeNativeUrl, absoluteBundleBase).href;
    }

    private renderCurrent(): void {
        const dom = this.ensureDom();
        if (!dom) return;
        const records = [...this.records.values()].filter(record => record.visible);
        if (records.length === 0) return;
        const current = records[records.length - 1];
        this.render(dom, current.message, current.progress, current.progressKind, current.failed);
    }

    private render(dom: TransitionDom, message: string, progress: number, _kind: PresentationProgressKind, failed: boolean): void {
        if (dom.message) dom.message.textContent = failed ? message : '正在加载中......';
        if (dom.retry) dom.retry.hidden = !failed;
        this.targetProgress = Math.max(this.targetProgress, failed ? this.displayedProgress : Math.min(0.95, this.clamp(progress)));
        if (failed) this.stopProgressAnimation();
        else this.startProgressAnimation();
        dom.root.classList.toggle('is-failed', failed);
    }

    /**
     * Stage callbacks are necessarily sparse. Keep the visible bar moving between
     * them, but reserve the final 1.5% for the authoritative mounted first frame.
     */
    private startProgressAnimation(): void {
        if (this.progressFrame !== null) return;
        const animate = (timestamp: number): void => {
            this.progressFrame = null;
            const elapsed = this.progressTimestamp > 0 ? Math.min(50, Math.max(0, timestamp - this.progressTimestamp)) : 16;
            this.progressTimestamp = timestamp;
            const ceiling = Math.max(this.targetProgress, 0.985);
            const gap = Math.max(0, ceiling - this.displayedProgress);
            if (gap > 0.0001) {
                const rate = this.displayedProgress < this.targetProgress
                    ? Math.max(0.00035, gap * 0.008)
                    : Math.max(0.000008, gap * 0.00015);
                this.displayedProgress = Math.min(ceiling, this.displayedProgress + elapsed * rate);
                this.paintProgress(this.displayedProgress);
            }
            if (this.records.size > 0 || this.displayedProgress < 0.9849) {
                this.progressFrame = this.requestFrame(animate);
            } else {
                this.progressTimestamp = 0;
            }
        };
        this.progressFrame = this.requestFrame(animate);
    }

    /** The target has painted: finish the remaining distance, paint 100%, then reveal it. */
    private async completeProgress(id: number): Promise<void> {
        const current = this.records.get(id);
        // Silent create and game handoffs can commit concurrently. They have no bar
        // to animate; sharing progressFrame here lets one completion cancel the
        // other's RAF and leaves both retained-frame owners pending forever.
        if (!current?.visible) return;
        if ([...this.records.values()].some(record => record.id !== id && record.visible)) return;
        this.stopProgressAnimation();
        const start = this.displayedProgress;
        const duration = Math.min(80, Math.max(32, (1 - start) * 120));
        await new Promise<void>(resolve => {
            const startedAt = Date.now();
            const step = (): void => {
                if (!this.records.has(id)) return resolve();
                const ratio = Math.min(1, (Date.now() - startedAt) / duration);
                const eased = 1 - Math.pow(1 - ratio, 3);
                this.displayedProgress = start + (1 - start) * eased;
                this.paintProgress(this.displayedProgress);
                if (ratio < 1) this.progressFrame = this.requestFrame(step);
                else {
                    this.progressFrame = null;
                    this.targetProgress = 1;
                    this.displayedProgress = 1;
                    this.paintProgress(1);
                    this.requestFrame(() => resolve());
                }
            };
            this.progressFrame = this.requestFrame(step);
        });
    }

    private paintProgress(progress: number): void {
        const dom = this.ensureDom();
        if (dom?.fill) dom.fill.style.transform = `scaleX(${this.clamp(progress)})`;
    }

    private stopProgressAnimation(): void {
        if (this.progressFrame !== null) globalThis.cancelAnimationFrame?.(this.progressFrame);
        this.progressFrame = null;
        this.progressTimestamp = 0;
    }

    private requestFrame(callback: FrameRequestCallback): number {
        return globalThis.requestAnimationFrame?.(callback)
            ?? globalThis.setTimeout(() => callback(Date.now()), 16) as unknown as number;
    }

    private clearTimers(record: TransitionRecord): void {
        if (record.showTimer) globalThis.clearTimeout(record.showTimer);
        if (record.timeoutTimer) globalThis.clearTimeout(record.timeoutTimer);
        record.showTimer = undefined;
        record.timeoutTimer = undefined;
    }

    private armTimeout(record: TransitionRecord): void {
        if (record.timeoutTimer) globalThis.clearTimeout(record.timeoutTimer);
        const timeoutMs = record.options.timeoutMs ?? 0;
        if (timeoutMs <= 0 || record.failed || !this.records.has(record.id)) {
            record.timeoutTimer = undefined;
            return;
        }
        record.timeoutTimer = globalThis.setTimeout(() => {
            this.fail(record.id, new Error(`${record.message}超时，请重试`));
        }, timeoutMs);
    }

    private clamp(value: number): number {
        return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
    }

    private log(action: string, record: TransitionRecord): void {
        const runtime = globalThis as typeof globalThis & { __aoo_PRESENTATION_TRANSITIONS__?: unknown[] };
        const entry = Object.freeze({
            action, id: record.id, name: record.options.name, message: record.message,
            progress: record.progress, progressKind: record.progressKind,
            visible: record.visible, failed: record.failed, activeCount: this.records.size,
            scene: director.getScene()?.name ?? 'none', timestamp: Date.now(),
        });
        runtime.__aoo_PRESENTATION_TRANSITIONS__ ??= [];
        runtime.__aoo_PRESENTATION_TRANSITIONS__.push(entry);
        if (runtime.__aoo_PRESENTATION_TRANSITIONS__.length > 256) runtime.__aoo_PRESENTATION_TRANSITIONS__.shift();
        console.info('[AooPresentationTransition]', JSON.stringify(entry));
    }
}

export const presentationTransition = new PresentationTransitionCoordinator();
