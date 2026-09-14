import { ProtocolClient } from '../../../Common/Code/Runtime/network/ProtocolClient';
import { LegacyForm, LegacyFormManager } from '../../../Common/Code/Runtime/ui/LegacyFormManager';
import { NumpadHandle, NumpadService } from '../../../Common/Code/Runtime/ui/NumpadService';

export class LegacyJoinUnionController {
    private readonly path = 'ui/club/UIJoinUnion';
    private form: LegacyForm | null = null;
    private clubId = 0;
    private digits: string[] = [];
    private submitting = false;
    private numpad: NumpadHandle | null = null;
    private readonly numpadService = new NumpadService();

    public constructor(private readonly forms: LegacyFormManager, private readonly client: ProtocolClient) {}
    public install(): void { this.forms.register(this.path, { zOrder: 12, lifecycle: { onCreate: (form) => this.bind(form), onShow: (form, clubId) => this.show(form, clubId), onClose: () => { this.form = null; }, onDestroy: () => this.dispose() }}); }
    public dispose(): void { this.numpad?.dispose(); this.numpad = null; }

    private bind(form: LegacyForm): void {
        this.attachNumpad(form);
    }
    private show(form: LegacyForm, clubId: unknown): void { this.form = form; this.clubId = Number(clubId ?? 0); this.reset(); }
    private reset(): void { this.digits = []; this.render(); }
    private render(): void { this.numpad?.refreshDigits(); }
    private async join(): Promise<void> {
        if (this.submitting) return;
        if (this.digits.length !== 6) { await this.tip('未找到该联盟'); return; }
        this.submitting = true;
        try {
            const result = await this.client.request<number>('union.CUnionJoin', { clubId: this.clubId, unionSign: Number(this.digits.join('')) });
            // Remove the interactive numpad before presenting the result. Keeping it
            // underneath Message lets the confirm pointer continue into a second join.
            this.forms.close(this.path);
            if (Number(result) === 1) await this.tip('申请加入成功');
            else { this.forms.close('ui/club/UIUnionNone'); await this.tip('加入成功'); }
        } catch (error) { await this.tip(error instanceof Error ? error.message : '加入失败'); } finally { this.submitting = false; }
    }
    private async tip(message: string): Promise<void> { try { await this.forms.show('UIMessageTip', message); } catch { console.warn(message); } }

    private attachNumpad(form: LegacyForm): void {
        this.numpad?.dispose();
        this.numpad = this.numpadService.attach(form.node, {
            close: () => this.forms.close(this.path), confirm: () => { void this.join(); },
        }, { digitCount: 6, maxDigits: 6, value: () => this.digits.join(''), setValue: value => { this.digits = [...value]; } }, { title: '加入联盟' });
    }
}
