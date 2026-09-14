import { _decorator, Component, sys, UITransform, view } from 'cc';

const { ccclass } = _decorator;

@ccclass('AooSafeAreaAdapter')
export class SafeAreaAdapter extends Component {
    public onEnable(): void { this.apply(); }
    public apply(): void {
        const transform = this.getComponent(UITransform);
        if (!transform) return;
        const visible = view.getVisibleSize();
        const safe = sys.getSafeAreaRect();
        transform.setContentSize(Math.min(visible.width, safe.width), Math.min(visible.height, safe.height));
        this.node.setPosition(safe.center.x - visible.width / 2, safe.center.y - visible.height / 2);
    }
}
