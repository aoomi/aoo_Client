import { _decorator, Component, Node, Sprite, SpriteFrame } from 'cc';

const { ccclass, property } = _decorator;

export enum Poker_Card_Suit {
    Spade = 0,
    Heart = 1,
    Club = 2,
    Diamond = 3,
}

export enum Poker_Card_Face {
    Front = 0,
    Back = 1,
}

export interface Poker_Card_Skin {
    cardFront: SpriteFrame;
    cardBack: SpriteFrame;
    selectedMask: SpriteFrame;
    disabledMask: SpriteFrame;
}

@ccclass('Poker_Card_Presenter')
export class Poker_Card_Presenter extends Component {
    @property(Node) private cardBack: Node | null = null;
    @property(Node) private cardFront: Node | null = null;
    @property(Sprite) private rankTop: Sprite | null = null;
    @property(Sprite) private suitTop: Sprite | null = null;
    @property(Sprite) private faceCenter: Sprite | null = null;
    @property(Sprite) private suitBottom: Sprite | null = null;
    @property(Node) private selectedMask: Node | null = null;
    @property(Node) private disabledMask: Node | null = null;

    @property([SpriteFrame]) private blackRanks: SpriteFrame[] = [];
    @property([SpriteFrame]) private redRanks: SpriteFrame[] = [];
    @property([SpriteFrame]) private suits: SpriteFrame[] = [];
    @property([SpriteFrame]) private facePictures: SpriteFrame[] = [];
    @property([SpriteFrame]) private jokerRanks: SpriteFrame[] = [];
    @property([SpriteFrame]) private jokerPictures: SpriteFrame[] = [];
    private selected = false;
    private disabled = false;
    /** Public/table cards can never display hand-interaction shading again. */
    private presentationOnly = false;

    public present(
        rank: number,
        suit: Poker_Card_Suit,
        face: Poker_Card_Face = Poker_Card_Face.Front,
        selected = false,
        disabled = false,
        skin?: Poker_Card_Skin,
    ): void {
        this.requireBindings();
        if (skin) this.applySkin(skin);
        const showingFront = face === Poker_Card_Face.Front;
        this.cardFront!.active = showingFront;
        this.cardBack!.active = !showingFront;
        this.selected = selected;
        this.disabled = disabled;
        this.applyVisualState();
        if (!showingFront) {
            return;
        }

        if (rank === 15 || rank === 16) {
            this.presentJoker(rank - 15);
            return;
        }
        if (!Number.isInteger(rank) || rank < 2 || rank > 14) {
            throw new Error(`Poker card rank must be 2-14 or joker 15-16: ${rank}`);
        }
        if (!Number.isInteger(suit) || suit < Poker_Card_Suit.Spade || suit > Poker_Card_Suit.Diamond) {
            throw new Error(`Poker card suit is invalid: ${suit}`);
        }

        const red = suit === Poker_Card_Suit.Heart || suit === Poker_Card_Suit.Diamond;
        const rankFrame = this.requireFrame(red ? this.redRanks : this.blackRanks, rank - 2, 'rank');
        const suitFrame = this.requireFrame(this.suits, suit, 'suit');
        this.rankTop!.spriteFrame = rankFrame;
        this.suitTop!.spriteFrame = suitFrame;
        this.suitBottom!.spriteFrame = suitFrame;
        // 当前权威 Poker_Card 模板没有中心花牌节点；普通牌仍由角标与右下花色完整表达。
        // 若用户以后在 Creator 绑定该可选节点，Presenter 会自动启用中心花牌而不改变模板布局。
        if (this.faceCenter) {
            this.faceCenter.spriteFrame = rank >= 11 && rank <= 13
                ? this.requireFrame(this.facePictures, rank - 11, 'face picture')
                : suitFrame;
        }
        this.suitBottom!.node.active = true;
    }

    public setSelected(selected: boolean): void {
        this.requireBindings();
        this.selected = selected;
        this.applyVisualState();
    }

    public setDisabled(disabled: boolean): void {
        this.requireBindings();
        this.disabled = disabled;
        this.applyVisualState();
    }

    /** PDK uses vertical movement alone for selection; selected cards stay fully bright. */
    public setPdkVisualState(selected: boolean, disabled: boolean): void {
        if (this.presentationOnly) return;
        this.requireBindings();
        this.selected = selected;
        this.disabled = disabled;
        this.selectedMask!.active = false;
        this.disabledMask!.active = this.presentationOnly ? false : !selected && disabled;
    }

    /** Drag-range feedback only; taps and committed selections never use a mask. */
    public setPdkDragPreview(preview: boolean): void {
        if (!this.node.isValid || this.presentationOnly) return;
        this.requireBindings();
        this.selectedMask!.active = this.presentationOnly ? false : !this.selected && preview;
        this.disabledMask!.active = false;
    }

    /** Permanently make this instance a display-only card. */
    public setPresentationOnly(): void {
        if (this.presentationOnly) return;
        this.presentationOnly = true;
        this.selected = false;
        this.disabled = false;
        // Public cards never return to the selectable hand. Detach these nodes
        // instead of merely hiding them: serialized references and delayed
        // selection callbacks then have nothing that can be reactivated.
        for (const mask of [this.selectedMask, this.disabledMask]) {
            if (!mask?.isValid) continue;
            mask.active = false;
            mask.removeFromParent();
            mask.destroy();
        }
        this.selectedMask = null;
        this.disabledMask = null;
    }

    private applyVisualState(): void {
        if (this.presentationOnly) return;
        this.selectedMask!.active = this.selected;
        this.disabledMask!.active = !this.selected && this.disabled;
    }

    private presentJoker(index: number): void {
        const rankFrame = this.requireFrame(this.jokerRanks, index, 'joker rank');
        this.rankTop!.spriteFrame = rankFrame;
        this.suitTop!.spriteFrame = null;
        if (this.faceCenter) {
            this.faceCenter.spriteFrame = this.requireFrame(this.jokerPictures, index, 'joker picture');
            this.suitBottom!.node.active = false;
        } else {
            // 无中心节点时复用模板已有的右下图片槽，保证大小王仍有完整牌面而非静默缺图。
            this.suitBottom!.spriteFrame = this.requireFrame(this.jokerPictures, index, 'joker picture');
            this.suitBottom!.node.active = true;
        }
    }

    private requireBindings(): void {
        if (!this.cardBack || !this.cardFront || !this.rankTop || !this.suitTop
            || !this.suitBottom || !this.selectedMask || !this.disabledMask) {
            throw new Error('Poker_Card prefab bindings are incomplete');
        }
    }

    private applySkin(skin: Poker_Card_Skin): void {
        // 基础牌底/牌背/遮罩必须运行时绑定到唯一公共图集；这样 Creator Preview
        // 的导入缓存即使滞后，也不会让生产房间显示空白底板或误用旧牌资源。
        this.requireSprite(this.cardFront, 'front').spriteFrame = skin.cardFront;
        this.requireSprite(this.cardBack, 'back').spriteFrame = skin.cardBack;
        this.requireSprite(this.selectedMask, 'selected mask').spriteFrame = skin.selectedMask;
        this.requireSprite(this.disabledMask, 'disabled mask').spriteFrame = skin.disabledMask;
    }

    private requireSprite(node: Node | null, label: string): Sprite {
        const sprite = node?.getComponent(Sprite);
        if (!sprite) throw new Error(`Poker_Card ${label} sprite binding is missing`);
        return sprite;
    }

    private requireFrame(frames: readonly SpriteFrame[], index: number, label: string): SpriteFrame {
        const frame = frames[index];
        if (!frame) {
            throw new Error(`Poker_Card ${label} mapping is missing at index ${index}`);
        }
        return frame;
    }
}
