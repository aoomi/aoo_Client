import { Button, Label, Node } from 'cc';
import type { ProtocolClient } from '../../../Common/Code/Runtime/network/ProtocolClient';
import type { LegacyForm, LegacyFormManager } from '../../../Common/Code/Runtime/ui/LegacyFormManager';
import { NumpadHandle, NumpadService } from '../../../Common/Code/Runtime/ui/NumpadService';

export interface LegacyReplayTarget { type: 'LEGACY_11'; gameName: string; playBackCode: string; }
export interface ShortReplayTarget { type: 'SHORT'; replayCode: string; roomId: string; setId: string; }
export type ReplayCodeTarget = LegacyReplayTarget | ShortReplayTarget;
interface ReplayCodeResolution { type: 'SHORT' | 'LEGACY_11'; replayCode: string; roomId: number; setId: number; legacyGameType?: number; }

export class ReplayCodeController {
    private form: LegacyForm | null = null;
    private digits: number[] = [];
    private readonly disposers: Array<() => void> = [];
    private submitting = false;
    private epoch = 0;
    private numpad: NumpadHandle | null = null;
    private readonly numpadService = new NumpadService();

    public constructor(
        private readonly forms: LegacyFormManager,
        private readonly client: ProtocolClient,
        private readonly resolveReplayCode: (value: string) => Promise<ReplayCodeResolution>,
        private readonly openReplay: (target: ReplayCodeTarget) => void,
    ) {}

    public install(): void {
        this.forms.register('UIReplayCode', {
            zOrder: 100,
            lifecycle: {
                onCreate: (form) => this.bind(form),
                onShow: () => { this.epoch += 1; this.submitting = false; this.digits = []; this.render(); },
                onClose: () => { this.epoch += 1; this.submitting = false; },
                onDestroy: () => this.dispose(),
            },
        });
    }

    private bind(form: LegacyForm): void {
        this.form = form;
        void this.attachNumpad(form);
        const paste = (event: Event): void => {
            if (!this.form?.isShown()) return;
            const text = (event as ClipboardEvent).clipboardData?.getData('text')?.trim() ?? '';
            if (!/^\d{1,11}$/.test(text)) return;
            event.preventDefault(); this.digits = [...text].map(Number); this.render();
        };
        globalThis.addEventListener?.('paste', paste);
        this.disposers.push(() => globalThis.removeEventListener?.('paste', paste));
        this.onClick(form.find('btn_close'), () => this.forms.close('UIReplayCode'));
        this.onClick(form.find('btn_bg'), () => this.forms.close('UIReplayCode'));
        this.onClick(form.find('btn_chakan'), () => { void this.submit(); });
    }

    private render(): void {
        for (let index = 0; index < 11; index += 1) {
            const label = this.form?.find(`sp_shuru/shurukuang/sp_bg${index + 1}/lb_num`)?.getComponent(Label);
            if (label) label.string = index < this.digits.length ? String(this.digits[index]) : '';
        }
        this.numpad?.refreshDigits();
    }

    private async submit(): Promise<void> {
        if (this.submitting) return;
        this.submitting = true;
        const epoch = this.epoch;
        const playBackCode = this.digits.join('');
        try {
            if (!/^(?:\d{6}|\d{7}|\d{8}|\d{11})$/.test(playBackCode)) throw new Error('回放码须为6、7、8或11位纯数字');
            const resolution = await this.resolveReplayCode(playBackCode);
            if (epoch !== this.epoch || !this.form) return;
            if (resolution.type === 'SHORT') {
                this.forms.close('UIReplayCode');
                this.openReplay({ type: 'SHORT', replayCode: resolution.replayCode,
                    roomId: String(resolution.roomId), setId: String(resolution.setId) });
                return;
            }
            if (resolution.type !== 'LEGACY_11') throw new Error('回放服务返回了未知类型');
            const response = await this.client.request<{ Name?: string }>('game.CPlayerPlayBack', { playBackCode, chekcPlayBackCode: true });
            if (epoch !== this.epoch || !this.form) return;
            const gameName = String(response.Name ?? '').toLowerCase();
            if (!gameName) throw new Error('回放记录不存在');
            this.forms.close('UIReplayCode');
            this.openReplay({ type: 'LEGACY_11', gameName, playBackCode });
        } catch (error: unknown) {
            if (epoch !== this.epoch || !this.form) return;
            await this.forms.show('UIMessage_Drift', null, null,
                error instanceof Error ? error.message : '回放记录不存在');
        } finally {
            if (epoch === this.epoch) this.submitting = false;
        }
    }

    private onClick(node: Node | null, listener: () => void): void {
        if (!node) return;
        node.on(Button.EventType.CLICK, listener);
        this.disposers.push(() => { if (node.isValid) node.off(Button.EventType.CLICK, listener); });
    }

    private dispose(): void {
        this.epoch += 1;
        this.submitting = false;
        for (const dispose of this.disposers.splice(0)) dispose();
        this.form = null;
        this.numpad?.dispose();
        this.numpad = null;
    }

    private async attachNumpad(form: LegacyForm): Promise<void> {
        this.numpad?.dispose();
        const callbacks = {
            close: () => this.forms.close('UIReplayCode'),
            confirm: () => { void this.submit(); },
        };
        const display = { digitCount: 11, maxDigits: 11, value: () => this.digits.join(''), setValue: (value: string) => { this.digits = [...value].map(Number); this.render(); } };
        const title = { title: () => this.form?.find('btn_chakan')?.getComponentInChildren(Label)?.string.trim() || '回放码' };
        if (form.node.getChildByName('Panel') && form.node.getChildByName('Keypad')) {
            this.numpad = this.numpadService.attach(form.node, callbacks, display, title);
            return;
        }
        const legacyKeyboard = form.find('sp_shuru/sp_num');
        if (legacyKeyboard) legacyKeyboard.active = false;
        this.numpad = await this.numpadService.open(form.node, () => this.forms.loadCommonNumpad(), callbacks, display, title);
    }
}
