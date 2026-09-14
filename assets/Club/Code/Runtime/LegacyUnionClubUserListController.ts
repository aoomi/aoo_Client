import { Button, EditBox, Label, Layout, Node, RichText, ScrollView, Toggle, instantiate } from 'cc';
import { ProtocolClient } from '../../../Common/Code/Runtime/network/ProtocolClient';
import { LegacyForm, LegacyFormManager } from '../../../Common/Code/Runtime/ui/LegacyFormManager';
import { ScrollEvents } from '../../../Common/Code/UI/UnifiedScroll';

interface ShortPlayer { pid?: number; name?: string; iconUrl?: string }
interface UnionClubMember { shortPlayer?: ShortPlayer; upShortPlayer?: ShortPlayer; minister?: number; clubCent?: number; eliminatePoint?: number; isUnionBanGame?: boolean }
interface SportsInfo { clubCent?: number; allowClubCent?: number }
interface ShareContext { name?: string; pid?: number; opPid?: number; opClubId?: number; clubId?: number; unionId?: number; shareType?: number; shareFixedValue?: number; shareValue?: number; onChanged?: () => void }
interface ShareRoom { configId?: number; configName?: string; size?: number; changeFlag?: boolean; scorePercent?: number }

export class LegacyUnionClubUserListController {
    private form: LegacyForm | null = null;
    private path = '';
    private ownerClubId = 0;
    private clubId = 0;
    private unionId = 0;
    private unionName = '';
    private unionSign = 0;
    private page = 1;
    private shareContext: ShareContext = {};
    private detailType = 0;
    private detailPage = 1;
    private readonly detailRows = new Map<string, ShareRoom>();
    private readonly disposers: Array<() => void> = [];
    private readonly rowDisposers: Array<() => void> = [];

    public constructor(private readonly forms: LegacyFormManager, private readonly client: ProtocolClient) {}

    public install(): void {
        for (const path of ['ui/club/UIUnionClubUserList', 'ui/club_2/UIUnionClubUserList_2']) {
            this.forms.register(path, { zOrder: 11, lifecycle: {
                onCreate: (form) => this.bind(form, path),
                onShow: (form, ownerClubId, clubId, unionId, unionName, unionSign) => this.show(form, path, ownerClubId, clubId, unionId, unionName, unionSign),
                onClose: () => { this.clearRows(); this.form = null; },
            }});
        }
        this.forms.register('ui/club/UIUserSetPercent', { zOrder: 12, lifecycle: { onCreate: (form) => this.bindPercent(form), onShow: (form, value) => this.showPercent(form, value) }});
        this.forms.register('ui/club/UIUserSetPercentDetail', { zOrder: 12, lifecycle: { onCreate: (form) => this.bindPercentDetail(form), onShow: (form, value, type) => this.showPercentDetail(form, value, type), onClose: () => this.detailRows.clear() }});
    }

    public dispose(): void {
        this.clearRows();
        for (const dispose of this.disposers.splice(0)) dispose();
    }

    private bind(form: LegacyForm, path: string): void {
        this.click(form.node, 'btn_close', () => this.forms.close(path));
        this.click(form.node, 'btn_search', () => { this.page = 1; void this.load(true); });
        this.click(form.node, 'btn_next', () => { this.page += 1; void this.load(true); });
        this.click(form.node, 'btn_last', () => { if (this.page > 1) { this.page -= 1; void this.load(true); } });
        for (const name of ['OnlineToggle', 'FuToggle']) {
            const toggle = this.desc(form.node, name)?.getComponent(Toggle);
            if (!toggle) continue;
            const change = () => { this.page = 1; void this.load(true); };
            toggle.node.on(Toggle.EventType.TOGGLE, change);
            this.disposers.push(() => toggle.node.off(Toggle.EventType.TOGGLE, change));
        }
    }

    private show(form: LegacyForm, path: string, ownerClubId: unknown, clubId: unknown, unionId: unknown, unionName: unknown, unionSign: unknown): void {
        this.form = form;
        this.path = path;
        this.ownerClubId = Number(ownerClubId ?? 0);
        this.clubId = Number(clubId ?? 0);
        this.unionId = Number(unionId ?? 0);
        this.unionName = String(unionName ?? '');
        this.unionSign = Number(unionSign ?? 0);
        this.page = 1;
        const edit = this.desc(form.node, 'EditBox')?.getComponent(EditBox);
        if (edit) edit.string = '';
        const online = this.desc(form.node, 'OnlineToggle')?.getComponent(Toggle);
        const negative = this.desc(form.node, 'FuToggle')?.getComponent(Toggle);
        if (online) online.isChecked = false;
        if (negative) negative.isChecked = false;
        void this.loadOnline();
        void this.load(true);
    }

    private async loadOnline(): Promise<void> {
        if (!this.form) return;
        try {
            const count = await this.client.request<number>('club.CClubOnlinePlayerCount', { clubId: this.clubId });
            this.label(this.form.node, 'lb_OnlineCount', `当前俱乐部在线人数：${count}人`);
        } catch {
            this.label(this.form.node, 'lb_OnlineCount', '当前俱乐部在线人数：0人');
        }
    }

    private async load(refresh: boolean): Promise<void> {
        const form = this.form;
        if (!form) return;
        const query = this.desc(form.node, 'EditBox')?.getComponent(EditBox)?.string.trim() ?? '';
        const type = this.desc(form.node, 'OnlineToggle')?.getComponent(Toggle)?.isChecked ? 1 : 0;
        const losePoint = this.desc(form.node, 'FuToggle')?.getComponent(Toggle)?.isChecked ? 1 : 0;
        try {
            const rows = await this.client.request<UnionClubMember[]>('union.CUnionClubMemberList', { clubId: this.ownerClubId, unionId: this.unionId, opClubId: this.clubId, pageNum: this.page, query, type, losePoint });
            if (!rows.length && this.page > 1) { this.page -= 1; this.pageLabel(); return; }
            this.render(rows, refresh);
            this.pageLabel();
        } catch (error) {
            await this.tip(error instanceof Error ? error.message : '获取俱乐部成员列表失败');
        }
    }

    private render(rows: UnionClubMember[], refresh: boolean): void {
        const root = this.form?.node;
        const content = root ? this.desc(root, 'layout') : null;
        const demo = root ? this.desc(root, 'user_demo') : null;
        if (!content || !demo) return;
        if (refresh) {
            this.clearRows();
            for (const child of [...content.children]) child.destroy();
        }
        demo.active = false;
        for (const row of rows) {
            const player = row.shortPlayer ?? {};
            const promoter = row.upShortPlayer ?? {};
            const pid = Number(player.pid ?? 0);
            const node = instantiate(demo);
            node.name = String(pid);
            node.active = true;
            this.label(node, 'name', String(player.name ?? ''));
            this.label(node, 'id', `ID:${pid}`);
            this.label(node, 'promoterName', String(promoter.name ?? ''));
            this.label(node, 'promoterId', `ID:${promoter.pid ?? ''}`);
            this.label(node, 'ClubCent', String(row.clubCent ?? 0));
            this.label(node, 'taotaifen', String(row.eliminatePoint ?? 0));
            this.active(node, 'btn_jzyx', !row.isUnionBanGame);
            this.active(node, 'btn_qxjz', Boolean(row.isUnionBanGame));
            this.active(node, 'img_jzyx', Boolean(row.isUnionBanGame));
            this.active(node, 'btn_changeClubCent', this.path.includes('club_2'));
            this.rowClick(node, 'btn_setClubCent', () => { void this.openSports(row); });
            this.rowClick(node, 'btn_changeClubCent', () => { void this.forms.show('ui/club_2/UIChangeClubCentWarning_2', { name: player.name, pid, opClubId: this.clubId, eliminatePoint: Number(row.eliminatePoint ?? 0), clubId: this.ownerClubId, unionId: this.unionId, onChanged: () => void this.load(true) }); });
            this.rowClick(node, 'btn_jzyx', () => { void this.forms.show('ui/club/UIForbidRoomCfg', this.clubId, pid); });
            this.rowClick(node, 'btn_qxjz', () => { void this.forms.show('ui/club/UIForbidRoomCfg', this.clubId, pid); });
            this.rowClick(node, 'btn_jjdz', () => { void this.forms.show('ui/club/ClubScoreRecord', this.ownerClubId, this.unionId, this.unionName, this.unionSign, pid, this.clubId); });
            content.addChild(node);
        }
        content.getComponent(Layout)?.updateLayout();
    }

    private async openSports(row: UnionClubMember): Promise<void> {
        const player = row.shortPlayer ?? {};
        try {
            const info = await this.client.request<SportsInfo>('club.CClubMemberClubCentInfo', { clubId: this.clubId, opPid: Number(player.pid ?? 0), exeClubId: this.ownerClubId });
            await this.forms.show(this.path.includes('club_2') ? 'ui/club_2/UIUserSetPL_2' : 'ui/club/UIUserSetPL', { name: player.name, pid: Number(player.pid ?? 0), opClubId: this.clubId, targetPL: Number(info.clubCent ?? 0), owerPL: Number(info.allowClubCent ?? 0), myisminister: Number(row.minister ?? 0), clubId: this.ownerClubId, unionId: this.unionId, onChanged: () => void this.load(true) }, true);
        } catch (error) {
            await this.tip(error instanceof Error ? error.message : '获取俱乐部积分失败');
        }
    }

    private bindPercent(form: LegacyForm): void {
        this.click(form.node, 'btn_close', () => this.forms.close('ui/club/UIUserSetPercent'));
        this.click(form.node, 'btn_sure', () => { void this.savePercent(form); });
        this.click(form.node, 'btn_detail_value', () => { void this.openPercentDetail(1); });
        this.click(form.node, 'btn_detail_percent', () => { void this.openPercentDetail(0); });
        this.click(form.node, 'btn_detail_section', () => { void this.forms.show('ui/club/UIUserSetSection', { ...this.shareContext, unionFlag: 1 }); this.forms.close('ui/club/UIUserSetPercent'); });
        for (const name of ['toggle1', 'toggle2', 'toggle3']) {
            const toggle = this.desc(form.node, name)?.getComponent(Toggle);
            if (!toggle) continue;
            const change = () => this.updatePercentType(form.node);
            toggle.node.on(Toggle.EventType.TOGGLE, change);
            this.disposers.push(() => toggle.node.off(Toggle.EventType.TOGGLE, change));
        }
    }

    private showPercent(form: LegacyForm, value: unknown): void {
        this.shareContext = value && typeof value === 'object' ? value as ShareContext : {};
        const type = Number(this.shareContext.shareType ?? 0);
        const name = String(this.shareContext.name ?? '').slice(0, 9);
        const rich = this.desc(form.node, 'lb_TargetPercent')?.getComponent(RichText);
        if (rich) rich.string = `<color=#705d52>修改</color><color=#f8772c>${name}（ID:${this.shareContext.pid ?? ''}）</color><color=#705d52>的活跃计算值</color>`;
        this.label(form.node, 'lb_curPercent', type === 1 ? `该成员当前活跃计算值：${this.shareContext.shareFixedValue ?? 0}` : type === 0 ? `该成员当前活跃计算值：${this.shareContext.shareValue ?? 0}%` : '');
        this.edit(form.node, 'PercentEditBox', type === 1 ? String(this.shareContext.shareFixedValue ?? 0) : '');
        this.edit(form.node, 'PercentEditBox2', type === 0 ? String(this.shareContext.shareValue ?? 0) : '');
        for (const [name, checked] of [['toggle1', type === 1], ['toggle2', type === 0], ['toggle3', type === 2]] as Array<[string, boolean]>) { const toggle = this.desc(form.node, name)?.getComponent(Toggle); if (toggle) toggle.isChecked = checked; }
        this.updatePercentType(form.node);
    }

    private updatePercentType(root: Node): void {
        const type = this.percentType(root);
        this.active(root, 'btn_detail_value', type === 1);
        this.active(root, 'btn_detail_percent', type === 0);
        this.active(root, 'btn_detail_section', type === 2);
    }

    private percentType(root: Node): number {
        if (this.desc(root, 'toggle1')?.getComponent(Toggle)?.isChecked) return 1;
        if (this.desc(root, 'toggle3')?.getComponent(Toggle)?.isChecked) return 2;
        return 0;
    }

    private async savePercent(form: LegacyForm): Promise<void> {
        const shareType = this.percentType(form.node);
        const raw = shareType === 1 ? this.value(form.node, 'PercentEditBox') : shareType === 0 ? this.value(form.node, 'PercentEditBox2') : '0';
        const value = Number(raw);
        if (!Number.isFinite(value) || value < 0) { await this.tip('请输入大于等于0的纯数字'); return; }
        if (shareType === 0 && value > 100) { await this.tip('请输入小于等于100的数字'); return; }
        if (typeof window !== 'undefined' && !window.confirm('切换分成方式将导致分支下所有队长的分成方式一起改变，需要重新设置，确认是否切换？')) return;
        try {
            await this.client.request('union.CUnionPromotionShareInfo', { clubId: Number(this.shareContext.clubId ?? this.ownerClubId), unionId: Number(this.shareContext.unionId ?? this.unionId), opClubId: Number(this.shareContext.opClubId ?? 0), opPid: Number(this.shareContext.pid ?? this.shareContext.opPid ?? 0), value, shareType });
            this.shareContext.onChanged?.();
            this.forms.close('ui/club/UIUserSetPercent');
            await this.tip('成功设置活跃计算值');
        } catch (error) { await this.tip(error instanceof Error ? error.message : '设置活跃计算值失败'); }
    }

    private async openPercentDetail(type: number): Promise<void> {
        await this.forms.show('ui/club/UIUserSetPercentDetail', { ...this.shareContext, opPid: Number(this.shareContext.pid ?? this.shareContext.opPid ?? 0) }, type);
        this.forms.close('ui/club/UIUserSetPercent');
    }

    private bindPercentDetail(form: LegacyForm): void {
        this.click(form.node, 'btn_close', () => this.forms.close('ui/club/UIUserSetPercentDetail'));
        this.click(form.node, 'btn_cancel', () => this.forms.close('ui/club/UIUserSetPercentDetail'));
        this.click(form.node, 'btn_save', () => { void this.savePercentDetail(form); });
        const scroll = this.desc(form.node, 'mark');
        if (scroll) {
            const more = () => { this.detailPage += 1; void this.loadPercentDetail(form, false); };
            const view = scroll.getComponent(ScrollView);
            if (view) this.disposers.push(ScrollEvents.onBottom(view, more));
        }
    }

    private showPercentDetail(form: LegacyForm, value: unknown, type: unknown): void {
        this.shareContext = value && typeof value === 'object' ? value as ShareContext : {};
        this.detailType = Number(type ?? 0);
        this.detailPage = 1;
        this.detailRows.clear();
        void this.loadPercentDetail(form, true);
    }

    private async loadPercentDetail(form: LegacyForm, refresh: boolean): Promise<void> {
        try {
            const rows = await this.client.request<ShareRoom[]>('union.CUnionScorePercentList', { clubId: Number(this.shareContext.clubId ?? this.ownerClubId), unionId: Number(this.shareContext.unionId ?? this.unionId), opClubId: Number(this.shareContext.opClubId ?? 0), opPid: Number(this.shareContext.opPid ?? this.shareContext.pid ?? 0), pageNum: this.detailPage, type: this.detailType });
            if (!rows.length && this.detailPage > 1) { this.detailPage -= 1; return; }
            const content = this.desc(form.node, 'layout');
            const demo = this.desc(form.node, 'demo');
            if (!content || !demo) return;
            if (refresh) { for (const child of [...content.children]) child.destroy(); this.detailRows.clear(); }
            demo.active = false;
            for (const row of rows) {
                const key = String(row.configId ?? 0);
                if (this.detailRows.has(key)) continue;
                this.detailRows.set(key, row);
                const node = instantiate(demo);
                node.name = key;
                node.active = true;
                this.label(node, 'lb_roomName', String(row.configName ?? ''));
                this.label(node, 'lb_roomCount', String(row.size ?? 0));
                const fallback = this.detailType === 1 ? this.shareContext.shareFixedValue : this.shareContext.shareValue;
                this.edit(node, 'scorePercentEditBox', String(row.changeFlag ? row.scorePercent ?? 0 : fallback ?? 0));
                content.addChild(node);
            }
            content.getComponent(Layout)?.updateLayout();
        } catch (error) { await this.tip(error instanceof Error ? error.message : '获取房间活跃计算列表失败'); }
    }

    private async savePercentDetail(form: LegacyForm): Promise<void> {
        const content = this.desc(form.node, 'layout');
        if (!content) return;
        const updates: Array<{ configId: number; scorePercent: number }> = [];
        for (const node of content.children) {
            const source = this.detailRows.get(node.name);
            if (!source) continue;
            const scorePercent = Number(this.value(node, 'scorePercentEditBox'));
            if (!Number.isFinite(scorePercent) || scorePercent < 0) { await this.tip('活跃计算值请输入大于等于0的数字'); return; }
            if (scorePercent !== Number(source.scorePercent ?? NaN)) updates.push({ configId: Number(source.configId ?? 0), scorePercent });
        }
        if (!updates.length) return;
        try {
            await this.client.request('union.CUnionScorePercentBatchUpdate', { clubId: Number(this.shareContext.clubId ?? this.ownerClubId), unionId: Number(this.shareContext.unionId ?? this.unionId), opClubId: Number(this.shareContext.opClubId ?? 0), opPid: Number(this.shareContext.opPid ?? this.shareContext.pid ?? 0), type: this.detailType, unionScorePercentItemList: updates });
            this.shareContext.onChanged?.();
            this.forms.close('ui/club/UIUserSetPercentDetail');
            await this.tip('保存成功');
        } catch (error) { await this.tip(error instanceof Error ? error.message : '保存失败'); }
    }

    private click(root: Node, name: string, action: () => void): void {
        const node = this.desc(root, name);
        if (!node) return;
        const handler = () => action();
        node.on(Button.EventType.CLICK, handler);
        this.disposers.push(() => node.off(Button.EventType.CLICK, handler));
    }

    private rowClick(root: Node, name: string, action: () => void): void {
        const node = this.desc(root, name);
        if (!node) return;
        const handler = () => action();
        node.on(Button.EventType.CLICK, handler);
        this.rowDisposers.push(() => node.off(Button.EventType.CLICK, handler));
    }

    private clearRows(): void { for (const dispose of this.rowDisposers.splice(0)) dispose(); }
    private edit(root: Node, name: string, value: string): void { const edit = this.desc(root, name)?.getComponent(EditBox); if (edit) edit.string = value; }
    private value(root: Node, name: string): string { return this.desc(root, name)?.getComponent(EditBox)?.string.trim() ?? ''; }
    private pageLabel(): void { if (this.form) this.label(this.form.node, 'lb_page', String(this.page)); }
    private desc(root: Node, name: string): Node | null { if (root.name === name) return root; for (const child of root.children) { const found = this.desc(child, name); if (found) return found; } return null; }
    private label(root: Node, name: string, value: string): void { const label = this.desc(root, name)?.getComponent(Label); if (label) label.string = value; }
    private active(root: Node, name: string, value: boolean): void { const node = this.desc(root, name); if (node) node.active = value; }
    private async tip(message: string): Promise<void> { await this.forms.show('ui/UIMessage', message); }
}
