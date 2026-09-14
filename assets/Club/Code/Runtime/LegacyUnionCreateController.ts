import { Button, EditBox, Node, Toggle } from 'cc';
import { ProtocolClient } from '../../../Common/Code/Runtime/network/ProtocolClient';
import { LegacyForm, LegacyFormManager } from '../../../Common/Code/Runtime/ui/LegacyFormManager';
import { UNION_TOTAL_SCORE_ERROR, parseUnionTotalScore } from './UnionTotalScore';

export class LegacyUnionCreateController {
    private readonly path = 'ui/club/UIUnionCreate';
    private readonly disposers: Array<() => void> = [];
    private form: LegacyForm | null = null;
    private clubId = 0;
    private onCreated: ((club: Record<string, unknown>, union: Record<string, unknown>) => void | Promise<void>) | null = null;
    private submitting = false;

    public constructor(private readonly forms: LegacyFormManager, private readonly client: ProtocolClient) {}
    public install(): void { this.forms.register(this.path, { zOrder: 12, lifecycle: { onCreate: (form) => this.bind(form), onShow: (form, clubId) => this.show(form, clubId), onClose: () => { this.form = null; } }}); }
    public dispose(): void { for (const dispose of this.disposers.splice(0)) dispose(); }
    private bind(form: LegacyForm): void { this.click(form.node, 'btn_close', () => this.forms.close(this.path)); this.click(form.node, 'btn_create', () => { void this.create(); }); }
    private show(form: LegacyForm, value: unknown): void {
        this.form = form;
        const context = value && typeof value === 'object' ? value as {
            clubId?: number;
            onCreated?: (club: Record<string, unknown>, union: Record<string, unknown>) => void | Promise<void>;
        } : null;
        this.clubId = Number(context?.clubId ?? value ?? 0);
        this.onCreated = context?.onCreated ?? null;
        this.edit(form.node, 'unionNameEditBox', ''); this.edit(form.node, 'ClubCentEdit', '2000'); this.edit(form.node, 'outSportsEditBox', '0'); this.edit(form.node, 'prizeRankEditBox', '0'); this.edit(form.node, 'prizeValueEditBox', '0');
        for (const container of ['joinToggleContainer', 'quitToggleContainer', 'matchRateToggleContainer', 'prizeToggleContainer']) this.check(form.node, container, 1);
    }
    private async create(): Promise<void> {
        const root = this.form?.node; if (!root || this.submitting) return;
        const name = this.text(root, 'unionNameEditBox').trim();
        const totalScoreText = this.text(root, 'ClubCentEdit').trim(), outText = this.text(root, 'outSportsEditBox').trim();
        const rankText = this.text(root, 'prizeRankEditBox').trim(), valueText = this.text(root, 'prizeValueEditBox').trim();
        if (!name) return void this.tip('联盟名称不能为空');
        if (name.length > 16) return void this.tip('联盟名称不能超过16个字符');
        const unionTotalScore = parseUnionTotalScore(totalScoreText);
        if (unionTotalScore === null) return void this.tip(UNION_TOTAL_SCORE_ERROR);
        if (!this.unsignedNumber(outText)) return void this.tip('联盟淘汰必须是纯数字');
        if (Number(outText) > unionTotalScore) return void this.tip('联盟淘汰值不能大于联盟总分');
        if (!/^\d+$/.test(rankText) || Number(rankText) < 0 || Number(rankText) > 50) return void this.tip('奖励排名必须是大于0小于50的纯数字');
        if (!/^\d+$/.test(valueText) || Number(valueText) < 0) return void this.tip('奖励数量必须是大于0的纯数字');
        const matchRate = this.checked(root, 'matchRateToggleContainer', 1) ? 0 : this.checked(root, 'matchRateToggleContainer', 2) ? 1 : 2;
        const packet = { clubId: this.clubId, unionName: name, join: this.checked(root, 'joinToggleContainer', 1) ? 0 : 1, quit: this.checked(root, 'quitToggleContainer', 1) ? 0 : 1, unionTotalScore, matchRate, outSports: Number(outText), prizeType: this.checked(root, 'prizeToggleContainer', 1) ? 2 : 1, ranking: Number(rankText), value: Number(valueText) };
        this.submitting = true;
        try {
            const union = await this.client.request<Record<string, unknown>>('union.CUnionCreate', packet);
            const club = await this.client.request<Record<string, unknown>>('club.CGetClubListById', { clubId: this.clubId });
            if (Number(club.unionId ?? union.unionId ?? 0) <= 0) throw new Error('联盟未实际创建，请重试');
            this.forms.close(this.path);
            this.forms.close('ui/club/UIUnionNone');
            await this.onCreated?.(club, union);
            await this.tip('联盟创建成功');
        }
        catch (error) { await this.tip(error instanceof Error ? error.message : '创建联盟失败'); }
        finally { this.submitting = false; }
    }
    private unsignedNumber(value: string): boolean { return /^\d+(?:\.\d+)?$/.test(value) && Number.isFinite(Number(value)); }
    private checked(root: Node, containerName: string, index: number): boolean { const container = this.desc(root, containerName); return container ? this.desc(container, `toggle${index}`)?.getComponent(Toggle)?.isChecked === true : false; }
    private check(root: Node, containerName: string, index: number): void { const container = this.desc(root, containerName); if (!container) return; for (const child of container.children) { const toggle = child.getComponent(Toggle); if (toggle) toggle.isChecked = child.name === `toggle${index}`; } }
    private text(root: Node, name: string): string { return this.desc(root, name)?.getComponent(EditBox)?.string ?? ''; }
    private edit(root: Node, name: string, value: string): void { const edit = this.desc(root, name)?.getComponent(EditBox); if (edit) edit.string = value; }
    private click(root: Node, name: string, action: () => void): void { const node = this.desc(root, name); if (!node) return; const handler = () => action(); node.on(Button.EventType.CLICK, handler); this.disposers.push(() => node.off(Button.EventType.CLICK, handler)); }
    private desc(root: Node, name: string): Node | null { if (root.name === name) return root; for (const child of root.children) { const found = this.desc(child, name); if (found) return found; } return null; }
    private async tip(message: string): Promise<void> {
        await this.forms.show('UIMessage_Drift', null, null, message);
    }
}
