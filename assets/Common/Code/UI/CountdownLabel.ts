import { _decorator, Component, Label } from 'cc';

const { ccclass, property } = _decorator;

@ccclass('AooCountdownLabel')
export class CountdownLabel extends Component {
    @property(Label) public label: Label | null = null;
    private deadlineMs = 0;
    private completed: (() => void) | undefined;

    public begin(deadlineMs: number, completed?: () => void): void { this.deadlineMs = deadlineMs; this.completed = completed; this.tick(); }
    public update(): void { this.tick(); }
    private tick(): void {
        const seconds = Math.max(0, Math.ceil((this.deadlineMs - Date.now()) / 1000));
        if (this.label) this.label.string = String(seconds);
        if (seconds === 0 && this.deadlineMs !== 0) { this.deadlineMs = 0; const callback = this.completed; this.completed = undefined; callback?.(); }
    }
}
