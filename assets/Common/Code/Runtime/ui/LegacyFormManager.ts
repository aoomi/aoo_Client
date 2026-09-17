import {
    BlockInputEvents,
    Button,
    EditBox,
    Label,
    Node,
    PageView,
    Prefab,
    AssetManager,
    ScrollView,
    Sprite,
    Toggle,
    Tween,
    instantiate,
    assetManager,
    tween,
    UITransform,
    Vec3,
    Widget,
} from 'cc';
import { LegacyInteractionContextOptions, LegacyUiInteractionPayload } from './LegacyPrefabRenderer';

export interface LegacyFormLifecycle {
    onCreate?(form: LegacyForm): void;
    onShow?(form: LegacyForm, ...args: unknown[]): void;
    onClose?(form: LegacyForm): void;
    onDestroy?(form: LegacyForm): void;
    onLegacyEvent?(
        form: LegacyForm,
        payload: LegacyUiInteractionPayload,
        sourceNode: Node,
        event: unknown,
    ): void;
}

import { COMMON_ASSET_BUNDLE, listCommonPrefabForms, resolveCommonNumpadAsset, resolveCommonPrefabAsset } from './CommonPrefabRegistry';
import { listGamePrefabForms, resolveGamePrefabAsset } from './GamePrefabRegistry';
import { listModulePrefabForms, resolveModulePrefabAsset } from './ModulePrefabRegistry';
import { NAVIGATION_REVEAL_DELAY_MS, PresentationTransition, presentationTransition } from './PresentationTransitionCoordinator';
import { NumpadHandle, NumpadService } from './NumpadService';

export interface LegacyFormOptions {
    zOrder?: number;
    showFromCenter?: boolean;
    modal?: boolean;
    /** An enclosing scene transaction owns the final draw/paint barrier. */
    presentationOwnedExternally?: boolean;
    lifecycle?: LegacyFormLifecycle;
}

export class LegacyForm {
    public readonly name: string;
    public readonly path: string;
    private shown = false;

    public constructor(
        public readonly node: Node,
        path: string,
        private readonly parent: Node,
        private options: LegacyFormOptions,
    ) {
        this.path = path;
        this.name = path.slice(path.lastIndexOf('/') + 1);
    }

    /**
     * Scene controllers may be recreated while the shared UI layer keeps a
     * cached form instance. Refresh its lifecycle ownership so reopening the
     * form cannot call a disposed controller or leave its buttons unbound.
     */
    public updateOptions(options: LegacyFormOptions): void {
        this.options = options;
    }

    public show(args: unknown[] = []): void {
        if (!this.parent.isValid || !this.node.isValid) return;
        if (!this.node.parent) this.parent.addChild(this.node);
        if (!this.shown && this.options.showFromCenter && this.name !== 'Numpad') {
            const scale = this.node.scale.clone();
            this.node.setScale(new Vec3(scale.x * 0.5, scale.y * 0.5, scale.z));
            tween(this.node).to(0.5, { scale }, { easing: 'elasticOut' }).start();
        }
        this.shown = true;
        this.options.lifecycle?.onShow?.(this, ...args);
    }

    public close(destroy = false): void {
        if (!this.shown && !this.node.parent) return;
        this.options.lifecycle?.onClose?.(this);
        this.stopAnimationTree(this.node);
        this.shown = false;
        this.node.removeFromParent();
        if (destroy) {
            this.options.lifecycle?.onDestroy?.(this);
            if (this.node.isValid) this.node.destroy();
        }
    }

    private stopAnimationTree(node: Node | null): void {
        if (!node?.isValid) return;
        Tween.stopAllByTarget(node);
        for (const child of [...node.children] as Array<Node | null>) this.stopAnimationTree(child);
    }

    public isShown(): boolean {
        return this.shown && this.node.parent === this.parent;
    }

    public get zOrder(): number {
        return this.options.zOrder ?? 6;
    }

    public get modal(): boolean {
        return this.options.modal ?? this.zOrder > 0;
    }

    public find(path: string): Node | null {
        let current: Node | null = this.node;
        for (const part of path.split('/')) {
            // A delayed lifecycle callback can race a scene transition. Cocos clears a
            // destroyed node's internal children array before the JavaScript reference is
            // released, so getChildByName must never be called after validity is lost.
            if (!current?.isValid) return null;
            current = current.getChildByName(part);
        }
        return current;
    }
}

export class LegacyFormManager {
    private readonly numericNumpadService = new NumpadService();
    private numericNumpad: NumpadHandle | null = null;
    private readonly numericOpeners = new WeakMap<Node, () => void>();
    private readonly loaded = new Map<string, LegacyForm>();
    private readonly interactionGuard = new Map<string, number>();
    private readonly creating = new Map<string, {
        promise: Promise<LegacyForm | null>; args: unknown[]; epoch: number; loading: boolean;
        transition: PresentationTransition;
    }>();
    private readonly options = new Map<string, LegacyFormOptions>();
    private readonly pathEpoch = new Map<string, number>();
    private readonly bundleLoading = new Map<string, Promise<AssetManager.Bundle | null>>();
    private readonly prefabLoading = new Map<string, Promise<Prefab | null>>();
    private refreshWarmup: Promise<void> | null = null;
    private warmupPausedUntil = 0;
    private readonly defaults: string[] = [];
    private readonly shownStack: string[] = [];
    private readonly modalMask = new Node('LegacyModalInputMask');
    private epoch = 0;
    private loadingCount = 0;
    private disposed = false;
    private suppressPointerContinuation = false;
    private readonly pointerStart = (event?: unknown): void => {
        this.deferBackgroundWarmup();
        this.suppressPointerContinuation = false;
        let target = (event as { target?: Node } | undefined)?.target ?? null;
        while (target && target !== this.uiLayer) {
            const open = this.numericOpeners.get(target);
            if (open) {
                open();
                break;
            }
            target = target.parent;
        }
    };
    private readonly pointerContinuation = (event: unknown): void => {
        if (!this.suppressPointerContinuation) return;
        const pointerEvent = event as { propagationStopped?: boolean; propagationImmediateStopped?: boolean };
        pointerEvent.propagationStopped = true;
        pointerEvent.propagationImmediateStopped = true;
    };

    public constructor(
        private readonly uiLayer: Node,
        private readonly onLoadingChanged: (loading: boolean) => void = () => undefined,
        private readonly externalLoadingPresentation = false,
    ) {
        this.modalMask.addComponent(UITransform).setContentSize(1280, 720);
        this.modalMask.addComponent(BlockInputEvents);
        this.modalMask.active = false;
        this.uiLayer.on(Node.EventType.TOUCH_START, this.pointerStart, this, true);
        this.uiLayer.on(Node.EventType.MOUSE_DOWN, this.pointerStart, this, true);
        this.uiLayer.on(Node.EventType.TOUCH_END, this.pointerContinuation, this, true);
        this.uiLayer.on(Node.EventType.MOUSE_UP, this.pointerContinuation, this, true);
        this.uiLayer.on(Button.EventType.CLICK, this.pointerContinuation, this, true);
    }

    public register(formPath: string, options: LegacyFormOptions): void {
        this.assertAlive();
        const path = this.normalize(formPath);
        this.options.set(path, options);
        this.loaded.get(path)?.updateOptions(options);
    }

    /** Warms a form's authoritative prefab without mounting it or firing lifecycle callbacks. */
    public async preload(formPath: string): Promise<void> {
        this.assertAlive();
        const path = this.normalize(formPath);
        if (this.loaded.get(path)?.node.isValid) return;
        const transition = presentationTransition.begin({
            name: `prefab-preload:${path}`, message: '正在预加载界面资源...', progress: 0,
            progressKind: 'STAGE', showDuringProgress: false, timeoutMs: 15_000,
        });
        try {
            const prefab = await this.loadNativePrefab(path);
            if (!prefab) throw new Error(`缺少 Creator 3.8.8 原生 Prefab: ${path}`);
            transition.update('界面资源已就绪', 1, 'STAGE');
            await transition.commitAfterPresentation();
        } catch (error: unknown) {
            transition.fail(error, () => { void this.preload(path); });
            throw error;
        }
    }

    /**
     * Warms every form reachable from the current application surface. It loads
     * assets only: no nodes are mounted and no lifecycle or network request runs.
     */
    public preloadRefreshSurface(includeModules = true, concurrency = 1): Promise<void> {
        this.assertAlive();
        if (this.refreshWarmup) return this.refreshWarmup;
        // Showing a surface is not an idle boundary. The former setTimeout(0)
        // implementation began decoding the complete prefab catalog on the next
        // task, competing with the first click, room navigation and initial deal.
        // Keep the established priority order, but consume it only in browser idle
        // slices and yield again before every prefab.
        this.deferBackgroundWarmup(600);
        const paths = [...new Set([
            // The first post-refresh navigation is most often a room entry.
            // Decode game-room and shared-room forms before optional page/module
            // forms so entering a club can hit the room cache immediately.
            ...listGamePrefabForms(),
            ...listCommonPrefabForms(),
            ...this.options.keys(),
            ...(includeModules ? listModulePrefabForms() : []),
        ])];
        const startedAt = Date.now();
        console.info('[AooBackgroundWarmup] started', { total: paths.length, concurrency });
        let cursor = 0;
        const worker = async (): Promise<void> => {
            while (!this.disposed) {
                const index = cursor++;
                if (index >= paths.length) return;
                await this.waitForBackgroundWarmupSlot();
                if (this.disposed) return;
                await this.loadNativePrefab(paths[index]);
            }
        };
        this.refreshWarmup = Promise.all(
            Array.from({ length: Math.min(Math.max(1, concurrency), paths.length || 1) }, () => worker()),
        ).then(() => undefined).finally(() => {
            console.info('[AooBackgroundWarmup] finished', {
                loaded: Math.min(cursor, paths.length), total: paths.length,
                elapsedMs: Date.now() - startedAt, disposed: this.disposed,
            });
            this.refreshWarmup = null;
        });
        return this.refreshWarmup;
    }

    public async show(formPath: string, ...args: unknown[]): Promise<LegacyForm | null> {
        this.assertAlive();
        // Foreground navigation always wins over speculative decoding. An already
        // running Creator asset callback cannot be cancelled safely, but this gate
        // prevents the warmup queue from starting another decode behind the click.
        this.deferBackgroundWarmup(1_200);
        const path = this.normalize(formPath);
        const cached = this.loaded.get(path);
        if (cached?.node.isValid) {
            this.activate(path, cached, args);
            return cached;
        }
        const pending = this.creating.get(path);
        if (pending) {
            // Drift messages are events, not replaceable form state. During the
            // first asset load every trigger must reach the lifecycle queue once.
            if (path === 'UIMessage_Drift') {
                const form = await pending.promise;
                if (form?.node.isValid) this.activate(path, form, args);
                return form;
            }
            pending.args = args;
            return pending.promise;
        }

        const epoch = this.epoch;
        const pathEpoch = this.pathEpoch.get(path) ?? 0;
        const transition = presentationTransition.begin({
            name: `form:${path}`, message: '正在加载界面...', progress: 0,
            // A transient toast must never flash a full-screen loading cover while
            // its prefab is being loaded for the first time.
            progressKind: 'STAGE', showAfterMs: this.transitionShowDelay(
                path === 'UIMessage_Drift' ? 15_000 : NAVIGATION_REVEAL_DELAY_MS,
            ), timeoutMs: 15_000,
        });
        if (!this.externalLoadingPresentation) this.changeLoading(1);
        const request = {
            args,
            epoch,
            loading: !this.externalLoadingPresentation,
            transition,
            promise: Promise.resolve(null) as Promise<LegacyForm | null>,
        };
        request.promise = (async (): Promise<LegacyForm | null> => {
          try {
            if (this.disposed || epoch !== this.epoch || pathEpoch !== (this.pathEpoch.get(path) ?? 0)) {
                transition.cancel();
                return null;
            }
            const existing = this.loaded.get(path);
            if (existing?.node.isValid) {
                this.activate(path, existing, request.args);
                if (this.options.get(path)?.presentationOwnedExternally) transition.cancel();
                else await transition.commitAfterPresentation({ ready: () => existing.isShown() });
                return existing;
            }
            const lifecycle = this.options.get(path)?.lifecycle;
            let form: LegacyForm | null = null;
            transition.update('正在加载界面资源...', 0.25, 'STAGE');
            const node = await this.instantiateWithFallback(
                path,
                (payload, sourceNode, event) => {
                    if (form) lifecycle?.onLegacyEvent?.(form, payload, sourceNode, event);
                },
            );
            this.adaptLegacyFullscreenForm(node, path);
            if (this.disposed || epoch !== this.epoch || pathEpoch !== (this.pathEpoch.get(path) ?? 0)) {
                node.destroy();
                transition.cancel();
                return null;
            }
            form = new LegacyForm(node, path, this.uiLayer, this.options.get(path) ?? {});
            this.loaded.set(path, form);
            this.bindNumericNumpads(form);
            this.options.get(path)?.lifecycle?.onCreate?.(form);
            transition.update('正在挂载界面...', 0.82, 'STAGE');
            this.activate(path, form, request.args);
            if (this.options.get(path)?.presentationOwnedExternally) transition.cancel();
            else await transition.commitAfterPresentation({
                // Non-modal forms such as the notice bar may intentionally hide their
                // root after onShow when there is no content. Being attached and marked
                // shown is sufficient; requiring activeInHierarchy leaves the global
                // presentation cover stuck over otherwise interactive lobby content.
                ready: () => Boolean(form?.node.isValid && form.isShown()),
                describe: () => `form=${path} shown=${Boolean(form?.isShown())}`,
            });
            return form;
          } catch (error: unknown) {
            transition.fail(error, () => { void this.show(path, ...request.args); });
            throw error;
          } finally {
            if (this.creating.get(path) === request) this.creating.delete(path);
            if (request.loading) {
                request.loading = false;
                if (!this.externalLoadingPresentation) this.changeLoading(-1);
            }
            }
        })();
        this.creating.set(path, request);
        return request.promise;
    }

    private deferBackgroundWarmup(milliseconds = 800): void {
        this.warmupPausedUntil = Math.max(this.warmupPausedUntil, Date.now() + milliseconds);
    }

    private async waitForBackgroundWarmupSlot(): Promise<void> {
        while (!this.disposed) {
            const remaining = this.warmupPausedUntil - Date.now();
            if (remaining > 0) {
                await new Promise<void>(resolve => globalThis.setTimeout(resolve, Math.min(remaining, 200)));
                continue;
            }
            const scheduler = globalThis as typeof globalThis & {
                requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number;
            };
            await new Promise<void>(resolve => {
                if (scheduler.requestIdleCallback) scheduler.requestIdleCallback(resolve, { timeout: 1_000 });
                else globalThis.setTimeout(resolve, 32);
            });
            if (Date.now() >= this.warmupPausedUntil) return;
        }
    }

    private async instantiateWithFallback(
        path: string,
        onLegacyUiEvent?: LegacyInteractionContextOptions['onLegacyUiEvent'],
    ): Promise<Node> {
        const nativePrefab = await this.loadNativePrefab(path);
        if (nativePrefab) {
            const instance = instantiate(nativePrefab);
            this.bindLegacyFallbackInteractions(instance, path, onLegacyUiEvent);
            return instance;
        }
        throw new Error(`缺少 Creator 3.8.8 原生 Prefab: ${path}`);
    }

    private adaptLegacyFullscreenForm(root: Node, path: string): void {
        const transform = root.getComponent(UITransform);
        if (!transform) return;
        const designWidth = transform.width;
        const designHeight = transform.height;
        // Item templates and compact overlays must retain their authored local
        // coordinates. Only old scene-sized forms participate in canvas fitting.
        if (designWidth < 1200 || designHeight < 700) return;

        // ChatPanel is a native Creator prefab whose root Widget owns the full-
        // screen input shield. Its authored offsets and child layout must remain
        // authoritative across viewport sizes; legacy fitting would disable that
        // Widget and create a second, code-defined layout path.
        if (path === 'room/ChatPanel') return;

        // All landscape gameplay UI is authored against the project's fixed
        // 1280x720 design resolution. The scene layer can report the physical
        // browser viewport (for example 1369x760), which must not become a
        // second design coordinate system.
        const viewportWidth = 1280;
        const viewportHeight = 720;
        if (this.isClubFullscreenForm(path)) {
            const widget = root.getComponent(Widget);
            if (widget) widget.enabled = false;
            transform.setContentSize(viewportWidth, viewportHeight);
            root.setPosition(0, 0, 0);
            root.setScale(1, 1, 1);
            return;
        }
        // LobbyMain is already authored for Creator 3.8's 1280x720 profile. For
        // every 1360/1560x760 legacy form, fit both axes instead of allowing its
        // root Widget to stretch or crop the old coordinate space.
        const scale = Math.min(viewportWidth / designWidth, viewportHeight / designHeight, 1);
        const widget = root.getComponent(Widget);
        if (widget && (designWidth !== viewportWidth || designHeight !== viewportHeight)) widget.enabled = false;
        root.setPosition(0, 0, 0);
        root.setScale(scale, scale, 1);

        // Native 1280x720 forms already use the project's authoritative design
        // coordinates. Their oversized children can intentionally extend into
        // the 160px landscape background gutters, so preserve the authored
        // Sprite size, Widget and aspect ratio instead of normalizing them as
        // legacy scene backgrounds.
        if (designWidth === viewportWidth && designHeight === viewportHeight) return;

        // Keep controls inside the safe 1280x720 content area, but let large
        // background sprites cover the viewport. Scaling the whole 1560x760
        // form with `min` otherwise leaves visible bars above and below it.
        const coverWidth = viewportWidth / scale;
        const coverHeight = viewportHeight / scale;
        const backgroundNames = /^(bg|bj|background|beijing|beijing01|di|mask|heidi|sprite)$/i;
        const visit = (node: Node, depth: number): void => {
            if (depth > 2) return;
            for (const child of node.children) {
                const childTransform = child.getComponent(UITransform);
                const childSprite = child.getComponent(Sprite);
                const isScreenSized = Boolean(childTransform)
                    && childTransform!.width >= designWidth * 0.8
                    && childTransform!.height >= designHeight * 0.8;
                const isBackground = backgroundNames.test(child.name) || isScreenSized;
                if (childTransform && childSprite && isBackground) {
                    childSprite.sizeMode = Sprite.SizeMode.CUSTOM;
                    childTransform.setContentSize(coverWidth, coverHeight);
                    child.setPosition(0, 0, child.position.z);
                    const childWidget = child.getComponent(Widget);
                    if (childWidget) childWidget.enabled = false;
                }
                visit(child, depth + 1);
            }
        };
        visit(root, 0);
    }

    private isClubFullscreenForm(path: string): boolean {
        return path.startsWith('club/default/')
            || path.startsWith('club/skin-1/')
            || path.startsWith('club/skin-2/');
    }

    private bindLegacyFallbackInteractions(
        root: Node,
        formPath: string,
        onLegacyUiEvent?: LegacyInteractionContextOptions['onLegacyUiEvent'],
    ): void {
        if (!onLegacyUiEvent) return;
        const pending = new Set<string>();
        const nodes: Node[] = [];
        const visit = (node: Node): void => {
            nodes.push(node);
            for (const child of node.children) visit(child);
        };
        visit(root);
        for (const node of nodes) {
            const button = node.getComponent(Button);
            const toggle = node.getComponent(Toggle);
            const editBox = node.getComponent(EditBox);
            const scrollView = node.getComponent(ScrollView);
            const buttonClickEvents = ((button as unknown as { clickEvents?: unknown[] })?.clickEvents) ?? [];
            const toggleCheckEvents = ((toggle as unknown as { checkEvents?: unknown[] })?.checkEvents) ?? [];
            if (button && buttonClickEvents.length === 0) {
                const guardKey = `${formPath}/${node.uuid}-click`;
                const emit = (event: unknown): void => {
                    const sourcePath = this.getNodePath(node);
                    const payload: LegacyUiInteractionPayload = {
                        formPath,
                        handler: 'OnClick_BtnWnd',
                        customEventData: '',
                        componentId: null,
                        targetLegacyId: null,
                        targetName: node.name,
                        eventType: 'button-click',
                        sourceLegacyId: null,
                        sourceName: node.name,
                        sourcePath,
                    };
                    onLegacyUiEvent(payload, node, node, event);
                    node.emit('legacy-ui-event', payload, event);
                };
                if (!pending.has(guardKey)) {
                    const handler = (event: unknown): void => {
                        const now = Date.now();
                        const last = this.interactionGuard.get(guardKey) ?? 0;
                        if (now - last < 180) return;
                        this.interactionGuard.set(guardKey, now);
                        emit(event);
                    };
                    node.on(Button.EventType.CLICK, handler);
                    node.on(Node.EventType.TOUCH_END, handler);
                    node.on(Node.EventType.MOUSE_UP, handler);
                    pending.add(guardKey);
                }
            }
            if (toggle && toggleCheckEvents.length === 0) {
                const handler = (event: unknown): void => {
                    const sourcePath = this.getNodePath(node);
                    onLegacyUiEvent({
                        formPath,
                        handler: 'OnToggle_Check',
                        customEventData: '',
                        componentId: null,
                        targetLegacyId: null,
                        targetName: node.name,
                        eventType: 'toggle',
                        sourceLegacyId: null,
                        sourceName: node.name,
                        sourcePath,
                    }, node, node, event);
                    node.emit('legacy-ui-event', {
                        formPath,
                        handler: 'OnToggle_Check',
                        customEventData: '',
                        componentId: null,
                        targetLegacyId: null,
                        targetName: node.name,
                        eventType: 'toggle',
                        sourceLegacyId: null,
                        sourceName: node.name,
                        sourcePath,
                    }, event);
                };
                node.on(Toggle.EventType.TOGGLE, handler);
            }
            if (editBox) {
                const attachEditbox = (eventType: LegacyUiInteractionPayload['eventType'], handler: string): void => {
                    const listener = (event: unknown): void => {
                        const sourcePath = this.getNodePath(node);
                        const payload: LegacyUiInteractionPayload = {
                            formPath,
                            handler,
                            customEventData: '',
                            componentId: null,
                            targetLegacyId: null,
                            targetName: node.name,
                            eventType,
                            sourceLegacyId: null,
                            sourceName: node.name,
                            sourcePath,
                        };
                        onLegacyUiEvent(payload, node, node, event);
                        node.emit('legacy-ui-event', payload, event);
                    };
                    if (eventType === 'editbox-began') {
                        node.on(EditBox.EventType.EDITING_DID_BEGAN as string, listener);
                    }
                    if (eventType === 'editbox-ended') {
                        node.on(EditBox.EventType.EDITING_DID_ENDED as string, listener);
                    }
                    if (eventType === 'editbox-return') {
                        node.on(EditBox.EventType.EDITING_RETURN as string, listener);
                    }
                };
                attachEditbox('editbox-began', 'OnEditBox_Began');
                attachEditbox('editbox-ended', 'OnEditBox_End');
                attachEditbox('editbox-return', 'OnEditBox_Return');
            }
            if (scrollView) {
                const scrollHandler = (event: unknown): void => {
                    const sourcePath = this.getNodePath(node);
                    const payload: LegacyUiInteractionPayload = {
                        formPath,
                        handler: 'OnScroll',
                        customEventData: '',
                        componentId: null,
                        targetLegacyId: null,
                        targetName: node.name,
                        eventType: 'scroll',
                        sourceLegacyId: null,
                        sourceName: node.name,
                        sourcePath,
                    };
                    onLegacyUiEvent(payload, node, node, event);
                    node.emit('legacy-ui-event', payload, event);
                };
                node.on(ScrollView.EventType.SCROLL_ENDED as string, scrollHandler);
            }
            if (node.getComponent(PageView)) {
                const pageViewHandler = (event: unknown): void => {
                    const sourcePath = this.getNodePath(node);
                    const payload: LegacyUiInteractionPayload = {
                        formPath,
                        handler: 'OnPageView_PageChanged',
                        customEventData: '',
                        componentId: null,
                        targetLegacyId: null,
                        targetName: node.name,
                        eventType: 'pageview',
                        sourceLegacyId: null,
                        sourceName: node.name,
                        sourcePath,
                    };
                    onLegacyUiEvent(payload, node, node, event);
                    node.emit('legacy-ui-event', payload, event);
                };
                node.on(PageView.EventType.PAGE_TURNING as string, pageViewHandler);
            }
        }
    }

    public close(formPath: string, destroy = false): void {
        const path = this.normalize(formPath);
        this.pathEpoch.set(path, (this.pathEpoch.get(path) ?? 0) + 1);
        this.cancelPending(path);
        this.removeFromStack(path);
        this.clearInteractionGuardsForForm(path);
        const form = this.loaded.get(path);
        if (!form) {
            this.refreshLayers();
            return;
        }
        if (this.numericNumpad?.node.isValid && this.isDescendantOf(this.numericNumpad.node, form.node)) {
            this.numericNumpad.dispose();
            this.numericNumpad = null;
        }
        form.close(destroy);
        if (destroy) this.loaded.delete(path);
        this.refreshLayers();
    }

    /**
     * Closes a form and consumes the remaining events from the same pointer
     * transaction before an underlying form is made interactive again.
     */
    public closeAfterPointer(formPath: string, destroy = false): void {
        if (this.suppressPointerContinuation) return;
        this.suppressPointerContinuation = true;
        this.close(formPath, destroy);
    }

    public closeAllClubForms(destroy = false): void {
        for (const path of [...this.loaded.keys()]) {
            if (!path.startsWith('club/')) continue;
            this.close(path, destroy);
        }
    }

    public closeAll(destroy = true): void {
        this.invalidatePending();
        for (const path of [...this.loaded.keys()]) {
            this.close(path, destroy);
        }
        if (destroy) this.loaded.clear();
        this.shownStack.length = 0;
        this.refreshLayers();
    }

    /** Mirrors the old FormManager scene-exit boundary and cancels late async loads. */
    public onBeforeExitScene(destroy = true): void {
        this.interactionGuard.clear();
        this.closeAll(destroy);
    }

    /**
     * Equivalent to old OnSwithSceneEnd + OnShowDefaultForm chain:
     * close scene-specific overlays then restore registered defaults.
     */
    public async onSceneDidEnter(): Promise<void> {
        await this.showDefaults();
    }

    /** Closes the current top form. Returns false when only the base form remains. */
    public back(): boolean {
        for (let index = this.shownStack.length - 1; index >= 0; index -= 1) {
            const path = this.shownStack[index];
            if (!path) continue;
            const form = this.loaded.get(path);
            if (!form?.isShown() || form.zOrder <= 0) continue;
            this.close(path);
            return true;
        }
        return false;
    }

    public destroy(): void {
        if (this.disposed) return;
        this.closeAll(true);
        this.disposed = true;
        this.interactionGuard.clear();
        if (this.uiLayer.isValid) {
            this.uiLayer.off(Node.EventType.TOUCH_START, this.pointerStart, this, true);
            this.uiLayer.off(Node.EventType.MOUSE_DOWN, this.pointerStart, this, true);
            this.uiLayer.off(Node.EventType.TOUCH_END, this.pointerContinuation, this, true);
            this.uiLayer.off(Node.EventType.MOUSE_UP, this.pointerContinuation, this, true);
            this.uiLayer.off(Button.EventType.CLICK, this.pointerContinuation, this, true);
        }
        if (this.modalMask.isValid) this.modalMask.destroy();
    }

    public isAlive(): boolean {
        return !this.disposed && this.uiLayer.isValid;
    }

    public diagnostics(): {
        loaded: number; creating: number; stack: readonly string[]; modal: boolean; epoch: number; loading: boolean;
    } {
        return {
            loaded: this.loaded.size,
            creating: this.creating.size,
            stack: [...this.shownStack],
            modal: this.modalMask.active,
            epoch: this.epoch,
            loading: this.loadingCount > 0,
        };
    }

    public toggle(formPath: string, ...args: unknown[]): boolean {
        const form = this.get(formPath);
        if (form?.isShown()) {
            this.close(formPath);
            return false;
        }
        void this.show(formPath, ...args);
        return true;
    }

    public get(formPath: string): LegacyForm | undefined {
        return this.loaded.get(this.normalize(formPath));
    }

    public isShown(formPath: string): boolean {
        return this.get(formPath)?.isShown() ?? false;
    }

    public addDefault(formPath: string): void {
        const path = this.normalize(formPath);
        if (this.defaults.indexOf(path) === -1) this.defaults.push(path);
    }

    /**
     * Legacy-compatible default restore path for scene transitions.
     * Reopens all registered default forms without duplicate side-effects.
     */
    public async showDefaults(): Promise<void> {
        if (!this.defaults.length) return;
        for (const formPath of this.defaults) {
            await this.show(formPath);
        }
    }

    public getDefaults(): readonly string[] {
        return this.defaults;
    }

    public clearDefaults(): void {
        this.defaults.length = 0;
    }

    public clearInteractionGuards(): void {
        this.interactionGuard.clear();
    }

    private clearInteractionGuardsForForm(formPath: string): void {
        const prefix = `${formPath}/`;
        for (const key of this.interactionGuard.keys()) {
            if (key === formPath) {
                this.interactionGuard.delete(key);
                continue;
            }
            if (key.startsWith(prefix)) this.interactionGuard.delete(key);
        }
    }

    private activate(path: string, form: LegacyForm, args: unknown[]): void {
        form.show(args);
        // Some Club forms create interval/value rows during onShow. Bind after the
        // lifecycle as well so those runtime-instantiated EditBoxes use Numpad too.
        this.bindNumericNumpads(form);
        this.removeFromStack(path);
        this.shownStack.push(path);
        this.refreshLayers();
    }

    private removeFromStack(path: string): void {
        let index = this.shownStack.indexOf(path);
        while (index !== -1) {
            this.shownStack.splice(index, 1);
            index = this.shownStack.indexOf(path);
        }
    }

    private refreshLayers(): void {
        if (!this.uiLayer.isValid || !this.modalMask.isValid) return;
        const visible = this.shownStack
            .map((path, order) => ({ path, order, form: this.loaded.get(path) }))
            .filter((entry): entry is { path: string; order: number; form: LegacyForm } => Boolean(entry.form?.isShown()))
            .sort((left, right) => left.form.zOrder - right.form.zOrder || left.order - right.order);
        const topModal = [...visible].reverse().find((entry) => entry.form.modal);
        if (!topModal) {
            this.modalMask.active = false;
            this.modalMask.removeFromParent();
        } else {
            if (!this.modalMask.parent) this.uiLayer.addChild(this.modalMask);
            this.modalMask.active = true;
        }
        let sibling = 0;
        for (const entry of visible) {
            if (topModal?.path === entry.path) this.modalMask.setSiblingIndex(sibling++);
            entry.form.node.setSiblingIndex(sibling++);
        }
    }

    private invalidatePending(): void {
        this.epoch += 1;
        for (const request of this.creating.values()) {
            request.transition.cancel();
            if (!request.loading) continue;
            request.loading = false;
            this.changeLoading(-1);
        }
        this.interactionGuard.clear();
        this.creating.clear();
    }

    private cancelPending(path: string): void {
        const request = this.creating.get(path);
        if (!request) return;
        request.transition.cancel();
        if (request.loading) {
            request.loading = false;
            this.changeLoading(-1);
        }
        this.creating.delete(path);
    }

    private changeLoading(delta: number): void {
        const wasLoading = this.loadingCount > 0;
        this.loadingCount = Math.max(0, this.loadingCount + delta);
        const isLoading = this.loadingCount > 0;
        if (wasLoading !== isLoading) this.onLoadingChanged(isLoading);
    }

    /**
     * Lobby shows normal loading through the canonical Creator WaitForm. The
     * DOM coordinator stays available for readiness, timeout and retry, but its
     * normal-state cover must not compete with that prefab. Login and explicit
     * game-entry managers keep the existing startup presentation by default.
     */
    private transitionShowDelay(defaultDelay: number): number {
        return this.externalLoadingPresentation ? 60_000 : defaultDelay;
    }

    private assertAlive(): void {
        if (!this.isAlive()) throw new Error('LegacyFormManager 已销毁');
    }

    private normalize(formPath: string): string {
        if (!formPath.includes('/')) return `lobby/${formPath}`;
        if (formPath.startsWith('ui/club_1/')) return `club/skin-1/${formPath.slice(10)}`;
        if (formPath.startsWith('ui/club_2/')) return `club/skin-2/${formPath.slice(10)}`;
        if (formPath.startsWith('ui/club/')) return `club/default/${formPath.slice(8)}`;
        if (formPath.startsWith('platform-ui/lobby/')) return `lobby/${formPath.slice(18)}`;
        if (formPath.startsWith('platform-ui/club/default/')) return `club/default/${formPath.slice(25)}`;
        if (formPath.startsWith('platform-ui/club/skin-1/')) return `club/skin-1/${formPath.slice(24)}`;
        if (formPath.startsWith('platform-ui/club/skin-2/')) return `club/skin-2/${formPath.slice(24)}`;
        if (formPath.startsWith('ui/')) return `lobby/${formPath.slice(3)}`;
        return formPath;
    }

    private formName(path: string): string {
        return path.slice(path.lastIndexOf('/') + 1);
    }

    private getNodePath(node: Node): string {
        const names: string[] = [];
        let current: Node | null = node;
        while (current) {
            names.push(current.name);
            current = current.parent;
        }
        return names.reverse().join('/');
    }

    private loadNativePrefab(path: string): Promise<Prefab | null> {
        const normalizedPath = this.normalize(path);
        const pending = this.prefabLoading.get(normalizedPath);
        if (pending) return pending;
        const task = this.loadNativePrefabUncached(normalizedPath)
            .finally(() => this.prefabLoading.delete(normalizedPath));
        this.prefabLoading.set(normalizedPath, task);
        return task;
    }

    private loadNativePrefabUncached(path: string): Promise<Prefab | null> {
        const formName = this.formName(path);
        const canonicalName = this.canonicalPrefabName(formName);
        const commonGameAsset = resolveCommonPrefabAsset(path);
        const numpadAsset = resolveCommonNumpadAsset(canonicalName);
        const gameAsset = resolveGamePrefabAsset(path);
        const moduleAsset = resolveModulePrefabAsset(path);
        const candidates: Array<{ bundle: string; asset: string }> = [
            ...(moduleAsset ? [moduleAsset] : []),
            ...(gameAsset ? [gameAsset] : []),
            ...(commonGameAsset ? [commonGameAsset] : []),
            ...(numpadAsset ? [{ bundle: COMMON_ASSET_BUNDLE, asset: numpadAsset }] : []),
            { bundle: 'lobby', asset: 'Prefab/' + canonicalName },
            // Club/Prefab belongs to the parent `club` Bundle; it is not a Bundle itself.
            { bundle: 'club', asset: 'Prefab/' + canonicalName },
            { bundle: 'mahjong01-prefab', asset: 'game/hzmj/' + canonicalName },
        ];
        return new Promise((resolve) => {
            const loadNext = (index: number): void => {
                if (index >= candidates.length) {
                    resolve(null);
                    return;
                }
                const candidate = candidates[index];
                void this.loadBundleWithDependencies(candidate.bundle).then((bundle) => {
                    if (!bundle) {
                        loadNext(index + 1);
                        return;
                    }
                    bundle.load(candidate.asset, Prefab, (error, prefab) => {
                        if (error || !prefab) {
                            loadNext(index + 1);
                            return;
                        }
                        resolve(prefab);
                    });
                });
            };
            loadNext(0);
        });
    }

    public loadCommonNumpad(): Promise<Prefab | null> {
        return this.loadNativePrefab('common/Numpad');
    }

    /** Every numeric legacy field is routed through the single Common Numpad asset. */
    private bindNumericNumpads(form: LegacyForm): void {
        if (['UIJoinClub', 'UIJoinUnion'].includes(form.name)) return;
        const numericName = /(?:pid|page|percent|sports|prize|score|cost|point|password|active|value|joinGame|leave|panker|diamond|choushui|PL(?:EditBox|Double|Start)|AutoDissolve)/i;
        const decimalName = /(?:percent|sports|score|cost|point|value|joinGame|leave|panker|choushui|PL(?:EditBox|Double|Start)|AutoDissolve)/i;
        // Several 2.22 prefabs named a player/club-id field only "EditBox" and
        // serialized it as a text input. Keep those business contracts explicit;
        // generic search/name fields must continue to use the native text keyboard.
        const legacyNumericFields = new Set([
            'UIClubPromoterAdd/EditBox',
            'UIForbidAddUser/EditBox',
            'UIForbidGameAddUser/EditBox',
            'UIClubPromoterLevelAdd/EditBox',
            'UIPromoterXIaShuAdd/EditBox',
            'UIPromoterXiaShuList/EditBox',
            'UIUnionYaoQing/EditBox',
            'UIYaoQing/EditBox',
        ]);
        const visit = (node: Node): void => {
            const edit = node.getComponent(EditBox);
            const nativeNumericMode = edit && (
                edit.inputMode === EditBox.InputMode.NUMERIC
                || edit.inputMode === EditBox.InputMode.PHONE_NUMBER
                || edit.inputMode === EditBox.InputMode.DECIMAL
            );
            if (edit && !this.numericOpeners.has(node) && (nativeNumericMode || numericName.test(node.name) || legacyNumericFields.has(`${form.name}/${node.name}`))) {
                // Numeric entries are buttons with a child label. The disabled legacy
                // EditBox remains only as the backing value contract for old form code;
                // it must never summon the platform keyboard.
                edit.enabled = false;
                const trigger = node.getComponent(Button) ?? node.addComponent(Button);
                trigger.interactable = true;
                let lastOpen = 0;
                const open = (): void => {
                    const now = Date.now();
                    if (now - lastOpen < 180) return;
                    lastOpen = now;
                    void this.openNumericNumpad(form, edit, edit.inputMode === EditBox.InputMode.DECIMAL || decimalName.test(node.name));
                };
                this.numericOpeners.set(node, open);
                // ScrollView may cancel an end/click gesture even when the pointer did
                // not visibly move. Opening on press gives numeric fields a stable hit
                // path while the debounce below absorbs the following end/click events.
                node.on(Node.EventType.TOUCH_START, open);
                node.on(Node.EventType.MOUSE_DOWN, open);
                node.on(Node.EventType.TOUCH_END, open);
                node.on(Node.EventType.MOUSE_UP, open);
                node.on(Button.EventType.CLICK, open);
            }
            for (const child of node.children) visit(child);
        };
        visit(form.node);
    }

    private async openNumericNumpad(form: LegacyForm, edit: EditBox, allowDecimal: boolean): Promise<void> {
        this.numericNumpad?.dispose();
        let value = edit.string.trim();
        const label = edit.node.getChildByName('lb')?.getComponent(Label) ?? null;
        const setValue = (next: string): void => {
            value = next;
            edit.string = next;
            if (label) label.string = next;
        };
        const maxDigits = edit.maxLength > 0 ? edit.maxLength : 12;
        const close = (): void => { this.numericNumpad?.dispose(); this.numericNumpad = null; };
        this.numericNumpad = await this.numericNumpadService.open(form.node, () => this.loadCommonNumpad(), {
            close,
            confirm: close,
        }, { digitCount: maxDigits, maxDigits: maxDigits + (allowDecimal ? 3 : 0), decimalPlaces: allowDecimal ? 2 : 0, value: () => value, setValue }, { title: '请输入数字' });
    }

    private isDescendantOf(node: Node, ancestor: Node): boolean {
        let current: Node | null = node;
        while (current) { if (current === ancestor) return true; current = current.parent; }
        return false;
    }

    private async loadBundleWithDependencies(name: string, seen = new Set<string>()): Promise<AssetManager.Bundle | null> {
        if (seen.has(name)) return assetManager.getBundle(name) ?? null;
        const bundle = await this.loadBundleByName(name);
        if (!bundle) return null;
        seen.add(name);
        for (const dependencyName of this.bundleDependencyNames(bundle)) {
            const dependency = await this.loadBundleWithDependencies(dependencyName, seen);
            if (!dependency) return null;
        }
        seen.delete(name);
        return bundle;
    }

    private loadBundleByName(name: string): Promise<AssetManager.Bundle | null> {
        const existing = assetManager.getBundle(name);
        if (existing) return Promise.resolve(existing);
        const pending = this.bundleLoading.get(name);
        if (pending) return pending;
        const task = new Promise<AssetManager.Bundle | null>((resolve) => {
            let settled = false;
            const timeout = globalThis.setTimeout(() => {
                if (settled) return;
                settled = true;
                this.bundleLoading.delete(name);
                resolve(null);
            }, 15_000);
            assetManager.loadBundle(name, (error, bundle) => {
                if (settled) return;
                settled = true;
                globalThis.clearTimeout(timeout);
                this.bundleLoading.delete(name);
                resolve(error || !bundle ? null : bundle);
            });
        });
        this.bundleLoading.set(name, task);
        return task;
    }

    private bundleDependencyNames(bundle: AssetManager.Bundle): string[] {
        const typedBundle = bundle as AssetManager.Bundle & {
            deps?: readonly unknown[];
            config?: { deps?: readonly unknown[] };
        };
        const rawDependencies = typedBundle.deps ?? typedBundle.config?.deps ?? [];
        const names: string[] = [];
        for (const dependency of rawDependencies) {
            if (typeof dependency !== 'string') continue;
            if (dependency.length === 0 || dependency === bundle.name || names.includes(dependency)) continue;
            names.push(dependency);
        }
        return names;
    }

    private canonicalPrefabName(name: string): string {
        if (name === 'UILobbyMain') return 'LobbyMain';
        if (name === 'UILobbyProfile') return 'Lobby_Profile';
        if (name === 'UILobbyRecords') return 'Lobby_Records';
        if (name === 'UILobbyRecordDetail') return 'Lobby_RecordDetail';
        return name.startsWith('UI') && name.length > 2 ? name.slice(2) : name;
    }

}
