import {
    Button,
    Animation,
    AnimationClip,
    BlockInputEvents,
    Color,
    EditBox,
    JsonAsset,
    Label,
    Layout,
    Mask,
    Component,
    Node,
    resources,
    Sprite,
    SpriteFrame,
    ProgressBar,
    RichText,
    ScrollView,
    PageView,
    Prefab,
    Toggle,
    UIOpacity,
    UITransform,
    Vec3,
    Widget,
    instantiate,
} from 'cc';
import { UnifiedScroll } from '../../UI/UnifiedScroll';
import { AssetLoader } from '../../UI/Infrastructure';

export interface LegacyNodeManifest {
    legacyId?: number;
    name: string;
    active: boolean;
    position: [number, number];
    /** Original root transform, retained for prefabs instantiated as children. */
    authoredPosition?: [number, number];
    scale: [number, number];
    angle: number;
    size: [number, number];
    anchor: [number, number];
    opacity: number;
    color: [number, number, number, number];
    sprite: null | { path: string | null; type: number; fillType: number; fillStart: number; fillRange: number; border?: [number, number, number, number] };
    label: null | { text: string; fontPath: string | null; fontSize: number; lineHeight: number; horizontalAlign: number; verticalAlign: number; overflow: number };
    labelOutline?: null | { color: [number, number, number, number]; width: number };
    richText?: null | { text: string; fontSize: number; lineHeight: number; maxWidth: number };
    editBox?: null | { text: string; placeholder: string; maxLength: number; inputFlag: number; inputMode: number };
    button: null | { interactable: boolean };
    toggle?: null | { checked: boolean; interactable: boolean };
    progressBar?: null | { progress: number };
    widget?: null | { alignMode: number; top: number; bottom: number; left: number; right: number; horizontalCenter: number; verticalCenter: number; isAlignTop: boolean; isAlignBottom: boolean; isAlignLeft: boolean; isAlignRight: boolean; isAlignHorizontalCenter: boolean; isAlignVerticalCenter: boolean };
    layout?: null | { type: number; resizeMode: number; startAxis: number; paddingLeft: number; paddingRight: number; paddingTop: number; paddingBottom: number; spacingX: number; spacingY: number; verticalDirection: number; horizontalDirection: number };
    mask?: null | { type: number; inverted: boolean; alphaThreshold: number };
    scrollView?: null | { horizontal: boolean; vertical: boolean; elastic: boolean; brake: number };
    blockInput?: boolean;
    animation?: null | { clips: string[]; defaultClip: string | null; playOnLoad: boolean };
    interactions?: {
        clickEvents: LegacySerializedEvent[];
        checkEvents: LegacySerializedEvent[];
        editingDidBegan: LegacySerializedEvent[];
        editingDidEnded: LegacySerializedEvent[];
        editingReturn: LegacySerializedEvent[];
        scrollEvents: LegacySerializedEvent[];
        pageEvents?: LegacySerializedEvent[];
    };
    children: LegacyNodeManifest[];
}

export interface LegacySerializedEvent {
    targetLegacyId: number | null;
    componentId: string | null;
    handler: string;
    customEventData: string;
}

export interface LegacyUiInteractionPayload {
    handler: string;
    customEventData: string;
    componentId: string | null;
    targetLegacyId: number | null;
    targetName: string | null;
    eventType: 'button-click' | 'toggle' | 'editbox-began' | 'editbox-ended' | 'editbox-return' | 'scroll' | 'pageview';
    sourceLegacyId: number | null;
    sourceName: string;
    sourcePath: string;
    formPath: string | null;
}

export interface LegacyInteractionContextOptions {
    formPath?: string;
    onLegacyUiEvent?: (
        payload: LegacyUiInteractionPayload,
        sourceNode: Node,
        targetNode: Node | null,
        event: unknown,
    ) => void;
}

interface PendingInteraction {
    sourceNode: Node;
    eventType: 'button-click' | 'toggle' | 'editbox-began' | 'editbox-ended' | 'editbox-return' | 'scroll' | 'pageview';
    handlers: readonly LegacySerializedEvent[];
}

interface InteractionContext {
    formPath: string | null;
    nodeByLegacyId: Map<number, Node>;
    legacyIdByNode: Map<Node, number>;
    pending: PendingInteraction[];
    onLegacyUiEvent?: LegacyInteractionContextOptions['onLegacyUiEvent'];
}

export interface LegacyPrefabManifest {
    root: LegacyNodeManifest;
}

export class LegacyPrefabRenderer {
    private readonly spriteFrames = new Map<string, SpriteFrame>();
    private readonly animationClips = new Map<string, AnimationClip>();
    private readonly assets = new AssetLoader();

    public async instantiatePrefab(bundleName: string, assetPath: string, parent: Node): Promise<Node> {
        const bundle = await this.assets.bundle(bundleName);
        const prefab = await this.assets.load(assetPath, Prefab, bundle);
        const node = instantiate(prefab);
        parent.addChild(node);
        return node;
    }

    public async loadManifest(resourcePath: string): Promise<LegacyPrefabManifest> {
        const asset = await this.load(resourcePath, JsonAsset);
        return asset.json as unknown as LegacyPrefabManifest;
    }

    public async instantiate(
        manifest: LegacyPrefabManifest,
        parent: Node,
        preserveRootPosition = false,
        options: LegacyInteractionContextOptions = {},
    ): Promise<Node> {
        // 旧版资源数量很多。逐节点 await 会把尚未完成的半个大厅直接展示给
        // 玩家，表现为黑底、只有头像和背景、功能按钮迟迟不出现。先并发加载
        // 全部依赖，再一次性创建节点树，保证大厅以完整帧出现。
        await this.preload(manifest.root);
        const context: InteractionContext = {
            formPath: options.formPath ?? null,
            nodeByLegacyId: new Map(),
            legacyIdByNode: new Map(),
            pending: [],
            onLegacyUiEvent: options.onLegacyUiEvent,
        };
        const node = this.createNode(manifest.root, parent, context);
        this.bindInteractions(context);
        if (preserveRootPosition && manifest.root.authoredPosition) {
            node.setPosition(manifest.root.authoredPosition[0], manifest.root.authoredPosition[1]);
        }
        return node;
    }

    private createNode(source: LegacyNodeManifest, parent: Node, context: InteractionContext): Node {
        const node = new Node(source.name);
        if (typeof source.legacyId === 'number') {
            context.nodeByLegacyId.set(source.legacyId, node);
            context.legacyIdByNode.set(node, source.legacyId);
        }
        parent.addChild(node);
        node.layer = parent.layer;
        node.active = source.active;
        node.setPosition(new Vec3(source.position[0], source.position[1]));
        node.setScale(new Vec3(source.scale[0], source.scale[1], 1));
        node.angle = source.angle;
        const transform = node.addComponent(UITransform);
        transform.setContentSize(source.size[0], source.size[1]);
        transform.setAnchorPoint(source.anchor[0], source.anchor[1]);
        if (source.opacity !== 255) node.addComponent(UIOpacity).opacity = source.opacity;
        const color = new Color(...source.color);

        if (source.sprite?.path) {
            const sprite = node.addComponent(Sprite);
            const frame = this.spriteFrames.get(source.sprite.path);
            if (frame) {
                const border = source.sprite.border;
                if (border) {
                    frame.insetLeft = border[0];
                    frame.insetRight = border[1];
                    frame.insetTop = border[2];
                    frame.insetBottom = border[3];
                }
                sprite.sizeMode = Sprite.SizeMode.CUSTOM;
                sprite.spriteFrame = frame;
                sprite.type = source.sprite.type as Sprite['type'];
                sprite.fillType = source.sprite.fillType as Sprite['fillType'];
                sprite.fillStart = source.sprite.fillStart;
                sprite.fillRange = source.sprite.fillRange;
                sprite.color = color;
                // Creator 3 在赋值 spriteFrame 时仍可能按纹理原始尺寸覆盖
                // UITransform。旧大厅大量九宫格原图只有几十像素，必须在绑定
                // 图片后再次恢复旧预制体序列化尺寸。
                transform.setContentSize(source.size[0], source.size[1]);
                transform.setAnchorPoint(source.anchor[0], source.anchor[1]);
            }
        }
        if (source.label) {
            const label = node.addComponent(Label);
            label.string = source.label.text;
            label.fontSize = source.label.fontSize;
            label.lineHeight = source.label.lineHeight;
            label.horizontalAlign = source.label.horizontalAlign as Label['horizontalAlign'];
            label.verticalAlign = source.label.verticalAlign as Label['verticalAlign'];
            label.overflow = source.label.overflow as Label['overflow'];
            label.color = color;
        }
        if (source.labelOutline && Label && node.getComponent(Label)) {
            const label = node.getComponent(Label)!;
            label.enableOutline = true;
            label.outlineColor = new Color(...source.labelOutline.color);
            label.outlineWidth = source.labelOutline.width;
        }
        if (source.richText) {
            const richText = node.addComponent(RichText);
            richText.string = source.richText.text;
            richText.fontSize = source.richText.fontSize;
            richText.lineHeight = source.richText.lineHeight;
            richText.maxWidth = source.richText.maxWidth;
        }
        let editBox: EditBox | null = null;
        if (source.button) {
            const button = node.addComponent(Button);
            button.interactable = source.button.interactable;
            button.transition = Button.Transition.SCALE;
            button.zoomScale = 0.96;
        }
        if (source.toggle) {
            const toggle = node.addComponent(Toggle);
            toggle.isChecked = source.toggle.checked;
            toggle.interactable = source.toggle.interactable;
        }
        if (source.progressBar) {
            const progressBar = node.addComponent(ProgressBar);
            progressBar.progress = source.progressBar.progress;
            progressBar.barSprite = Sprite ? node.getComponent(Sprite) : null;
        }
        if (source.widget) {
            const widget = node.addComponent(Widget);
            widget.alignMode = source.widget.alignMode as Widget.AlignMode;
            widget.top = source.widget.top;
            widget.bottom = source.widget.bottom;
            widget.left = source.widget.left;
            widget.right = source.widget.right;
            widget.horizontalCenter = source.widget.horizontalCenter;
            widget.verticalCenter = source.widget.verticalCenter;
            widget.isAlignTop = source.widget.isAlignTop;
            widget.isAlignBottom = source.widget.isAlignBottom;
            widget.isAlignLeft = source.widget.isAlignLeft;
            widget.isAlignRight = source.widget.isAlignRight;
            widget.isAlignHorizontalCenter = source.widget.isAlignHorizontalCenter;
            widget.isAlignVerticalCenter = source.widget.isAlignVerticalCenter;
        }
        let layout: Layout | null = null;
        if (source.layout) {
            layout = node.addComponent(Layout);
            layout.type = source.layout.type as Layout['type'];
            layout.resizeMode = source.layout.resizeMode as Layout['resizeMode'];
            layout.startAxis = source.layout.startAxis as Layout['startAxis'];
            layout.paddingLeft = source.layout.paddingLeft;
            layout.paddingRight = source.layout.paddingRight;
            layout.paddingTop = source.layout.paddingTop;
            layout.paddingBottom = source.layout.paddingBottom;
            layout.spacingX = source.layout.spacingX;
            layout.spacingY = source.layout.spacingY;
            layout.verticalDirection = source.layout.verticalDirection as Layout['verticalDirection'];
            layout.horizontalDirection = source.layout.horizontalDirection as Layout['horizontalDirection'];
        }
        if (source.mask) {
            const mask = node.addComponent(Mask);
            // Creator 3 cannot initialize a detached 2.x image-stencil Mask
            // before its render stencil exists. Rect clipping preserves the
            // authored viewport without triggering a null stencil.
            mask.type = Mask.Type.GRAPHICS_RECT;
        }
        let scrollView: ScrollView | null = null;
        if (source.scrollView) {
            scrollView = UnifiedScroll.ensure(node);
            scrollView.horizontal = source.scrollView.horizontal;
            scrollView.vertical = source.scrollView.vertical;
        }
        if (source.blockInput) node.addComponent(BlockInputEvents);
        if (source.animation) {
            const animation = node.addComponent(Animation);
            animation.clips = source.animation.clips
                .map((path) => this.animationClips.get(path)).filter((clip): clip is AnimationClip => Boolean(clip));
            animation.defaultClip = source.animation.defaultClip
                ? this.animationClips.get(source.animation.defaultClip) ?? null : null;
            animation.playOnLoad = source.animation.playOnLoad;
        }
        for (const child of source.children) this.createNode(child, node, context);
        // EditBox creates TEXT_LABEL/PLACEHOLDER_LABEL automatically when they
        // do not exist. Converted 2.4 prefabs already serialize those nodes,
        // so attach the component only after restoring its children. Attaching
        // it earlier produces two label layers: runtime updates one while the
        // stale serialized value remains visible above it.
        if (source.editBox) {
            editBox = node.addComponent(EditBox);
            editBox.textLabel = Label ? node.getChildByName('TEXT_LABEL')?.getComponent(Label) ?? null : null;
            editBox.placeholderLabel = Label ? node.getChildByName('PLACEHOLDER_LABEL')?.getComponent(Label) ?? null : null;
            editBox.maxLength = source.editBox.maxLength;
            editBox.inputFlag = source.editBox.inputFlag as EditBox['inputFlag'];
            editBox.inputMode = source.editBox.inputMode as EditBox['inputMode'];
            // Creator 2.2 prefabs render through their authored background and
            // label nodes. Leaving the 3.8 web DOM input on top produces a
            // white native field that covers the legacy placeholder styling.
            (editBox as EditBox & { stayOnTop: boolean }).stayOnTop = false;
            editBox.string = source.editBox.text;
            editBox.placeholder = source.editBox.placeholder;
        }
        if (scrollView) scrollView.content = node.getChildByName('view') ?? node.getChildByName('content');
        this.collectInteractions(node, source, context);
        layout?.updateLayout();
        return node;
    }

    private collectInteractions(
        sourceNode: Node,
        source: LegacyNodeManifest,
        context: InteractionContext,
    ): void {
        const interactions = source.interactions ?? {
            clickEvents: [],
            checkEvents: [],
            editingDidBegan: [],
            editingDidEnded: [],
            editingReturn: [],
            scrollEvents: [],
        };
        const buttonHandlers = source.button ? interactions.clickEvents : [];
        if (buttonHandlers.length) {
            context.pending.push({
                sourceNode,
                eventType: 'button-click',
                handlers: buttonHandlers,
            });
        } else if (source.button) {
            // 某些旧导出场景缺失 clickEvents，兜底让按钮仍按统一遗留路径可响应。
            // 为这些场景补一条兼容兜底监听，交由 onLegacyEvent 的统一路由处理。
            context.pending.push({
                sourceNode,
                eventType: 'button-click',
                handlers: [{
                    targetLegacyId: source.legacyId ?? null,
                    componentId: null,
                    handler: 'OnClick_BtnWnd',
                    customEventData: '',
                }],
            });
        }
        if (source.toggle) {
            context.pending.push({
                sourceNode,
                eventType: 'toggle',
                handlers: interactions.checkEvents.length
                    ? interactions.checkEvents
                    : [{
                        targetLegacyId: source.legacyId ?? null,
                        componentId: null,
                        handler: 'OnToggle_Check',
                        customEventData: '',
                    }],
            });
        }
        if (source.editBox) {
            const hasEditEvents = interactions.editingDidBegan.length || interactions.editingDidEnded.length || interactions.editingReturn.length;
            if (interactions.editingDidBegan.length) {
                context.pending.push({
                    sourceNode,
                    eventType: 'editbox-began',
                    handlers: interactions.editingDidBegan,
                });
            }
            if (interactions.editingDidEnded.length) {
                context.pending.push({
                    sourceNode,
                    eventType: 'editbox-ended',
                    handlers: interactions.editingDidEnded,
                });
            }
            if (interactions.editingReturn.length) {
                context.pending.push({
                    sourceNode,
                    eventType: 'editbox-return',
                    handlers: interactions.editingReturn,
                });
            }
            if (!hasEditEvents) {
                context.pending.push({
                    sourceNode,
                    eventType: 'editbox-ended',
                    handlers: [{
                        targetLegacyId: source.legacyId ?? null,
                        componentId: null,
                        handler: 'OnEditBox_Return',
                        customEventData: '',
                    }],
                });
            }
        }
        if (source.scrollView) {
            context.pending.push({
                sourceNode,
                eventType: 'scroll',
                handlers: interactions.scrollEvents.length
                    ? interactions.scrollEvents
                    : [{
                        targetLegacyId: source.legacyId ?? null,
                        componentId: null,
                        handler: 'OnScroll',
                        customEventData: '',
                    }],
            });
        }
        const pageView = sourceNode.getComponent(PageView);
        if (pageView) {
            const handlers = interactions.pageEvents && interactions.pageEvents.length > 0
                ? interactions.pageEvents
                : [{
                    targetLegacyId: source.legacyId ?? null,
                    componentId: null,
                    handler: 'OnPageView_PageChanged',
                    customEventData: '',
                }];
            context.pending.push({
                sourceNode,
                eventType: 'pageview',
                handlers,
            });
        }
    }

    private bindInteractions(context: InteractionContext): void {
        for (const binding of context.pending) {
            const sourcePath = this.getNodePath(binding.sourceNode);
            for (const raw of binding.handlers) {
                const target = raw.targetLegacyId !== null ? context.nodeByLegacyId.get(raw.targetLegacyId) : binding.sourceNode;
                const component = this.resolveHandlerComponent(target ?? null, raw, binding.eventType);
                const dispatchGeneric = (event: unknown): void => {
                    const targetNode = raw.targetLegacyId === null ? binding.sourceNode : context.nodeByLegacyId.get(raw.targetLegacyId);
                    const payload = {
                        formPath: context.formPath,
                        handler: raw.handler,
                        customEventData: raw.customEventData,
                        componentId: raw.componentId,
                        targetLegacyId: raw.targetLegacyId,
                        targetName: targetNode?.name ?? null,
                        eventType: binding.eventType,
                        sourceLegacyId: context.legacyIdByNode.get(binding.sourceNode) ?? null,
                        sourceName: binding.sourceNode.name,
                        sourcePath,
                    };
                    context.onLegacyUiEvent?.(payload, binding.sourceNode, targetNode ?? null, event);
                    binding.sourceNode.emit('legacy-ui-event', payload, event);
                };
                if (component && typeof component[raw.handler as keyof typeof component] === 'function') {
                    this.attachInteraction(binding.sourceNode, binding.eventType, (event: unknown) => {
                        const handler = (component as Record<string, (...args: unknown[]) => unknown>)[raw.handler];
                        let shouldFallback = false;
                        try {
                            handler?.call(component, event, raw.customEventData);
                        } catch (error: unknown) {
                            console.error(
                                `[LegacyPrefabRenderer] legacy handler 调用失败 (${raw.handler}):`,
                                error,
                            );
                            shouldFallback = true;
                        }
                        if (shouldFallback) {
                            dispatchGeneric(event);
                        }
                    });
                    continue;
                }
                this.attachInteraction(binding.sourceNode, binding.eventType, dispatchGeneric);
            }
        }
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

    private resolveHandlerComponent(target: Node | null, event: LegacySerializedEvent, eventType: PendingInteraction['eventType']): unknown {
        if (!target) return null;
        const candidates = target.components.filter((component: Component) => typeof component[event.handler as keyof typeof component] === 'function');
        if (candidates.length === 1) return candidates[0];
        if (event.componentId) {
            for (const component of candidates) {
                const id = (component as { __componentId?: string }).__componentId;
                if (typeof id === 'string' && id === event.componentId) return component;
                const constructorName = component.constructor?.name;
                if (constructorName === event.componentId) return component;
            }
        }
        if (eventType === 'button-click' || eventType === 'toggle') return target.getComponent(Button) ?? null;
        if (eventType.startsWith('editbox')) return target.getComponent(EditBox) ?? null;
        if (eventType === 'scroll') return target.getComponent(ScrollView) ?? null;
        if (eventType === 'pageview') return target.getComponent(PageView) ?? null;
        return null;
    }

    private attachInteraction(
        node: Node,
        eventType: PendingInteraction['eventType'],
        listener: (...args: unknown[]) => void,
    ): void {
        if (eventType === 'button-click') {
            let lastFire = 0;
            const guard = (event: unknown): void => {
                const now = Date.now();
                // Cocos button can fire TOUCH_END + CLICK in sequence on some devices.
                // Keep the first event in a short window to avoid duplicate routing.
                if (now - lastFire < 180) return;
                lastFire = now;
                listener(event);
            };
            node.on(Button.EventType.CLICK, guard);
            node.on(Node.EventType.TOUCH_END, guard);
            node.on(Node.EventType.MOUSE_UP, guard);
            return;
        }
        if (eventType === 'toggle') {
            node.on(Toggle.EventType.TOGGLE, listener);
            return;
        }
        if (eventType === 'editbox-began') {
            node.on(EditBox.EventType.EDITING_DID_BEGAN as string, listener);
            return;
        }
        if (eventType === 'editbox-ended') {
            node.on(EditBox.EventType.EDITING_DID_ENDED as string, listener);
            return;
        }
        if (eventType === 'editbox-return') {
            node.on(EditBox.EventType.EDITING_RETURN as string, listener);
            return;
        }
        if (eventType === 'scroll') {
            node.on(ScrollView.EventType.SCROLL_ENDED as string, listener);
            return;
        }
        if (eventType === 'pageview') {
            node.on(PageView.EventType.PAGE_TURNING as string, listener);
        }
    }

    private async preload(root: LegacyNodeManifest): Promise<void> {
        const sprites = new Set<string>();
        const animationClips = new Set<string>();
        const collect = (node: LegacyNodeManifest): void => {
            if (node.sprite?.path) sprites.add(node.sprite.path);
            for (const path of node.animation?.clips ?? []) animationClips.add(path);
            if (node.animation?.defaultClip) animationClips.add(node.animation.defaultClip);
            for (const child of node.children) collect(child);
        };
        collect(root);
        await Promise.all([
            ...Array.from(sprites, async (path) => {
                const frame = await this.tryLoad(`${path}/spriteFrame`, SpriteFrame);
                if (frame) this.spriteFrames.set(path, frame);
            }),
            ...Array.from(animationClips, async (path) => {
                const clip = await this.tryLoad(path, AnimationClip);
                if (clip) this.animationClips.set(path, clip);
            }),
        ]);
    }

    private load<T>(path: string, type: new (...args: never[]) => T): Promise<T> {
        return new Promise<T>((resolve, reject) => {
            resources.load(path, type as unknown as typeof import('cc').Asset, (error, asset) => {
                if (error || !asset) reject(error ?? new Error(`资源不存在：${path}`));
                else resolve(asset as unknown as T);
            });
        });
    }

    private async tryLoad<T>(path: string, type: new (...args: never[]) => T): Promise<T | null> {
        try {
            return await this.load(path, type);
        } catch (error: unknown) {
            console.error(`[LegacyPrefabRenderer] resource failed: ${path}`, error);
            return null;
        }
    }
}
