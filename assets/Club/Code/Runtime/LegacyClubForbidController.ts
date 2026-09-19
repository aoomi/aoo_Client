import { Button, EditBox, Label, Layout, Node, Toggle, instantiate, isValid } from 'cc';
import { ProtocolClient } from '../../../Common/Code/Runtime/network/ProtocolClient';
import { LegacyForm, LegacyFormManager } from '../../../Common/Code/Runtime/ui/LegacyFormManager';
import { setClubDynamicLabel } from './ClubDynamicLabel';

interface ClubContext { id?: number; clubId?: number; unionId?: number; minister?: number; unionPostType?: number; groupingScope?: 'club' | 'union'; onChanged?: () => void }
interface Player { pid?: number; name?: string; iconUrl?: string }
interface Group { groupingId?: number; groupingSize?: number; playerList?: Player[] }
interface Member { player?: Player; isBan?: boolean }
interface RoomConfig { configId?: number; gameId?: number; roomName?: string; dataJsonCfg?: string; isBan?: number }

export class LegacyClubForbidController {
    private readonly disposers: Array<() => void> = [];
    private readonly rows: Array<() => void> = [];
    private context: ClubContext = {};
    private groupingId = 0;
    private selectedPid = 0;
    private memberForm: LegacyForm | null = null;
    private mainForm: LegacyForm | null = null;
    private roomForm: LegacyForm | null = null;
    private roomPid = 0;

    public constructor(private readonly forms: LegacyFormManager, private readonly client: ProtocolClient) {}

    public install(): void {
        this.forms.register('ui/club/ClubBan', { zOrder: 9, lifecycle: {
            onCreate: (form) => this.bindMain(form), onShow: (form, context) => this.showMain(form, context),
            onClose: () => { this.mainForm = null; this.clearRows(); },
        }});
        this.forms.register('ui/club/UIForbidUserList', { zOrder: 10, lifecycle: {
            onCreate: (form) => this.bindMembers(form), onShow: (form, context) => this.showMembers(form, context),
            onClose: () => { this.memberForm = null; this.clearRows(); },
        }});
        for (const [path, unionGame] of [
            ['ui/club/UIForbidAddUser', false], ['ui/club/UIForbidGameAddUser', true],
        ] as Array<[string, boolean]>) this.forms.register(path, { zOrder: 11, lifecycle: {
            onCreate: (form) => this.bindAdd(form, path, unionGame),
            onShow: (form, context) => this.showAdd(form, context),
        }});
        this.forms.register('ui/club/UIForbidRoomCfg', { zOrder: 11, lifecycle: {
            onCreate: (form) => this.bindRoom(form), onShow: (form, context) => this.showRoom(form, context),
            onClose: () => { this.roomForm = null; this.clearRows(); },
        }});
    }

    public dispose(): void { this.clearRows(); for (const dispose of this.disposers.splice(0)) dispose(); }

    private bindMain(form: LegacyForm): void {
        this.click(form.node, 'btn_close', () => this.forms.close('ui/club/ClubBan'));
        this.click(form.node, 'btn_add_forbid', () => { void this.addGroup(); });
        this.click(form.node, 'btn_ForbidSearch', () => { void this.loadGroups(); });
    }
    private showMain(form: LegacyForm, value: unknown): void {
        this.mainForm = form; this.context = this.contextValue(value);
        const add = this.desc(form.node, 'btn_add_forbid');
        if (add) add.active = this.canManage();
        for (const name of ['EditBoxForbid1', 'EditBoxForbid2']) { const edit = this.desc(form.node, name)?.getComponent(EditBox); if (edit) edit.string = ''; }
        void this.loadGroups();
    }
    private async loadGroups(): Promise<void> {
        const form = this.mainForm; if (!form) return;
        const pidOne = this.input(form.node, 'EditBoxForbid1'); const pidTwo = this.input(form.node, 'EditBoxForbid2');
        if (pidOne < 0 || pidTwo < 0) { await this.tip('请输入纯数字的成员ID'); return; }
        try {
            const groups = await this.client.request<Group[]>('club.CClubGroupingList', { clubId: this.clubId(), pidOne: pidOne || '', pidTwo: pidTwo || '' });
            this.renderGroups(groups);
        } catch (error: unknown) { await this.tip(this.message(error, '获取限制组失败')); }
    }
    private renderGroups(groups: Group[]): void {
        const form = this.mainForm;
        const mark = form ? this.desc(form.node, 'mark') : null;
        // ClubBan contains another layout inside the hidden demo row. Resolve both
        // nodes from mark so new rows are added to the visible list container.
        const content = mark?.getChildByName('layout') ?? null;
        const demo = mark?.getChildByName('demo') ?? null;
        if (!content || !demo) return; this.clearRows(); for (const child of [...content.children]) if (child !== demo) child.destroy(); demo.active = false;
        groups.forEach((group, index) => {
            const node = instantiate(demo); node.name = `forbid_${group.groupingId ?? 0}`; node.active = true;
            this.label(node, 'renshu', `${index + 1}.限制人数：${group.groupingSize ?? group.playerList?.length ?? 0}/15`);
            const players = group.playerList ?? [];
            for (let i = 0; i < 2; i += 1) { const slot = this.desc(node, `user${i + 1}`); const player = players[i]; if (slot) slot.active = Boolean(player); if (slot && player) this.player(slot, player); }
            const canManage = this.canManage();
            const setButton = this.desc(node, 'btn_set_forbit'); if (setButton) setButton.active = canManage;
            const deleteButton = this.desc(node, 'btn_del_forbit'); if (deleteButton) deleteButton.active = canManage;
            this.rowClick(node, 'btn_set_forbit', () => { void this.forms.show('ui/club/UIForbidUserList', { ...this.context, groupingId: group.groupingId, groupingScope: 'club' }); });
            this.rowClick(node, 'btn_del_forbit', () => { void this.removeGroup(Number(group.groupingId ?? 0), node); });
            for (let i = 0; i < 2; i += 1) { const player = players[i]; if (player) this.rowClick(this.desc(node, `user${i + 1}`) ?? node, 'btn_forbit_del_user', () => { void this.removePid(Number(group.groupingId ?? 0), Number(player.pid ?? 0)); }); }
            content.addChild(node);
        });
        content.getComponent(Layout)?.updateLayout();
    }
    private async addGroup(): Promise<void> { if (!this.canManage()) { await this.tip('只有亲友圈管理可添加限制'); return; } try { await this.client.request('club.CClubGroupingAdd', { clubId: this.clubId() }); await this.loadGroups(); } catch (e) { await this.tip(this.message(e, '新增限制组失败')); } }
    private async removeGroup(groupingId: number, node: Node): Promise<void> { try { await this.client.request('club.CClubGroupingRemove', { clubId: this.clubId(), groupingId }); node.destroy(); } catch (e) { await this.tip(this.message(e, '删除限制组失败')); } }
    private async removePid(groupingId: number, pid: number): Promise<void> { try { await this.client.request('club.CClubGroupingPidRemove', { clubId: this.clubId(), groupingId, pid }); await this.loadGroups(); } catch (e) { await this.tip(this.message(e, '移除成员失败')); } }

    private bindMembers(form: LegacyForm): void {
        this.click(form.node, 'btn_close', () => this.forms.close('ui/club/UIForbidUserList'));
        this.click(form.node, 'btn_addByPid', () => { void this.forms.show('ui/club/UIForbidAddUser', { ...this.context, groupingId: this.groupingId }); });
    }
    private showMembers(form: LegacyForm, value: unknown): void { this.memberForm = form; this.context = this.contextValue(value); this.groupingId = Number((value as ClubContext & { groupingId?: number })?.groupingId ?? 0); void this.loadMembers(); }
    private async loadMembers(): Promise<void> {
        const unionId = Number(this.context.unionId ?? 0); const protocol = this.isUnionGrouping() ? 'union.CUnionGroupingMemberList' : 'club.CClubGroupingMemberList';
        try {
            const members = await this.client.request<Member[]>(protocol, { unionId, clubId: this.clubId(), groupingId: this.groupingId }); this.renderMembers(members);
        } catch (e) { await this.tip(this.message(e, '获取限制组成员失败')); }
    }
    private renderMembers(members: Member[]): void {
        const form = this.memberForm; const content = form ? this.desc(form.node, 'layout') : null; const demo = form ? this.desc(form.node, 'user_demo') : null;
        if (!content || !demo) return; this.clearRows(); for (const child of [...content.children]) if (child !== demo) child.destroy(); demo.active = false;
        for (const member of members) { const info = member.player ?? {}; const node = instantiate(demo); node.active = true; this.player(node, info);
            const add = this.desc(node, 'btn_add'); const del = this.desc(node, 'btn_del'); if (add) add.active = !member.isBan; if (del) del.active = member.isBan !== false;
            this.rowClick(node, 'btn_add', () => { void this.changeMember(info, true); }); this.rowClick(node, 'btn_del', () => { void this.changeMember(info, false); }); content.addChild(node); }
        content.getComponent(Layout)?.updateLayout();
    }
    private async changeMember(player: Player, add: boolean): Promise<void> {
        const unionId = Number(this.context.unionId ?? 0); const protocol = this.isUnionGrouping() ? `union.CUnionGroupingPid${add ? 'Add' : 'Remove'}` : `club.CClubGroupingPid${add ? 'Add' : 'Remove'}`;
        try { await this.client.request(protocol, { unionId, clubId: this.clubId(), groupingId: this.groupingId, pid: Number(player.pid ?? 0) }); await this.loadMembers(); await this.loadGroups(); this.context.onChanged?.(); }
        catch (e) { await this.tip(this.message(e, add ? '添加成员失败' : '移除成员失败')); }
    }

    private bindAdd(form: LegacyForm, path: string, unionGame: boolean): void {
        this.click(form.node, 'btn_close', () => this.forms.close(path)); this.click(form.node, 'btn_search', () => { void this.findPlayer(form, unionGame); }); this.click(form.node, 'btn_add', () => { void this.addFoundPlayer(path, unionGame); });
    }
    private showAdd(form: LegacyForm, value: unknown): void { this.context = this.contextValue(value); this.groupingId = Number((value as ClubContext & { groupingId?: number })?.groupingId ?? 0); this.selectedPid = 0; const edit = this.desc(form.node, 'EditBox')?.getComponent(EditBox); if (edit) edit.string = ''; const user = this.desc(form.node, 'user'); if (user) user.active = false; const add = this.desc(form.node, 'btn_add'); if (add) add.active = false; }
    private async findPlayer(form: LegacyForm, unionGame: boolean): Promise<void> {
        const pid = this.input(form.node, 'EditBox'); if (pid <= 0) { await this.tip('请输入纯数字的成员ID'); return; }
        const unionId = Number(this.context.unionId ?? 0); const protocol = unionGame ? 'union.CUnionFindPidInfo' : this.isUnionGrouping() ? 'union.CUnionGroupingPidFind' : 'club.CClubGroupingPidFind';
        try { const result = await this.client.request<Player | { player?: Player }>(protocol, { unionId, clubId: this.clubId(), pid }); const player = 'player' in result && result.player ? result.player : result as Player; this.selectedPid = Number(player.pid ?? 0); const user = this.desc(form.node, 'user'); if (user) { user.active = true; this.player(user, player); } const add = this.desc(form.node, 'btn_add'); if (add) add.active = this.selectedPid > 0; }
        catch (e) { await this.tip(this.message(e, '查找成员失败')); }
    }
    private async addFoundPlayer(path: string, unionGame: boolean): Promise<void> {
        if (!this.selectedPid) return; const unionId = Number(this.context.unionId ?? 0); const protocol = unionGame ? 'union.CUnionBanGamePlayerAdd' : this.isUnionGrouping() ? 'union.CUnionGroupingPidAdd' : 'club.CClubGroupingPidAdd';
        try { await this.client.request(protocol, { unionId, clubId: this.clubId(), groupingId: this.groupingId, pid: this.selectedPid }); await this.tip('添加成功'); this.forms.close(path); await this.loadMembers(); await this.loadGroups(); this.context.onChanged?.(); }
        catch (e) { await this.tip(this.message(e, '添加成员失败')); }
    }

    private bindRoom(form: LegacyForm): void { this.click(form.node, 'btn_cancel', () => this.forms.close('ui/club/UIForbidRoomCfg')); this.click(form.node, 'btn_sure', () => { void this.saveRoom(); }); this.click(form.node, 'selectAllToggle', () => this.selectAll(form)); }
    private showRoom(form: LegacyForm, value: unknown): void { this.roomForm = form; this.context = this.contextValue(value); this.roomPid = Number((value as ClubContext & { pid?: number })?.pid ?? 0); void this.loadRooms(); }
    private async loadRooms(): Promise<void> {
        const unionId = Number(this.context.unionId ?? 0); const protocol = unionId > 0 ? 'union.CUnionBanRoomConigList' : 'club.CClubBanRoomConigList';
        try { const result = await this.client.request<{ isAll?: number; unionBanRoomConfigBOList?: RoomConfig[] }>(protocol, { unionId, clubId: this.clubId(), opClubId: this.clubId(), opPid: this.roomPid }); this.renderRooms(result.unionBanRoomConfigBOList ?? [], Number(result.isAll ?? 0) === 1); }
        catch (e) { await this.tip(this.message(e, '获取禁止玩法列表失败')); }
    }
    private renderRooms(items: RoomConfig[], all: boolean): void {
        const form = this.roomForm; if (!form) return; const content = this.desc(form.node, 'content'); const demo = this.desc(form.node, 'demo'); if (!content || !demo) return;
        this.clearRows(); for (const child of [...content.children]) if (child !== demo) child.destroy(); demo.active = false; const allToggle = this.desc(form.node, 'selectAllToggle')?.getComponent(Toggle); if (allToggle) allToggle.isChecked = all;
        for (const item of items) { const node = instantiate(demo); node.name = String(item.configId ?? 0); node.active = true; this.label(node, 'lb_roomName', item.roomName || `游戏${item.gameId ?? ''}`); let cfg = item.dataJsonCfg ?? ''; try { cfg = JSON.stringify(JSON.parse(cfg)); } catch {} this.label(node, 'lb_roomCfg', cfg.length > 36 ? `${cfg.slice(0, 36)}...` : cfg); const toggle = this.desc(node, 'selectToggle')?.getComponent(Toggle); if (toggle) toggle.isChecked = Number(item.isBan ?? 0) === 1; content.addChild(node); }
        content.getComponent(Layout)?.updateLayout();
    }
    private selectAll(form: LegacyForm): void { const checked = Boolean(this.desc(form.node, 'selectAllToggle')?.getComponent(Toggle)?.isChecked); const content = this.desc(form.node, 'content'); for (const child of content?.children ?? []) { const toggle = this.desc(child, 'selectToggle')?.getComponent(Toggle); if (toggle) toggle.isChecked = checked; } }
    private async saveRoom(): Promise<void> { const form = this.roomForm; if (!form) return; const content = this.desc(form.node, 'content'); const configIdList = (content?.children ?? []).filter((node) => this.desc(node, 'selectToggle')?.getComponent(Toggle)?.isChecked).map((node) => Number(node.name)).filter(Boolean); const unionId = Number(this.context.unionId ?? 0); const protocol = unionId > 0 ? 'union.CUnionBanRoomConigOp' : 'club.CClubBanRoomConigOp'; const isAll = this.desc(form.node, 'selectAllToggle')?.getComponent(Toggle)?.isChecked ? 1 : 0; try { await this.client.request(protocol, { unionId, clubId: this.clubId(), opClubId: this.clubId(), opPid: this.roomPid, configIdList, isAll }); await this.tip('禁止游戏成功'); this.forms.close('ui/club/UIForbidRoomCfg'); } catch (e) { await this.tip(this.message(e, '保存禁止玩法失败')); } }

    private contextValue(value: unknown): ClubContext { return value && typeof value === 'object' ? value as ClubContext : {}; }
    private clubId(): number { return Number(this.context.id ?? this.context.clubId ?? 0); }
    private isUnionGrouping(): boolean { return this.context.groupingScope === 'union'; }
    private canManage(): boolean { return Number(this.context.minister ?? 0) > 0; }
    private player(root: Node, player: Player): void { this.label(root, 'name', String(player.name ?? '')); this.label(root, 'id', `ID:${player.pid ?? ''}`); }
    private label(root: Node, name: string, value: string): void {
        const base = this.desc(root, name);
        const label = base?.getComponent(Label) ?? this.desc(base ?? root, 'lb')?.getComponent(Label) ?? null;
        setClubDynamicLabel(label, name, value);
    }
    private input(root: Node, name: string): number { const text = this.desc(root, name)?.getComponent(EditBox)?.string.trim() ?? ''; return !text ? 0 : /^\d+$/.test(text) ? Number(text) : -1; }
    private click(root: Node, name: string, listener: () => void): void { const node = this.desc(root, name); if (!node) return; node.on(Button.EventType.CLICK, listener); this.disposers.push(() => { if (isValid(node, true)) node.off(Button.EventType.CLICK, listener); }); }
    private rowClick(root: Node, name: string, listener: () => void): void { const node = this.desc(root, name); if (!node) return; node.on(Button.EventType.CLICK, listener); this.rows.push(() => { if (isValid(node, true)) node.off(Button.EventType.CLICK, listener); }); }
    private clearRows(): void { for (const dispose of this.rows.splice(0)) dispose(); }
    private desc(root: Node, name: string): Node | null { if (root.name === name) return root; for (const child of root.children) { const found = this.desc(child, name); if (found) return found; } return null; }
    private message(error: unknown, fallback: string): string { return error instanceof Error ? error.message : fallback; }
    private async tip(text: string): Promise<void> { await this.forms.show('UIMessage_Drift', null, null, text); }
}
