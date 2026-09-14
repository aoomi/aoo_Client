import { EventTouch, Node } from 'cc';
import { ProtocolClient } from '../../../Common/Code/Runtime/network/ProtocolClient';
import { LegacyForm, LegacyFormManager } from '../../../Common/Code/Runtime/ui/LegacyFormManager';
import { NumpadHandle, NumpadService } from '../../../Common/Code/Runtime/ui/NumpadService';

export class LegacyJoinClubController {
    private readonly digits: number[] = [];
    private readonly disposers: Array<() => void> = [];
    private form: LegacyForm | null = null;
    private submitting = false;
    private submissionEpoch = 0;
    private numpad: NumpadHandle | null = null;
    private readonly numpadService = new NumpadService();

    public constructor(
        private readonly forms: LegacyFormManager,
        private readonly client: ProtocolClient,
    ) {}

    public install(): void {
        this.forms.register('ui/club/UIJoinClub', {
            zOrder: 8,
            lifecycle: {
                onCreate: (form) => this.bind(form),
                onShow: () => { this.submissionEpoch += 1; this.submitting = false; this.reset(); },
                onClose: () => { this.submissionEpoch += 1; this.submitting = false; },
                onDestroy: () => this.dispose(),
            },
        });
    }

    private bind(form: LegacyForm): void {
        this.form = form;
        this.blockInput(form.node);
        this.attachNumpad(form);
    }

    private reset(): void {
        this.digits.length = 0;
        this.render();
    }

    private render(): void { this.numpad?.refreshDigits(); }

    private async submit(): Promise<void> {
        if (this.submitting) return;
        this.submitting = true;
        const epoch = this.submissionEpoch;
        if (this.digits.length !== 6) {
            await this.forms.show('UIMessage_Drift', null, null, '未找到俱乐部ID,找会长或代理要ID号码');
            this.submitting = false;
            return;
        }
        const clubSign = Number(this.digits.join(''));
        try {
            const response = await this.client.request<{ joinStatus?: number }>('club.CClubJoin', { clubSign });
            if (epoch !== this.submissionEpoch || !this.form?.isShown()) return;
            const messages: Record<number, string> = {
                1: '未找到俱乐部ID,找会长或代理要ID号码',
                2: '加入失败,当前俱乐部已满',
                4: '加入失败,您已加入的俱乐部数量达到上限',
                8: '您已经在申请列表内,请等待审批',
                16: '加入俱乐部成功,等待审批',
                32: '您已是俱乐部成员!',
            };
            await this.forms.show('UIMessage_Drift', null, null,
                messages[Number(response?.joinStatus)] ?? '成功申请加入，请等待管理员审核');
            this.forms.close('ui/club/UIJoinClub');
        } catch {
            if (epoch !== this.submissionEpoch || !this.form?.isShown()) return;
            // The legacy UI maps a missing club to MSG_CLUB_JOIN_NotFind;
            // never expose the server's internal `error clubSign` text.
            await this.forms.show('UIMessage_Drift', null, null, '未找到俱乐部ID,找会长或代理要ID号码');
            this.reset();
        } finally {
            if (epoch === this.submissionEpoch) this.submitting = false;
        }
    }

    private blockInput(node: Node): void {
        const stop = (event: EventTouch): void => { event.propagationStopped = true; };
        for (const type of [Node.EventType.TOUCH_START, Node.EventType.TOUCH_MOVE,
            Node.EventType.TOUCH_END, Node.EventType.TOUCH_CANCEL]) node.on(type, stop);
        this.disposers.push(() => {
            if (!node.isValid) return;
            for (const type of [Node.EventType.TOUCH_START, Node.EventType.TOUCH_MOVE,
                Node.EventType.TOUCH_END, Node.EventType.TOUCH_CANCEL]) node.off(type, stop);
        });
    }

    private dispose(): void {
        for (const dispose of this.disposers.splice(0)) dispose();
        this.form = null;
        this.numpad?.dispose();
        this.numpad = null;
    }

    private attachNumpad(form: LegacyForm): void {
        this.numpad?.dispose();
        this.numpad = this.numpadService.attach(form.node, {
            close: () => this.forms.close('ui/club/UIJoinClub'),
            confirm: () => { void this.submit(); },
        }, { digitCount: 6, maxDigits: 6, value: () => this.digits.join(''), setValue: value => { this.digits.splice(0, this.digits.length, ...[...value].map(Number)); } }, { title: '加入俱乐部' });
    }
}
