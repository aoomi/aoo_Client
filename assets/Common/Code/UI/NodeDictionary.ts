import { _decorator, Component, isValid, Node } from 'cc';
import { KeyNode } from './NodeDictionaryEntry';

const { ccclass, menu, property } = _decorator;

/** Native Creator 3.8.8 node lookup component used by editable settlement prefabs. */
@ccclass('NodeDictionary')
@menu('Aoo/Common/NodeDictionary')
export class NodeDictionary extends Component {
    @property({ type: [KeyNode], serializable: true }) dict: KeyNode[] = [];
    get(key: string): Node | null {
        return this.dict.find((entry) => entry.key === key && isValid(entry.node))?.node ?? null;
    }
}
