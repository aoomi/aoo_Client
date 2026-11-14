import { Button, Component, EditBox, Label, Layout, Node, RichText, ScrollView, Toggle, instantiate } from 'cc';
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
    private msgContext: MessageContext = {};
    private msgDisposers: Array<() => void> = [];
    private msgRows: Node[] = [];
    private msgVersion = 0;
    private msgBindings: { scroll: ScrollView; content: Node; template: Node; target: EditBox; operator: EditBox } | null = null;
    private dynamicPage = 1;
    private dynamicDate = 0;
    private dynamicFilter: number[] = [];
    private sportsPage = 1;
    private sportsType = 0;
    private sportsDate = 0;
    private sportsLoading = false;

    public constructor(private readonly forms: LegacyFormManager, private readonly client: ProtocolClient) {}

    public install(): void {
        this.forms.register('ui/club/ClubDynamic', {
            zOrder: 9,
            lifecycle: {
                onShow: (form, context) => this.openEmbeddedDynamic(form, context),
                onClose: () => this.closeEmbeddedDynamic(),
                onDestroy: () => this.closeEmbeddedDynamic(),
            },
        });
        this.forms.register('ui/club/ClubMsg', {
            zOrder: 9,
            lifecycle: {
                onShow: (form, context) => this.showDynamic(form, context),
                onClose: () => this.closeDynamic(),
                onDestroy: () => this.closeDynamic(),
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
        this.closeEmbeddedDynamic();
        this.closeDynamic();
        this.clearRows();
        for (const dispose of this.disposers.splice(0)) dispose();
        this.dynamicForm = null;
        this.sportsForm = null;
    }

    private embedded: LegacyForm | null = null;
    private embeddedContext: MessageContext & { selfPid?: number; unionType?: number } = {};
    private embeddedDisposers: Array<() => void> = [];
    private embeddedRows: Node[] = [];
    private embeddedRowDisposers: Array<() => void> = [];
    private embeddedTemplates: Node[] = [];
    private embeddedContent: Node | null = null;
    private embeddedVersion = 0;
    private embeddedPage = 1;
    private embeddedDate = 0;
    private embeddedType = 0;
    private embeddedLoading = false;
    private embeddedCache: DynamicRow[] = [];
    private embeddedServerPage = 0;
    private embeddedExhausted = false;

    // Push pages have no query id. Keep one wire request in flight, including across close/reset.
    private embeddedWireTail: Promise<void> = Promise.resolve();
    private embeddedWireTainted = false;
    private embeddedDetailLoading = new Set<Node>();
    private embeddedDetails = new Map<Node, Node[]>();

    private embeddedRequest(protocol: string, body: Record<string, number>): Promise<unknown> {
        const request = this.embeddedWireTail.then(async () => {
            if (this.embeddedWireTainted) throw new Error('[ClubDynamic] Previous page timed out; reconnect before querying again');
            if (body.pageNum === 1 || body.chooseType === 7) return this.client.request<unknown>(protocol, body);
            return new Promise<unknown>((resolve, reject) => {
                const off = this.client.on('club.SClub_UnionDynamic', (value: unknown) => {
                    const packet = value as { pageNum?: number };
                    if (Number(packet?.pageNum) !== body.pageNum) return;
                    clearTimeout(timer); off(); resolve(value);
                });
                const timer = setTimeout(() => {
                    off(); this.embeddedWireTainted = true;
                    reject(new Error('[ClubDynamic] Dynamic page push timed out; reconnect required'));
                }, 15000);
                this.client.notify(protocol, body);
            });
        });
        this.embeddedWireTail = request.then(() => undefined, () => undefined);
        return request;
    }

    /** Only searches this interface (or one cloned row), and rejects ambiguous bindings. */
    private embeddedNode(root: Node, name: string, component?: new (...args: any[]) => Component): Node {
        const matches: Array<{ node: Node; path: string }> = [];
        const walk = (node: Node, path: string): void => {
            if (node.name === name && (!component || node.getComponent(component))) matches.push({ node, path });
            for (const child of node.children) walk(child, `${path}/${child.name}`);
        };
        walk(root, root.name);
        if (matches.length !== 1) throw new Error(`[ClubDynamic] ${name}: ${matches.length ? matches.map(x => x.path).join(', ') : 'required node/component missing'}`);
        return matches[0].node;
    }

    private openEmbeddedDynamic(form: LegacyForm, value: unknown): void {
        this.closeEmbeddedDynamic();
        const root = form.node;
        // Validate every required binding before attaching any listeners or requesting data.
        const names = ['CompAdjust', 'Penalty', 'AuthAdd', 'AuthReduce', 'RoomAuthReduce', 'Reward', 'ShuffleFee',
            'SafeTransfer', 'RateChange', 'MemberRemove', 'WarnScore', 'AuditAdd', 'SelfRate', 'EntryFee',
            'SurvivalScore', 'MemberKick', 'OwnerChange'];
        const info = this.embeddedNode(root, 'Info');
        const templates = names.map(name => this.embeddedNode(info, name));
        const scroll = this.embeddedNode(root, 'DynamicInfo', ScrollView).getComponent(ScrollView)!;
        if (!scroll.content) throw new Error('[ClubDynamic] DynamicInfo ScrollView.content missing');
        const categories = ['Btn_All', 'Btn_OperationException', 'Btn_Record', 'Btn_RoomFee', 'Btn_ShuffleFee',
            'Btn_RoomFeeShare', 'Btn_Box', 'Btn_SurvivalTask', 'Btn_Eliminate', 'Btn_CrossLevelException', 'Btn_PersonnelChange']
            .map(name => this.embeddedNode(root, name, Toggle));
        const buttons = ['Btn_Close', 'btn_next', 'btn_last', 'btn_msg_more', 'btn_msg_today', 'btn_msg_yesterday',
            'btn_msg_santian', 'btn_msg_sanshitian'].map(name => this.embeddedNode(root, name, Button));
        const dateLabel = this.embeddedNode(buttons[3], 'label', Label).getComponent(Label)!;
        const dateTitles = ['今  天', '昨  天', '近三天', '近三十天'];
        this.embeddedNode(root, 'lb_page', Label);
        this.embeddedNode(root, 'Lb_Title', Label);
        this.embeddedNode(root, 'lb_tip', Label);
        this.embedded = form;
        this.embeddedContext = this.asContext(value);
        this.embeddedTemplates = templates;
        this.embeddedContent = scroll.content;
        for (const template of templates) template.active = false;
        this.embeddedPage = 1; this.embeddedDate = 0; this.embeddedType = 0;
        this.embeddedCache = []; this.embeddedServerPage = 0; this.embeddedExhausted = false;
        const bind = (node: Node, event: string, listener: () => void): void => {
            node.on(event, listener); this.embeddedDisposers.push(() => node.off(event, listener));
        };
        bind(buttons[0], Button.EventType.CLICK, () => this.forms.close('ui/club/ClubDynamic'));
        bind(buttons[1], Button.EventType.CLICK, () => { void this.loadEmbeddedDynamic(this.embeddedPage + 1); });
        bind(buttons[2], Button.EventType.CLICK, () => { if (this.embeddedPage > 1) void this.loadEmbeddedDynamic(this.embeddedPage - 1); });
        const dateNodes = buttons.slice(4);
        const dateMenu = (active: boolean): void => { for (const node of dateNodes) node.active = active; };
        bind(buttons[3], Button.EventType.CLICK, () => dateMenu(!dateNodes.some(node => node.active)));
        dateNodes.forEach((node, index) => bind(node, Button.EventType.CLICK, () => {
            this.embeddedDate = index; dateLabel.string = dateTitles[index];
            dateMenu(false); this.resetEmbeddedQuery();
        }));
        const unionType = Number(this.embeddedContext.unionType ?? 0);
        categories.forEach((node, index) => {
            node.active = index !== 3 && (index !== 6 || unionType === 0) && (![8, 9].includes(index) || unionType === 1);
            node.getComponent(Toggle)!.isChecked = index === 0;
            bind(node, Toggle.EventType.TOGGLE, () => {
                if (!node.active || !node.getComponent(Toggle)!.isChecked || this.embeddedType === index) return;
                this.embeddedType = index;
                categories.forEach((other, i) => { other.getComponent(Toggle)!.isChecked = i === index; });
                this.resetEmbeddedQuery();
            });
        });
        this.embeddedNode(root, 'Lb_Title', Label).getComponent(Label)!.string =
            `${this.embeddedContext.unionName ?? this.embeddedContext.name ?? ''} (ID:${this.embeddedContext.unionSign ?? this.embeddedContext.unionId ?? ''})`;
        dateLabel.string = dateTitles[this.embeddedDate];
        dateMenu(false);
        void this.loadEmbeddedDynamic(1);
    }

    private resetEmbeddedQuery(): void {
        this.embeddedVersion += 1; this.embeddedLoading = false;
        this.embeddedCache = []; this.embeddedServerPage = 0; this.embeddedExhausted = false;
        this.clearEmbeddedRows();
        void this.loadEmbeddedDynamic(1);
    }

    private async loadEmbeddedDynamic(page: number): Promise<void> {
        const form = this.embedded;
        if (!form || this.embeddedLoading) return;
        const version = this.embeddedVersion;
        this.embeddedLoading = true;
        try {
            while (this.embeddedCache.length < page * 20 && !this.embeddedExhausted) {
                const context = this.embeddedContext;
                const pid = Number(context.pid ?? 0), opClubId = Number(context.opClubId ?? 0);
                const protocol = opClubId > 0 ? 'union.CUnionSportsPointMemberDynamicByPid'
                    : pid > 0 ? 'club.CClubSportsPointMemberDynamicByPid' : 'club.CClubSportsPointDynamicByPid';
                const serverPage = this.embeddedServerPage + 1;
                let result: unknown;
                try { result = await this.embeddedRequest(protocol, {
                    clubId: Number(context.clubId ?? context.id ?? 0), unionId: Number(context.unionId ?? 0),
                    getType: this.embeddedDate, chooseType: this.embeddedType, pageNum: serverPage,
                    ...(pid > 0 ? opClubId > 0 ? { opPid: pid, opClubId } : { pid } : {}),
                }); } catch (error: unknown) {
                    if (version === this.embeddedVersion && form === this.embedded) {
                        this.embeddedNode(form.node, 'lb_tip', Label).getComponent(Label)!.string = this.error(error, '获取动态失败');
                        console.error('[ClubDynamic] request failed', error);
                    }
                    return;
                }
                if (version !== this.embeddedVersion || form !== this.embedded) return;
                const records = this.rows(result);
                this.embeddedServerPage = serverPage;
                this.embeddedCache.push(...records);
                // A short server page is not assumed final; only an empty page proves exhaustion.
                if (!records.length) this.embeddedExhausted = true;
            }
            if (version !== this.embeddedVersion || form !== this.embedded) return;
            if (page > 1 && (page - 1) * 20 >= this.embeddedCache.length) return;
            this.embeddedPage = page;
            this.renderEmbeddedRows(this.embeddedCache.slice((page - 1) * 20, page * 20));
            this.embeddedNode(form.node, 'lb_page', Label).getComponent(Label)!.string = String(page);
            this.embeddedNode(form.node, 'DynamicInfo', ScrollView).getComponent(ScrollView)!.scrollToTop();
        } finally { if (version === this.embeddedVersion) this.embeddedLoading = false; }
    }

    private renderEmbeddedRows(rows: DynamicRow[]): void {
        this.clearEmbeddedRows();
        const types = [[1,114,124,133],[2,115,125,134],[122,131,1020],[123,132,1021],[119,126,1006,1008,1013],
            [120,121],[129,130],[1009,1010,1011],[3,48,49],[1012],[40,41,46,47],[137,138,139,140],
            [50,51],[1014],[1016,1017,1018,1019],[1022,1023],[1024]];
        for (const row of rows) {
            const index = types.findIndex(list => list.includes(Number(row.execType)));
            if (index < 0) { console.error(`[ClubDynamic] Unsupported execType=${row.execType}`); continue; }
            const node = instantiate(this.embeddedTemplates[index]);
            // Never publish a clone until all of its real fields have been populated.
            this.embeddedRows.push(node);
            this.fillEmbeddedRow(node, row, index);
            node.active = true; this.embeddedContent!.addChild(node);
        }
        this.embeddedContent?.getComponent(Layout)?.updateLayout();
    }

    private fillEmbeddedRow(node: Node, row: DynamicRow, index: number): void {
        const text = (name: string, value: unknown): void => {
            this.embeddedNode(node, name, Label).getComponent(Label)!.string = String(value ?? '');
        };
        const active = (name: string, value: boolean): void => { this.embeddedNode(node, name).active = value; };
        const type = Number(row.execType);
        const person = (name: unknown, id: unknown): string => `${name ?? ''}(ID:${id ?? ''})`;
        const timestamp = Number(row.execTime);
        const date = new Date(timestamp < 1e12 ? timestamp * 1000 : timestamp);
        const pad = (value: number): string => String(value).padStart(2, '0');
        text('Time', Number.isFinite(timestamp) && !Number.isNaN(date.getTime())
            ? `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}` : row.execTime);
        if ([0,1,2,3,11].includes(index)) {
            text('OpClubName', `圈:${row.execClubName ?? ''}`); text('OpClubId', `ID:${row.execClubSign ?? ''}`);
            text('OpName', type === 1020 || type === 1021 ? row.msg : row.execName);
            text('OpId', `ID:${type === 1020 || type === 1021 ? row.roomKey ?? '' : row.execPid ?? ''}`);
            text('OpDelta', row.execPidValue); text('OpBalance', row.execPidCurValue);
            const own = Number(row.execPid) === Number(this.embeddedContext.selfPid);
            active('OpBalance', own); active('BalanceSep', own);
            text('ToClubName', `圈:${row.clubName ?? ''}`); text('ToClubId', `ID:${row.clubSign ?? ''}`);
            text('ToUserName', type === 1020 || type === 1021 ? row.execPidPreValue : row.name);
            text('ToUserId', `ID:${type === 1020 || type === 1021 ? row.pidPreValue ?? '' : row.pid ?? ''}`);
            text('Delta', row.pidValue); text('Balance', row.pidCurValue);
            text('TypeText', index === 11 ? [137,139].includes(type) ? '审核增加' : '审核减少'
                : ['异常补偿','异常处罚','授权增加','授权减少'][index]);
        } else if ([4,5,6].includes(index)) {
            text('RoomNo', row.roomKey == null ? '' : `房间号：${row.roomKey}`);
            text('Delta', row.value); text('Balance', row.curValue);
            const show = Number(this.embeddedContext.unionType ?? 0) !== 1;
            active('Balance', show); active('BalanceSep', show);
            text('TypeText', index === 4 ? type === 119 ? '赢家报名费' : Number(row.value) > 0 ? '报名费获得' : '报名费分出'
                : index === 5 ? type === 120 ? '对局获得' : '对局失去' : type === 129 ? '洗牌消耗' : '洗牌获得');
        } else if (index === 7) {
            text('OpClubName', row.execClubName); text('ToClubName', row.clubName);
            text('OpDelta', row.execPidValue); text('OpBalance', row.execPidCurValue);
            text('Delta', row.pidValue); text('Balance', row.pidCurValue);
            const verb = type === 1009 ? '转入' : type === 1010 ? '转出' : '关闭';
            text('OpText', verb); text('TypeText', `保险柜${verb}`);
        } else if (index === 8) {
            text('OpName', person(row.execName,row.execPid)); text('ToUserName', person(row.name,row.pid));
            text('OpDelta', type === 3 ? row.curValue : ''); text('Delta', type === 3 ? row.value : '');
            active('OpIcon', type !== 49); text('TypeText', type === 3 ? '分成修改' : type === 48 ? '预留值修改' : '区间分成');
        } else if (index === 9) {
            text('OpName', person(row.execName,row.execPid)); text('Delta', row.execPidValue);
            text('Balance', row.execPidCurValue); text('TypeText', '成员移除');
        } else if (index === 10) {
            text('OpName', person(row.execName,row.execPid)); text('OpDelta', row.preValue);
            text('Delta', [40,46].includes(type) ? '无' : row.curValue);
            text('TypeText', type < 46 ? '推广员预警值' : '个人预警值');
        } else if (index === 12) {
            const range = `(${row.preValue ?? ''},${row.curValue ?? ''}]`;
            text('ToUserName', person(row.name,row.pid)); text('OpDelta', row.pidPreValue); text('Delta', row.pidCurValue);
            text('OpTitle', type === 50 ? '被修改人' : `${range}，可分配值`);
            text('RateTitle', type === 50 ? `${range}，分配给自己` : ''); text('TypeText', '个人分成修改');
        } else if (index === 13) {
            text('RoomNo', `房间号：${row.roomKey ?? ''} 房间名：${row.roomName ?? ''}`);
            text('Delta', row.num); text('Balance', row.curRemainder); text('TypeText', '房间报名费');
            const show = Number(this.embeddedContext.unionType ?? 0) !== 1;
            active('Balance', show); active('BalanceSep', show);
            active('DetailPanel', false); active('DetailItem', false);
            // Detail data is fetched on demand; the saved example remains hidden.
            const button = this.embeddedNode(node, 'DetailBtn', Button);
            const listener = (): void => { void this.loadEmbeddedDetail(node, row); };
            button.on(Button.EventType.CLICK, listener);
            this.embeddedRowDisposers.push(() => button.off(Button.EventType.CLICK, listener));
        } else if (index === 14) {
            text('OpName', person(row.execName,row.execPid)); text('ToUserName', person(row.name,row.pid));
            text('OpDelta', type === 1017 ? '无' : row.preValue); text('Delta', row.curValue);
            text('TypeText', ({1016:'生存积分关闭',1017:'生存积分开启',1018:'生存积分修改',1019:'淘汰分修改'} as Record<number,string>)[type]);
        } else if (index === 15) {
            text('OpName', row.msg); text('OpId', `ID:${row.roomKey ?? ''}`);
            text('ToUserName', row.name); text('ToUserId', `ID:${row.pid ?? ''}`);
            text('OpText', type === 1022 ? '踢出' : '加入'); text('TypeText', type === 1022 ? '踢出亲友圈' : '加入亲友圈');
        } else if (index === 16) {
            text('OpName', person(row.msg,row.roomKey)); text('ToUserName', person(row.name,row.pid));
            text('OldOwner', person(row.execName,row.execPid)); text('NewOwner', person(row.pidCurValue,row.pidPreValue));
            text('TypeText', '圈主变更');
        }
    }

    private async loadEmbeddedDetail(node: Node, row: DynamicRow): Promise<void> {
        const version = this.embeddedVersion;
        const panel = this.embeddedNode(node, 'DetailPanel');
        if (panel.active) { panel.active = false; return; }
        if (this.embeddedDetailLoading.has(node)) return;
        this.embeddedDetailLoading.add(node);
        let result: unknown;
        try {
            result = await this.client.request<unknown>('club.CClubRoomPromotionPointDetail', {
                roomId: row.roomId, pid: row.pid, getType: this.embeddedDate,
            });
        } catch (error: unknown) { console.error('[ClubDynamic] detail request failed', error); return; }
        finally { this.embeddedDetailLoading.delete(node); }
            if (version !== this.embeddedVersion || !this.embeddedRows.includes(node)) return;
            for (const child of this.embeddedDetails.get(node) ?? []) { child.removeFromParent(); child.destroy(); }
            const generated: Node[] = []; this.embeddedDetails.set(node, generated);
            const template = this.embeddedNode(node, 'DetailItem');
            for (const detail of this.rows(result)) {
                const item = instantiate(template);
                this.embeddedNode(item, 'Text', Label).getComponent(Label)!.string = Number(detail.type) === 1
                    ? `上级分成 ${detail.reasonPidName ?? ''}` : Number(detail.type) === 2
                        ? `分给下级 ${detail.reasonPidName ?? ''}` : '玩家支付的房间报名费';
                this.embeddedNode(item, 'Delta_2', Label).getComponent(Label)!.string = String(detail.num ?? '');
                item.active = true; panel.addChild(item); generated.push(item);
            }
            panel.active = true; panel.getComponent(Layout)?.updateLayout();
    }

    private clearEmbeddedRows(): void {
        for (const dispose of this.embeddedRowDisposers.splice(0)) dispose();
        for (const node of this.embeddedRows.splice(0)) { node.removeFromParent(); node.destroy(); }
        this.embeddedDetails.clear(); this.embeddedDetailLoading.clear();
    }

    private closeEmbeddedDynamic(): void {
        this.embeddedVersion += 1;
        for (const dispose of this.embeddedDisposers.splice(0)) dispose();
        this.clearEmbeddedRows();
        this.embedded = null; this.embeddedContent = null; this.embeddedTemplates = [];
        this.embeddedCache = []; this.embeddedLoading = false;
    }

    /** ClubMsg bindings are scoped to this form or one generated row. */
    private msgNode(root: Node, name: string, component?: new (...args: any[]) => Component): Node {
        const candidates: Array<{ node: Node; path: string }> = [];
        const visit = (node: Node, path: string): void => {
            if (node.name === name && (!component || node.getComponent(component))) candidates.push({ node, path });
            for (const child of node.children) visit(child, `${path}/${child.name}`);
        };
        visit(root, root.name);
        if (candidates.length !== 1) throw new Error(`[ClubMsg] ${name}: ${candidates.length
            ? candidates.map(item => item.path).join(', ') : 'required node/component missing'}`);
        return candidates[0].node;
    }

    private showDynamic(form: LegacyForm, context: unknown): void {
        this.closeDynamic();
        const root = form.node;
        const scroll = this.msgNode(root, 'Mag', ScrollView).getComponent(ScrollView)!;
        const content = scroll.content;
        let ancestor: Node | null = content;
        while (ancestor && ancestor !== root) ancestor = ancestor.parent;
        if (!content || ancestor !== root) throw new Error('[ClubMsg] Mag ScrollView.content must belong to ClubMsg');
        const template = this.msgNode(root, 'Demo');
        this.msgNode(template, 'Msg', RichText);
        this.msgNode(template, 'Time', Label);
        const target = this.msgNode(root, 'TargetOperatorEditBox', EditBox).getComponent(EditBox)!;
        const operator = this.msgNode(root, 'OperatorEditBox', EditBox).getComponent(EditBox)!;
        const close = this.msgNode(root, 'Btn_Close', Button);
        const find = this.msgNode(root, 'Btn_Find', Button);
        const more = this.msgNode(root, 'Btn_More', Button);
        const dateLabel = this.msgNode(more, 'label', Label).getComponent(Label)!;
        const dates = ['Btn_Today', 'Btn_Yesterday', 'Btn_LastThreeDays', 'Btn_LastThirtyDays']
            .map(name => this.msgNode(root, name, Button));
        const titles = dates.map(node => this.msgNode(node, 'label', Label).getComponent(Label)!.string);
        const tabs = ['Btn_All', 'Btn_JoinMsg', 'Btn_Exit'].map(name => this.msgNode(root, name, Toggle));
        const filters = [[], [4, 7, 30, 101], [5, 6, 31, 102, 103]];
        this.dynamicForm = form; this.msgContext = this.asContext(context);
        this.msgBindings = { scroll, content, template, target, operator };
        this.dynamicPage = 1; this.dynamicDate = 0; this.dynamicFilter = [];
        template.active = false; target.string = ''; operator.string = '';
        const hideDates = (): void => { for (const node of dates) node.active = false; };
        hideDates(); dateLabel.string = titles[0];
        tabs.forEach((node, index) => { node.getComponent(Toggle)!.isChecked = index === 0; });
        const click = (node: Node, listener: () => void): void => {
            node.on(Button.EventType.CLICK, listener);
            this.msgDisposers.push(() => node.off(Button.EventType.CLICK, listener));
        };
        click(close, () => this.forms.close('ui/club/ClubMsg'));
        click(find, () => { this.dynamicPage = 1; void this.loadDynamic(); });
        click(more, () => { const visible = !dates.some(node => node.active); dates.forEach(node => { node.active = visible; }); });
        dates.forEach((node, index) => click(node, () => {
            this.dynamicDate = index; this.dynamicPage = 1; dateLabel.string = titles[index];
            hideDates(); void this.loadDynamic();
        }));
        tabs.forEach((node, index) => {
            const listener = (): void => {
                if (!node.getComponent(Toggle)!.isChecked) return;
                this.dynamicFilter = filters[index]; this.dynamicPage = 1; void this.loadDynamic();
            };
            node.on(Toggle.EventType.TOGGLE, listener);
            this.msgDisposers.push(() => node.off(Toggle.EventType.TOGGLE, listener));
        });
        void this.loadDynamic();
    }

    private clearMsgRows(): void {
        for (const node of this.msgRows.splice(0)) {
            if (node.isValid) { node.removeFromParent(); node.destroy(); }
        }
    }

    private closeDynamic(): void {
        this.msgVersion += 1;
        for (const dispose of this.msgDisposers.splice(0)) dispose();
        this.clearMsgRows();
        if (this.msgBindings?.template.isValid) this.msgBindings.template.active = false;
        this.msgBindings = null; this.dynamicForm = null; this.msgContext = {};
    }

    private async loadDynamic(): Promise<void> {
        const form = this.dynamicForm; const bindings = this.msgBindings;
        if (!form || !bindings) return;
        const version = ++this.msgVersion;
        const pid = this.numericInput(bindings.target);
        const execPid = this.numericInput(bindings.operator);
        if (pid < 0 || execPid < 0) { await this.tip('请输入正确的成员ID'); return; }
        const filter = [...this.dynamicFilter];
        let result: unknown;
        try {
            result = await this.client.request<unknown>('club.CClubDynamic', {
                clubId: Number(this.msgContext.id ?? this.msgContext.clubId ?? 0),
                unionId: Number(this.msgContext.unionId ?? 0), pageNum: this.dynamicPage,
                getType: this.dynamicDate, pid, execPid,
            });
        } catch (error: unknown) {
            if (version === this.msgVersion && this.dynamicForm === form) await this.tip(this.error(error, '获取俱乐部动态失败'));
            return;
        }
        if (version !== this.msgVersion || this.dynamicForm !== form || !form.node.isValid) return;
        const rows = this.rows(result).filter(row => !filter.length || filter.includes(Number(row.execType ?? 0)));
        this.clearMsgRows();
        for (const row of rows) {
            const node = instantiate(bindings.template);
            this.msgRows.push(node);
            this.msgNode(node, 'Msg', RichText).getComponent(RichText)!.string = this.dynamicText(row);
            this.msgNode(node, 'Time', Label).getComponent(Label)!.string = String(row.createTime ?? row.time ?? '');
            node.active = true; bindings.content.addChild(node);
        }
        bindings.content.getComponent(Layout)?.updateLayout();
        bindings.scroll.scrollToTop();
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

    private rows(result: unknown): DynamicRow[] {
        if (Array.isArray(result)) return result as DynamicRow[];
        if (!result || typeof result !== 'object') return [];
        const value = result as Record<string, unknown>;
        for (const key of ['list', 'data', 'items', 'dynamicList', 'clubCentList', 'unionDynamicItemList']) if (Array.isArray(value[key])) return value[key] as DynamicRow[];
        return [];
    }

    private numericInput(input: EditBox): number {
        const value = input.string.trim();
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
