import { Button, EditBox, Label, Layout, Node, RichText, ScrollView, instantiate } from 'cc';
import { ProtocolClient } from '../../../Common/Code/Runtime/network/ProtocolClient';
import { LegacyForm, LegacyFormManager } from '../../../Common/Code/Runtime/ui/LegacyFormManager';
import { ScrollEvents } from '../../../Common/Code/UI/UnifiedScroll';

interface MessageContext {
    id?: number; clubId?: number; unionId?: number; name?: string; unionName?: string; unionSign?: number;
    pid?: number; opClubId?: number;
}

interface DynamicRow {
    execType?: number; createTime?: string | number; time?: string | number; pid?: number; execPid?: number;
    playerName?: string; execName?: string; value?: number; clubCent?: number; roomKey?: number | string;
    [key: string]: unknown;
}

export class LegacyClubMessageController {
    private readonly disposers: Array<() => void> = [];
    private readonly rowDisposers: Array<() => void> = [];
    private dynamicForm: LegacyForm | null = null;
    private sportsForm: LegacyForm | null = null;
    private context: MessageContext = {};
    private dynamicPage = 1;
    private dynamicDate = 0;
    private dynamicFilter: number[] = [];
    private sportsPage = 1;
    private sportsType = 0;
    private sportsDate = 0;
    private sportsLoading = false;

    public constructor(private readonly forms: LegacyFormManager, private readonly client: ProtocolClient) {}

    public install(): void {
        this.forms.register('ui/club/ClubMsg', {
            zOrder: 9,
            lifecycle: {
                onCreate: (form) => this.bindDynamic(form),
                onShow: (form, context) => this.showDynamic(form, context),
                onClose: () => { this.dynamicForm = null; this.clearRows(); },
            },
        });
        this.forms.register('ui/club/ClubScoreRecord', {
            zOrder: 9,
            lifecycle: {
                onCreate: (form) => this.bindSports(form),
                onShow: (form, context) => this.showSports(form, context),
                onClose: () => { this.sportsForm = null; this.clearRows(); },
            },
        });
    }

    public dispose(): void {
        this.clearRows();
        for (const dispose of this.disposers.splice(0)) dispose();
        this.dynamicForm = null;
        this.sportsForm = null;
    }

    private bindDynamic(form: LegacyForm): void {
        this.clickNamed(form.node, 'btn_close', () => this.forms.close('ui/club/ClubMsg'));
        this.clickNamed(form.node, 'btn_search', () => { this.dynamicPage = 1; void this.loadDynamic(); });
        this.clickNamed(form.node, 'btn_msg_more', () => this.toggleDateMenu(form.node));
        const dates: Array<[string, number]> = [
            ['btn_msg_today', 0], ['btn_msg_yesterday', 1], ['btn_msg_santian', 2], ['btn_msg_sanshitian', 3],
        ];
        for (const [name, value] of dates) this.clickNamed(form.node, name, () => {
            this.dynamicDate = value; this.dynamicPage = 1; this.toggleDateMenu(form.node, false); void this.loadDynamic();
        });
        this.clickNamed(form.node, 'btn_all', () => this.selectDynamicFilter([], form.node, 'btn_all'));
        this.clickNamed(form.node, 'btn_jiaru', () => this.selectDynamicFilter([4, 7, 30, 101], form.node, 'btn_jiaru'));
        this.clickNamed(form.node, 'btn_tuichu', () => this.selectDynamicFilter([5, 6, 31, 102, 103], form.node, 'btn_tuichu'));
    }

    private showDynamic(form: LegacyForm, context: unknown): void {
        this.dynamicForm = form;
        this.context = this.asContext(context);
        this.dynamicPage = 1; this.dynamicDate = 0; this.dynamicFilter = [];
        for (const name of ['pidEditBox', 'execPidEditBox']) {
            const input = this.desc(form.node, name)?.getComponent(EditBox); if (input) input.string = '';
        }
        this.toggleDateMenu(form.node, false);
        void this.loadDynamic();
    }

    private async loadDynamic(): Promise<void> {
        const form = this.dynamicForm; if (!form) return;
        const pid = this.numericInput(form.node, 'pidEditBox');
        const execPid = this.numericInput(form.node, 'execPidEditBox');
        if (pid < 0 || execPid < 0) { await this.tip('请输入正确的成员ID'); return; }
        try {
            const result = await this.client.request<unknown>('club.CClubDynamic', {
                clubId: this.clubId(), unionId: Number(this.context.unionId ?? 0), pageNum: this.dynamicPage,
                getType: this.dynamicDate, pid, execPid,
            });
            const rows = this.rows(result).filter((row) => !this.dynamicFilter.length
                || this.dynamicFilter.includes(Number(row.execType ?? 0)));
            this.render(form, rows, true);
        } catch (error: unknown) { await this.tip(this.error(error, '获取俱乐部动态失败')); }
    }

    private bindSports(form: LegacyForm): void {
        this.clickNamed(form.node, 'btn_close', () => this.forms.close('ui/club/ClubScoreRecord'));
        this.active(form.node, 'btn_last', false);
        this.active(form.node, 'btn_next', false);
        this.active(form.node, 'lb_page', false);
        const scroll = this.desc(form.node, 'content')?.parent?.parent?.getComponent(ScrollView);
        if (scroll) this.disposers.push(ScrollEvents.onBottom(scroll, () => {
            if (!this.sportsLoading) { this.sportsPage += 1; void this.loadSports(false); }
        }));
        for (let index = 0; index <= 11; index += 1) this.clickNamed(form.node, `btn_ChooseType_${index}`, () => {
            this.sportsType = index; this.sportsPage = 1; void this.loadSports(true);
        });
        const dateNames = ['btn_msg_today', 'btn_msg_yesterday', 'btn_msg_santian', 'btn_msg_sanshitian'];
        dateNames.forEach((name, index) => this.clickNamed(form.node, name, () => {
            this.sportsDate = index; this.sportsPage = 1; void this.loadSports(true);
        }));
    }

    private showSports(form: LegacyForm, context: unknown): void {
        this.sportsForm = form;
        this.context = this.asContext(context);
        this.sportsPage = 1; this.sportsType = 0; this.sportsDate = 0;
        void this.loadSports(true);
    }

    private async loadSports(refresh: boolean): Promise<void> {
        const form = this.sportsForm; if (!form) return;
        if (this.sportsLoading) return;
        this.sportsLoading = true;
        const pid = Number(this.context.pid ?? 0); const opClubId = Number(this.context.opClubId ?? 0);
        const protocol = opClubId > 0 ? 'union.CUnionClubCentMemberDynamicByPid'
            : pid > 0 ? 'club.CClubCentMemberDynamicByPid' : 'club.CClubCentDynamicByPid';
        try {
            const result = await this.client.request<unknown>(protocol, {
                clubId: this.clubId(), unionId: Number(this.context.unionId ?? 0), pageNum: this.sportsPage,
                type: this.sportsType, chooseType: this.sportsType, date: this.sportsDate,
                pid, opPid: pid, opClubId,
            });
            const rows = this.rows(result);
            if (!rows.length && this.sportsPage > 1) this.sportsPage -= 1;
            else this.render(form, rows, false, refresh);
        } catch (error: unknown) { if (!refresh && this.sportsPage > 1) this.sportsPage -= 1; await this.tip(this.error(error, '获取竞技动态失败')); }
        finally { this.sportsLoading = false; }
    }

    private render(form: LegacyForm, rows: DynamicRow[], dynamic: boolean, refresh = true): void {
        if (refresh) this.clearRows();
        const content = this.desc(form.node, 'content');
        const template = this.desc(form.node, dynamic ? 'demo' : 'message_demo') ?? this.desc(form.node, 'demo');
        if (!content || !template) return;
        if (refresh) for (const child of [...content.children]) if (child !== template) child.destroy();
        template.active = false;
        for (const row of rows) {
            const node = instantiate(template); node.active = true;
            const time = String(row.createTime ?? row.time ?? '');
            this.setAnyLabel(node, ['lb_time', 'time'], time);
            const message = dynamic ? this.dynamicText(row) : this.sportsText(row);
            const rich = this.desc(node, 'lb_message')?.getComponent(RichText);
            if (rich) rich.string = message; else this.setAnyLabel(node, ['lb_message', 'message'], message);
            content.addChild(node);
        }
        content.getComponent(Layout)?.updateLayout();
    }

    private active(root: Node, name: string, value: boolean): void { const node = this.desc(root, name); if (node) node.active = value; }

    private dynamicText(row: DynamicRow): string {
        const actor = String(row.execName ?? row.execPid ?? '系统');
        const target = String(row.playerName ?? row.pid ?? '成员');
        const map: Record<number, string> = {
            4: `${target}申请加入俱乐部`, 5: `${target}申请退出俱乐部`, 6: `${target}被移出俱乐部`, 7: `${target}加入俱乐部`,
            30: `${actor}同意${target}加入俱乐部`, 31: `${actor}同意${target}退出俱乐部`,
            101: `${target}加入俱乐部`, 102: `${target}退出俱乐部`, 103: `${actor}将${target}移出俱乐部`,
            104: `${actor}将${target}设为管理员`, 105: `${actor}取消${target}的管理员`, 106: `${actor}创建俱乐部`,
            109: `${actor}创建房间${row.roomKey ?? ''}`, 110: `${actor}禁止房间${row.roomKey ?? ''}`,
            111: `${actor}修改房间配置`, 112: `${actor}解散房间${row.roomKey ?? ''}`, 113: `房间${row.roomKey ?? ''}恢复正常`,
            114: `${actor}为${target}增加竞技点${row.value ?? row.clubCent ?? ''}`,
            115: `${actor}为${target}扣除竞技点${row.value ?? row.clubCent ?? ''}`,
            122: `${actor}授权${target}`, 123: `${actor}取消${target}授权`, 124: `${actor}为${target}设置补偿`, 125: `${actor}取消${target}补偿`,
            127: `${actor}将${target}设为联盟管理`, 128: `${actor}将${target}设为圈管理`,
            135: `${actor}取消${target}的联盟管理`, 136: `${actor}取消${target}的圈管理`,
            1001: `${actor}新增队长${target}`, 1002: `${actor}删除队长${target}`,
            1003: `${actor}调整队长${target}`, 1004: `${actor}修改推广关系`,
            1009: `${actor}增加保险箱竞技点${row.value ?? ''}`, 1010: `${actor}扣除保险箱竞技点${row.value ?? ''}`,
        };
        return map[Number(row.execType ?? 0)] ?? `${actor}执行俱乐部操作（类型${row.execType ?? 0}）`;
    }

    private sportsText(row: DynamicRow): string {
        const actor = String(row.execName ?? row.execPid ?? '系统');
        const target = String(row.playerName ?? row.pid ?? '成员');
        const value = row.value ?? row.clubCent ?? '';
        return `${actor} 对 ${target} 的竞技点变动：${value}`;
    }

    private selectDynamicFilter(types: number[], root: Node, selected: string): void {
        this.dynamicFilter = types; this.dynamicPage = 1;
        for (const name of ['btn_all', 'btn_jiaru', 'btn_tuichu']) {
            const node = this.desc(root, name); if (node) node.active = true;
            const mark = node ? this.desc(node, 'checkmark') : null; if (mark) mark.active = name === selected;
        }
        void this.loadDynamic();
    }

    private toggleDateMenu(root: Node, active?: boolean): void {
        const nodes = ['btn_msg_today', 'btn_msg_yesterday', 'btn_msg_santian', 'btn_msg_sanshitian']
            .map((name) => this.desc(root, name)).filter((node): node is Node => Boolean(node));
        const value = active ?? !nodes.some((node) => node.active); for (const node of nodes) node.active = value;
    }

    private rows(result: unknown): DynamicRow[] {
        if (Array.isArray(result)) return result as DynamicRow[];
        if (!result || typeof result !== 'object') return [];
        const value = result as Record<string, unknown>;
        for (const key of ['list', 'data', 'items', 'dynamicList', 'clubCentList']) if (Array.isArray(value[key])) return value[key] as DynamicRow[];
        return [];
    }

    private numericInput(root: Node, name: string): number {
        const value = this.desc(root, name)?.getComponent(EditBox)?.string.trim() ?? '';
        if (!value) return 0; return /^\d+$/.test(value) ? Number(value) : -1;
    }
    private clubId(): number { return Number(this.context.id ?? this.context.clubId ?? 0); }
    private asContext(value: unknown): MessageContext { return value && typeof value === 'object' ? value as MessageContext : {}; }
    private error(value: unknown, fallback: string): string { return value instanceof Error ? value.message : fallback; }
    private async tip(message: string): Promise<void> { await this.forms.show('UIMessage_Drift', null, null, message); }
    private clickNamed(root: Node, name: string, listener: () => void): void { const node = this.desc(root, name); if (!node) return; node.on(Button.EventType.CLICK, listener); this.disposers.push(() => node.off(Button.EventType.CLICK, listener)); }
    private clearRows(): void { for (const dispose of this.rowDisposers.splice(0)) dispose(); }
    private setAnyLabel(root: Node, names: string[], value: string): void { for (const name of names) { const label = this.desc(root, name)?.getComponent(Label); if (label) { label.string = value; return; } } }
    private desc(root: Node, name: string): Node | null { if (root.name === name) return root; for (const child of root.children) { const found = this.desc(child, name); if (found) return found; } return null; }
}
