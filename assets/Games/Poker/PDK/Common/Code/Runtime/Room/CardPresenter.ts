import { Button, Node, Tween, tween, UITransform, Vec3 } from 'cc';
import { Poker_Card_Factory } from '../../../../../Common/Code/Card/Poker_Card_Factory';
import { Poker_Card_Presenter } from '../../../../../Common/Code/Card/Poker_Card_Presenter';

const SELECTED_OFFSET_Y = 20;
const SELECT_RAISE_DURATION = 0.09;
const DESELECT_DROP_DURATION = 0.045;

export class CardPresenter {
    private readonly cards = new Poker_Card_Factory();
    private readonly basePositions = new WeakMap<Node, Vec3>();
    private readonly selectedStates = new WeakMap<Node, boolean>();
    private readonly motionResolvers = new WeakMap<Node, () => void>();
    private readonly presented = new Set<Node>();

    public async create(parent: Node, cardValue: number, selected = false, onClick?: () => void): Promise<Node> {
        const card = await this.cards.create(parent, cardValue, undefined, selected);
        const presenter = card.getComponent(Poker_Card_Presenter);
        if (!presenter) throw new Error('Poker_Card instance is missing Poker_Card_Presenter');
        // PDK represents selection only by raising the physical card. Never let
        // the common poker prefab's Selected_Mask/Disabled_Mask follow a card
        // into Out_Card or Table_Cards.
        presenter.setPdkVisualState(selected, false);
        if (onClick) {
            const button = card.getComponent(Button) ?? card.addComponent(Button);
            button.transition = Button.Transition.NONE;
            card.on(Button.EventType.CLICK, onClick, this);
        }
        const base = card.position.clone();
        this.basePositions.set(card, base);
        this.selectedStates.set(card, selected);
        this.presented.add(card);
        if (selected) this.select(card, true);
        return card;
    }

    public select(card: Node, selected: boolean): void {
        if (!card.isValid) return;
        const presenter = card.getComponent(Poker_Card_Presenter);
        if (!presenter) throw new Error('Poker_Card instance is missing Poker_Card_Presenter');
        presenter.setPdkVisualState(selected, false);
        const changed = this.selectedStates.get(card) !== selected;
        this.selectedStates.set(card, selected);
        // Authority refreshes selection on every committed packet. Reapplying an
        // unchanged state must not restart the composed card-position motion.
        if (!changed) return;
        const current = card.position;
        const base = this.basePositions.get(card) ?? new Vec3(current.x, current.y, current.z);
        this.basePositions.set(card, base);
        this.presented.add(card);
        void this.animateToPose(card, selected ? SELECT_RAISE_DURATION : DESELECT_DROP_DURATION);
    }

    /** Manual Hint must be visible in the same click frame, without a selection tween. */
    public selectImmediately(card: Node, selected: boolean): void {
        if (!card.isValid) return;
        const presenter = card.getComponent(Poker_Card_Presenter);
        if (!presenter) throw new Error('Poker_Card instance is missing Poker_Card_Presenter');
        this.cancelMotion(card);
        presenter.setPdkVisualState(selected, false);
        this.selectedStates.set(card, selected);
        const current = card.position;
        const base = this.basePositions.get(card) ?? new Vec3(current.x, current.y, current.z);
        this.basePositions.set(card, base);
        this.presented.add(card);
        card.setPosition(base.x, base.y + (selected ? SELECTED_OFFSET_Y : 0), base.z);
    }

    /**
     * Change the authored hand slot without creating a second position owner.
     * Selection and hand compaction both affect the same Node.position, so they
     * must be composed into one target instead of cancelling each other's tween.
     */
    public moveBase(card: Node, target: Vec3, duration: number): Promise<void> {
        if (!card.isValid) return Promise.resolve();
        this.basePositions.set(card, target.clone());
        this.presented.add(card);
        return this.animateToPose(card, duration);
    }

    /**
     * Compose Layout's fresh horizontal slot with the card's stable hand baseline.
     * Horizontal Layout does not own Y, so node.position.y may still be between the
     * selected and unselected poses when the player replaces a hint and immediately
     * plays another card. That transient value must never become the next baseline.
     */
    public canonicalLayoutBase(card: Node, layoutPosition: Readonly<Vec3>): Vec3 {
        const previousBase = this.basePositions.get(card);
        return new Vec3(layoutPosition.x, previousBase?.y ?? layoutPosition.y, layoutPosition.z);
    }

    /** Drop stale user selection synchronously at an authoritative turn boundary. */
    public clearSelectionImmediately(cards: readonly Node[]): void {
        for (const card of cards) {
            if (!card.isValid) continue;
            // A locally accepted play has already detached the selected cards.
            // Only stale raised cards need reset; untouched survivors keep their
            // composed motion toward the canonical hand slot.
            if (this.selectedStates.get(card) !== true) continue;
            this.cancelMotion(card);
            card.getComponent(Poker_Card_Presenter)?.setPdkVisualState(false, false);
            this.selectedStates.set(card, false);
            const base = this.basePositions.get(card);
            if (base) card.setPosition(base);
        }
    }

    public isSelected(card: Node): boolean {
        return card.isValid && this.selectedStates.get(card) === true;
    }

    public previewDrag(card: Node, preview: boolean): void {
        if (!card.isValid) return;
        card.getComponent(Poker_Card_Presenter)?.setPdkDragPreview(preview);
    }

    /**
     * Out_Card/Table_Cards/flying nodes are presentation-only. Remove the hand
     * interaction layers instead of merely hiding them, otherwise a later
     * presenter refresh or an instantiated selected hand card can reactivate a
     * mask after the card has already entered the public play area.
     */
    public stripInteractionVisual(card: Node): void {
        if (!card.isValid) return;
        // Mark the presenter first so no delayed present/selection refresh can
        // reactivate either overlay after the card reaches Out_Card/Table_Cards.
        card.getComponent(Poker_Card_Presenter)?.setPresentationOnly();
        const disable = (node: Node): void => {
            for (const child of [...node.children]) {
                if (child.name === 'Selected_Mask' || child.name === 'Disabled_Mask') {
                    child.active = false;
                    child.removeFromParent();
                    child.destroy();
                    continue;
                }
                disable(child);
            }
        };
        disable(card);
    }

    /**
     * Layout writes the canonical unselected slot. Cache that authored position as
     * the base, then compose the current logical selection on top of it. Treating
     * Layout's Y as an already-raised position makes a hint clicked during hand
     * compaction visually drop again when the authority reconciliation finishes.
     */
    public synchronizeLayout(cards: readonly Node[]): void {
        for (const card of cards) {
            if (!card.isValid) continue;
            this.cancelMotion(card);
            const selected = this.selectedStates.get(card) === true;
            const current = card.position;
            // Horizontal Layout does not own Y. When a hinted card is already
            // raised, current.y therefore contains the selection offset. Reusing
            // that value as the new base raises the same card another 20 px on
            // every authority reconciliation. Preserve the last canonical Y and
            // only accept Layout's freshly authored X/Z coordinates.
            const base = this.canonicalLayoutBase(card, current);
            this.basePositions.set(card, base);
            card.setPosition(current.x, base.y + (selected ? SELECTED_OFFSET_Y : 0), current.z);
        }
    }

    public createFlyingOverlay(parent: Node): Node {
        const overlay = new Node('PDK_Flying_Cards_Overlay');
        const size = parent.getComponent(UITransform)?.contentSize;
        overlay.addComponent(UITransform).setContentSize(size?.width ?? 0, size?.height ?? 0);
        parent.addChild(overlay);
        return overlay;
    }

    public stopAll(restoreBase: boolean): void {
        for (const card of [...this.presented]) {
            if (!card.isValid) { this.presented.delete(card); continue; }
            this.cancelMotion(card);
            if (restoreBase) {
                const base = this.basePositions.get(card);
                if (base) card.setPosition(base);
            }
        }
    }

    public clear(parent: Node | null): void {
        if (parent) {
            const children = [...parent.children];
            for (const card of children) {
                this.cancelMotion(card);
                this.presented.delete(card);
            }
            parent.removeAllChildren();
            for (const card of children) if (card.isValid) card.destroy();
            return;
        }
    }

    /** Clear generated cards while keeping prefab-owned layout templates intact. */
    public clearExcept(parent: Node | null, preservedNames: readonly string[]): void {
        if (!parent) return;
        const preserved = new Set(preservedNames);
        for (const card of [...parent.children]) {
            if (preserved.has(card.name)) continue;
            this.cancelMotion(card);
            this.presented.delete(card);
            card.removeFromParent();
            if (card.isValid) card.destroy();
        }
    }

    private animateToPose(card: Node, duration: number): Promise<void> {
        if (!card.isValid) return Promise.resolve();
        const base = this.basePositions.get(card) ?? card.position.clone();
        const selected = this.selectedStates.get(card) === true;
        const target = new Vec3(base.x, base.y + (selected ? SELECTED_OFFSET_Y : 0), base.z);
        this.cancelMotion(card);
        if (Vec3.equals(card.position, target)) return Promise.resolve();
        return new Promise<void>((resolve) => {
            let settled = false;
            const settle = (): void => {
                if (settled) return;
                settled = true;
                if (this.motionResolvers.get(card) === settle) this.motionResolvers.delete(card);
                resolve();
            };
            this.motionResolvers.set(card, settle);
            tween(card).to(duration, { position: target }, { easing: 'quadOut' })
                .call(settle)
                .start();
        });
    }

    private cancelMotion(card: Node): void {
        const settle = this.motionResolvers.get(card);
        this.motionResolvers.delete(card);
        Tween.stopAllByTarget(card);
        settle?.();
    }
}
