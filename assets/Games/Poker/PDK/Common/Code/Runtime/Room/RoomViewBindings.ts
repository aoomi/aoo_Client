import { Button, Label, Node } from 'cc';

export class RoomViewBindings {
    public constructor(public readonly root: Node) {}

    public find(path: string): Node | null {
        let current: Node | null = this.root;
        for (const segment of path.split('/').filter(Boolean)) current = current?.getChildByName(segment) ?? null;
        return current;
    }

    public require(path: string): Node {
        const node = this.find(path);
        if (!node) throw new Error(`${this.root.name} 节点契约缺失: ${path}`);
        return node;
    }

    public label(path: string, value: string): void {
        const label = this.find(path)?.getComponent(Label);
        if (label) label.string = value;
    }

    public visible(path: string, visible: boolean): void {
        const node = this.find(path);
        if (node) node.active = visible;
    }

    public bind(path: string, handler: () => void, bound: Set<Node>): void {
        const node = this.require(path);
        const button = node.getComponent(Button);
        if (!button) throw new Error(`${this.root.name} 按钮组件缺失: ${path}`);
        if (bound.has(node)) return;
        bound.add(node);
        // 统一以绑定器作为事件 target，销毁房间时才能精确解绑本层监听，
        // 不会误删 Creator 预制体中已有的序列化事件。
        let lastFire = 0;
        const invoke = (): void => {
            const now = Date.now();
            // Web Preview/Safari may omit the synthesized CLICK event. Bind the
            // physical pointer completions too, but submit one action per gesture.
            if (now - lastFire < 180 || !button.interactable) return;
            lastFire = now;
            handler();
        };
        node.on(Button.EventType.CLICK, invoke, this);
        node.on(Node.EventType.TOUCH_END, invoke, this);
        node.on(Node.EventType.MOUSE_UP, invoke, this);
    }

    public unbind(bound: Set<Node>): void {
        for (const node of bound) node.targetOff(this);
        bound.clear();
    }
}
