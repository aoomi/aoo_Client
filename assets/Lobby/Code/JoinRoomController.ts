import { Button } from 'cc';
import { LegacyForm, LegacyFormManager } from '../../Common/Code/Runtime/ui/LegacyFormManager';
import { HallRoomGateway, HallRoomHandoff } from './HallRoomGateway';
import { NumpadHandle, NumpadService } from '../../Common/Code/Runtime/ui/NumpadService';
import { ProductionApiError } from '../../Common/Code/Runtime/Activity/ProductionApiClient';

const FORM_PATH = 'common/Numpad';
const ROOM_KEY_DIGITS = 6;

/** 公共 Numpad 是加入房间唯一界面；本控制器只维护房号和权威 Hall join 生命周期。 */
export class JoinRoomController {
    private readonly digits: number[] = [];
    private readonly numpadService = new NumpadService();
    private form: LegacyForm | null = null;
    private numpad: NumpadHandle | null = null;
    private confirmButton: Button | null = null;
    private resolving = false;
    private epoch = 0;

    public constructor(
        private readonly forms: LegacyFormManager,
        private readonly gateway: HallRoomGateway,
        private readonly onResolved?: (handoff: HallRoomHandoff) => void,
    ) {}

    public install(): void {
        this.forms.register(FORM_PATH, {
            zOrder: 8,
            showFromCenter: true,
            lifecycle: {
                onCreate: form => this.bind(form),
                onShow: () => { this.epoch += 1; this.resolving = false; this.reset(); },
                onClose: () => { this.epoch += 1; this.resolving = false; },
                onDestroy: () => this.dispose(),
            },
        });
    }

    public cancelPending(): void {
        this.epoch += 1;
        this.resolving = false;
        this.reset();
    }

    public destroy(): void {
        this.dispose();
    }

    private bind(form: LegacyForm): void {
        this.form = form;
        this.confirmButton = form.find('Keypad/Btn_Confirm')?.getComponent(Button) ?? null;
        this.numpad = this.numpadService.attach(form.node, {
            close: () => this.forms.close(FORM_PATH),
            confirm: () => { void this.resolveRoom(); },
        }, {
            digitCount: ROOM_KEY_DIGITS,
            maxDigits: ROOM_KEY_DIGITS,
            value: () => this.digits.join(''),
            setValue: value => { this.digits.splice(0, this.digits.length, ...[...value].map(Number)); },
        }, { title: '加入房间' });
    }

    private reset(): void {
        this.digits.length = 0;
        this.numpad?.refreshDigits();
        if (this.confirmButton?.isValid) this.confirmButton.interactable = true;
    }

    private async resolveRoom(): Promise<void> {
        if (this.resolving) return;
        const roomKey = this.digits.join('');
        if (!/^\d{6}$/.test(roomKey)) {
            await this.forms.show('UIMessage_Drift', null, null, '请输入6位纯数字房间号');
            return;
        }
        this.resolving = true;
        if (this.confirmButton) this.confirmButton.interactable = false;
        const epoch = this.epoch;
        try {
            const handoff = await this.gateway.join(Number(roomKey));
            if (epoch !== this.epoch || !this.form) return;
            this.resolving = false;
            if (this.confirmButton?.isValid) this.confirmButton.interactable = true;
            this.form.node.emit('authoritative-join-room-resolved', handoff);
            this.onResolved?.(handoff);
        } catch (error: unknown) {
            if (epoch !== this.epoch || !this.form) return;
            await this.forms.show('UIMessage_Drift', null, null,
                this.joinFailureMessage(error));
        } finally {
            if (epoch === this.epoch) {
                this.resolving = false;
                if (this.confirmButton?.isValid) this.confirmButton.interactable = true;
            }
        }
    }

    private joinFailureMessage(error: unknown): string {
        if (!(error instanceof ProductionApiError)) return error instanceof Error ? error.message : '房间不存在或已解散';
        switch (error.code) {
            case 'HALL_ROOM_FULL': return '房间人数已满';
            case 'HALL_ALREADY_IN_ANOTHER_ROOM': {
                const activeRoomId = error.message.match(/\b(\d{6})\b/)?.[1];
                return activeRoomId
                    ? `活动房间 ${activeRoomId}，请先返回`
                    : '已在其他活动房间，请先返回';
            }
            case 'HALL_ROOM_ENDED': return '房间已结束或已解散';
            case 'HALL_ROOM_JOIN_REJECTED': return error.message || '不满足该房间的加入条件';
            case 'HALL_NOT_FOUND': return '房间不存在或已解散';
            default: return error.message || '加入房间失败，请稍后重试';
        }
    }

    private dispose(): void {
        this.epoch += 1;
        this.resolving = false;
        this.confirmButton = null;
        this.form = null;
        this.numpad?.dispose();
        this.numpad = null;
    }
}
