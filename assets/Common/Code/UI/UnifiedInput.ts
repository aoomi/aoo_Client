import { _decorator, Component, EditBox } from 'cc';

const { ccclass, property } = _decorator;

@ccclass('AooUnifiedInput')
export class UnifiedInput extends Component {
    @property public trim = true;
    @property public numeric = false;

    public value(): string {
        const value = this.getComponent(EditBox)?.string ?? '';
        return this.trim ? value.trim() : value;
    }

    public valid(): boolean {
        const value = this.value();
        return value.length > 0 && (!this.numeric || /^\d+$/.test(value));
    }
}
