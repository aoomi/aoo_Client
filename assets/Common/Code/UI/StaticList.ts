import { _decorator, Component, instantiate, isValid, Node } from 'cc';

const { ccclass, menu, property } = _decorator;

export type StaticListRenderer<T> = (item: Node, data: T, index: number) => void;

/**
 * Small, fixed-size list used by settlement panels and other bounded UI.
 * Large or unbounded data sets must use UnifiedScroll/VirtualList instead.
 */
@ccclass('StaticList')
@menu('Aoo/Common/StaticList')
export class StaticList extends Component {
    @property(Node)
    item: Node | null = null;

    private readonly items = new Map<number, Node>();
    private data: unknown[] = [];

    protected onLoad(): void {
        for (const [index, child] of this.node.children.entries()) {
            this.items.set(index, child);
        }
    }

    setData<T>(data: readonly T[], renderer?: StaticListRenderer<T>): void {
        if (!Array.isArray(data) || !this.item) return;

        this.data = [...data];
        for (const [index, node] of this.items) {
            if (index >= data.length) {
                node.active = false;
            }
        }

        data.forEach((value, index) => {
            const node = this.ensureItem(index);
            node.active = true;
            renderer?.(node, value, index);
        });
    }

    /** Compatibility with migrated callers; new code should use setData. */
    setDatas<T>(data: readonly T[], renderer?: StaticListRenderer<T>): void {
        this.setData(data, renderer);
    }

    addItem<T>(data: T, renderer?: StaticListRenderer<T>): Node | null {
        if (!this.item) return null;
        const index = this.data.length;
        this.data.push(data);
        const node = this.ensureItem(index);
        node.active = true;
        renderer?.(node, data, index);
        return node;
    }

    getItems(): Node[] {
        return [...this.items.entries()]
            .sort(([left], [right]) => left - right)
            .map(([, node]) => node)
            .filter((node) => isValid(node));
    }

    getItem(index: number): Node | null {
        const node = this.items.get(index);
        return node && isValid(node) ? node : null;
    }

    getData<T>(): readonly T[] {
        return this.data as readonly T[];
    }

    getDatas<T>(): readonly T[] {
        return this.getData<T>();
    }

    private ensureItem(index: number): Node {
        const current = this.items.get(index);
        if (current && isValid(current)) return current;

        const node = instantiate(this.item as Node);
        node.parent = this.node;
        this.items.set(index, node);
        return node;
    }
}

export default StaticList;
