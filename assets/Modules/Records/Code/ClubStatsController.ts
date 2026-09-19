import { Button, EditBox, Label, Layout, Node, instantiate } from 'cc';
import type { ProtocolClient } from '../../../Common/Code/Runtime/network/ProtocolClient';
import type { LegacyForm, LegacyFormManager } from '../../../Common/Code/Runtime/ui/LegacyFormManager';

interface StatsPlayer { pid?: number; name?: string }
interface StatsRow {
    player?: StatsPlayer; size?: number; winner?: number; point?: number; clubCent?: number;
    roomCard?: number; roomCardSize?: number; clubCard?: number; clubCardSize?: number;
}
interface StatsPage { totalPageNum?: number; clubPlayerRoomAloneLogBOS?: StatsRow[] }
interface OpenContext { clubId?: number; unionId?: number }

/** Authoritative data binding for the 2.22 club member statistics screen. */
export class ClubStatsController {
    private form: LegacyForm | null = null;
    private clubId = 0;
    private unionId = 0;
    private getType = 0;
    private query = '';
    private generation = 0;
    private readonly disposers: Array<() => void> = [];
    private readonly rowDisposers: Array<() => void> = [];

    public constructor(private readonly forms: LegacyFormManager, private readonly client: ProtocolClient,
        private readonly lobbyNode: Node, private readonly reportError: (error: unknown) => void) {}

    public install(): void {
        this.forms.register('UIClubStats', { zOrder: 11, lifecycle: {
            onCreate: form => this.bind(form),
            onShow: (form, context) => { void this.show(form, this.object(context) as OpenContext); },
            onClose: () => { this.generation += 1; this.form = null; this.clearRows(); },
            onDestroy: () => { this.generation += 1; this.form = null; this.clearRows(); },
        }});
    }

    public destroy(): void {
        this.generation += 1;
        this.clearRows();
        for (const dispose of this.disposers.splice(0)) dispose();
    }

    private bind(form: LegacyForm): void {
        this.click(form.node, 'Btn_Close', () => this.forms.closeAfterPointer('UIClubStats'));
        this.click(form.node, 'Btn_Back', () => this.forms.closeAfterPointer('UIClubStats'));
        this.click(form.node, 'Btn_Search', () => {
            this.query = this.desc(form.node, 'EditBox')?.getComponent(EditBox)?.string.trim() ?? '';
            void this.load();
        });
        const timeTypes: ReadonlyArray<[string, number, string]> = [
            ['Btn_Today', 0, '今天'], ['Btn_Yesterday', 1, '昨天'], ['Btn_ThreeDays', 2, '近三天'],
            ['Btn_Week', 5, '近七天'], ['Btn_Month', 3, '近一月'],
        ];
        for (const [name, value, text] of timeTypes) this.click(form.node, name, () => {
            this.getType = value; this.labelAt(form.node, 'TimeFilter/Current/Label', text);
            this.active(form.node, 'TimeFilter/Options', false); this.active(form.node, 'Mask_Dropdown', false);
            void this.load();
        });
        this.clickAt(form.node, 'TimeFilter/Current', () => {
            const options = this.at(form.node, 'TimeFilter/Options'); if (!options) return;
            options.active = !options.active; this.active(form.node, 'Mask_Dropdown', options.active);
        });
        this.click(form.node, 'Mask_Dropdown', () => {
            this.active(form.node, 'TimeFilter/Options', false); this.active(form.node, 'GameFilter/View', false);
            this.active(form.node, 'Mask_Dropdown', false);
        });
        // The current authoritative score-sheet protocol has one club-member scope.
        // Unsupported 2.22 hierarchy tabs are hidden instead of showing fabricated results.
        this.active(form.node, 'Options', false);
        this.active(form.node, 'GameFilter', false);
    }

    private async show(form: LegacyForm, context: OpenContext): Promise<void> {
        this.form = form;
        this.clubId = Math.max(0, Number(context.clubId ?? 0));
        this.unionId = Math.max(0, Number(context.unionId ?? 0));
        this.getType = 0; this.query = '';
        const edit = this.desc(form.node, 'EditBox')?.getComponent(EditBox); if (edit) edit.string = '';
        this.labelAt(form.node, 'TimeFilter/Current/Label', '今天');
        this.active(form.node, 'TimeFilter/Options', false); this.active(form.node, 'Mask_Dropdown', false);
        if (!this.clubId) { await this.tip('缺少亲友圈编号，无法查询战绩统计'); return; }
        await this.load();
    }

    private async load(): Promise<void> {
        const form = this.form; if (!form?.isShown() || !this.clubId) return;
        const generation = ++this.generation;
        this.render([]);
        this.state(form, '正在加载成员统计…');
        console.info('[ClubStats] load:start', { clubId: this.clubId, unionId: this.unionId,
            getType: this.getType, query: this.query });
        try {
            const rows: StatsRow[] = [];
            let totalPages = 1;
            for (let pageNum = 1; pageNum <= totalPages; pageNum += 1) {
                const page = await this.client.request<StatsPage>('club.CClubSChoolReport', {
                    clubId: this.clubId, unionId: this.unionId, roomIDList: [], isAll: true,
                    getType: this.getType, pageNum, query: this.query,
                });
                if (generation !== this.generation || !form.isShown()) return;
                totalPages = Math.max(1, Number(page.totalPageNum ?? 1));
                rows.push(...(Array.isArray(page.clubPlayerRoomAloneLogBOS) ? page.clubPlayerRoomAloneLogBOS : []));
            }
            console.info('[ClubStats] load:success', { clubId: this.clubId, getType: this.getType,
                pageCount: totalPages, rowCount: rows.length });
            this.render(rows);
        } catch (error) {
            if (generation !== this.generation || !form.isShown()) return;
            console.error('[ClubStats] load:failed', { clubId: this.clubId, getType: this.getType,
                message: error instanceof Error ? error.message : String(error) });
            this.render([]); this.state(form, '成员统计加载失败'); this.reportError(error);
            await this.tip(error instanceof Error ? error.message : '成员统计加载失败');
        }
    }

    private render(source: StatsRow[]): void {
        const form = this.form; if (!form) return;
        const content = this.at(form.node, 'StatsList/View/Content');
        const template = content ? this.desc(content, 'Item') : null;
        if (!content || !template) return;
        this.clearRows();
        for (const child of [...content.children]) if (child !== template) child.destroy();
        template.active = false; this.active(template, 'Btn_Details', true); this.active(template, 'BaseStats', true);
        const seen = new Set<number>();
        const rows = [...source].sort((a, b) => Number(b.size ?? 0) - Number(a.size ?? 0));
        for (const row of rows) {
            const pid = Number(row.player?.pid ?? 0); if (!pid || seen.has(pid)) continue; seen.add(pid);
            const item = instantiate(template); item.name = `Player_${pid}`; item.active = true;
            this.label(item, 'Lb_Id', `ID:${pid}`); this.label(item, 'Lb_Name', String(row.player?.name ?? ''));
            this.labelAt(item, 'Games/Label', String(row.size ?? 0));
            const score = Number(row.clubCent ?? row.point ?? 0);
            this.label(item, 'Lb_Win', score >= 0 ? `+${score}` : '');
            this.label(item, 'Lb_Lose', score < 0 ? String(score) : '');
            this.labelAt(item, 'BaseStats/Current/Label', `大赢家:${row.winner ?? 0}`);
            this.rowClick(item, 'Btn_Details', () => {
                void this.forms.show('ui/club/UIClubRecordUser', this.clubId, [], row, true,
                    this.getType, this.unionId > 0, this.unionId);
            });
            content.addChild(item);
        }
        content.getComponent(Layout)?.updateLayout();
        if (!seen.size) this.state(form, '暂无成员统计');
        this.lobbyNode.emit('club-stats-rendered', { clubId: this.clubId, rowCount: seen.size, getType: this.getType });
    }

    private state(form: LegacyForm, value: string): void {
        const template = this.at(form.node, 'StatsList/View/Content/Item');
        if (!template) return; template.active = true;
        this.label(template, 'Lb_Name', value); this.label(template, 'Lb_Id', '');
        this.labelAt(template, 'Games/Label', ''); this.label(template, 'Lb_Win', ''); this.label(template, 'Lb_Lose', '');
        this.active(template, 'Btn_Details', false); this.active(template, 'BaseStats', false);
    }
    private click(root: Node, name: string, fn: () => void): void { const node = this.desc(root, name); if (!node) return;
        node.getComponent(Button) ?? node.addComponent(Button); node.on(Button.EventType.CLICK, fn); this.disposers.push(() => node.off(Button.EventType.CLICK, fn)); }
    private clickAt(root: Node, path: string, fn: () => void): void { const node = this.at(root, path); if (!node) return;
        node.getComponent(Button) ?? node.addComponent(Button); node.on(Button.EventType.CLICK, fn); this.disposers.push(() => node.off(Button.EventType.CLICK, fn)); }
    private rowClick(root: Node, name: string, fn: () => void): void { const node = this.desc(root, name); if (!node) return;
        node.getComponent(Button) ?? node.addComponent(Button); node.on(Button.EventType.CLICK, fn); this.rowDisposers.push(() => node.off(Button.EventType.CLICK, fn)); }
    private clearRows(): void { for (const dispose of this.rowDisposers.splice(0)) dispose(); }
    private desc(root: Node, name: string): Node | null { if (root.name === name) return root; for (const child of root.children) {
        const found = this.desc(child, name); if (found) return found; } return null; }
    private at(root: Node, path: string): Node | null { let node: Node | null = root; for (const name of path.split('/')) node = node?.getChildByName(name) ?? null; return node; }
    private label(root: Node, name: string, value: string): void { const label = this.desc(root, name)?.getComponent(Label); if (label) label.string = value; }
    private labelAt(root: Node, path: string, value: string): void { const label = this.at(root, path)?.getComponent(Label); if (label) label.string = value; }
    private active(root: Node, path: string, value: boolean): void { const node = path.includes('/') ? this.at(root, path) : this.desc(root, path); if (node) node.active = value; }
    private object(value: unknown): Record<string, unknown> { return value && typeof value === 'object' ? value as Record<string, unknown> : {}; }
    private async tip(message: string): Promise<void> { await this.forms.show('UIMessage_Drift', null, null, message); }
}
