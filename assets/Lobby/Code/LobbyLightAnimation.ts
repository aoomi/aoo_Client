import { _decorator, Animation, Button, Component, isValid, Node, UIOpacity, Vec3 } from 'cc';
const { ccclass, property } = _decorator;

/** Clip parameters remain editable in Creator; this component owns only triggers and cleanup. */
@ccclass('LobbyLightAnimation')
export class LobbyLightAnimation extends Component {
    @property(Animation) public ambient: Animation | null = null;
    @property(Animation) public pressed: Animation | null = null;
    @property(Node) public button: Node | null = null;
    @property({ min: 0, tooltip: 'Initial offset in seconds.' }) public firstDelay = 0;
    @property({ min: 0, tooltip: '0: looping clip; otherwise seconds between starts (8–12).' }) public interval = 10;

    private readonly restPosition = new Vec3();
    private restOpacity = 0;
    private ownsPlayback = false;
    protected onLoad(): void {
        if (this.isLiveAnimation(this.ambient)) {
            this.restPosition.set(this.ambient.node.position);
            this.restOpacity = this.ambient.node.getComponent(UIOpacity)?.opacity ?? 0;
        }
    }
    protected onEnable(): void {
        this.stopAndRestore();
        this.ownsPlayback = true;
        if (isValid(this.button, true)) this.button.on(Node.EventType.TOUCH_START, this.onPress, this);
        this.scheduleOnce(this.begin, Math.max(0, this.firstDelay));
    }
    protected onDisable(): void { this.stopAndRestore(); }
    protected onDestroy(): void { this.stopAndRestore(); }

    private readonly begin = (): void => {
        if (!this.ownsPlayback || !this.enabledInHierarchy) return;
        this.playAmbient();
        if (this.ownsPlayback && this.enabledInHierarchy && this.interval > 0) this.schedule(this.playAmbient, Math.min(12, Math.max(8, this.interval)));
    };
    private readonly playAmbient = (): void => {
        if (this.ownsPlayback && this.enabledInHierarchy && this.isLiveAnimation(this.ambient)) this.ambient.play();
    };
    private readonly onPress = (): void => {
        if (this.ownsPlayback && this.enabledInHierarchy && isValid(this.button, true)
            && this.button.getComponent(Button)?.interactable && this.isLiveAnimation(this.pressed)) this.pressed.play();
    };
    private isLiveAnimation(animation: Animation | null): animation is Animation {
        return isValid(animation, true) && isValid(animation.node, true);
    }

    private stopAndRestore(): void {
        // Disable owns cleanup; destroy can follow after child animations are gone.
        if (!this.ownsPlayback) return;
        this.ownsPlayback = false;
        this.unschedule(this.begin);
        this.unschedule(this.playAmbient);
        if (isValid(this.button, true)) this.button.off(Node.EventType.TOUCH_START, this.onPress, this);
        const ambient = this.ambient;
        if (this.isLiveAnimation(ambient)) {
            ambient.stop();
            ambient.node.setPosition(this.restPosition);
            const opacity = ambient.node.getComponent(UIOpacity);
            if (opacity) opacity.opacity = this.restOpacity;
        }
        const pressed = this.pressed;
        if (this.isLiveAnimation(pressed)) {
            pressed.stop();
            const opacity = pressed.node.getComponent(UIOpacity);
            if (opacity) opacity.opacity = 0;
        }
    }
}
