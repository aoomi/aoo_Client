import { _decorator, Component, EditBox, Enum, Label, Node, UITransform } from 'cc';

const { ccclass, executeInEditMode, executionOrder, menu, property, requireComponent } = _decorator;

/**
 * Stable, public-API-only layout for Creator 3.8.8 EditBox labels.
 *
 * Creator places EditBox labels by their top-left corner during __preload and
 * every SIZE_CHANGED event.  Consequently these nodes must use a (0, 1)
 * anchor.  This component runs after cc.EditBox and applies configurable
 * padding without polling or touching engine-private methods.
 */
@ccclass('EditBoxLabelLayout')
@menu('Aoo/UI/EditBox Label Layout')
@executeInEditMode
@executionOrder(120)
@requireComponent(EditBox)
export class EditBoxLabelLayout extends Component {
    @property({ min: 0 })
    public left = 2;

    @property({ min: 0 })
    public right = 0;

    @property({ min: 0 })
    public top = 0;

    @property({ min: 0 })
    public bottom = 0;

    @property({ type: Enum(Label.HorizontalAlign) })
    public textHorizontalAlign = Label.HorizontalAlign.LEFT;

    @property({ type: Enum(Label.HorizontalAlign) })
    public placeholderHorizontalAlign = Label.HorizontalAlign.LEFT;

    @property({ type: Enum(Label.VerticalAlign) })
    public verticalAlign = Label.VerticalAlign.CENTER;

    protected onLoad (): void {
        this.sync();
    }

    protected onEnable (): void {
        this.node.on(Node.EventType.SIZE_CHANGED, this.sync, this);
        this.sync();
    }

    protected onDisable (): void {
        this.node.off(Node.EventType.SIZE_CHANGED, this.sync, this);
    }

    public sync (): void {
        const editBox = this.getComponent(EditBox);
        const transform = this.getComponent(UITransform);
        if (!editBox || !transform) {
            return;
        }

        // Migrated 2.2 scenes may keep the visible background size while the
        // EditBox root is reset to the legacy 40x40 default. Creator then
        // clamps both labels to a single glyph on every deserialize/save.
        const background = this.node.getChildByName('BACKGROUND_SPRITE')?.getComponent(UITransform);
        if (background && (transform.width !== background.width || transform.height !== background.height)) {
            transform.setContentSize(background.width, background.height);
        }

        this.layoutLabel(editBox.textLabel, this.textHorizontalAlign, transform);
        this.layoutLabel(editBox.placeholderLabel, this.placeholderHorizontalAlign, transform);
    }

    private layoutLabel (label: Label | null, horizontalAlign: number, owner: UITransform): void {
        if (!label) {
            return;
        }

        const labelTransform = label.getComponent(UITransform);
        if (!labelTransform) {
            return;
        }

        const width = Math.max(0, owner.width - this.left - this.right);
        const height = Math.max(0, owner.height - this.top - this.bottom);
        labelTransform.setAnchorPoint(0, 1);
        labelTransform.setContentSize(width, height);
        label.node.setPosition(
            -owner.anchorX * owner.width + this.left,
            -owner.anchorY * owner.height + owner.height - this.top,
            label.node.position.z,
        );
        label.horizontalAlign = horizontalAlign;
        label.verticalAlign = this.verticalAlign;
    }
}
