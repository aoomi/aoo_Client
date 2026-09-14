import { _decorator, Component, Event, Node } from 'cc';

const { ccclass } = _decorator;

export const NUMPAD_DECIMAL_EVENT = 'aoo-numpad-decimal';

/** Public Numpad-owned pointer bridge for Creator's dot key; business pages never bind it. */
@ccclass('NumpadDotBridge')
export class NumpadDotBridge extends Component {
    private lastEmit = 0;

    protected onEnable(): void {
        this.node.on(Node.EventType.TOUCH_START, this.emitDecimal, this);
        this.node.on(Node.EventType.MOUSE_DOWN, this.emitDecimal, this);
    }

    protected onDisable(): void {
        this.node.off(Node.EventType.TOUCH_START, this.emitDecimal, this);
        this.node.off(Node.EventType.MOUSE_DOWN, this.emitDecimal, this);
    }

    private readonly emitDecimal = (): void => {
        const now = Date.now();
        if (now - this.lastEmit < 80) return;
        this.lastEmit = now;
        this.node.dispatchEvent(new Event(NUMPAD_DECIMAL_EVENT, true));
    };
}
