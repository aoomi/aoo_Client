import { Button, Component, EditBox, Label, Layout, Node, ScrollView, Toggle, instantiate, isValid } from 'cc';
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
    private readonly mainDisposers: Array<() => void> = [];
    private mainRevision = 0;
    private session = 0;
    private memberRevision = 0;
    private addRevision = 0;
    private saving = false;
    private readonly embeddedRows: Array<() => void> = [];
    private readonly embeddedNodes = new Set<Node>();
    private readonly generated = new Set<Node>();
    private readonly rows: Array<() => void> = [];
    private readonly mainRows: Array<() => void> = [];
    private context: ClubContext = {};
    private groupingId = 0;
    private selectedPid = 0;
    private memberForm: LegacyForm | null = null;
    private mainForm: LegacyForm | null = null;
    private roomForm: LegacyForm | null = null;
    private roomPid = 0;

    public constructor(private readonly forms: LegacyFormManager, private readonly client: ProtocolClient) {}

    public install(): void {
        this.forms.register('ui/club/ClubBanDeskMate', { zOrder: 9, lifecycle: {
            onCreate: (form) => { this.mainControls(form); }, onShow: (form, context) => this.showMain(form, context),
            onClose: () => this.clearMain(), onDestroy: () => this.clearMain(),
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

    public dispose(): void { this.clearMain(); this.clearRows(); for (const dispose of this.disposers.splice(0)) dispose(); }

    private mainControls(form: LegacyForm): { popup: Node; list: Node; demo: Node; content: Node } {
        const embedded = [this.unique(form.node, 'AddPlay'), this.unique(form.node, 'ManageMember')];
        const popup = this.unique(form.node, 'Popup', undefined, embedded);
        const list = this.unique(form.node, 'ForbidGroup', ScrollView);
        const demo = this.unique(list, 'Demo');
        const content = list.getComponent(ScrollView)?.content;
        if (!content || !this.contains(list, content) || this.contains(demo, content)) {
            throw new Error('[ClubBanDeskMate] ForbidGroup ScrollView.content 无效');
        }
        for (const name of ['Btn_Close', 'Btn_AddForbid', 'Btn_Search']) this.unique(popup, name, Button);
        for (const name of ['EditBox_0', 'EditBox_1']) this.unique(popup, name, EditBox);
        this.unique(this.unique(demo, 'PeopleCount'), 'lb', Label);
        for (const name of ['Btn_SetGroup', 'Btn_Add', 'Btn_DelGroup']) this.unique(demo, name, Button);
        for (let i = 0; i < 2; i += 1) {
            const slot = this.unique(demo, `Player_${i}`);
            for (const name of ['Name', 'ID']) this.unique(slot, name, Label);
            this.unique(slot, 'Btn_Del', Button);
        }
        const manage = embedded[1];
        const memberList = this.unique(manage, 'PlayerInfo', ScrollView);
        const memberDemo = this.unique(memberList, 'Demo');
        const memberContent = memberList.getComponent(ScrollView)!.content;
        if (!memberContent || !this.contains(memberList, memberContent) || this.contains(memberDemo, memberContent)) {
            throw new Error('[ClubBanDeskMate] PlayerInfo ScrollView.content 无效');
        }
        for (const name of ['Btn_Add', 'Btn_Cancel']) this.unique(memberDemo, name, Button);
        for (const name of ['Name', 'ID']) this.unique(memberDemo, name, Label);
        this.unique(manage, 'Btn_Add', Button, memberList);
        this.unique(manage, 'Btn_Close', Button);
        for (const name of ['Btn_Close', 'Btn_Search', 'Btn_Add']) this.unique(embedded[0], name, Button);
        this.unique(embedded[0], 'EditBox', EditBox);
        const user = this.unique(embedded[0], 'User');
        for (const name of ['Name', 'ID']) this.unique(user, name, Label);
        return { popup, list, demo, content };
    }
    private bindMain(form: LegacyForm): void {
        const { popup } = this.mainControls(form);
        this.mainClick(popup, 'Btn_Close', () => this.forms.close('ui/club/ClubBanDeskMate'));
        this.mainClick(popup, 'Btn_AddForbid', () => { void this.addGroup(); });
        this.mainClick(popup, 'Btn_Search', () => { void this.loadGroups(); });
        const manage = this.unique(form.node, 'ManageMember');
        const members = this.unique(manage, 'PlayerInfo', ScrollView);
        this.unique(members, 'Demo').active = false;
        const add = this.unique(manage, 'Btn_Add', Button, members);
        this.mainClick(add, 'Btn_Add', () => this.openAddPlay(this.groupingId));
        this.mainClick(manage, 'Btn_Close', () => {
            this.memberRevision += 1; this.addRevision += 1;
            manage.active = false;
            this.unique(form.node, 'AddPlay').active = false;
            this.clearEmbeddedRows();
        });
        const addPlay = this.unique(form.node, 'AddPlay');
        this.mainClick(addPlay, 'Btn_Close', () => { this.addRevision += 1; addPlay.active = false; });
        this.mainClick(addPlay, 'Btn_Search', () => { void this.findEmbeddedPlayer(); });
        this.mainClick(addPlay, 'Btn_Add', () => { void this.saveEmbeddedMember(this.selectedPid, true); });
    }
    private showMain(form: LegacyForm, value: unknown): void {
        const { popup, demo } = this.mainControls(form);
        this.clearMain(); this.bindMain(form);
        this.mainForm = form; this.context = this.contextValue(value);
        this.unique(popup, 'Btn_AddForbid', Button).active = this.canManage();
        for (const name of ['EditBox_0', 'EditBox_1']) this.unique(popup, name, EditBox).getComponent(EditBox)!.string = '';
        demo.active = false;
        this.unique(form.node, 'AddPlay').active = false;
        this.unique(form.node, 'ManageMember').active = false;
        void this.loadGroups();
    }
    private async loadGroups(): Promise<void> {
        const form = this.mainForm; if (!form) return;
        const revision = ++this.mainRevision;
        const { popup } = this.mainControls(form);
        const pidOne = this.mainInput(popup, 'EditBox_1'); const pidTwo = this.mainInput(popup, 'EditBox_0');
        if (pidOne < 0 || pidTwo < 0) { await this.tip('请输入纯数字的成员ID'); return; }
        let groups: Group[];
        try {
            groups = await this.client.request<Group[]>('club.CClubGroupingList', { clubId: this.clubId(), pidOne: pidOne || '', pidTwo: pidTwo || '' });
        } catch (error: unknown) { if (this.mainForm === form && this.mainRevision === revision) await this.tip(this.message(error, '获取限制组失败')); return; }
        if (this.mainForm === form && this.mainRevision === revision) this.renderGroups(groups);
    }
    private renderGroups(groups: Group[]): void {
        const form = this.mainForm; if (!form) return;
        const { content, demo } = this.mainControls(form);
        this.clearMainRows();
        for (const node of this.generated) if (isValid(node, true)) node.destroy();
        this.generated.clear(); demo.active = false;
        groups.forEach((group, index) => {
            const node = instantiate(demo); node.name = `forbid_${group.groupingId ?? 0}`; node.active = true;
            this.embeddedLabel(this.unique(node, 'PeopleCount'), 'lb', `${index + 1}.限制人数：${group.groupingSize ?? group.playerList?.length ?? 0}/15`);
            const players = group.playerList ?? [];
            for (let i = 0; i < 2; i += 1) {
                const slot = this.unique(node, `Player_${i}`); const player = players[i]; slot.active = Boolean(player);
                if (player) { this.embeddedLabel(slot, 'Name', String(player.name ?? '')); this.embeddedLabel(slot, 'ID', `ID:${player.pid ?? ''}`); }
            }
            const openMembers = () => { void this.openEmbeddedMembers(Number(group.groupingId ?? 0)); };
            for (const name of ['Btn_SetGroup', 'Btn_Add', 'Btn_DelGroup']) this.unique(node, name, Button).active = this.canManage();
            this.mainRowClick(node, 'Btn_SetGroup', openMembers);
            this.mainRowClick(node, 'Btn_Add', () => this.openAddPlay(Number(group.groupingId ?? 0)));
            this.mainRowClick(node, 'Btn_DelGroup', () => { void this.removeGroup(Number(group.groupingId ?? 0), node); });
            for (let i = 0; i < 2; i += 1) {
                const slot = this.unique(node, `Player_${i}`); const player = players[i];
                this.unique(slot, 'Btn_Del', Button).active = this.canManage();
                if (player) this.mainRowClick(slot, 'Btn_Del', () => { void this.removePid(Number(group.groupingId ?? 0), Number(player.pid ?? 0)); });
            }
            content.addChild(node); this.generated.add(node);
        });
        content.getComponent(Layout)?.updateLayout();
    }
    private openAddPlay(groupingId: number): void {
        if (!this.mainForm || !this.canManage()) return;
        const panel = this.unique(this.mainForm.node, 'AddPlay');
        this.addRevision += 1; this.groupingId = groupingId; this.selectedPid = 0;
        this.unique(panel, 'EditBox', EditBox).getComponent(EditBox)!.string = '';
        this.unique(panel, 'User').active = false;
        this.unique(panel, 'Btn_Add', Button).active = false;
        panel.active = true;
    }
    private mainInput(root: Node, name: string): number {
        const text = this.unique(root, name, EditBox).getComponent(EditBox)!.string.trim();
        if (!text) return 0;
        const value = Number(text);
        return /^\d+$/.test(text) && Number.isSafeInteger(value) ? value : -1;
    }
    private embeddedLabel(root: Node, name: string, value: string): void {
        setClubDynamicLabel(this.unique(root, name, Label).getComponent(Label)!, name, value);
    }
    private clearEmbeddedRows(): void {
        for (const dispose of this.embeddedRows.splice(0)) dispose();
        for (const node of this.embeddedNodes) if (isValid(node, true)) node.destroy();
        this.embeddedNodes.clear();
    }
    private async openEmbeddedMembers(groupingId: number): Promise<void> {
        const form = this.mainForm; if (!form || !this.canManage()) return;
        this.addRevision += 1; this.selectedPid = 0;
        this.unique(form.node, 'AddPlay').active = false;
        this.groupingId = groupingId;
        const panel = this.unique(form.node, 'ManageMember'); panel.active = true;
        const revision = ++this.memberRevision; const session = this.session;
        const list = this.unique(panel, 'PlayerInfo', ScrollView);
        const demo = this.unique(list, 'Demo'); const content = list.getComponent(ScrollView)!.content!;
        this.clearEmbeddedRows();
        demo.active = false;
        let members: Member[];
        try { members = await this.client.request<Member[]>('club.CClubGroupingMemberList', { clubId: this.clubId(), groupingId }); }
        catch (error: unknown) { if (this.mainForm === form && this.session === session && revision === this.memberRevision && panel.active) await this.tip(this.message(error, '获取限制组成员失败')); return; }
        if (this.mainForm !== form || this.session !== session || revision !== this.memberRevision || !panel.active) return;
        for (const member of members) {
            const player = member.player ?? {}; const node = instantiate(demo); node.name = `member_${player.pid ?? 0}`; node.active = true;
            this.embeddedLabel(node, 'Name', String(player.name ?? ''));
            this.embeddedLabel(node, 'ID', `ID:${player.pid ?? ''}`);
            for (const [name, add] of [['Btn_Add', true], ['Btn_Cancel', false]] as const) {
                const button = this.unique(node, name, Button);
                button.active = this.canManage() && (add ? !member.isBan : member.isBan !== false);
                const listener = () => { void this.saveEmbeddedMember(Number(player.pid ?? 0), add); };
                button.on(Button.EventType.CLICK, listener);
                this.embeddedRows.push(() => { if (isValid(button, true)) button.off(Button.EventType.CLICK, listener); });
            }
            content.addChild(node); this.embeddedNodes.add(node);
        }
        content.getComponent(Layout)?.updateLayout();
    }
    private async findEmbeddedPlayer(): Promise<void> {
        const form = this.mainForm; if (!form || !this.canManage()) return;
        const panel = this.unique(form.node, 'AddPlay');
        const text = this.unique(panel, 'EditBox', EditBox).getComponent(EditBox)!.string.trim();
        const revision = ++this.addRevision; const session = this.session;
        this.selectedPid = 0; this.unique(panel, 'User').active = false; this.unique(panel, 'Btn_Add', Button).active = false;
        if (!/^\d+$/.test(text) || !Number.isSafeInteger(Number(text)) || Number(text) <= 0) { await this.tip('请输入纯数字的成员ID'); return; }
        let result: Player | { player?: Player } | null;
        try { result = await this.client.request<Player | { player?: Player } | null>('club.CClubGroupingPidFind', { clubId: this.clubId(), pid: Number(text) }); }
        catch (error: unknown) { if (this.session === session && revision === this.addRevision) await this.tip(this.message(error, '查找成员失败')); return; }
        if (this.mainForm !== form || session !== this.session || revision !== this.addRevision || !panel.active) return;
        const player = result && ('player' in result ? result.player : result as Player);
        if (!player || !Number.isSafeInteger(Number(player.pid)) || Number(player.pid) <= 0) { await this.tip('未找到有效成员'); return; }
        this.selectedPid = Number(player.pid);
        const user = this.unique(panel, 'User');
        this.embeddedLabel(user, 'Name', String(player.name ?? '')); this.embeddedLabel(user, 'ID', `ID:${player.pid}`);
        user.active = true; this.unique(panel, 'Btn_Add', Button).active = true;
    }
    private async saveEmbeddedMember(pid: number, add: boolean): Promise<void> {
        const form = this.mainForm;
        if (!form || !this.canManage() || this.saving || !Number.isSafeInteger(pid) || pid <= 0) return;
        const session = this.session; const groupingId = this.groupingId; const addRevision = this.addRevision; const onChanged = this.context.onChanged;
        this.saving = true;
        try { await this.client.request(`club.CClubGroupingPid${add ? 'Add' : 'Remove'}`, { clubId: this.clubId(), groupingId, pid }); }
        catch (error: unknown) { if (session === this.session) { this.saving = false; await this.tip(this.message(error, add ? '添加成员失败' : '移除成员失败')); } return; }
        if (this.mainForm !== form || session !== this.session) return;
        this.saving = false;
        if (groupingId === this.groupingId) {
            if (addRevision === this.addRevision) {
                this.addRevision += 1; this.selectedPid = 0; this.unique(form.node, 'AddPlay').active = false;
            }
            if (this.unique(form.node, 'ManageMember').active) await this.openEmbeddedMembers(groupingId);
        }
        if (this.mainForm !== form || session !== this.session) return;
        await this.loadGroups();
        if (this.mainForm === form && session === this.session) onChanged?.();
    }
    private contains(root: Node, node: Node): boolean { return root === node || root.children.some(child => this.contains(child, node)); }
    private unique(root: Node, name: string, component?: typeof Button | typeof EditBox | typeof ScrollView | typeof Label, excluded?: Node | Node[]): Node {
        const matches: Node[] = [];
        const visit = (node: Node): void => {
            if (Array.isArray(excluded) ? excluded.includes(node) : node === excluded) return;
            if (node.name === name && (!component || node.getComponent<Component>(component))) matches.push(node);
            for (const child of node.children) visit(child);
        };
        visit(root);
        if (matches.length !== 1) {
            throw new Error(`[ClubBanDeskMate] ${name} 需要唯一匹配，候选：${matches.map(node => node.getPathInHierarchy()).join(', ') || '(缺失)'}；范围：${root.getPathInHierarchy()}`);
        }
        return matches[0];
    }
    private clearMain(): void {
        this.mainRevision += 1; this.session += 1; this.memberRevision += 1; this.addRevision += 1;
        this.selectedPid = 0; this.saving = false; this.clearEmbeddedRows();
        for (const node of this.generated) if (isValid(node, true)) node.destroy();
        this.generated.clear();
        if (this.mainForm && isValid(this.mainForm.node, true)) {
            this.unique(this.mainForm.node, 'AddPlay').active = false;
            this.unique(this.mainForm.node, 'ManageMember').active = false;
        }
        this.mainForm = null; this.clearMainRows();
        for (const dispose of this.mainDisposers.splice(0)) dispose();
    }
    private mainClick(root: Node, name: string, listener: () => void): void {
        const node = this.unique(root, name, Button);
        node.on(Button.EventType.CLICK, listener);
        this.mainDisposers.push(() => { if (isValid(node, true)) node.off(Button.EventType.CLICK, listener); });
    }
    private async addGroup(): Promise<void> {
        if (!this.mainForm) return;
        if (!this.canManage()) { await this.tip('只有亲友圈管理可添加限制'); return; }
        const form = this.mainForm; const session = this.session;
        try { await this.client.request('club.CClubGroupingAdd', { clubId: this.clubId() }); }
        catch (error: unknown) { if (this.mainForm === form && session === this.session) await this.tip(this.message(error, '新增限制组失败')); return; }
        if (this.mainForm === form && session === this.session) await this.loadGroups();
    }
    private async removeGroup(groupingId: number, node: Node): Promise<void> {
        if (!this.mainForm) return;
        if (!this.canManage()) return;
        const form = this.mainForm; const session = this.session;
        try { await this.client.request('club.CClubGroupingRemove', { clubId: this.clubId(), groupingId }); }
        catch (error: unknown) { if (this.mainForm === form && session === this.session) await this.tip(this.message(error, '删除限制组失败')); return; }
        if (this.mainForm === form && session === this.session && isValid(node, true)) { this.generated.delete(node); node.destroy(); }
    }
    private async removePid(groupingId: number, pid: number): Promise<void> {
        if (!this.mainForm) return;
        if (!this.canManage()) return;
        const form = this.mainForm; const session = this.session;
        try { await this.client.request('club.CClubGroupingPidRemove', { clubId: this.clubId(), groupingId, pid }); }
        catch (error: unknown) { if (this.mainForm === form && session === this.session) await this.tip(this.message(error, '移除成员失败')); return; }
        if (this.mainForm === form && session === this.session) await this.loadGroups();
    }

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
    private mainRowClick(root: Node, name: string, listener: () => void): void {
        const node = this.unique(root, name, Button);
        node.on(Button.EventType.CLICK, listener);
        this.mainRows.push(() => { if (isValid(node, true)) node.off(Button.EventType.CLICK, listener); });
    }
    private clearMainRows(): void { for (const dispose of this.mainRows.splice(0)) dispose(); }
    private clearRows(): void { for (const dispose of this.rows.splice(0)) dispose(); }
    private desc(root: Node, name: string): Node | null { if (root.name === name) return root; for (const child of root.children) { const found = this.desc(child, name); if (found) return found; } return null; }
    private message(error: unknown, fallback: string): string { return error instanceof Error ? error.message : fallback; }
    private async tip(text: string): Promise<void> { await this.forms.show('UIMessage_Drift', null, null, text); }
}
