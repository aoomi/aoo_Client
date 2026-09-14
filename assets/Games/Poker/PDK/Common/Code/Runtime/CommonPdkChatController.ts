import { Button, EditBox, Node, Tween, Vec3, tween, view } from 'cc';
import type { LegacyForm, LegacyFormManager } from '../../../../../../Common/Code/Runtime/ui/LegacyFormManager';
import type { CommonPdkRuntime } from './CommonPdkRuntime';
import type { CommonPdkSocialController } from './CommonPdkSocialController';

/** Shared room-chat binding and right-edge panel transition. */
export class CommonPdkChatController {
    public static readonly formKey = 'room/ChatPanel';
    private static readonly transitionSeconds = 0.16;
    private form: LegacyForm | null = null;
    private readonly shownPositions = new Map<Node, Vec3>();
    private closing = false;
    private acceptBackdropAfter = 0;

    public constructor(
        private readonly runtime: CommonPdkRuntime,
        private readonly forms: LegacyFormManager,
        private readonly showMessage: (message: string) => void,
        private readonly social?: CommonPdkSocialController,
    ) {}

    public onCreate(form: LegacyForm): void {
        this.form = form;
        form.node.on(Button.EventType.CLICK, this.onBackdropClick, this);
        form.find('CloseButton')?.on(Button.EventType.CLICK, this.close, this);
        form.find('Popup/SendButton')?.on(Button.EventType.CLICK, this.sendInput, this);
        for (let index = 1; index <= 20; index += 1) {
            const name = `Emoji${String(index).padStart(2, '0')}`;
            form.find(`EmojiGrid/${name}`)?.on(Button.EventType.CLICK, () => this.sendEmoji(index), this);
        }
        for (let index = 1; index <= 7; index += 1) {
            const name = `QuickText${String(index).padStart(2, '0')}`;
            form.find(`QuickTextPanel/Viewport/QuickTextList/${name}`)?.on(Button.EventType.CLICK, () => this.sendQuickText(index), this);
        }
    }

    public onShow(form: LegacyForm): void {
        this.form = form;
        this.closing = false;
        // The full-screen backdrop can be mounted before the touch that opened
        // the panel finishes bubbling. Ignore that same gesture so opening the
        // chat never immediately closes and destroys its native prefab.
        this.acceptBackdropAfter = Date.now() + CommonPdkChatController.transitionSeconds * 1_000;
        for (const node of this.animatedNodes(form)) {
            Tween.stopAllByTarget(node);
            const shown = this.shownPositions.get(node) ?? node.position.clone();
            this.shownPositions.set(node, shown);
            node.setPosition(this.hiddenPosition(shown));
            tween(node)
                .to(CommonPdkChatController.transitionSeconds, { position: shown }, { easing: 'sineOut' })
                .start();
        }
    }

    public destroy(): void {
        for (const node of this.shownPositions.keys()) {
            if (node.isValid) Tween.stopAllByTarget(node);
        }
        this.form = null;
        this.closing = false;
        this.shownPositions.clear();
    }

    private sendQuickText(quickId: number): void {
        const request = this.social?.sendQuickText(quickId) ?? this.runtime.action('chat', 'common.room.dispatch', {
            command: 'quick_text', roomId: Number(this.runtime.getRoomManager().GetEnterRoomID()),
            seatId: Number(this.runtime.getRoomPosManager().GetClientPos()), quickId,
        });
        this.finishSend(request);
    }

    private sendEmoji(emojiId: number): void {
        this.finishSend(this.social?.sendEmoji(emojiId) ?? Promise.reject(new Error('表情功能未就绪')));
    }

    private sendInput = (): void => {
        const input = this.form?.find('Popup/MessageComposer/MessageInput')?.getComponent(EditBox);
        const text = String(input?.string ?? '').trim();
        if (!text) {
            this.showMessage('请先输入聊天内容');
            return;
        }
        const request = this.social?.sendChatText(text) ?? Promise.reject(new Error('聊天功能未就绪'));
        if (input) input.string = '';
        this.finishSend(request);
    };

    private finishSend(request: Promise<unknown>): void {
        this.close();
        void request.catch((error: unknown) => {
            this.showMessage(error instanceof Error ? error.message : '聊天发送失败，请重试');
        });
    }

    private onBackdropClick = (event: unknown): void => {
        if (Date.now() < this.acceptBackdropAfter) return;
        if ((event as { target?: Node } | null)?.target === this.form?.node) this.close();
    };

    private close = (): void => {
        const form = this.form;
        if (!form?.node.isValid || this.closing) return;
        this.closing = true;
        const nodes = this.animatedNodes(form);
        nodes.forEach((node, index) => {
            Tween.stopAllByTarget(node);
            const shown = this.shownPositions.get(node) ?? node.position.clone();
            const transition = tween(node)
                .to(CommonPdkChatController.transitionSeconds, { position: this.hiddenPosition(shown) }, { easing: 'sineIn' });
            if (index === nodes.length - 1) {
                transition.call(() => this.forms.close(CommonPdkChatController.formKey));
            }
            transition.start();
        });
    };

    private animatedNodes(form: LegacyForm): Node[] {
        return ['Popup', 'EmojiGrid', 'QuickTextPanel']
            .map(path => form.find(path))
            .filter((node): node is Node => Boolean(node?.isValid));
    }

    private hiddenPosition(shown: Readonly<Vec3>): Vec3 {
        return new Vec3(shown.x + Math.max(1280, view.getVisibleSize().width), shown.y, shown.z);
    }
}
