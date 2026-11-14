import { _decorator, Animation, Component, isValid, tween, Tween, Vec3 } from 'cc';

const { ccclass, property, requireComponent } = _decorator;

/** Plays the continuous icon clip on a transform separate from button feedback. */
@ccclass('LobbyIconAccentAnimation')
@requireComponent(Animation)
export class LobbyIconAccentAnimation extends Component {
    @property({ min: 0, tooltip: 'Initial stagger in seconds.' })
    public firstDelay = 0;

    @property({ tooltip: 'Gently sway the icon while its clip controls breathing scale.' })
    public sway = false;

    private readonly restPosition = new Vec3();
    private readonly restScale = new Vec3();
    private readonly restEuler = new Vec3();
    private captured = false;
    private ownsPlayback = false;
    private animation: Animation | null = null;
    private swayTween: Tween<Vec3> | null = null;

    protected onLoad(): void {
        this.animation = this.getComponent(Animation);
        this.restPosition.set(this.node.position);
        this.restScale.set(this.node.scale);
        this.restEuler.set(this.node.eulerAngles);
        this.captured = true;
    }

    protected onEnable(): void {
        this.stopAndRestore();
        this.restore();
        this.ownsPlayback = true;
        if (this.firstDelay > 0) this.scheduleOnce(this.begin, this.firstDelay);
        else this.begin();
    }

    protected onDisable(): void { this.stopAndRestore(); }
    protected onDestroy(): void { this.stopAndRestore(); }

    private readonly begin = (): void => {
        this.playClip();
        if (this.sway && this.ownsPlayback && this.enabledInHierarchy) {
            const angles = this.node.eulerAngles.clone();
            this.swayTween = tween(angles)
                .to(1.2, new Vec3(angles.x, angles.y, angles.z + 5), { easing: 'sineInOut', onUpdate: () => this.node.setRotationFromEuler(angles) })
                .to(2.4, new Vec3(angles.x, angles.y, angles.z - 5), { easing: 'sineInOut', onUpdate: () => this.node.setRotationFromEuler(angles) })
                .to(1.2, new Vec3(angles.x, angles.y, angles.z), { easing: 'sineInOut', onUpdate: () => this.node.setRotationFromEuler(angles) })
                .union().repeatForever().start();
        }
    };

    private readonly playClip = (): void => {
        if (this.ownsPlayback && this.enabledInHierarchy && this.isLiveAnimation()) this.animation!.play();
    };

    private isLiveAnimation(): boolean {
        return isValid(this.animation, true) && isValid(this.node, true);
    }

    private stopAndRestore(): void {
        if (!this.ownsPlayback) return;
        this.ownsPlayback = false;
        this.unschedule(this.begin);
        this.unschedule(this.playClip);
        this.swayTween?.stop();
        this.swayTween = null;
        if (this.isLiveAnimation()) this.animation!.stop();
        this.restore();
    }

    private restore(): void {
        if (!this.captured || !isValid(this.node, true)) return;
        this.node.setPosition(this.restPosition);
        this.node.setScale(this.restScale);
        this.node.setRotationFromEuler(this.restEuler);
    }
}
