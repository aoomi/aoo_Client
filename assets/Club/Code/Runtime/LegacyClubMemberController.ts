import { Button, EditBox, Label, Layout, Node, ScrollView, Toggle, UITransform, instantiate } from 'cc';
import { ProtocolClient } from '../../../Common/Code/Runtime/network/ProtocolClient';
import { LegacyForm, LegacyFormManager } from '../../../Common/Code/Runtime/ui/LegacyFormManager';
import { adaptClubMemberLandscape } from './LegacyClubLandscapeAdapter';

interface MemberContext {
    id?: number; clubId?: number; unionId?: number; minister?: number;
    unionPostType?: number; levelPromotion?: number; unionName?: string; unionSign?: number; skinType?: number;
}
interface MemberRow {
    status?: number; minister?: number; playerClubCard?: number; clubCent?: number;
    isBanGame?: boolean; isPromotionManage?: boolean;
    shortPlayer?: { pid?: number; name?: string };
    upShortPlayer?: { pid?: number; name?: string };
}

export class LegacyClubMemberController {
    private readonly disposers: Array<() => void> = [];
    private readonly rowDisposers: Array<() => void> = [];
    private form: LegacyForm | null = null;
    private context: MemberContext = {};
    private page = 1;

    private remarkPlayer: { pid?: number; name?: string; onChanged?: (remarkName: string) => void } = {};

    public constructor(
        private readonly forms: LegacyFormManager,
        private readonly client: ProtocolClient,
        private readonly playerId: number,
    ) {}

    public install(): void {
        this.forms.register('ui/club/ClubMembers', {
            zOrder: 9,
            lifecycle: {
                onCreate: (form) => this.bind(form),
                onShow: (form, context) => this.show(form, context),
                onClose: () => { this.form = null; this.clearRows(); },
            },
        });
        this.forms.register('UILobbyRemark', {
            zOrder: 11,
            lifecycle: {
                onCreate: (form) => this.bindRemark(form),
                onShow: (form, player) => this.showRemark(form, player),
            },
        });
        for (const event of ['SClub_PlayerNtf', 'OnClubPlayerNtf', 'SUnion_ClubCent']) {
            this.disposers.push(this.client.on(event, () => { if (this.form) void this.load(true); }));
        }
    }

    public dispose(): void {
        this.clearRows();
        for (const dispose of this.disposers.splice(0)) dispose();
        this.form = null;
    }

    private bind(form: LegacyForm): void {
        adaptClubMemberLandscape(form.node);
        this.click(form.find('btn_close') ?? form.find('bottom/btn_close'), () => this.forms.close('ui/club/ClubMembers'));
        this.click(form.find('bottom/btn_search'), () => { this.page = 1; void this.load(true); });
        this.click(form.find('bottom/btn_next'), () => { this.page += 1; void this.load(true); });
        this.click(form.find('bottom/btn_last'), () => { if (this.page > 1) { this.page -= 1; void this.load(true); } });
        for (const path of ['bottom/OnlineToggle', 'bottom/FuToggle']) {
            this.click(form.find(path), () => { this.page = 1; void this.load(true); });
        }
        this.click(form.find('bottom/SeeToggle'), () => { void this.saveOnlineCountVisibility(); });
    }

    private show(form: LegacyForm, context: unknown): void {
        adaptClubMemberLandscape(form.node);
        this.form = form;
        this.context = context && typeof context === 'object' ? context as MemberContext : {};
        this.page = 1;
        const input = form.find('bottom/SearchBox/EditBox')?.getComponent(EditBox);
        if (input) input.string = '';
        const canManage = Number(this.context.minister ?? 0) > 0;
        this.active(form.node, 'bottom/SeeToggle', canManage);
        this.active(form.node, 'top/tip_pl', Number(this.context.unionId ?? 0) > 0);
        if (canManage) void this.loadOnlineCountVisibility();
        void this.load(true);
        void this.loadOnlineCount();
    }

    private async load(refresh: boolean): Promise<void> {
        const form = this.form; if (!form) return;
        const query = form.find('bottom/SearchBox/EditBox')?.getComponent(EditBox)?.string.trim() ?? '';
        const online = Boolean(form.find('bottom/OnlineToggle')?.getComponent(Toggle)?.isChecked);
        const losePoint = Boolean(form.find('bottom/FuToggle')?.getComponent(Toggle)?.isChecked);
        try {
            const rows = await this.client.request<MemberRow[]>('club.CClubGetMemberManage', {
                clubId: this.clubId(), pageNum: this.page, query,
                type: online ? 1 : 0, losePoint: losePoint ? 1 : 0,
            });
            if (!rows.length && this.page > 1) {
                this.page -= 1;
                await this.load(true);
                return;
            }
            this.render(rows, refresh);
            this.label(form.node, 'bottom/page/lb_page', String(this.page));
            if (query && rows.length === 0) await this.forms.show('UIMessage_Drift', null, null, '此玩家不存在');
        } catch (error: unknown) {
            await this.forms.show('UIMessage_Drift', null, null,
                error instanceof Error ? error.message : '获取俱乐部成员列表失败');
        }
    }

    private async loadOnlineCount(): Promise<void> {
        try {
            const count = await this.client.request<number>('club.CClubOnlinePlayerCount', { clubId: this.clubId() });
            if (this.form) this.label(this.form.node, 'bottom/lb_OnlineCount', `在线人数：${count >= 0 ? count : '**'}人`);
        } catch { if (this.form) this.label(this.form.node, 'bottom/lb_OnlineCount', '在线人数：**人'); }
    }

    private async loadOnlineCountVisibility(): Promise<void> {
        const toggle = this.form?.find('bottom/SeeToggle')?.getComponent(Toggle);
        if (!toggle) return;
        try {
            const result = await this.client.request<{ showOnlinePlayerNum?: number }>(
                'club.CClubGetShowOnlinePlayerNum', { clubId: this.clubId() });
            toggle.isChecked = Number(result.showOnlinePlayerNum ?? 1) === 0;
        } catch {
            toggle.isChecked = false;
        }
    }

    private async saveOnlineCountVisibility(): Promise<void> {
        const toggle = this.form?.find('bottom/SeeToggle')?.getComponent(Toggle);
        if (!toggle) return;
        try {
            await this.client.request('club.CClubChangeShowOnlinePlayerNum', {
                clubId: this.clubId(), showOnlinePlayerNum: toggle.isChecked ? 0 : 1,
            });
        } catch (error: unknown) {
            await this.forms.show('UIMessage_Drift', null, null,
                error instanceof Error ? error.message : '设置在线人数显示失败');
        }
    }

    private render(rows: MemberRow[], refresh: boolean): void {
        const form = this.form; const mark = form?.find('mark');
        const layout = mark?.getChildByName('layout'); const template = mark?.getChildByName('user_demo');
        if (!layout || !template) return;
        const scroll = mark?.getComponent(ScrollView);
        if (scroll) { scroll.vertical = true; scroll.horizontal = false; }
        if (refresh) {
            this.clearRows();
            // destroy() is deferred until the end of the frame. Detach first so the
            // ID de-duplication below cannot mistake stale rows for refreshed rows.
            for (const child of [...layout.children]) {
                child.removeFromParent();
                child.destroy();
            }
        }
        template.active = false;
        // Never trust transport/invalidation order for identity-sensitive lists.
        // Keep the authenticated account first while preserving every other row's
        // server order, including after search and realtime refreshes.
        const orderedRows = [...rows].sort((left, right) => {
            const leftSelf = Number(left.shortPlayer?.pid ?? 0) === this.playerId;
            const rightSelf = Number(right.shortPlayer?.pid ?? 0) === this.playerId;
            return leftSelf === rightSelf ? 0 : leftSelf ? -1 : 1;
        });
        for (const row of orderedRows) {
            const pid = Number(row.shortPlayer?.pid ?? 0); if (layout.getChildByName(String(pid))) continue;
            const node = instantiate(template); node.name = String(pid); node.active = true;
            this.label(node, 'name', String(row.shortPlayer?.name ?? ''));
            this.label(node, 'id', `ID:${pid}`);
            this.label(node, 'promoterName', String(row.upShortPlayer?.name ?? ''));
            this.label(node, 'promoterId', `ID:${row.upShortPlayer?.pid ?? ''}`);
            this.label(node, 'zhiwu', Boolean(row.isPromotionManage) && Number(row.minister ?? 0) > 0 ? '管理/队长'
                : Boolean(row.isPromotionManage) ? '队长'
                : Number(row.minister ?? 0) === 2 ? '圈主'
                    : Number(row.minister ?? 0) > 0 ? '管理' : '成员');
            this.label(node, 'quanka', Number(this.context.unionId ?? 0) > 0 ? '' : String(row.playerClubCard ?? 0));
            this.label(node, 'ClubCent', Number(this.context.unionId ?? 0) > 0 ? String(row.clubCent ?? 0) : '');
            const control = node.getChildByName('controlNode');
            this.setMemberRowExpanded(node, false);
            this.bindMemberActions(node, row);
            layout.addChild(node);
        }
        layout.getComponent(Layout)?.updateLayout();
        const empty = form?.find('nullNode'); if (empty) empty.active = layout.children.length === 0;
    }

    private bindMemberActions(node: Node, row: MemberRow): void {
        const control = node.getChildByName('controlNode'); if (!control) return;
        const pid = Number(row.shortPlayer?.pid ?? 0); const selfMinister = Number(this.context.minister ?? 0);
        const targetMinister = Number(row.minister ?? 0); const canManage = selfMinister > 0 && pid !== this.playerId && targetMinister !== 2;
        const set = (name: string, active: boolean, action: () => void) => {
            const button = control.getChildByName(name); if (!button) return; button.active = active; this.bindRowClick(button, action);
        };
        const rowToggle = node.getChildByName('btn_ShowBtn') ?? node.getChildByName('btn_control');
        if (rowToggle) rowToggle.active = pid !== this.playerId && targetMinister !== 2;
        this.bindRowClick(rowToggle, () => this.toggleMemberRow(node));
        const remarkContext = {
            ...(row.shortPlayer ?? {}),
            onChanged: (remarkName: string) => this.label(node, 'name', remarkName),
        };
        this.bindRowClick(node.getChildByName('name'), () => { void this.forms.show('UILobbyRemark', remarkContext); });
        this.bindRowClick(node.getChildByName('head'), () => { void this.forms.show('UILobbyRemark', remarkContext); });
        set('btn_tichu', canManage && targetMinister === 0, () => { void this.confirmKick(pid, String(row.shortPlayer?.name ?? '')); });
        set('btn_qxgl', selfMinister === 2 && (targetMinister === 1 || targetMinister === 3), () => { void this.setMinister(pid, 0); });
        set('btn_swgl', selfMinister === 2 && targetMinister !== 1, () => { void this.setMinister(pid, 1); });
        // The standalone tournament-manager member role was removed. Club
        // administrators now share the union-management permissions.
        const tournamentManager = control.getChildByName('btn_swssgl');
        if (tournamentManager) tournamentManager.active = false;
        set('btn_swtgygl', Number(this.context.levelPromotion ?? 0) > 0 && !row.isPromotionManage && pid !== this.playerId, () => { void this.setPromotionMinister(pid, 1); });
        set('btn_qxtgygl', Number(this.context.levelPromotion ?? 0) > 0 && Boolean(row.isPromotionManage) && pid !== this.playerId, () => { void this.setPromotionMinister(pid, 0); });
        set('btn_jzyx', canManage && !row.isBanGame, () => { void this.forms.show('ui/club/UIForbidRoomCfg', { ...this.context, pid }); });
        set('btn_qxjz', canManage && Boolean(row.isBanGame), () => { void this.forms.show('ui/club/UIForbidRoomCfg', { ...this.context, pid }); });
        set('btn_jjdz', Number(this.context.unionId ?? 0) > 0, () => { void this.forms.show('ui/club/ClubScoreRecord', { ...this.context, pid }); });
        set('btn_csxg', selfMinister === 2 && targetMinister !== 2, () => { void this.openPromotionParent(pid); });
        set('btn_setClubCent', Number(this.context.unionId ?? 0) > 0, () => { void this.openClubCent(row); });
    }

    /** 2.2.2 member rows use the same accordion behavior as captain rows. */
    private toggleMemberRow(row: Node): void {
        const expand = !row.getChildByName('controlNode')?.active;
        for (const sibling of row.parent?.children ?? []) this.setMemberRowExpanded(sibling, sibling === row && expand);
        row.parent?.getComponent(Layout)?.updateLayout();
    }

    private setMemberRowExpanded(row: Node, expanded: boolean): void {
        const control = row.getChildByName('controlNode');
        if (control) control.active = expanded;
        const transform = row.getComponent(UITransform);
        if (transform) transform.setContentSize(transform.contentSize.width, expanded ? 330 : 100);
    }

    private bindRowClick(node: Node | null, action: () => void): void {
        if (!node) return; node.on(Button.EventType.CLICK, action); this.rowDisposers.push(() => node.off(Button.EventType.CLICK, action));
    }

    private async confirmKick(pid: number, name: string): Promise<void> {
        const confirm = await this.forms.show('UIMessage', null, null, `确定将“${name}”移出俱乐部吗？`); if (!confirm) return;
        const sure = this.find(confirm.node, 'image01/btnSure'); const cancel = this.find(confirm.node, 'image01/btnCancel');
        if (cancel) { cancel.active = true; cancel.once(Button.EventType.CLICK, () => this.forms.close('UIMessage')); }
        sure?.once(Button.EventType.CLICK, () => { this.forms.close('UIMessage'); void this.kickMember(pid, this.findRow(pid)); });
    }

    private findRow(pid: number): Node {
        return this.form ? this.find(this.form.node, 'mark/layout')?.getChildByName(String(pid)) ?? this.form.node : new Node();
    }

    private async setMinister(pid: number, minister: number): Promise<void> {
        try { await this.client.request('club.CClubSetMinister', { clubId: this.clubId(), pid, minister }); await this.load(true); }
        catch (error: unknown) { await this.forms.show('UIMessage_Drift', null, null, error instanceof Error ? error.message : '设置管理员失败'); }
    }

    private async setPromotionMinister(pid: number, minister: number): Promise<void> {
        try { await this.client.request('club.CClubSetPromotionMinister', { clubId: this.clubId(), pid, minister }); await this.load(true); }
        catch (error: unknown) { await this.forms.show('UIMessage_Drift', null, null, error instanceof Error ? error.message : '设置圈管理失败'); }
    }

    private async openPromotionParent(pid: number): Promise<void> {
        try { const result = await this.client.request<{ player?: unknown }>('club.CClubGetUplevelPromotion', { clubId: this.clubId(), pid }); await this.forms.show('ui/club/ClubPromoterSet', { ...this.context, pid, player: result.player }); }
        catch (error: unknown) { await this.forms.show('UIMessage_Drift', null, null, error instanceof Error ? error.message : '获取上级队长失败'); }
    }

    private async openClubCent(row: MemberRow): Promise<void> {
        const pid = Number(row.shortPlayer?.pid ?? 0);
        try {
            const info = await this.client.request<{ clubCent?: number; allowClubCent?: number }>('club.CClubMemberClubCentInfo', { clubId: this.clubId(), opPid: pid });
            const path = Number(this.context.skinType ?? 0) === 2 ? 'ui/club_2/UIUserSetPL_2' : 'ui/club/UIUserSetPL';
            await this.forms.show(path, { ...this.context, clubId: this.clubId(), opClubId: this.clubId(), pid,
                name: row.shortPlayer?.name ?? '', targetPL: Number(info.clubCent ?? 0), owerPL: Number(info.allowClubCent ?? 0),
                myisminister: Number(row.minister ?? 0), isUnion: Number(this.context.unionId ?? 0) > 0, isPromoter: false,
                onChanged: (changedValue: number) => this.label(this.findRow(pid), 'ClubCent', String(changedValue)) });
        } catch (error: unknown) { await this.forms.show('UIMessage_Drift', null, null, error instanceof Error ? error.message : '获取成员俱乐部积分失败'); }
    }

    private bindRemark(form: LegacyForm): void {
        this.click(form.find('btn_close'), () => this.forms.close('UILobbyRemark'));
        this.click(form.find('btn_save'), () => { void this.saveRemark(form); });
    }

    private showRemark(form: LegacyForm, player: unknown): void {
        this.remarkPlayer = player && typeof player === 'object'
            ? player as { pid?: number; name?: string; onChanged?: (remarkName: string) => void } : {};
        this.label(form.node, 'label_name', String(this.remarkPlayer.name ?? ''));
        this.label(form.node, 'label_ID', `ID:${this.remarkPlayer.pid ?? ''}`);
        const edit = this.find(form.node, 'input/EditBox')?.getComponent(EditBox); if (edit) edit.string = '';
    }

    private async saveRemark(form: LegacyForm): Promise<void> {
        const edit = this.find(form.node, 'input/EditBox')?.getComponent(EditBox); const remarkName = edit?.string.trim() ?? '';
        if (!remarkName) { await this.forms.show('UIMessage_Drift', null, null, '备注名不能为空'); return; }
        try {
            await this.client.request('club.CClubChangePlayerRemarkName', {
                clubId: this.clubId(), remarkID: Number(this.remarkPlayer.pid ?? 0), remarkName,
            });
            this.forms.close('UILobbyRemark');
            this.remarkPlayer.onChanged?.(remarkName);
        }
        catch (error: unknown) { await this.forms.show('UIMessage_Drift', null, null, error instanceof Error ? error.message : '备注失败，请稍后重试'); }
    }

    private async kickMember(pid: number, row: Node): Promise<void> {
        try {
            const gate = await this.client.request<{ type?: number }>('club.CClubKickOutNeedConfirm', { clubId: this.clubId(), pid });
            if (Number(gate?.type ?? 0) === 1) {
                await this.forms.show('UIMessage_Drift', null, null, '该成员身上或保险箱有竞技点，无法操作'); return;
            }
            await this.client.request('club.CClubChangePlayerStatus', { clubId: this.clubId(), pid, status: 8 });
            row.destroy();
        } catch (error: unknown) {
            await this.forms.show('UIMessage_Drift', null, null,
                error instanceof Error ? error.message : '成员状态修改失败');
        }
    }

    private clubId(): number { return Number(this.context.id ?? this.context.clubId ?? 0); }
    private click(node: Node | null, listener: () => void): void {
        if (!node) return; node.on(Button.EventType.CLICK, listener);
        this.disposers.push(() => node.off(Button.EventType.CLICK, listener));
    }
    private clearRows(): void { for (const dispose of this.rowDisposers.splice(0)) dispose(); }
    private active(root: Node, path: string, value: boolean): void { const node = this.find(root, path); if (node) node.active = value; }
    private label(root: Node, path: string, value: string): void { const label = this.find(root, path)?.getComponent(Label); if (label) label.string = value; }
    private find(root: Node, path: string): Node | null {
        let node: Node | null = root; for (const part of path.split('/')) node = node?.getChildByName(part) ?? null; return node;
    }
}
