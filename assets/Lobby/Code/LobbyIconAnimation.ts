import { _decorator, Animation, Component, isValid, Vec3 } from 'cc';

const { ccclass, property, requireComponent } = _decorator;

/** Owns only a neutral animation transform. A separate parent preserves the authored position. */
@ccclass('LobbyIconAnimation')
@requireComponent(Animation)
export class LobbyIconAnimation extends Component {
    @property({ min: 0, tooltip: 'Seconds before playback; use half the clip duration for the paired image.' })
    public phaseDelay = 0;

    private readonly restPosition = new Vec3();
    private readonly restScale = new Vec3();
    private captured = false;
    private ownsPlayback = false;
    private animation: Animation | null = null;

    protected onLoad(): void {
        this.animation = this.getComponent(Animation);
        this.restPosition.set(this.node.position);
        this.restScale.set(this.node.scale);
        this.captured = true;
    }

    protected onEnable(): void {
        this.stopAndRestore();
        this.restore();
        this.ownsPlayback = true;
        if (this.phaseDelay > 0) {
            this.scheduleOnce(this.playClip, this.phaseDelay);
        } else {
            this.playClip();
        }
    }

    protected onDisable(): void {
        this.stopAndRestore();
    }

    protected onDestroy(): void {
        this.stopAndRestore();
    }

    private readonly playClip = (): void => {
        if (this.ownsPlayback && this.enabledInHierarchy && this.isLiveAnimation()) {
            this.animation!.play();
        }
    };

    private isLiveAnimation(): boolean {
        return isValid(this.animation, true) && isValid(this.node, true);
    }

    private stopAndRestore(): void {
        if (!this.ownsPlayback) return;
        this.ownsPlayback = false;
        this.unschedule(this.playClip);
        if (this.isLiveAnimation()) this.animation!.stop();
        this.restore();
    }

    private restore(): void {
        if (this.captured && isValid(this.node, true)) {
            this.node.setPosition(this.restPosition);
            this.node.setScale(this.restScale);
        }
    }
}
