import { _decorator, isValid, Node } from 'cc';

const { ccclass, property } = _decorator;

@ccclass('KeyNode')
export class KeyNode {
    @property key = '';
    @property(Node) private _node: Node | null = null;
    @property(Node) get node(): Node | null { return this._node; }
    set node(value: Node | null) {
        this._node = value;
        if (!this.key && isValid(value)) this.key = value.name;
    }
}
