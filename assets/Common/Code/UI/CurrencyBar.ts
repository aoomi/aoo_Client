import { _decorator, Component, Label } from 'cc';

const { ccclass, property } = _decorator;

@ccclass('AooCurrencyBar')
export class CurrencyBar extends Component {
    @property(Label) public primary: Label | null = null;
    @property(Label) public secondary: Label | null = null;
    public render(primary: number, secondary = 0): void {
        if (this.primary) this.primary.string = this.format(primary);
        if (this.secondary) this.secondary.string = this.format(secondary);
    }
    private format(value: number): string { return Math.max(0, Math.floor(value)).toLocaleString('en-US'); }
}
