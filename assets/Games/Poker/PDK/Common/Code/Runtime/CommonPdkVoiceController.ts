import { Label, Node } from 'cc';
import type { LegacyForm, LegacyFormManager } from '../../../../../../Common/Code/Runtime/ui/LegacyFormManager';
import type { CommonPdkSocialController } from './CommonPdkSocialController';

/** Owns the shared recording panel lifecycle; media transport remains in the social controller. */
export class CommonPdkVoiceController {
    public static readonly formKey = 'room/VoiceRecordingPanel';
    private generation = 0;
    private root: Node | null = null;
    private animationTimer = 0;
    private recordingStartedAt = 0;

    public constructor(
        private readonly forms: LegacyFormManager,
        private readonly social: CommonPdkSocialController,
    ) {}

    public onCreate(form: LegacyForm): void {
        this.root = form.node;
        form.node.on(Node.EventType.TOUCH_END, this.finishRecording, this);
        form.node.on(Node.EventType.TOUCH_CANCEL, this.cancel, this);
        form.node.on(Node.EventType.MOUSE_UP, this.finishRecording, this);
    }

    public onShow(form?: LegacyForm): void {
        if (form) this.root = form.node;
        const generation = ++this.generation;
        this.startRecordingAnimation();
        void this.social.recordAndSendVoice().finally(() => {
            if (generation === this.generation) {
                this.stopRecordingAnimation();
                this.forms.close(CommonPdkVoiceController.formKey);
            }
        });
    }

    public destroy(): void {
        this.generation += 1;
        this.stopRecordingAnimation();
        this.social.cancelVoiceRecording();
        this.root = null;
    }

    public finishRecording(): void {
        this.social.finishVoiceRecording();
    }

    private cancel(): void {
        this.generation += 1;
        this.stopRecordingAnimation();
        this.social.cancelVoiceRecording();
        this.forms.close(CommonPdkVoiceController.formKey);
    }

    private startRecordingAnimation(): void {
        this.stopRecordingAnimation();
        this.recordingStartedAt = Date.now();
        let frame = 0;
        const render = (): void => {
            frame = (frame % 4) + 1;
            for (let index = 1; index <= 4; index += 1) {
                const level = this.root?.getChildByName(`VoiceLevel0${index}`);
                if (level) level.active = index === frame;
            }
            const label = this.root?.getChildByName('DurationLabel')?.getComponent(Label);
            if (label) label.string = `${Math.floor((Date.now() - this.recordingStartedAt) / 1000)}秒`;
        };
        render();
        this.animationTimer = globalThis.setInterval(render, 180) as unknown as number;
    }

    private stopRecordingAnimation(): void {
        if (this.animationTimer) globalThis.clearInterval(this.animationTimer);
        this.animationTimer = 0;
    }
}
