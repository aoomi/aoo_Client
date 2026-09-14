import { Button, EditBox, Node } from 'cc';
import { ProtocolClient } from '../../../Common/Code/Runtime/network/ProtocolClient';
import { LegacyForm, LegacyFormManager } from '../../../Common/Code/Runtime/ui/LegacyFormManager';

interface ManagementContext {
    id?: number;
    clubId?: number;
    unionId?: number;
    minister?: number;
    myisminister?: number;
    diamondsAttentionMinister?: number;
    diamondsAttentionAll?: number;
    unionDiamondsAttentionMinister?: number;
    unionDiamondsAttentionAll?: number;
}
export class LegacyClubManagementController {
    private readonly disposers: Array<() => void> = [];
    private context: ManagementContext = {};
    private diamond: ManagementContext = {};

    public constructor(
        private readonly forms: LegacyFormManager,
        private readonly client: ProtocolClient,
        private readonly playerId: number,
    ) {}

    public install(): void {
        this.forms.register('ui/club/ClubManage', { zOrder: 9, lifecycle: {
            onCreate: (form) => this.bindManager(form), onShow: (form, context) => this.showManager(form, context),
        }});
        this.forms.register('ui/club/UIClubDiamond', { zOrder: 10, lifecycle: {
            onCreate: (form) => this.bindDiamond(form), onShow: (form, context) => this.showDiamond(form, context),
        }});
    }

    public dispose(): void { for (const dispose of this.disposers.splice(0)) dispose(); }

    private bindManager(form: LegacyForm): void {
        this.click(form.node, 'btn_close', () => this.forms.close('ui/club/ClubManage'));
        this.click(form.node, 'btn_outclub', () => { void this.confirmExit(); });
        this.click(form.node, 'btn_dissolveclub', () => {
            this.forms.close('ui/club/ClubManage');
            void this.confirmDissolveClub();
        });
        this.click(form.node, 'btn_diamond', () => {
            this.forms.close('ui/club/ClubManage');
            void this.forms.show('ui/club/UIClubDiamond', this.context);
        });
    }

    private showManager(form: LegacyForm, value: unknown): void {
        this.context = this.asContext(value);
        const minister = Number(this.context.minister ?? this.context.myisminister ?? 0);
        this.active(form.node, 'btn_outclub', minister !== 2);
        this.active(form.node, 'btn_dissolveclub', minister === 2);
        this.active(form.node, 'btn_diamond', minister === 2 && Number(this.context.unionId ?? 0) === 0);
    }

    private async confirmExit(): Promise<void> {
        const confirm = await this.forms.show('UIMessage', null, null, '确定退出当前俱乐部吗？');
        if (!confirm) return;
        const sure = this.desc(confirm.node, 'btnSure'); const cancel = this.desc(confirm.node, 'btnCancel');
        if (cancel) { cancel.active = true; cancel.once(Button.EventType.CLICK, () => this.forms.close('UIMessage')); }
        sure?.once(Button.EventType.CLICK, () => { this.forms.close('UIMessage'); void this.exitClub(); });
    }

    private async exitClub(): Promise<void> {
        const clubId = this.clubId(this.context);
        try {
            const gate = await this.client.request<{ type?: number }>('club.CClubKickOutNeedConfirm', { clubId, pid: this.playerId });
            if (Number(gate.type ?? 0) === 1) { await this.tip('您当前身上或保险箱有竞技点，无法申请退出'); return; }
            await this.client.request('club.CClubChangePlayerStatus', { clubId, status: 0x40, audit: false });
            this.closeClubForms(); await this.tip('已退出俱乐部');
        } catch (error: unknown) { await this.tip(this.error(error, '退出俱乐部失败')); }
    }

    private async confirmDissolveClub(): Promise<void> {
        const confirm = await this.forms.show('UIMessage', null, null, '确定解散当前俱乐部吗？');
        if (!confirm) return;
        const sure = this.desc(confirm.node, 'btnSure');
        const cancel = this.desc(confirm.node, 'btnCancel');
        if (cancel) { cancel.active = true; cancel.once(Button.EventType.CLICK, () => this.forms.close('UIMessage')); }
        sure?.once(Button.EventType.CLICK, () => { this.forms.close('UIMessage'); void this.dissolveClub(); });
    }

    private async dissolveClub(): Promise<void> {
        const clubId = this.clubId(this.context);
        try {
            await this.client.request('club.CClubClose', { clubId });
            this.closeClubForms();
            await this.tip('俱乐部已解散');
        } catch (error: unknown) { await this.tip(this.error(error, '俱乐部解散失败')); }
    }

    private bindDiamond(form: LegacyForm): void {
        this.click(form.node, 'HeaderClose', () => this.forms.close('ui/club/UIClubDiamond'));
        this.click(form.node, 'Cancel', () => this.forms.close('ui/club/UIClubDiamond'));
        this.click(form.node, 'Confirm', () => { void this.commitDiamond(form); });
    }

    private showDiamond(form: LegacyForm, value: unknown): void {
        this.diamond = this.asContext(value);
        const isUnion = Number(this.diamond.unionId ?? 0) > 0;
        this.edit(form.node, 'AdminLimit', isUnion
            ? this.diamond.unionDiamondsAttentionMinister
            : this.diamond.diamondsAttentionMinister);
        this.edit(form.node, 'MemberLimit', isUnion
            ? this.diamond.unionDiamondsAttentionAll
            : this.diamond.diamondsAttentionAll);
    }

    private async commitDiamond(form: LegacyForm): Promise<void> {
        const adminLimit = this.number(form.node, 'AdminLimit');
        const memberLimit = this.number(form.node, 'MemberLimit');
        const clubId = this.clubId(this.diamond);
        const unionId = Number(this.diamond.unionId ?? 0);
        try {
            if (unionId > 0) {
                await this.client.request('union.CUnionChangeDimondsAttention', {
                    clubId, unionId,
                    unionDiamondsAttentionMinister: adminLimit,
                    unionDiamondsAttentionAll: memberLimit,
                });
            } else {
                const changed = await this.client.request<ManagementContext>('club.CClubChangeDiamondsAttention', {
                    clubId,
                    diamondsAttentionMinister: adminLimit,
                    diamondsAttentionAll: memberLimit,
                });
                Object.assign(this.diamond, changed);
                Object.assign(this.context, changed);
            }
            this.forms.close('ui/club/UIClubDiamond');
            await this.tip('钻石提醒设置成功');
        } catch (error: unknown) {
            await this.tip(this.error(error, '钻石提醒设置失败'));
        }
    }

    private closeClubForms(): void {
        this.forms.close('ui/club/ClubManage');
        for (const path of ['ui/club/ClubMain', 'ui/club_1/UIClubMain_1', 'ui/club_2/UIClubMain_2']) this.forms.close(path);
    }
    private clubId(value: ManagementContext): number { return Number(value.id ?? value.clubId ?? 0); }
    private asContext(value: unknown): ManagementContext { return value && typeof value === 'object' ? value as ManagementContext : {}; }
    private active(root: Node, name: string, active: boolean): void { const node = this.desc(root, name); if (node) node.active = active; }
    private edit(root: Node, name: string, value: unknown): void { const edit = this.desc(root, name)?.getComponent(EditBox); if (edit) edit.string = String(value ?? 0); }
    private number(root: Node, name: string): number { const value = Number(this.desc(root, name)?.getComponent(EditBox)?.string ?? 0); return Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0; }
    private click(root: Node, name: string, listener: () => void): void { const node = this.desc(root, name); if (!node) return; node.on(Button.EventType.CLICK, listener); this.disposers.push(() => node.off(Button.EventType.CLICK, listener)); }
    private desc(root: Node, name: string): Node | null { if (root.name === name) return root; for (const child of root.children) { const found = this.desc(child, name); if (found) return found; } return null; }
    private error(error: unknown, fallback: string): string { return error instanceof Error ? error.message : fallback; }
    private async tip(message: string): Promise<void> { await this.forms.show('UIMessage_Drift', null, null, message); }
}
