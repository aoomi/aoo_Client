import { Button, EditBox, Label, Node, RichText } from 'cc';
import { ProtocolClient } from '../../../Common/Code/Runtime/network/ProtocolClient';
import { LegacyForm, LegacyFormManager } from '../../../Common/Code/Runtime/ui/LegacyFormManager';

export interface ClubCentContext {
    clubId?: number; unionId?: number; opClubId?: number; targetClubId?: number;
    pid?: number; name?: string; targetPL?: number; owerPL?: number; myisminister?: number;
    isUnion?: boolean; isPromoter?: boolean; skinType?: number; inputValue?: string;
    onChanged?: (changedValue: number, operatorChangedValue: number) => void;
}

interface UpdateResult { type?: number; value?: number; changedValue?: number; operatorChangedValue?: number }

export class LegacyClubCentController {
    private readonly disposers: Array<() => void> = [];
    private data: ClubCentContext = {};
    private activeSetPath = 'ui/club/UIUserSetPL';

    public constructor(private readonly forms: LegacyFormManager, private readonly client: ProtocolClient) {}

    public install(): void {
        for (const path of ['ui/club/UIUserSetPL', 'ui/club_2/UIUserSetPL_2']) this.forms.register(path, { zOrder: 11, lifecycle: {
            onCreate: (form) => this.bindSet(form, path), onShow: (form, value) => this.showSet(form, path, value),
        }});
        this.forms.register('ui/club/UIUserOutRace', { zOrder: 12, lifecycle: {
            onCreate: (form) => this.bindOut(form), onShow: (form, value) => this.showOut(form, value),
        }});
    }

    public dispose(): void { for (const dispose of this.disposers.splice(0)) dispose(); }

    private bindSet(form: LegacyForm, path: string): void {
        this.click(form.node, 'btn_close', () => this.forms.close(path));
        this.click(form.node, 'btn_help', () => { const help = this.desc(form.node, 'helpNode'); if (help) help.active = !help.active; });
        this.click(form.node, 'btn_Add', () => { void this.addPoint(form); });
        this.click(form.node, 'btn_Del', () => { void this.openOut(form); });
        this.click(form.node, 'btn_tuisai', () => { void this.clearAndExit(); });
    }

    private showSet(form: LegacyForm, path: string, value: unknown): void {
        this.data = this.context(value); this.activeSetPath = path;
        const manager = Number(this.data.myisminister ?? 0) > 0;
        this.rich(form.node, 'TargetClubCent', manager
            ? `授权${this.data.name ?? ''}（ID:${this.data.pid ?? ''}）可裁判的俱乐部积分`
            : `因异常修改${this.data.name ?? ''}（ID:${this.data.pid ?? ''}）的俱乐部积分`);
        this.label(form.node, 'CurrentClubCent', `该成员当前拥有俱乐部积分：${this.data.targetPL ?? 0}`);
        this.label(form.node, 'OwnerClubCent', `您当前可操作俱乐部积分：${this.data.owerPL ?? 0}`);
        this.label(this.desc(form.node, 'btn_Add') ?? form.node, 'lb_btnName', manager ? '增 加' : '补 偿');
        const edit = this.desc(form.node, 'ClubCentEdit')?.getComponent(EditBox); if (edit) edit.string = '';
        const help = this.desc(form.node, 'helpNode'); if (help) help.active = false;
    }

    private async addPoint(form: LegacyForm): Promise<void> {
        const value = this.number(form); if (value <= 0 || value > Number(this.data.owerPL ?? 0)) { await this.tip('请输入不大于可操作俱乐部积分的纯数字'); return; }
        await this.update(0, value, form);
    }

    private async openOut(form: LegacyForm): Promise<void> {
        const edit = this.desc(form.node, 'ClubCentEdit')?.getComponent(EditBox);
        await this.forms.show('ui/club/UIUserOutRace', { ...this.data, inputValue: edit?.string.trim() ?? '' });
        if (edit) edit.string = '';
    }

    private async clearAndExit(): Promise<void> {
        const target = Number(this.data.targetPL ?? 0); if (target === 0) { await this.tip('该成员俱乐部积分已为 0'); return; }
        await this.update(target > 0 ? 1 : 0, Math.abs(target));
    }

    private bindOut(form: LegacyForm): void {
        this.click(form.node, 'btn_close', () => this.forms.close('ui/club/UIUserOutRace'));
        this.click(form.node, 'btn_sure', () => { void this.commitOut(form); });
    }

    private showOut(form: LegacyForm, value: unknown): void {
        this.data = this.context(value);
        this.rich(form.node, 'TargetClubCent', `成员身上拥有${this.data.targetPL ?? 0}俱乐部积分，请清零成员竞技点后退赛`);
        const edit = this.desc(form.node, 'ClubCentEdit')?.getComponent(EditBox); if (edit) edit.string = this.data.inputValue ?? '';
    }

    private async commitOut(form: LegacyForm): Promise<void> {
        const value = this.number(form); const target = Number(this.data.targetPL ?? 0); const limit = target < 0 ? Number(this.data.owerPL ?? 0) : target;
        if (value <= 0 || value > Math.abs(limit)) { await this.tip('请输入不大于该成员俱乐部积分的纯数字'); return; }
        const result = await this.update(1, value); if (result) this.forms.close('ui/club/UIUserOutRace');
    }

    private async update(type: number, value: number, form?: LegacyForm): Promise<UpdateResult | null> {
        const protocol = this.data.isUnion && !this.data.isPromoter ? 'union.CUnionClubCentUpdate'
            : !this.data.isUnion && this.data.isPromoter ? 'club.CClubSubordinateLevelClubCentUpdate' : 'club.CClubCentUpdate';
        const packet: Record<string, unknown> = { clubId: Number(this.data.clubId ?? 0), opPid: Number(this.data.pid ?? 0), type, value };
        if (protocol.startsWith('union.')) { packet.unionId = Number(this.data.unionId ?? 0); packet.opClubId = Number(this.data.opClubId ?? this.data.clubId ?? 0); }
        if (protocol.includes('Subordinate')) packet.clubId = Number(this.data.targetClubId ?? this.data.clubId ?? 0);
        try {
            const result = await this.client.request<UpdateResult>(protocol, packet); const changed = Number(result.changedValue ?? 0);
            const operatorChanged = Number(result.operatorChangedValue ?? this.data.owerPL ?? 0);
            this.data.targetPL = changed; this.data.owerPL = operatorChanged;
            if (form) this.label(form.node, 'CurrentClubCent', `该成员当前拥有俱乐部积分：${changed}`);
            if (form) this.label(form.node, 'OwnerClubCent', `您当前可操作俱乐部积分：${operatorChanged}`);
            this.data.onChanged?.(changed, operatorChanged);
            await this.tip(Number(result.type ?? type) === 0 ? '成功设置俱乐部积分' : `成员退赛成功，已处理 ${result.value ?? value} 俱乐部积分`);
            return result;
        } catch (error: unknown) { await this.tip(error instanceof Error ? error.message : '设置俱乐部积分失败'); return null; }
    }

    private number(form: LegacyForm): number { const text = this.desc(form.node, 'ClubCentEdit')?.getComponent(EditBox)?.string.trim() ?? ''; return /^\d+(?:\.\d+)?$/.test(text) ? Number(text) : -1; }
    private context(value: unknown): ClubCentContext { return value && typeof value === 'object' ? value as ClubCentContext : {}; }
    private label(root: Node, name: string, value: string): void { const label = this.desc(root, name)?.getComponent(Label); if (label) label.string = value; }
    private rich(root: Node, name: string, value: string): void { const rich = this.desc(root, name)?.getComponent(RichText); if (rich) rich.string = value; else this.label(root, name, value); }
    private click(root: Node, name: string, action: () => void): void { const node = this.desc(root, name); if (!node) return; node.on(Button.EventType.CLICK, action); this.disposers.push(() => node.off(Button.EventType.CLICK, action)); }
    private desc(root: Node, name: string): Node | null { if (root.name === name) return root; for (const child of root.children) { const found = this.desc(child, name); if (found) return found; } return null; }
    private async tip(message: string): Promise<void> { await this.forms.show('UIMessage_Drift', null, null, message); }
}
