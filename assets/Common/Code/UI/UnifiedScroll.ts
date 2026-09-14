import { _decorator, Component, Enum, EventHandler, EventMouse, EventTouch, input, Input, isValid, Node, PageView, ScrollView, tween, Tween, UITransform, Vec2, Vec3, ViewGroup } from 'cc';

const { ccclass, property } = _decorator;

export interface ScrollPolicy {
    inertia: boolean;
    brake: number;
    elastic: boolean;
    bounceDuration: number;
    cancelInnerEvents: boolean;
}

export const DEFAULT_SCROLL_POLICY: Readonly<ScrollPolicy> = Object.freeze({
    inertia: true,
    brake: 0.32,
    elastic: true,
    bounceDuration: 0.65,
    cancelInnerEvents: true,
});

const HORIZONTAL_SCROLL_POLICY = Object.freeze({
    brake: 0.32,
    bounceDuration: 0.65,
    dragThresholdSquared: 25,
    buttonDuration: 0.16,
});

type NativeInputScrollView = ScrollView & {
    _onTouchBegan(event: EventTouch): void;
    _onTouchMoved(event: EventTouch): void;
    _onTouchEnded(event: EventTouch): void;
    _onTouchCancelled(event: EventTouch): void;
};

type NodeWithEventProcessor = Node & {
    _eventProcessor?: unknown;
};

export enum UnifiedScrollDirection {
    Horizontal = 0,
    Vertical = 1,
    Both = 2,
}

Enum(UnifiedScrollDirection);

/** The only project-level policy layer over Creator 3.8.8's native ScrollView. */
@ccclass('AooUnifiedScroll')
export class UnifiedScroll extends Component {
    @property({ type: Enum(UnifiedScrollDirection) }) public direction = UnifiedScrollDirection.Vertical;
    @property({ min: 0, max: 1 }) public brake = DEFAULT_SCROLL_POLICY.brake;
    @property public elastic = DEFAULT_SCROLL_POLICY.elastic;
    @property({ min: 0 }) public bounceDuration = DEFAULT_SCROLL_POLICY.bounceDuration;
    /** Underfilled lists keep a visible pull distance on both axes. */
    @property({ min: 0 }) public underfilledMinDragDistance = 50;
    /** Underfilled content follows the pointer by this ratio; normal scroll physics are unaffected. */
    @property({ min: 0, max: 1 }) public underfilledDragFollowRatio = 1;
    /** Underfilled content needs a readable release animation instead of the native short edge snap. */
    @property({ min: 0 }) public underfilledBounceDuration = 0.65;
    private underfilled = false;
    private dragging = false;
    private nestedTouchActive = false;
    private wheelBounceActive = false;
    private wheelBounceOrigin = new Vec3();
    private pointerStart = new Vec2();
    private contentStart = new Vec3();
    private boundNode: Node | null = null;
    private nodeInputBound = false;
    private view: ScrollView | null = null;
    private content: Node | null = null;
    private viewportTransform: UITransform | null = null;
    private contentTransform: UITransform | null = null;
    private axisLocked = false;
    private nativeSuspendedForUnderfilledGesture = false;
    private suppressClickUntil = 0;
    private pendingPosition = false;
    private readonly pointerNow = new Vec2();
    private readonly scrollOffset = new Vec2();
    private readonly pendingContentPosition = new Vec3();
    private readonly buttonTargetOffset = new Vec2();
    private buttonScrollActive = false;

    public onLoad(): void {
        this.boundNode = this.node;
        this.apply();
        this.bindUnifiedInput();
    }
    public onEnable(): void { UnifiedScroll.register(this); }
    public onDisable(): void {
        UnifiedScroll.unregister(this);
        this.restoreNativeAfterUnderfilledGesture();
    }

    public onDestroy(): void {
        UnifiedScroll.unregister(this);
        this.unbindNodeInput();
        this.unschedule(this.finishWheelBounce);
        this.nestedTouchActive = false;
        this.wheelBounceActive = false;
        this.restoreNativeAfterUnderfilledGesture();
        this.unschedule(this.finishButtonScroll);
    }

    public static ensure(node: Node, direction?: UnifiedScrollDirection): ScrollView {
        const view = node.getComponent(ScrollView) ?? node.addComponent(ScrollView);
        const existing = node.getComponent(UnifiedScroll);
        const policy = existing ?? node.addComponent(UnifiedScroll);
        if (direction !== undefined) policy.direction = direction;
        else if (!existing) policy.direction = view.horizontal
            ? (view.vertical ? UnifiedScrollDirection.Both : UnifiedScrollDirection.Horizontal)
            : UnifiedScrollDirection.Vertical;
        policy.apply();
        policy.bindUnifiedInput();
        return view;
    }

    public apply(): void {
        const view = this.getComponent(ScrollView);
        if (!view) throw new Error('UnifiedScroll requires native ScrollView');
        this.view = view;
        this.content = view.content;
        this.viewportTransform = (view.node.getChildByName('View') ?? view.node.getChildByName('view'))?.getComponent(UITransform)
            ?? view.node.getComponent(UITransform);
        this.contentTransform = this.content?.getComponent(UITransform) ?? null;
        view.horizontal = this.direction !== UnifiedScrollDirection.Vertical;
        view.vertical = this.direction !== UnifiedScrollDirection.Horizontal;
        view.inertia = DEFAULT_SCROLL_POLICY.inertia;
        view.brake = this.direction === UnifiedScrollDirection.Horizontal
            ? HORIZONTAL_SCROLL_POLICY.brake : this.brake;
        view.elastic = this.elastic;
        view.bounceDuration = this.direction === UnifiedScrollDirection.Horizontal
            ? HORIZONTAL_SCROLL_POLICY.bounceDuration : this.bounceDuration;
        view.cancelInnerEvents = DEFAULT_SCROLL_POLICY.cancelInnerEvents;
    }

    /** Scroll one viewport in the configured direction. Buttons must use this API. */
    public scrollByPage(step: number): void {
        this.refreshReferences();
        const view = this.view;
        const viewport = this.viewportTransform;
        if (!view?.content || !viewport || step === 0) return;
        view.stopAutoScroll();
        const current = view.getScrollOffset();
        const maximum = view.getMaxScrollOffset();
        if (!this.buttonScrollActive) this.buttonTargetOffset.set(current);
        if (view.horizontal) this.buttonTargetOffset.x = Math.max(0,
            Math.min(maximum.x, this.buttonTargetOffset.x + step * viewport.width));
        else if (view.vertical) this.buttonTargetOffset.y = Math.max(0,
            Math.min(maximum.y, this.buttonTargetOffset.y + step * viewport.height));
        this.buttonScrollActive = true;
        this.unschedule(this.finishButtonScroll);
        view.scrollToOffset(this.buttonTargetOffset,
            this.direction === UnifiedScrollDirection.Horizontal
                ? HORIZONTAL_SCROLL_POLICY.buttonDuration : UnifiedScroll.BUTTON_SCROLL_DURATION,
            true);
        this.scheduleOnce(this.finishButtonScroll,
            this.direction === UnifiedScrollDirection.Horizontal
                ? HORIZONTAL_SCROLL_POLICY.buttonDuration : UnifiedScroll.BUTTON_SCROLL_DURATION);
    }

    /** True briefly after a drag so child desk buttons cannot also enter a room. */
    public shouldSuppressClick(): boolean {
        return Date.now() < this.suppressClickUntil;
    }

    public lateUpdate(): void {
        if (!this.pendingPosition || !this.content) return;
        this.pendingPosition = false;
        this.content.setPosition(this.pendingContentPosition);
    }

    private refreshReferences(): void {
        if (!this.view || this.view.node !== this.node || this.view.content !== this.content) this.apply();
    }

    private readonly finishButtonScroll = (): void => { this.buttonScrollActive = false; };

    /**
     * Creator 原生 ScrollView 在内容不足一屏时不会产生位移。这里只补齐该空白边界：
     * 内容可滚动时完全交还原生惯性/制动/弹性；内容不足时仅跟随手势产生阻尼位移，
     * 松手仍使用统一 bounceDuration 回到模板原点，不维护第二套速度或边界物理。
     */
    /** Observe gestures during capture without replacing Creator's native ScrollView event chain. */
    private bindUnifiedInput(): void {
        const node = this.boundNode ?? this.node;
        this.boundNode = node;
        node.off(Node.EventType.TOUCH_START, this.onNestedTouchStart, this, true);
        node.off(Node.EventType.TOUCH_MOVE, this.onNestedTouchMove, this, true);
        node.off(Node.EventType.TOUCH_END, this.onNestedTouchEnd, this, true);
        node.off(Node.EventType.TOUCH_CANCEL, this.onNestedTouchCancel, this, true);
        node.on(Node.EventType.TOUCH_START, this.onNestedTouchStart, this, true);
        node.on(Node.EventType.TOUCH_MOVE, this.onNestedTouchMove, this, true);
        node.on(Node.EventType.TOUCH_END, this.onNestedTouchEnd, this, true);
        node.on(Node.EventType.TOUCH_CANCEL, this.onNestedTouchCancel, this, true);
        this.nodeInputBound = true;
    }

    private unbindNodeInput(): void {
        if (!this.nodeInputBound) return;
        this.nodeInputBound = false;
        const node = this.boundNode as NodeWithEventProcessor | null;
        this.boundNode = null;
        if (!node || !isValid(node, true) || !node._eventProcessor) return;
        node.off(Node.EventType.TOUCH_START, this.onNestedTouchStart, this, true);
        node.off(Node.EventType.TOUCH_MOVE, this.onNestedTouchMove, this, true);
        node.off(Node.EventType.TOUCH_END, this.onNestedTouchEnd, this, true);
        node.off(Node.EventType.TOUCH_CANCEL, this.onNestedTouchCancel, this, true);
    }

    private isNestedControlTarget(target: unknown): boolean {
        let node = target instanceof Node ? target : null;
        while (node && node !== this.node) {
            if (node.getComponent(ScrollView)) return false;
            if (node.getComponent(ViewGroup)) return true;
            node = node.parent;
        }
        return false;
    }

    private isInsideViewport(event: EventMouse | EventTouch): boolean {
        this.refreshReferences();
        return Boolean(this.viewportTransform?.hitTest(event.getLocation()));
    }

    private nativeScrollView(): NativeInputScrollView {
        this.refreshReferences();
        if (!this.view) throw new Error('UnifiedScroll requires native ScrollView');
        return this.view as NativeInputScrollView;
    }

    private consumeMouseWheel(event: EventMouse): boolean {
        if (!this.enabledInHierarchy || !this.isInsideViewport(event)) return false;
        if (this.bounceUnderfilledWheel(event)) return true;
        const view = this.view;
        if (!view?.content || (!view.vertical && !view.horizontal)) return false;
        const delta = -event.getScrollY() * UnifiedScroll.WHEEL_PRECISION;
        const offset = view.getScrollOffset();
        this.scrollOffset.set(offset.x + (view.horizontal ? delta : 0),
            offset.y + (view.vertical ? delta : 0));
        view.scrollToOffset(this.scrollOffset, UnifiedScroll.WHEEL_SCROLL_DURATION);
        return true;
    }

    private bounceUnderfilledWheel(event: EventMouse): boolean {
        this.refreshReferences();
        const view = this.view;
        const content = this.content;
        const viewport = this.viewportTransform;
        if (!view || !content || !viewport) return false;
        const horizontal = view.horizontal && !view.vertical;
        const underfilled = horizontal
            ? this.isContentUnderfilled(true, viewport.width)
            : view.vertical && this.isContentUnderfilled(false, viewport.height);
        if (!underfilled) return false;
        if (!this.wheelBounceActive) this.wheelBounceOrigin.set(content.position);
        this.wheelBounceActive = true;
        Tween.stopAllByTarget(content);
        const extent = horizontal ? viewport.width : viewport.height;
        const origin = horizontal ? this.wheelBounceOrigin.x : this.wheelBounceOrigin.y;
        const current = horizontal ? content.position.x : content.position.y;
        const limit = this.underfilledDragLimit(extent);
        const next = current - event.getScrollY() * UnifiedScroll.WHEEL_PRECISION;
        const displaced = Math.max(-limit, Math.min(limit, next - origin));
        this.pendingContentPosition.set(
            this.wheelBounceOrigin.x + (horizontal ? displaced : 0),
            this.wheelBounceOrigin.y + (horizontal ? 0 : displaced),
            this.wheelBounceOrigin.z,
        );
        this.pendingPosition = true;
        this.unschedule(this.finishWheelBounce);
        this.scheduleOnce(this.finishWheelBounce, UnifiedScroll.WHEEL_RELEASE_DELAY);
        return true;
    }

    private readonly finishWheelBounce = (): void => {
        const content = this.content;
        if (!content || !this.wheelBounceActive) return;
        this.wheelBounceActive = false;
        this.pendingPosition = false;
        tween(content).to(this.underfilledBounceDuration,
            { position: this.wheelBounceOrigin }, { easing: 'sineInOut' }).start();
    };

    private static register(instance: UnifiedScroll): void {
        const wasEmpty = UnifiedScroll.instances.size === 0;
        UnifiedScroll.instances.add(instance);
        if (!wasEmpty) return;
        input.on(Input.EventType.MOUSE_WHEEL, UnifiedScroll.onGlobalMouseWheel, UnifiedScroll);
    }

    private static unregister(instance: UnifiedScroll): void {
        UnifiedScroll.instances.delete(instance);
        if (UnifiedScroll.instances.size !== 0) return;
        input.off(Input.EventType.MOUSE_WHEEL, UnifiedScroll.onGlobalMouseWheel, UnifiedScroll);
    }

    private static readonly onGlobalMouseWheel = (event: EventMouse): void => { UnifiedScroll.routeMouseWheel(event); };

    private static routeMouseWheel(event: EventMouse): boolean {
        let target: UnifiedScroll | null = null;
        for (const instance of UnifiedScroll.instances) {
            if (!instance.enabledInHierarchy || !instance.isInsideViewport(event)) continue;
            if (!target || UnifiedScroll.compareFrontmost(instance, target) < 0) target = instance;
        }
        if (!target?.consumeMouseWheel(event)) return false;
        event.propagationStopped = true;
        event.propagationImmediateStopped = true;
        return true;
    }

    private static compareFrontmost(left: UnifiedScroll, right: UnifiedScroll): number {
        const leftPath = UnifiedScroll.nodeOrder(left.node);
        const rightPath = UnifiedScroll.nodeOrder(right.node);
        if (leftPath.length !== rightPath.length) return rightPath.length - leftPath.length;
        for (let index = 0; index < leftPath.length; index += 1) {
            if (leftPath[index] !== rightPath[index]) return rightPath[index] - leftPath[index];
        }
        return 0;
    }

    private static nodeOrder(node: Node): number[] {
        const result: number[] = [];
        for (let current: Node | null = node; current?.parent; current = current.parent) result.unshift(current.getSiblingIndex());
        return result;
    }
    private onNestedTouchStart(event: EventTouch): void {
        if (!this.isInsideViewport(event)) return;
        this.nestedTouchActive = this.isNestedControlTarget(event.target);
        this.prepareUnderfilledGesture(event);
        if (this.nestedTouchActive && !this.underfilled) this.nativeScrollView()._onTouchBegan(event);
    }
    private onNestedTouchMove(event: EventTouch): void {
        if (this.underfilled) {
            this.onTouchMove(event);
            if (this.dragging) this.consumeUnderfilledDragEvent(event);
        }
        else if (this.nestedTouchActive) this.nativeScrollView()._onTouchMoved(event);
    }
    private onNestedTouchEnd(event: EventTouch): void {
        if (this.underfilled) {
            const wasDragging = this.dragging;
            this.onTouchEnd();
            if (wasDragging) this.consumeUnderfilledDragEvent(event);
        }
        else if (this.nestedTouchActive) this.nativeScrollView()._onTouchEnded(event);
        this.nestedTouchActive = false;
    }
    private onNestedTouchCancel(event: EventTouch): void {
        if (this.underfilled) {
            const wasDragging = this.dragging;
            this.onTouchEnd();
            if (wasDragging) this.consumeUnderfilledDragEvent(event);
        }
        else if (this.nestedTouchActive) this.nativeScrollView()._onTouchCancelled(event);
        this.nestedTouchActive = false;
    }

    /** A completed drag must not reach a child Button as a release/click. */
    private consumeUnderfilledDragEvent(event: EventTouch): void {
        event.propagationStopped = true;
        event.propagationImmediateStopped = true;
    }

    private prepareUnderfilledGesture(event: EventTouch): void {
        this.buttonScrollActive = false;
        this.unschedule(this.finishButtonScroll);
        this.refreshReferences();
        const view = this.view;
        const content = this.content;
        const viewport = this.viewportTransform;
        const horizontalUnderfilled = Boolean(view?.horizontal && viewport
            && this.isContentUnderfilled(true, viewport.width));
        const verticalUnderfilled = Boolean(view?.vertical && viewport
            && this.isContentUnderfilled(false, viewport.height));
        this.underfilled = Boolean(content && viewport && (horizontalUnderfilled || verticalUnderfilled));
        this.dragging = false;
        this.axisLocked = false;
        if (!this.underfilled || !content) return;
        view?.stopAutoScroll();
        if (view?.enabled) {
            view.enabled = false;
            this.nativeSuspendedForUnderfilledGesture = true;
        }
        Tween.stopAllByTarget(content);
        this.pointerStart.set(event.getUILocation());
        this.contentStart.set(content.position);
    }

    private onTouchMove(event: EventTouch): void {
        const view = this.view;
        const content = this.content;
        const viewport = this.viewportTransform;
        if (!this.underfilled || !content || !viewport) return;
        event.getUILocation(this.pointerNow);
        const dx = this.pointerNow.x - this.pointerStart.x;
        const dy = this.pointerNow.y - this.pointerStart.y;
        // 轻点必须继续交给 Toggle；超过触摸容差后才进入拖动状态。
        const threshold = this.direction === UnifiedScrollDirection.Horizontal
            ? HORIZONTAL_SCROLL_POLICY.dragThresholdSquared : UnifiedScroll.DRAG_THRESHOLD_SQUARED;
        if (!this.dragging && dx * dx + dy * dy <= threshold) return;
        this.dragging = true;
        if (!this.axisLocked) {
            this.axisLocked = true;
            if (view?.horizontal && view.vertical) {
                view.horizontal = Math.abs(dx) >= Math.abs(dy);
                view.vertical = !view.horizontal;
            }
        }
        const horizontal = Boolean(view?.horizontal);
        const delta = horizontal ? dx : dy;
        // 按住期间始终跟随手指，不在最小回弹距离处夹住；只有松手/取消才回弹。
        const displaced = delta * this.underfilledDragFollowRatio;
        this.pendingContentPosition.set(
            this.contentStart.x + (horizontal ? displaced : 0),
            this.contentStart.y + (horizontal ? 0 : displaced),
            this.contentStart.z,
        );
        this.pendingPosition = true;
    }

    private onTouchEnd(): void {
        const content = this.content;
        if (!this.underfilled || !content) return;
        this.underfilled = false;
        if (!this.dragging) {
            this.restoreNativeAfterUnderfilledGesture();
            return;
        }
        this.dragging = false;
        this.suppressClickUntil = Date.now() + UnifiedScroll.CLICK_SUPPRESS_MS;
        if (this.view && this.direction === UnifiedScrollDirection.Both) {
            this.view.horizontal = true;
            this.view.vertical = true;
        }
        if (this.pendingPosition) {
            this.pendingPosition = false;
            content.setPosition(this.pendingContentPosition);
        }
        tween(content)
            .to(this.underfilledBounceDuration, { position: this.contentStart }, { easing: 'sineInOut' })
            .call(() => this.restoreNativeAfterUnderfilledGesture())
            .start();
    }

    private restoreNativeAfterUnderfilledGesture(): void {
        if (!this.nativeSuspendedForUnderfilledGesture) return;
        this.nativeSuspendedForUnderfilledGesture = false;
        if (this.view && isValid(this.view.node, true)) this.view.enabled = true;
    }

    private underfilledDragLimit(extent: number): number {
        return Math.max(this.underfilledMinDragDistance,
            extent * UnifiedScroll.UNDERFILLED_DRAG_LIMIT_RATIO);
    }

    /** Layout containers may include padding or inactive templates; only live rows determine fill. */
    private isContentUnderfilled(horizontal: boolean, viewportExtent: number): boolean {
        const content = this.content;
        if (!content) return false;
        let minimum = Number.POSITIVE_INFINITY;
        let maximum = Number.NEGATIVE_INFINITY;
        for (const child of content.children) {
            if (!child.active) continue;
            const transform = child.getComponent(UITransform);
            if (!transform) continue;
            const scale = horizontal ? Math.abs(child.scale.x) : Math.abs(child.scale.y);
            const size = (horizontal ? transform.width : transform.height) * scale;
            const anchor = horizontal ? transform.anchorX : transform.anchorY;
            const position = horizontal ? child.position.x : child.position.y;
            minimum = Math.min(minimum, position - size * anchor);
            maximum = Math.max(maximum, position + size * (1 - anchor));
        }
        const occupiedExtent = Number.isFinite(minimum) && Number.isFinite(maximum)
            ? maximum - minimum : 0;
        return occupiedExtent <= viewportExtent;
    }

    private static readonly DRAG_THRESHOLD_SQUARED = 64;
    private static readonly UNDERFILLED_DRAG_LIMIT_RATIO = 0.12;
    private static readonly EDGE_DAMPING = 0.35;
    private static readonly WHEEL_PRECISION = 0.1;
    private static readonly WHEEL_SCROLL_DURATION = 0.08;
    private static readonly WHEEL_RELEASE_DELAY = 0.55;
    private static readonly BUTTON_SCROLL_DURATION = 0.2;
    private static readonly CLICK_SUPPRESS_MS = 300;
    private static readonly instances = new Set<UnifiedScroll>();
}

export class ScrollEvents {
    public static onEnd(view: ScrollView, listener: () => void, target?: unknown): () => void {
        view.node.on(ScrollView.EventType.SCROLL_ENDED, listener, target);
        return () => view.node.off(ScrollView.EventType.SCROLL_ENDED, listener, target);
    }

    public static onBottom(view: ScrollView, listener: () => void, target?: unknown): () => void {
        view.node.on(ScrollView.EventType.SCROLL_TO_BOTTOM, listener, target);
        return () => view.node.off(ScrollView.EventType.SCROLL_TO_BOTTOM, listener, target);
    }

    public static onPage(view: PageView, listener: () => void, target?: unknown): () => void {
        view.node.on(PageView.EventType.PAGE_TURNING, listener, target);
        return () => view.node.off(PageView.EventType.PAGE_TURNING, listener, target);
    }

    public static handler(componentName: string, handler: string, target: Node): EventHandler {
        const event = new EventHandler();
        event.target = target;
        event.component = componentName;
        event.handler = handler;
        return event;
    }
}

export interface VirtualItemRenderer<T> {
    node: Node;
    render(value: T, index: number): void;
    recycle?(): void;
}

/** Fixed-extent virtualization shared by every list; data and styling stay in adapters. */
export class VirtualList<T> {
    private values: readonly T[] = [];
    private readonly visible = new Map<number, VirtualItemRenderer<T>>();
    private readonly spare: VirtualItemRenderer<T>[] = [];

    public constructor(
        private readonly view: ScrollView,
        private readonly itemExtent: number,
        private readonly create: () => VirtualItemRenderer<T>,
        private readonly overscan = 2,
    ) {
        if (!view.content) throw new Error('VirtualList requires ScrollView.content');
        if (!Number.isFinite(itemExtent) || itemExtent <= 0) throw new Error('VirtualList itemExtent must be positive');
        if (!Number.isInteger(overscan) || overscan < 0) throw new Error('VirtualList overscan must be a non-negative integer');
    }

    public setData(values: readonly T[]): void {
        this.values = values;
        const content = this.view.content;
        if (!content) return;
        const transform = content.getComponent(UITransform);
        if (!transform) throw new Error('VirtualList content requires UITransform');
        transform.setContentSize(transform.contentSize.width, values.length * this.itemExtent);
        this.refresh();
    }

    public refresh(): void {
        const content = this.view.content;
        if (!content) return;
        const viewport = this.view.node.getComponent(UITransform)?.contentSize.height ?? 0;
        const offset = Math.max(0, content.position.y);
        const first = Math.max(0, Math.floor(offset / this.itemExtent) - this.overscan);
        const last = Math.min(this.values.length - 1, Math.ceil((offset + viewport) / this.itemExtent) + this.overscan);
        for (const [index, item] of [...this.visible]) {
            if (index >= first && index <= last) continue;
            this.visible.delete(index);
            item.node.active = false;
            item.recycle?.();
            this.spare.push(item);
        }
        for (let index = first; index <= last; index += 1) {
            if (this.visible.has(index)) continue;
            const item = this.spare.pop() ?? this.create();
            if (item.node.parent !== content) content.addChild(item.node);
            item.node.active = true;
            item.node.setPosition(new Vec3(item.node.position.x, -index * this.itemExtent, item.node.position.z));
            item.render(this.values[index], index);
            this.visible.set(index, item);
        }
    }

    public dispose(): void {
        for (const item of [...this.visible.values(), ...this.spare]) item.node.destroy();
        this.visible.clear();
        this.spare.length = 0;
    }
}

export class Pagination {
    private page = 1;
    private pages = 1;
    private loading = false;

    public reset(pages = 1): void { this.page = 1; this.pages = Pagination.normalizePages(pages); this.loading = false; }
    public setPages(pages: number): void { this.pages = Pagination.normalizePages(pages); this.page = Math.min(this.page, this.pages); }
    public current(): number { return this.page; }
    public hasNext(): boolean { return !this.loading && this.page < this.pages; }
    public hasPrevious(): boolean { return !this.loading && this.page > 1; }

    public async next(load: (page: number) => Promise<void>): Promise<boolean> {
        return this.move(this.page + 1, load);
    }

    public async previous(load: (page: number) => Promise<void>): Promise<boolean> {
        return this.move(this.page - 1, load);
    }

    public async move(page: number, load: (page: number) => Promise<void>): Promise<boolean> {
        if (this.loading || !Number.isInteger(page) || page < 1 || page > this.pages || page === this.page) return false;
        this.loading = true;
        try { await load(page); this.page = page; return true; }
        finally { this.loading = false; }
    }

    private static normalizePages(pages: number): number {
        return Number.isFinite(pages) ? Math.max(1, Math.floor(pages)) : 1;
    }
}
