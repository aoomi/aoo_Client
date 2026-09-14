import { Button, Color, EditBox, Graphics, Label, Node, UITransform, Vec3 } from 'cc';

export class UiFactory {
    public createNode(name: string, parent: Node, width: number, height: number): Node {
        const node = new Node(name);
        parent.addChild(node);
        node.layer = parent.layer;
        node.addComponent(UITransform).setContentSize(width, height);
        return node;
    }

    public drawRect(node: Node, color: Color, width: number, height: number, radius: number): void {
        const graphics = node.getComponent(Graphics) ?? node.addComponent(Graphics);
        graphics.clear();
        graphics.fillColor = color;
        if (radius > 0) graphics.roundRect(-width / 2, -height / 2, width, height, radius);
        else graphics.rect(-width / 2, -height / 2, width, height);
        graphics.fill();
    }

    public createLabel(
        parent: Node,
        name: string,
        text: string,
        fontSize: number,
        position: Vec3,
        color: Color,
    ): Label {
        const node = this.createNode(name, parent, 440, fontSize + 18);
        node.setPosition(position);
        const label = node.addComponent(Label);
        label.string = text;
        label.fontSize = fontSize;
        label.lineHeight = fontSize + 6;
        label.color = color;
        label.horizontalAlign = Label.HorizontalAlign.CENTER;
        label.verticalAlign = Label.VerticalAlign.CENTER;
        return label;
    }

    public createEditBox(parent: Node, name: string, placeholder: string, position: Vec3): EditBox {
        const node = this.createNode(name, parent, 400, 58);
        node.setPosition(position);
        this.drawRect(node, new Color(232, 240, 247, 255), 400, 58, 10);

        const textLabel = this.createLabel(node, 'Text', '', 22, Vec3.ZERO, new Color(35, 54, 70));
        textLabel.horizontalAlign = Label.HorizontalAlign.LEFT;
        textLabel.node.getComponent(UITransform)?.setContentSize(350, 48);

        const placeholderLabel = this.createLabel(
            node,
            'Placeholder',
            placeholder,
            22,
            Vec3.ZERO,
            new Color(132, 149, 163),
        );
        placeholderLabel.horizontalAlign = Label.HorizontalAlign.LEFT;
        placeholderLabel.node.getComponent(UITransform)?.setContentSize(350, 48);

        const editBox = node.addComponent(EditBox);
        editBox.textLabel = textLabel;
        editBox.placeholderLabel = placeholderLabel;
        editBox.maxLength = 32;
        return editBox;
    }

    public createButton(
        parent: Node,
        name: string,
        text: string,
        position: Vec3,
        width = 400,
    ): Button {
        const node = this.createNode(name, parent, width, 64);
        node.setPosition(position);
        this.drawRect(node, new Color(30, 144, 229, 255), width, 64, 12);
        this.createLabel(node, 'Label', text, 26, Vec3.ZERO, Color.WHITE);
        const button = node.addComponent(Button);
        button.transition = Button.Transition.SCALE;
        button.zoomScale = 0.96;
        return button;
    }

    public clearChildren(node: Node): void {
        for (const child of [...node.children]) child.destroy();
    }
}
