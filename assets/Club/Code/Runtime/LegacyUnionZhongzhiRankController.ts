import { Button, JsonAsset, Label, Layout, Node, ScrollView, Toggle, instantiate, resources } from 'cc';
import { ProtocolClient } from '../../../Common/Code/Runtime/network/ProtocolClient';
import { populateAuthoritativeGameNames } from '../../../Games/Common/Code/Catalog/CatalogFamilyBindings';
import { LegacyForm, LegacyFormManager } from '../../../Common/Code/Runtime/ui/LegacyFormManager';
import { ScrollEvents } from '../../../Common/Code/UI/UnifiedScroll';

interface RankPlayer { pid?: number; name?: string; iconUrl?: string }
interface RankRow { id?: number; pid?: number; itemsValue?: number; player?: RankPlayer }
interface RankData { recordList?: RankRow[]; clubRankedZhongZhiSelf?: RankRow }
interface RankResponse { data?: RankData }
interface RankContext { id?: number; clubId?: number; unionId?: number; unionName?: string; unionSign?: number; rankedOpenZhongZhi?: boolean; rankedOpenEntryZhongZhi?: boolean }

export class LegacyUnionZhongzhiRankController {
    private form: LegacyForm | null = null;
    private context: RankContext = {};
    private page = 1;
    private getType = 0;
    private rankType = 0;
    private gameType = -1;
    private wechatName = true;
    private loading = false;
    private initializing = false;
    private readonly games = new Map<number, string>();
    private readonly disposers: Array<() => void> = [];
    private readonly rowDisposers: Array<() => void> = [];

    public constructor(private readonly forms: LegacyFormManager, private readonly client: ProtocolClient) {
        populateAuthoritativeGameNames(this.games);
    }

    public install(): void {
        this.forms.register('ui/club_2/Skin2UnionRankZhongZhi', { zOrder: 10, lifecycle: {
            onCreate: (form) => this.bind(form),
            onShow: (form, value, unionId, unionName, unionPostType, minister, unionSign, levelPromotion, rankedOpen, rankedEntry, defaultDay) => this.show(form, value, unionId, unionName, unionSign, rankedOpen, rankedEntry, defaultDay),
            onClose: () => { this.clearRows(); this.form = null; },
        }});
    }

    public dispose(): void { this.clearRows(); for (const dispose of this.disposers.splice(0)) dispose(); }

    private bind(form: LegacyForm): void {
        this.click(form.node, 'btn_close', () => this.forms.close('ui/club_2/Skin2UnionRankZhongZhi'));
        for (let day = 0; day < 4; day += 1) this.click(form.node, `btn_day_${day}`, () => this.selectDay(day));
        this.click(form.node, 'lb_4', () => this.toggleNode(form.node, 'toggleContainer'));
        this.click(form.node, 'img_qmp', () => { this.wechatName = !this.wechatName; this.renderNames(); this.label(form.node, 'lb_2_3', this.wechatName ? '群名片' : '微信昵称'); });
        this.click(form.node, 'btn_selectGame', () => this.toggleNode(form.node, 'img_gamedi'));
        for (let type = 0; type < 5; type += 1) {
            const toggle = this.desc(form.node, `toggle${type}`)?.getComponent(Toggle);
            if (!toggle) continue;
            const change = () => { if (!toggle.isChecked) return; this.rankType = type; this.page = 1; this.active(form.node, 'toggleContainer', false); this.label(form.node, 'lb_4', ['参与房间数', '参与小局数', '积分', '大赢家', '比赛最高分'][type] ?? ''); void this.load(true); };
            toggle.node.on(Toggle.EventType.TOGGLE, change);
            this.disposers.push(() => toggle.node.off(Toggle.EventType.TOGGLE, change));
        }
        for (const name of ['allToggle', 'openToggle']) {
            const toggle = this.desc(form.node, name)?.getComponent(Toggle);
            if (!toggle) continue;
            const change = () => { if (!this.initializing) void this.saveOpenState(name); };
            toggle.node.on(Toggle.EventType.TOGGLE, change);
            this.disposers.push(() => toggle.node.off(Toggle.EventType.TOGGLE, change));
        }
        const scroll = this.desc(form.node, 'rankScrollView')?.getComponent(ScrollView);
        if (scroll) {
            const more = () => { if (this.loading) return; this.page += 1; void this.load(false); };
            this.disposers.push(ScrollEvents.onBottom(scroll, more));
        }
    }

    private show(form: LegacyForm, value: unknown, unionId: unknown, unionName: unknown, unionSign: unknown, rankedOpen: unknown, rankedEntry: unknown, defaultDay: unknown): void {
        this.form = form;
        if (value && typeof value === 'object') this.context = value as RankContext;
        else this.context = { clubId: Number(value ?? 0), unionId: Number(unionId ?? 0), unionName: String(unionName ?? ''), unionSign: Number(unionSign ?? 0), rankedOpenZhongZhi: Boolean(rankedOpen), rankedOpenEntryZhongZhi: Boolean(rankedEntry) };
        this.page = 1;
        this.rankType = 0;
        this.gameType = -1;
        this.wechatName = true;
        this.label(form.node, 'lb_Title', `${this.context.unionName ?? ''}（ID:${this.context.unionSign ?? ''}）`);
        this.initializing = true;
        const all = this.desc(form.node, 'allToggle')?.getComponent(Toggle);
        const open = this.desc(form.node, 'openToggle')?.getComponent(Toggle);
        if (all) all.isChecked = Boolean(this.context.rankedOpenZhongZhi);
        if (open) open.isChecked = Boolean(this.context.rankedOpenEntryZhongZhi);
        this.initializing = false;
        this.active(form.node, 'toggleContainer', false);
        this.active(form.node, 'img_gamedi', false);
        this.renderGames(form.node);
        const typeToggle = this.desc(form.node, 'toggle0')?.getComponent(Toggle);
        if (typeToggle) typeToggle.isChecked = true;
        const day = Number(String(defaultDay ?? 'btn_day_0').replace('btn_day_', '')) || 0;
        this.selectDay(Math.max(0, Math.min(3, day)));
    }

    private selectDay(day: number): void {
        this.getType = day;
        this.page = 1;
        const root = this.form?.node;
        if (!root) return;
        for (let index = 0; index < 4; index += 1) {
            const node = this.desc(root, `btn_day_${index}`);
            if (!node) continue;
            this.active(node, 'img_off', index !== day);
            this.active(node, 'lb_off', index !== day);
            this.active(node, 'img_on', index === day);
            this.active(node, 'lb_on', index === day);
        }
        void this.load(true);
    }

    private async load(refresh: boolean): Promise<void> {
        const root = this.form?.node;
        if (!root || this.loading) return;
        this.loading = true;
        try {
            const response = await this.client.request<RankResponse>('Club.CClubReportRanked', { clubId: Number(this.context.id ?? this.context.clubId ?? 0), unionId: Number(this.context.unionId ?? 0), pageNum: this.page, type: this.rankType, getType: this.getType, gameType: this.gameType });
            const data = response.data ?? response as unknown as RankData;
            const rows = data.recordList ?? [];
            if (!rows.length && this.page > 1) { this.page -= 1; return; }
            this.render(rows, refresh);
            this.renderSelf(data.clubRankedZhongZhiSelf);
        } catch (error) { await this.tip(error instanceof Error ? error.message : '获取中至排行榜失败'); }
        finally { this.loading = false; }
    }

    private render(rows: RankRow[], refresh: boolean): void {
        const root = this.form?.node;
        const content = root ? this.desc(root, 'content') : null;
        const demo = root ? this.desc(root, 'demo') : null;
        if (!content || !demo) return;
        if (refresh) { this.clearRows(); for (const child of [...content.children]) child.destroy(); }
        demo.active = false;
        const existing = new Set(content.children.map((node) => node.name));
        for (const row of rows) {
            const pid = Number(row.player?.pid ?? row.pid ?? 0);
            const key = `${pid}_${row.id ?? 0}`;
            if (existing.has(key)) continue;
            const node = instantiate(demo);
            node.name = key;
            node.active = true;
            this.label(node, 'lb_name', String(row.player?.name ?? ''));
            this.label(node, 'lb_pid', String(pid));
            this.label(node, 'lb_value', String(row.itemsValue ?? 0));
            this.label(node, 'lb_rank', String(row.id ?? 0));
            content.addChild(node);
        }
        content.getComponent(Layout)?.updateLayout();
    }

    private renderSelf(row?: RankRow): void {
        const root = this.form?.node;
        if (!root || !row) return;
        this.label(root, 'lb_selfRank', Number(row.id ?? 0) === 0 ? '我的名次:未上榜' : `我的名次:${row.id}`);
        this.label(root, 'lb_selfName', String(row.player?.name ?? ''));
        this.label(root, 'lb_selfPid', String(row.player?.pid ?? row.pid ?? ''));
        this.label(root, 'lb_selfValue', String(row.itemsValue ?? 0));
    }

    private renderNames(): void {
        const content = this.form ? this.desc(this.form.node, 'content') : null;
        if (!content) return;
        for (const node of content.children) {
            const current = this.desc(node, 'lb_name')?.getComponent(Label);
            if (current) current.string = current.string;
        }
    }

    private renderGames(root: Node): void {
        const panel = this.desc(root, 'img_gamedi');
        const demo = this.desc(root, 'btn_gameDemo');
        if (!panel || !demo) return;
        for (const child of [...panel.children]) child.destroy();
        const entries: Array<[number, string]> = [[-1, '所有游戏'], ...this.games.entries()];
        for (const [id, name] of entries) {
            const node = instantiate(demo);
            node.name = `game_${id}`;
            node.active = true;
            this.label(node, 'lb_btnGame', name);
            this.active(node, 'img_sjxz', id === this.gameType);
            this.rowClick(node, () => { this.gameType = id; this.page = 1; this.label(root, 'lb_3', name); this.active(root, 'img_gamedi', false); this.renderGames(root); void this.load(true); });
            panel.addChild(node);
        }
    }

    private async saveOpenState(name: string): Promise<void> {
        const root = this.form?.node;
        if (!root) return;
        const all = this.desc(root, 'allToggle')?.getComponent(Toggle);
        const open = this.desc(root, 'openToggle')?.getComponent(Toggle);
        if (!all || !open) return;
        if (name === 'allToggle' && all.isChecked && !open.isChecked) open.isChecked = true;
        if (name === 'openToggle' && all.isChecked && !open.isChecked) all.isChecked = false;
        const protocol = name === 'allToggle' ? 'Union.CUnionChangeZhongZhiRnaked' : 'Union.CUnionChangeZhongZhiRnakedOpenEntry';
        const field = name === 'allToggle' ? { rankedOpenZhongZhi: all.isChecked } : { rankedOpenEntryZhongZhi: open.isChecked };
        try { await this.client.request(protocol, { clubId: Number(this.context.id ?? this.context.clubId ?? 0), unionId: Number(this.context.unionId ?? 0), ...field }); }
        catch (error) { await this.tip(error instanceof Error ? error.message : '修改排行榜设置失败'); }
    }

    private click(root: Node, name: string, action: () => void): void { const node = this.desc(root, name); if (!node) return; const handler = () => action(); node.on(Button.EventType.CLICK, handler); this.disposers.push(() => node.off(Button.EventType.CLICK, handler)); }
    private rowClick(node: Node, action: () => void): void { const handler = () => action(); node.on(Button.EventType.CLICK, handler); this.rowDisposers.push(() => node.off(Button.EventType.CLICK, handler)); }
    private clearRows(): void { for (const dispose of this.rowDisposers.splice(0)) dispose(); }
    private toggleNode(root: Node, name: string): void { const node = this.desc(root, name); if (node) node.active = !node.active; }
    private desc(root: Node, name: string): Node | null { if (root.name === name) return root; for (const child of root.children) { const found = this.desc(child, name); if (found) return found; } return null; }
    private label(root: Node, name: string, value: string): void { const label = this.desc(root, name)?.getComponent(Label); if (label) label.string = value; }
    private active(root: Node, name: string, value: boolean): void { const node = this.desc(root, name); if (node) node.active = value; }
    private async tip(message: string): Promise<void> { await this.forms.show('ui/UIMessage', message); }
}
