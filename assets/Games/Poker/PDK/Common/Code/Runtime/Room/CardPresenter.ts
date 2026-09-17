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
        // unchanged state must not stop the independent hand-compaction tween.
        if (!changed) return;
        const current = card.position;
        const base = this.basePositions.get(card) ?? new Vec3(current.x, current.y, current.z);
        this.basePositions.set(card, base);
        this.presented.add(card);
        const target = new Vec3(current.x, base.y + (selected ? SELECTED_OFFSET_Y : 0), current.z);
        Tween.stopAllByTarget(card);
        tween(card).to(selected ? SELECT_RAISE_DURATION : DESELECT_DROP_DURATION, { position: target }, { easing: 'quadOut' })
            .start();
    }

    /** Drop stale user selection synchronously at an authoritative turn boundary. */
    public clearSelectionImmediately(cards: readonly Node[]): void {
        for (const card of cards) {
            if (!card.isValid) continue;
            // A locally accepted play has already detached the selected cards;
            // every survivor may currently be running the independent hand-
            // compaction tween. Stopping all survivors here freezes the exact
            // gaps left by the played cards. Only stale raised cards need reset.
            if (this.selectedStates.get(card) !== true) continue;
            Tween.stopAllByTarget(card);
            card.getComponent(Poker_Card_Presenter)?.setPdkVisualState(false, false);
            this.selectedStates.set(card, false);
            const base = this.basePositions.get(card);
            if (base) card.setPosition(base);
        }
    }

    public preview(card: Node, preview: boolean): void {
        if (!card.isValid) return;
        card.getComponent(Poker_Card_Presenter)?.setPdkPreview(preview);
    }

    public isSelected(card: Node): boolean {
        return card.isValid && this.selectedStates.get(card) === true;
    }

    /** Layout owns the initial x/y placement, so cache bases only after it has settled. */
    public synchronizeLayout(cards: readonly Node[]): void {
        for (const card of cards) {
            if (!card.isValid) continue;
            Tween.stopAllByTarget(card);
            const selected = this.selectedStates.get(card) === true;
            const current = card.position;
            const base = new Vec3(current.x, current.y - (selected ? SELECTED_OFFSET_Y : 0), current.z);
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
            Tween.stopAllByTarget(card);
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
                Tween.stopAllByTarget(card);
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
            Tween.stopAllByTarget(card);
            this.presented.delete(card);
            card.removeFromParent();
            if (card.isValid) card.destroy();
        }
    }
}
