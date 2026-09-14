import { Button, EditBox, Label, Node } from 'cc';
import { ProtocolClient } from '../../../Common/Code/Runtime/network/ProtocolClient';
import { LegacyForm, LegacyFormManager } from '../../../Common/Code/Runtime/ui/LegacyFormManager';

interface InviteContext { id?: number; clubId?: number; unionId?: number }
interface ClubInfo { clubName?: string; createName?: string }

export class LegacyUnionInviteController {
    private form: LegacyForm | null = null;
    private context: InviteContext = {};
    private clubSign = '';
    private readonly disposers: Array<() => void> = [];

    public constructor(private readonly forms: LegacyFormManager, private readonly client: ProtocolClient) {}
    public install(): void { this.forms.register('ui/club/UIUnionYaoQing', { zOrder: 12, lifecycle: { onCreate: (form) => this.bind(form), onShow: (form, value) => this.show(form, value), onClose: () => { this.form = null; } }}); }
    public dispose(): void { for (const dispose of this.disposers.splice(0)) dispose(); }

    private bind(form: LegacyForm): void {
        this.click(form.node, 'btn_close', () => this.forms.close('ui/club/UIUnionYaoQing'));
        this.click(form.node, 'btn_search', () => { void this.search(); });
        this.click(form.node, 'btn_yaoqing', () => { void this.invite(); });
    }

    private show(form: LegacyForm, value: unknown): void {
        this.form = form;
        this.context = value && typeof value === 'object' ? value as InviteContext : {};
        this.clubSign = '';
        const edit = this.desc(form.node, 'EditBox')?.getComponent(EditBox);
        if (edit) edit.string = '';
        this.label(form.node, 'lb_tip', '');
        this.label(form.node, 'lb_clubName', '');
        this.label(form.node, 'lb_clubCreatorName', '');
        this.active(form.node, 'btn_yaoqing', false);
    }

    private async search(): Promise<void> {
        const form = this.form;
        if (!form) return;
        const value = this.desc(form.node, 'EditBox')?.getComponent(EditBox)?.string.trim() ?? '';
        if (!/^\d+$/.test(value)) { await this.tip('请输入纯数字的俱乐部ID'); return; }
        this.clubSign = value;
        try {
            const info = await this.client.request<ClubInfo>('union.CUnionFindClubSignInfo', { clubId: Number(this.context.id ?? this.context.clubId ?? 0), unionId: Number(this.context.unionId ?? 0), clubSign: value });
            this.label(form.node, 'lb_clubName', `俱乐部名字：${info.clubName ?? ''}`);
            this.label(form.node, 'lb_clubCreatorName', `圈主名字：${info.createName ?? ''}`);
            this.label(form.node, 'lb_tip', '可以邀请该俱乐部加入联盟');
            this.active(form.node, 'btn_yaoqing', true);
        } catch (error) {
            this.active(form.node, 'btn_yaoqing', false);
            this.label(form.node, 'lb_clubName', '');
            this.label(form.node, 'lb_clubCreatorName', '');
            await this.tip(error instanceof Error ? error.message : '未查找到该俱乐部');
        }
    }

    private async invite(): Promise<void> {
        if (!this.clubSign) return;
        try {
            await this.client.request('union.CUnionFindClubSignAdd', { clubId: Number(this.context.id ?? this.context.clubId ?? 0), unionId: Number(this.context.unionId ?? 0), clubSign: this.clubSign });
            if (this.form?.node.isValid) this.active(this.form.node, 'btn_yaoqing', false);
            await this.tip('已成功发送邀请信息');
        } catch (error) { await this.tip(error instanceof Error ? error.message : '该俱乐部已有联盟'); }
    }

    private click(root: Node, name: string, action: () => void): void { const node = this.desc(root, name); if (!node) return; const handler = () => action(); node.on(Button.EventType.CLICK, handler); this.disposers.push(() => node.off(Button.EventType.CLICK, handler)); }
    private desc(root: Node, name: string): Node | null { if (root.name === name) return root; for (const child of root.children) { const found = this.desc(child, name); if (found) return found; } return null; }
    private label(root: Node, name: string, value: string): void { const label = this.desc(root, name)?.getComponent(Label); if (label) label.string = value; }
    private active(root: Node, name: string, value: boolean): void { const node = this.desc(root, name); if (node) node.active = value; }
    private async tip(message: string): Promise<void> { await this.forms.show('ui/UIMessage', message); }
}
