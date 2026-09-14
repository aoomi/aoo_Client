import { Color, Label, LabelOutline, Node, UIOpacity, UITransform, Vec3, tween } from 'cc';

/** 在牌桌根节点上展示不依赖大厅弹窗层的短时气泡。 */
export class RoomBubblePresenter {
    private bubble: Node | null = null;

    public constructor(private readonly root: Node) {}

    public show(message: string, durationMs = 1800): void {
        this.destroy();
        const bubble = new Node('RoomBubble');
        bubble.addComponent(UITransform).setContentSize(520, 64);
        bubble.setPosition(new Vec3(0, 86, 0));
        const label = bubble.addComponent(Label);
        label.string = message;
        label.fontSize = 32;
        label.lineHeight = 42;
        label.horizontalAlign = Label.HorizontalAlign.CENTER;
        label.verticalAlign = Label.VerticalAlign.CENTER;
        label.color = Color.WHITE;
        const outline = bubble.addComponent(LabelOutline);
        outline.color = new Color(49, 36, 19, 230);
        outline.width = 5;
        const opacity = bubble.addComponent(UIOpacity);
        this.root.addChild(bubble);
        this.bubble = bubble;
        tween(opacity)
            .delay(Math.max(500, durationMs - 300) / 1000)
            .to(0.3, { opacity: 0 })
            .call(() => this.destroy())
            .start();
    }

    public destroy(): void {
        if (this.bubble?.isValid) this.bubble.destroy();
        this.bubble = null;
    }
}
