import { Button, EventMouse, EventTouch, game, Node, UITransform, Vec2, Vec3, view } from 'cc';










import { largestLegalPdkSubsets, pdkCardRank, pdkSelectionMask } from './logic/PdkCleanHintRanker';







const CLICK_SUPPRESS_MS = 250;

export type HandPointerSource = 'mouse' | 'touch' | 'pen';

export interface HandPointerSample {
    pointerId: number;
    source: HandPointerSource;
    raw: { x: number; y: number };
    client: { x: number; y: number };
    canvas: { x: number; y: number };
    screen: { x: number; y: number };
    ui: { x: number; y: number };
    handLocal: { x: number; y: number } | null;
    cardLocal: { x: number; y: number } | null;
    targetPath: string;
    windowId: number;
    index: number;
    domPointer: boolean;
}

/** Internal behavior module; state remains in its PdkPlayController host. */
export class PdkHandInputController {
    public constructor(private readonly host: any) {}

public async toggleCardAt(index: number, capturedPointer = false): Promise<void> {
        if (!capturedPointer && Date.now() < this.host.suppressClickUntil) return;
        if (index < 0 || index >= this.host.cardNodes.length) return;
        const before = [...(this.host.logic.GetSelectCard() ?? [])].map(Number).sort((a, b) => a - b).join(',');
        const clicked = this.host.logic.GetHandCard()[index];
        const responding = !this.host.isAuthoritativeLeadingTurn();
        this.host.selectionIntentRevision += 1;
        const responseCore = responding ? this.responseCoreSelectionForCard(clicked) : [];
        if (responseCore.length > 0) {
            const selected = [...(this.host.logic.GetSelectCard() ?? [])].map(Number);
            const completeCoreWasSelected = responseCore.every((card) => selected.includes(card));
            const next = completeCoreWasSelected
                ? selected.filter((card) => !responseCore.includes(card))
                : [
                    ...selected.filter((card) => pdkCardRank(card) !== pdkCardRank(clicked)),
                    ...responseCore,
                ];
            this.host.logic.ChangeSelectCard(this.host.cardsInHandOrder(next));
        } else if (this.host.logic.CheckSelected(clicked)) {
            this.host.logic.DeleteCardSelected(index + 1);
        } else {
            this.host.logic.SetCardSelected(index + 1);
        }
        this.host.resetPromptCycle();
        this.updateSelection();
        this.host.refresh();
        const after = [...(this.host.logic.GetSelectCard() ?? [])].map(Number).sort((a, b) => a - b).join(',');
        this.host.traceOutCards('selection-tap', {
            playerId: this.host.runtime.getPlayerId(),
            operationId: String(this.host.record(
                this.host.runtime.getRoomSet().GetRoomSetInfo()?.operationDeadline,
            )?.operationId ?? ''),
            responding, clicked, before, after,
        });
        if (before !== after) void this.host.roomAudio?.play('xuanpai');
    }

public responseCoreSelectionForCard(clicked: number): number[] {
        const { type } = this.host.authorityComparison(
            this.host.runtime.getRoomSet().GetRoomSetInfo() ?? {},
        );
        const expectedCount = type === 3
            ? 2
            : ([5, 6, 7, 15].includes(type) ? 3 : 0);
        if (expectedCount === 0) return [];
        const sameRank = (this.host.logic.GetHandCard() ?? []).map(Number)
            .filter((card: number) => pdkCardRank(card) === pdkCardRank(clicked));
        // A bomb is deliberately not auto-split. The requested assistance is
        // only for an existing pair or three-card body.
        if (sameRank.length !== expectedCount) return [];
        return [clicked, ...sameRank.filter((card: number) => card !== clicked)].slice(0, expectedCount);
    }

public updateSelection(): void {
        const selectedSlots = pdkSelectionMask(
            (this.host.logic.GetHandCard() ?? []).map(Number),
            (this.host.logic.GetSelectCard() ?? []).map(Number),
        );
        this.host.cardNodes.forEach((node: Node, index: number) => this.host.cards.select(node, selectedSlots[index] === true));
    }

public onRoomTouchEnd(event: EventTouch): void {
        const target = event.target instanceof Node ? event.target : null;
        const location = event.getUILocation();
        const screen = event.getLocation();
        const windowId = Number((event as EventTouch & { windowId?: number }).windowId ?? 0);
        this.clearSelectionOutsideCards(target, screen.x, screen.y, windowId, location.x, location.y);
    }

public onRoomMouseUp(event: EventMouse): void {
        if (event.getButton() !== EventMouse.BUTTON_LEFT) return;
        const target = event.target instanceof Node ? event.target : null;
        const location = event.getLocation();
        const uiLocation = event.getUILocation();
        const windowId = Number((event as EventMouse & { windowId?: number }).windowId ?? 0);
        this.clearSelectionOutsideCards(target, location.x, location.y, windowId, uiLocation.x, uiLocation.y);
    }

public clearSelectionOutsideCards(
        target: Node | null,
        screenX: number,
        screenY: number,
        windowId: number,
        uiX: number,
        uiY: number,
    ): void {
        if ((this.host.logic.GetSelectCard() ?? []).length === 0) return;
        // Browser PointerEvent owns this physical release. Cocos can dispatch a
        // second room-level mouse/touch up with a differently scaled position;
        // it must never reinterpret the same card tap as an outside-hand clear.
        if (this.host.capturedPointerId !== null || Date.now() < this.host.suppressClickUntil) return;
        if (this.hasInteractiveButtonAncestor(target)) return;
        // The visible cards, rather than the oversized gesture surface, define
        // "inside the hand". UI and screen coordinates come from different
        // Creator event paths; either exact hit proves that the release is on a
        // real card and therefore cannot clear the complete selection.
        if (this.cardIndexAtUi(uiX, uiY) >= 0
            || this.cardIndexAtScreen(screenX, screenY, windowId) >= 0) return;
        this.host.logic.ChangeSelectCard([]);
        this.host.selectionIntentRevision += 1;
        this.host.resetPromptCycle();
        this.host.cards.stopAll(false);
        this.updateSelection();
    }

public hasInteractiveButtonAncestor(start: Node | null): boolean {
        let current = start;
        while (current) {
            const button = current.getComponent(Button);
            if (button?.interactable && current.activeInHierarchy) return true;
            if (current === this.host.view?.root) break;
            current = current.parent;
        }
        return false;
    }

public onHandTouchStart(event: EventTouch): void {
        if (this.host.capturedPointerId !== null || this.host.dragActive) return;
        const sample = this.sampleFromTouch(event);
        event.propagationStopped = true;
        this.beginDragSelection(sample);
        this.traceGesture('bridge-start', sample.index, [], sample);
    }

public bindGestureSurface(surface: Node | null): void {
        // Native Cocos events remain the input path for packaged clients. Browser
        // Preview additionally captures the Canvas pointer so sibling UI nodes
        // cannot interrupt a swipe that begins in empty bottom-band space.
        if (!surface) return;
        this.installHandHitTest(surface);
        this.syncHandTouchArea();
        if (surface === this.host.gestureSurface) return;
        if (this.host.gestureSurface) {
            this.host.gestureSurface.off(Node.EventType.TOUCH_START, this.onHandTouchStart, this, true);
            this.host.gestureSurface.off(Node.EventType.TOUCH_MOVE, this.onHandTouchMove, this, true);
            this.host.gestureSurface.off(Node.EventType.TOUCH_CANCEL, this.onHandTouchCancel, this, true);
            this.host.gestureSurface.off(Node.EventType.TOUCH_END, this.onHandTouchEnd, this, true);
            this.host.gestureSurface.off(Node.EventType.MOUSE_DOWN, this.onHandMouseDown, this, true);
            this.host.gestureSurface.off(Node.EventType.MOUSE_MOVE, this.onHandMouseMove, this, true);
            this.host.gestureSurface.off(Node.EventType.MOUSE_UP, this.onHandMouseUp, this, true);
            this.host.gestureSurface.off(Node.EventType.MOUSE_LEAVE, this.onHandMouseCancel, this, true);
            this.host.bound.delete(this.host.gestureSurface);
        }
        surface.on(Node.EventType.TOUCH_START, this.onHandTouchStart, this, true);
        surface.on(Node.EventType.TOUCH_MOVE, this.onHandTouchMove, this, true);
        surface.on(Node.EventType.TOUCH_CANCEL, this.onHandTouchCancel, this, true);
        surface.on(Node.EventType.TOUCH_END, this.onHandTouchEnd, this, true);
        surface.on(Node.EventType.MOUSE_DOWN, this.onHandMouseDown, this, true);
        surface.on(Node.EventType.MOUSE_MOVE, this.onHandMouseMove, this, true);
        surface.on(Node.EventType.MOUSE_UP, this.onHandMouseUp, this, true);
        surface.on(Node.EventType.MOUSE_LEAVE, this.onHandMouseCancel, this, true);
        this.host.gestureSurface = surface;
        this.host.bound.add(surface);
        this.bindDomPointerBridge();
    }

public installHandHitTest(hand: Node): void {
        const transform = hand.getComponent(UITransform);
        const visualHand = this.host.view?.find('Players/Seat_0/Card/Hand_Cards');
        const visualTransform = visualHand?.getComponent(UITransform) ?? null;
        if (!transform || !visualTransform) return;
        this.host.handTransform = transform;
        this.host.handCardsTransform = visualTransform;
    }

public restoreHandHitTest(): void {
        this.host.handTransform = null;
        this.host.handCardsTransform = null;
        this.host.handVisibleWidth = 0;
    }

public syncHandTouchArea(): void {
        const hand = this.host.view?.find('Players/Seat_0/Card/Hand_TouchArea');
        const visualHand = this.host.view?.find('Players/Seat_0/Card/Hand_Cards');
        const transform = hand?.getComponent(UITransform);
        const visualTransform = visualHand?.getComponent(UITransform);
        if (!hand || !visualHand || !transform || !visualTransform) return;
        // Hand_TouchArea is only an invisible event receiver. Its vertical band
        // follows Hand_Cards exactly, while its horizontal span covers the whole
        // visible screen so a swipe may begin and end outside the physical cards.
        hand.active = this.isHandInteractionEnabled();
        if (!hand.active) {
            this.restoreHandHitTest();
            return;
        }
        const worldScaleX = Math.abs(hand.worldScale.x) || 1;
        const worldScaleY = Math.abs(hand.worldScale.y) || 1;
        const visualWorldScaleY = Math.abs(visualHand.worldScale.y) || 1;
        const visibleWidth = view.getVisibleSize().width / worldScaleX;
        const visualHeight = visualTransform.height * visualWorldScaleY / worldScaleY;
        if (!Number.isFinite(visibleWidth) || visibleWidth <= 0
            || !Number.isFinite(visualHeight) || visualHeight <= 0) return;
        this.host.handTransform = transform;
        this.host.handCardsTransform = visualTransform;
        const visualPosition = visualHand.worldPosition;
        const currentPosition = hand.worldPosition;
        const positionAlreadyApplied = Math.abs(currentPosition.x - visualPosition.x) < 0.01
            && Math.abs(currentPosition.y - visualPosition.y) < 0.01;
        const sizeAlreadyApplied = Math.abs(transform.width - visibleWidth) < 0.01
            && Math.abs(transform.height - visualHeight) < 0.01;
        if (sizeAlreadyApplied && positionAlreadyApplied
            && Math.abs(visibleWidth - this.host.handVisibleWidth) < 0.01) return;
        this.host.handVisibleWidth = visibleWidth;
        hand.setWorldPosition(visualPosition);
        transform.setContentSize(visibleWidth, visualHeight);
    }

public isHandInteractionEnabled(): boolean {
        return this.host.cardNodes.length > 0
            && !this.host.competeDealerPhase
            && Number(this.host.runtime.getRoom().GetRoomProperty('state') ?? 0) === 1;
    }

public bindDomPointerBridge(): void {
        const canvas = typeof HTMLCanvasElement !== 'undefined' && game.canvas instanceof HTMLCanvasElement
            ? game.canvas : null;
        if (canvas === this.host.gestureCanvas) return;
        this.unbindDomPointerBridge();
        if (!canvas) return;
        this.host.gestureCanvas = canvas;
        canvas.style.touchAction = 'none';
        // Creator Preview places simulator/debug DOM layers above the actual
        // canvas. Capture on document so those layers cannot swallow a hand
        // swipe before it reaches the canvas; coordinates are still normalized
        // against the real canvas bounds in sampleFromPointer.
        document.addEventListener('pointerdown', this.onDomPointerDown, true);
        document.addEventListener('pointermove', this.onDomPointerMove, true);
        document.addEventListener('pointerup', this.onDomPointerUp, true);
        document.addEventListener('pointercancel', this.onDomPointerCancel, true);
    }

public unbindDomPointerBridge(): void {
        const canvas = this.host.gestureCanvas;
        if (!canvas) return;
        document.removeEventListener('pointerdown', this.onDomPointerDown, true);
        document.removeEventListener('pointermove', this.onDomPointerMove, true);
        document.removeEventListener('pointerup', this.onDomPointerUp, true);
        document.removeEventListener('pointercancel', this.onDomPointerCancel, true);
        this.host.gestureCanvas = null;
        this.host.capturedPointerId = null;
    }

public readonly onDomPointerDown = (event: PointerEvent): void => {
        if (!event.isPrimary || (event.pointerType === 'mouse' && event.button !== 0)) return;
        // A fresh primary down means the browser has already ended the previous
        // physical gesture. Safari can omit pointerup/pointercancel while the
        // Canvas is resized or loses focus; recover here so hand selection does
        // not remain permanently locked by a stale captured pointer.
        if (this.host.capturedPointerId !== null) {
            try { this.host.gestureCanvas?.releasePointerCapture(this.host.capturedPointerId); } catch { /* capture already lost */ }
            this.host.capturedPointerId = null;
            this.cancelDragSelection();
        }
        const sample = this.sampleFromPointer(event);
        this.traceDomPointer('down', sample);
        // CommonRoom is mounted as a sibling Canvas child and owns its own
        // button events. The hand gesture band covers that sibling's three
        // public controls, so leave their pointer stream untouched instead of
        // treating the button coordinate as empty hand space.
        if (this.isInteractiveRoomControlAtUi(sample.ui.x, sample.ui.y)) {
            // The button owns this pointer sequence. Preserve the committed hand
            // selection so Btn_Play can submit it after pointerdown completes.
            return;
        }
        if (this.isHandInteractionEnabled() && sample.index >= 0) {
            event.preventDefault();
            event.stopImmediatePropagation();
            this.host.capturedPointerId = event.pointerId;
            this.beginDragSelection(sample);
            try { this.host.gestureCanvas?.setPointerCapture(event.pointerId); } catch { /* detached Canvas */ }
            this.traceGesture('dom-start', sample.index, [], sample);
            return;
        }
        if (this.isHandInteractionEnabled() && this.isInsideHandGestureArea(sample)) {
            event.preventDefault();
            event.stopImmediatePropagation();
            this.host.capturedPointerId = event.pointerId;
            this.beginDragSelection(sample);
            try { this.host.gestureCanvas?.setPointerCapture(event.pointerId); } catch { /* detached Canvas */ }
            this.traceGesture('dom-start', sample.index, [], sample);
            return;
        }
        if (this.isHandInteractionEnabled()) this.clearCardSelection();
    };

public readonly onDomPointerMove = (event: PointerEvent): void => {
        if (event.pointerId !== this.host.capturedPointerId) return;
        if (!this.host.dragActive) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        const sample = this.sampleFromPointer(event);
        this.traceDomPointer('move', sample);
        this.host.lastPointerSample = sample;
        this.updateDragSelection(sample.index);
        this.traceGesture('move', sample.index, [], sample);
    };

public readonly onDomPointerUp = (event: PointerEvent): void => {
        if (event.pointerId !== this.host.capturedPointerId) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        const sample = this.sampleFromPointer(event);
        this.traceDomPointer('up', sample);
        this.updateDragSelection(sample.index);
        try { this.host.gestureCanvas?.releasePointerCapture(event.pointerId); } catch { /* already released */ }
        this.host.capturedPointerId = null;
        if (!this.host.dragActive) return;
        this.host.suppressClickUntil = Date.now() + CLICK_SUPPRESS_MS;
        if (this.host.dragStartIndex < 0) {
            this.traceGesture('blank-tap', -1, [], sample);
            this.cancelDragSelection();
            this.clearCardSelection();
            return;
        }
        if (this.host.dragMoved) {
            if (this.host.dragIndices.size > 0) this.commitSmartDragSelection(sample);
            else {
                this.traceGesture('cancel', -1, [], sample);
                this.cancelDragSelection();
            }
            return;
        }
        const index = this.host.dragStartIndex;
        this.cancelDragSelection();
        this.traceGesture('tap', index, [], sample);
        if (index >= 0) void this.toggleCardAt(index, true).catch((error: unknown) => this.host.report(error, '选牌失败'));
    };

public readonly onDomPointerCancel = (event: PointerEvent): void => {
        if (event.pointerId !== this.host.capturedPointerId) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        const sample = this.sampleFromPointer(event);
        this.traceDomPointer('cancel', sample);
        try { this.host.gestureCanvas?.releasePointerCapture(event.pointerId); } catch { /* already released */ }
        this.host.capturedPointerId = null;
        this.traceGesture('cancel', -1, [], sample);
        this.cancelDragSelection();
    };

public sampleFromPointer(event: PointerEvent): HandPointerSample {
        const canvas = this.host.gestureCanvas;
        const bounds = canvas?.getBoundingClientRect();
        const visibleOrigin = view.getVisibleOrigin();
        const visibleSize = view.getVisibleSize();
        // PointerEvent and getBoundingClientRect are guaranteed to share CSS-pixel
        // coordinates. Convert by the pointer's normalized position inside the
        // visible Canvas, not by DPR or backing-store dimensions: Creator Preview
        // shells and Safari can report a device DPR that differs from the Canvas
        // render DPR, which otherwise shifts every card hit horizontally.
        const canvasX = bounds ? event.clientX - bounds.left : event.clientX;
        const canvasY = bounds ? event.clientY - bounds.top : event.clientY;
        const normalizedX = bounds?.width ? canvasX / bounds.width : 0;
        const normalizedY = bounds?.height ? canvasY / bounds.height : 0;
        const uiX = visibleOrigin.x + normalizedX * visibleSize.width;
        const uiY = visibleOrigin.y + (1 - normalizedY) * visibleSize.height;
        return this.buildPointerSample({
            pointerId: event.pointerId,
            source: this.pointerSource(event.pointerType),
            raw: { x: event.pageX, y: event.pageY },
            client: { x: event.clientX, y: event.clientY },
            canvas: { x: canvasX, y: canvasY },
            screen: { x: uiX, y: uiY },
            ui: { x: uiX, y: uiY },
            targetPath: this.domTargetPath(event.target),
            windowId: 0,
            domPointer: true,
        });
    }

public sampleFromTouch(event: EventTouch): HandPointerSample {
        const ui = event.getUILocation();
        const screen = event.getLocation();
        const canvas = this.host.gestureCanvas;
        const bounds = canvas?.getBoundingClientRect();
        const visibleOrigin = view.getVisibleOrigin();
        const visibleSize = view.getVisibleSize();
        const normalizedX = visibleSize.width ? (ui.x - visibleOrigin.x) / visibleSize.width : 0;
        const normalizedY = visibleSize.height ? (ui.y - visibleOrigin.y) / visibleSize.height : 0;
        const canvasX = bounds ? normalizedX * bounds.width : ui.x;
        const canvasY = bounds ? (1 - normalizedY) * bounds.height : ui.y;
        const clientX = bounds ? bounds.left + canvasX : ui.x;
        const clientY = bounds ? bounds.top + canvasY : ui.y;
        const windowId = Number((event as EventTouch & { windowId?: number }).windowId ?? 0);
        return this.buildPointerSample({
            pointerId: Number(event.getID?.() ?? 0),
            source: 'touch',
            raw: { x: clientX, y: clientY },
            client: { x: clientX, y: clientY },
            canvas: { x: canvasX, y: canvasY },
            screen: { x: screen.x, y: screen.y },
            ui: { x: ui.x, y: ui.y },
            targetPath: this.nodeTargetPath(event.target instanceof Node ? event.target : null),
            windowId,
            domPointer: false,
        });
    }

public sampleFromMouse(event: EventMouse): HandPointerSample {
        const ui = event.getUILocation();
        const location = event.getLocation();
        return this.buildPointerSample({
            pointerId: -2,
            source: 'mouse',
            raw: { x: location.x, y: location.y },
            client: { x: location.x, y: location.y },
            canvas: { x: location.x, y: location.y },
            screen: { x: location.x, y: location.y },
            ui: { x: ui.x, y: ui.y },
            targetPath: this.nodeTargetPath(event.target instanceof Node ? event.target : null),
            windowId: Number((event as EventMouse & { windowId?: number }).windowId ?? 0),
            domPointer: false,
        });
    }

public buildPointerSample(base: Omit<HandPointerSample, 'handLocal' | 'cardLocal' | 'index'>): HandPointerSample {
        const index = base.domPointer
            ? this.cardIndexAtUi(base.ui.x, base.ui.y)
            : this.cardIndexAtScreen(base.screen.x, base.screen.y, base.windowId);
        const world = new Vec3(base.ui.x, base.ui.y, 0);
        const handTransform = this.host.view?.find('Players/Seat_0/Card/Hand_TouchArea')?.getComponent(UITransform);
        const handPoint = handTransform?.convertToNodeSpaceAR(world);
        const indexedCard = index >= 0 ? this.host.cardNodes[index] : null;
        const cardPoint = indexedCard?.isValid
            ? indexedCard.getComponent(UITransform)?.convertToNodeSpaceAR(world) : null;
        return {
            ...base,
            handLocal: handPoint ? { x: handPoint.x, y: handPoint.y } : null,
            cardLocal: cardPoint ? { x: cardPoint.x, y: cardPoint.y } : null,
            index,
        };
    }

public pointerSource(value: string): HandPointerSource {
        return value === 'touch' || value === 'pen' ? value : 'mouse';
    }

public domTargetPath(target: EventTarget | null): string {
        if (!(target instanceof Element)) return '';
        const parts: string[] = [];
        let current: Element | null = target;
        while (current && parts.length < 8) {
            const id = current.id ? `#${current.id}` : '';
            parts.unshift(`${current.tagName.toLowerCase()}${id}`);
            current = current.parentElement;
        }
        return parts.join('>');
    }

public nodeTargetPath(target: Node | null): string {
        const parts: string[] = [];
        let current = target;
        while (current) {
            parts.unshift(current.name);
            current = current.parent;
        }
        return parts.join('/');
    }

public traceDomPointer(stage: string, sample: HandPointerSample): void {
        const host = globalThis as typeof globalThis & { __PDK_DOM_POINTER_TRACE__?: unknown[] };
        const trace = host.__PDK_DOM_POINTER_TRACE__ ?? [];
        trace.push({ stage, ...sample, at: Date.now() });
        if (trace.length > 200) trace.splice(0, trace.length - 200);
        host.__PDK_DOM_POINTER_TRACE__ = trace;
    }

public onHandTouchMove(event: EventTouch): void {
        if (!this.host.dragActive || this.host.capturedPointerId !== null) return;
        event.propagationStopped = true;
        const sample = this.sampleFromTouch(event);
        this.updateDragSelection(sample.index);
        this.host.lastPointerSample = sample;
        this.traceGesture('bridge-move', sample.index, [], sample);
    }

public onHandTouchCancel(event: EventTouch): void {
        if (this.host.capturedPointerId !== null) return;
        event.propagationStopped = true;
        this.traceGesture('cancel', -1, [], this.host.lastPointerSample);
        this.cancelDragSelection();
    }

public onHandTouchEnd(event: EventTouch): void {
        if (!this.host.dragActive || this.host.capturedPointerId !== null) return;
        event.propagationStopped = true;
        const sample = this.sampleFromTouch(event);
        this.host.lastPointerSample = sample;
        this.updateDragSelection(sample.index);
        if (this.host.dragStartIndex < 0) {
            this.traceGesture('blank-tap', -1, [], sample);
            this.cancelDragSelection();
            this.clearCardSelection();
            return;
        }
        if (this.host.dragMoved) {
            this.host.suppressClickUntil = Date.now() + CLICK_SUPPRESS_MS;
            this.commitSmartDragSelection(sample);
            return;
        }
        const index = this.host.dragStartIndex;
        this.cancelDragSelection();
        this.host.suppressClickUntil = Date.now() + CLICK_SUPPRESS_MS;
        this.traceGesture('bridge-tap', index, [], sample);
        void this.toggleCardAt(index, true).catch((error: unknown) => this.host.report(error, '选牌失败'));
    }

public onHandMouseDown(event: EventMouse): void {
        if (event.getButton() !== EventMouse.BUTTON_LEFT || this.host.capturedPointerId !== null || this.host.dragActive) return;
        const sample = this.sampleFromMouse(event);
        event.propagationStopped = true;
        this.beginDragSelection(sample);
        this.traceGesture('mouse-start', sample.index, [], sample);
    }

public onHandMouseMove(event: EventMouse): void {
        if (!this.host.dragActive || this.host.capturedPointerId !== null) return;
        event.propagationStopped = true;
        const sample = this.sampleFromMouse(event);
        this.updateDragSelection(sample.index);
        this.host.lastPointerSample = sample;
        this.traceGesture('mouse-move', sample.index, [], sample);
    }

public onHandMouseUp(event: EventMouse): void {
        if (!this.host.dragActive || this.host.capturedPointerId !== null) return;
        event.propagationStopped = true;
        const sample = this.sampleFromMouse(event);
        this.host.lastPointerSample = sample;
        this.updateDragSelection(sample.index);
        if (this.host.dragStartIndex < 0) {
            this.traceGesture('blank-tap', -1, [], sample);
            this.cancelDragSelection();
            this.clearCardSelection();
            return;
        }
        if (this.host.dragMoved) {
            if (this.host.dragIndices.size > 0) this.commitSmartDragSelection(sample);
            else this.cancelDragSelection();
            return;
        }
        const index = this.host.dragStartIndex;
        this.cancelDragSelection();
        this.traceGesture('mouse-tap', index, [], sample);
        void this.toggleCardAt(index, true).catch((error: unknown) => this.host.report(error, '选牌失败'));
    }

public onHandMouseCancel(event: EventMouse): void {
        if (!this.host.dragActive || this.host.capturedPointerId !== null) return;
        event.propagationStopped = true;
        this.traceGesture('mouse-cancel', -1, [], this.sampleFromMouse(event));
        this.cancelDragSelection();
    }

public cardIndexAtScreen(screenX: number, screenY: number, windowId: number): number {
        const screenPoint = new Vec2(screenX, screenY);
        // Use Creator's camera-aware screen-space hit test as the single source of
        // truth. Comparing Event UI coordinates with world AABBs drifts when the
        // Preview device shell, Retina DPR and Canvas scaling are all active.
        // Cards are rendered from left to right, so the last matching sibling is
        // visually on top in the overlap region.
        for (let index = this.host.cardNodes.length - 1; index >= 0; index -= 1) {
            const card = this.host.cardNodes[index];
            if (!card?.isValid) continue;
            const transform = card.getComponent(UITransform);
            if (!transform) continue;
            if (UITransform.prototype.hitTest.call(transform, screenPoint, windowId)) return index;
        }
        // Both taps and swipes use the same exact visible-card boundary.
        // Empty space must never be projected to a nearby card.
        return -1;
    }

public cardIndexAtUi(uiX: number, uiY: number): number {
        const world = new Vec3(uiX, uiY, 0);
        for (let index = this.host.cardNodes.length - 1; index >= 0; index -= 1) {
            const card = this.host.cardNodes[index];
            const transform = card?.isValid ? card.getComponent(UITransform) : null;
            if (!card?.activeInHierarchy || !transform) continue;
            const local = transform.convertToNodeSpaceAR(world);
            const left = -transform.anchorPoint.x * transform.width;
            const right = (1 - transform.anchorPoint.x) * transform.width;
            const bottom = -transform.anchorPoint.y * transform.height;
            const top = (1 - transform.anchorPoint.y) * transform.height;
            if (local.x >= left && local.x <= right && local.y >= bottom && local.y <= top) return index;
        }
        return -1;
    }

public isInsideHandGestureArea(sample: HandPointerSample): boolean {
        const origin = view.getVisibleOrigin();
        const size = view.getVisibleSize();
        const transform = this.host.handCardsTransform
            ?? this.host.view?.find('Players/Seat_0/Card/Hand_Cards')?.getComponent(UITransform);
        if (!transform || !Number.isFinite(size.width) || size.width <= 0) return false;
        if (sample.ui.x < origin.x || sample.ui.x > origin.x + size.width) return false;
        const local = transform.convertToNodeSpaceAR(new Vec3(sample.ui.x, sample.ui.y, 0));
        const bottom = -transform.anchorPoint.y * transform.height;
        const top = (1 - transform.anchorPoint.y) * transform.height;
        return local.y >= bottom && local.y <= top;
    }

public isInteractiveRoomControlAtUi(uiX: number, uiY: number): boolean {
        // The document-level pointer bridge owns the hand gesture surface.
        // Protect both PDK action buttons and the shared room shell so a button
        // press is delivered to its Button listener instead of being captured as
        // an empty-hand drag.
        const roots: Node[] = [];
        const ownRoot = this.host.view?.root;
        if (ownRoot?.isValid) roots.push(ownRoot);
        let ancestor = ownRoot?.parent ?? null;
        while (ancestor) {
            const shared = ancestor.name === 'CommonRoom' ? ancestor : ancestor.getChildByName('CommonRoom');
            if (shared?.isValid && !roots.includes(shared)) roots.push(shared);
            ancestor = ancestor.parent;
        }
        const paths = [
            'Btn/Btn_Play', 'Btn/Btn_Hint', 'Btn/Btn_Pass',
            'Btn/Btn_NoGrab', 'Btn/Btn_GrabDealer',
            'Btn/Btn_Back', 'Btn/Btn_More', 'Btn/Btn_Chat', 'Btn/Btn_Voice',
            'Btn/Btn_SmallSettlement', 'WaitingActions/Btn_Ready', 'WaitingActions/Btn_Start',
            'CardCounter/MoreMenu/MoreItems/Btn_Settings',
            'CardCounter/MoreMenu/MoreItems/Btn_DissolveRoom',
            'CardCounter/MoreMenu/MoreItems/Btn_RoomRule',
        ];
        const point = new Vec3(uiX, uiY, 0);
        for (const root of roots) {
            if (!root.activeInHierarchy) continue;
            for (const path of paths) {
                const node = root.getChildByPath(path);
                const button = node?.getComponent(Button);
                const transform = node?.getComponent(UITransform);
                if (!node?.activeInHierarchy || !button?.interactable || !transform) continue;
                const local = transform.convertToNodeSpaceAR(point);
                const left = -transform.anchorPoint.x * transform.width;
                const right = (1 - transform.anchorPoint.x) * transform.width;
                const bottom = -transform.anchorPoint.y * transform.height;
                const top = (1 - transform.anchorPoint.y) * transform.height;
                if (local.x >= left && local.x <= right && local.y >= bottom && local.y <= top) return true;
            }
        }
        return false;
    }

public beginDragSelection(sample: HandPointerSample): void {
        this.host.dragActive = true;
        this.host.dragMoved = false;
        this.host.dragStartIndex = sample.index;
        this.host.dragLastIndex = sample.index;
        this.host.dragIndices.clear();
        if (sample.index >= 0) this.host.dragIndices.add(sample.index);
        this.host.lastPointerSample = sample;
    }

public updateDragSelection(index: number): void {
        if (!this.host.dragActive || index < 0) return;
        if (this.host.dragStartIndex < 0) {
            this.host.dragStartIndex = index;
            this.host.dragLastIndex = index;
            this.host.dragIndices.clear();
            this.host.dragIndices.add(index);
            this.host.dragMoved = true;
            this.previewDragSelection();
            return;
        }
        if (index !== this.host.dragStartIndex) this.host.dragMoved = true;
        this.host.dragIndices.clear();
        for (const item of this.coveredDragIndices(this.host.dragStartIndex, index)) this.host.dragIndices.add(item);
        this.host.dragLastIndex = index;
        if (this.host.dragMoved) this.previewDragSelection();
    }

public previewDragSelection(): void {
        this.host.cardNodes.forEach((node: Node, index: number) => {
            this.host.cards.previewDrag(node, this.host.dragIndices.has(index));
        });
    }

public commitSmartDragSelection(sample: HandPointerSample): void {
        const hand = (this.host.logic.GetHandCard() ?? []).map(Number);
        const touched = this.orderedDragIndices().map((index) => hand[index]);
        const leading = this.host.isAuthoritativeLeadingTurn();
        const legal = this.largestLegalDragCandidates(touched)[0] ?? [];
        // A drag is one physical interval. It must not merge a preceding tap or
        // swipe into a new synthetic hand: choose the largest legal shape fully
        // covered by this gesture. A lead interval without any complete legal
        // shape remains a manual partial selection for the player to finish.
        const selected = legal.length > 0 ? legal : leading ? touched : [];
        this.traceGesture('commit', this.host.dragLastIndex, selected, sample);
        this.host.traceOutCards('selection-drag', {
            playerId: this.host.runtime.getPlayerId(),
            operationId: String(this.host.record(
                this.host.runtime.getRoomSet().GetRoomSetInfo()?.operationDeadline,
            )?.operationId ?? ''),
            leading, touched, selected,
        });
        this.host.cardNodes.forEach((node: Node) => this.host.cards.previewDrag(node, false));
        this.host.logic.ChangeSelectCard(selected);
        this.host.selectionIntentRevision += 1;
        this.clearDragSelection();
        this.host.resetPromptCycle();
        this.updateSelection();
        this.host.refresh();
    }

public largestLegalDragCandidates(touched: readonly number[]): number[][] {
        const leading = this.host.isAuthoritativeLeadingTurn();
        const required = leading ? this.host.activeRequiredFirstCard() : 0;
        // Enumerate only subsets of this drag interval. The DRAG strategy checks
        // first-card, response type/count/beat and scoring-bomb constraints, then
        // ranks this one size tier without invoking the fixed-plan hint ordering.
        return largestLegalPdkSubsets(touched, (subsets) => {
            const candidates = required > 0
                ? subsets.filter((cards) => cards.includes(required)) : [...subsets];
            return this.host.sortedLegalTipCandidates(leading, 'DRAG', candidates);
        });
    }

public cancelDragSelection(): void {
        // Cancel only the transient drag preview; committed selection is restored below.
        this.host.cardNodes.forEach((node: Node) => this.host.cards.previewDrag(node, false));
        this.clearDragSelection();
        this.updateSelection();
    }

public clearCardSelection(): void {
        if ((this.host.logic.GetSelectCard() ?? []).length === 0) return;
        this.host.logic.ChangeSelectCard([]);
        this.host.selectionIntentRevision += 1;
        this.host.resetPromptCycle();
        this.host.cards.stopAll(false);
        this.updateSelection();
    }

public clearDragSelection(): void {
        this.host.dragActive = false;
        this.host.dragMoved = false;
        this.host.dragStartIndex = -1;
        this.host.dragLastIndex = -1;
        this.host.dragIndices.clear();
    }

public coveredDragIndices(startIndex: number, endIndex: number): number[] {
        const start = Math.min(startIndex, endIndex);
        const end = Math.max(startIndex, endIndex);
        const values: number[] = [];
        for (let item = start; item <= end; item += 1) values.push(item);
        return values;
    }

public sortedDragIndices(): number[] {
        return [...this.host.dragIndices].sort((left, right) => left - right);
    }

public orderedDragIndices(): number[] {
        if (this.host.dragStartIndex < 0 || this.host.dragLastIndex < 0) return [];
        const step = this.host.dragLastIndex >= this.host.dragStartIndex ? 1 : -1;
        const values: number[] = [];
        for (let index = this.host.dragStartIndex;; index += step) {
            values.push(index);
            if (index === this.host.dragLastIndex) break;
        }
        return values;
    }

public traceGesture(stage: string, index: number, finalCards: readonly number[] = [], sample: HandPointerSample | null = null): void {
        const host = globalThis as typeof globalThis & { __PDK_GESTURE_TRACE__?: unknown[] };
        const trace = host.__PDK_GESTURE_TRACE__ ?? [];
        const entry = { stage, index, coveredIndexes: this.sortedDragIndices(), finalCards: [...finalCards], ...sample, at: Date.now() };
        trace.push(entry);
        if (trace.length > 100) trace.splice(0, trace.length - 100);
        host.__PDK_GESTURE_TRACE__ = trace;
        const terminalStage = stage === 'commit' || stage === 'required-card-missing'
            || stage === 'cancel' || stage.endsWith('tap');
        if (terminalStage) {
            console.info('[PDKGesture]', JSON.stringify(entry));
        }
    }
}
