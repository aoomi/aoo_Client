import { Button, EditBox, Label, Layout, Node, ScrollView, Toggle, instantiate } from 'cc';
import { ProtocolClient } from '../../../Common/Code/Runtime/network/ProtocolClient';
import { LegacyForm, LegacyFormManager } from '../../../Common/Code/Runtime/ui/LegacyFormManager';
import { ScrollEvents } from '../../../Common/Code/UI/UnifiedScroll';
import { setClubDynamicLabel } from './ClubDynamicLabel';

interface Context { id?: number; clubId?: number; unionId?: number; unionName?: string; unionSign?: number; unionPostType?: number; minister?: number; levelPromotion?: number }
interface CompetitionTime { type?: number; beginTime?: number | string; status?: number }
interface LeagueRow { id?: number; clubName?: string; clubSign?: number; promotionShareValue?: number; unionAllMemberPointTotal?: number; zhongZhiTotalPoint?: number; consumeValue?: number }
interface CompetitionRow { id?: number; pid?: number; name?: string; scorePoint?: number; playerTotalPoint?: number; totalPoint?: number }
interface CompetitionResult { clubPromotionLevelItemList?: CompetitionRow[]; totalPointShowStatus?: number; scorePointTotal?: number }
interface TeamRow { pid?: number; name?: string; level?: number; scorePoint?: number; number?: number; clubCentConsume?: number; consume?: number }
interface TeamResult { clubTeamListInfoList?: TeamRow[] }
interface TeamDetailRow extends TeamRow { position?: number; eliminatePoint?: number }
interface ShortPlayer { pid?: number; name?: string; iconUrl?: string }
interface AliveRow { shortPlayer?: ShortPlayer; upPlayerName?: string; eliminatePoint?: number; alivePoint?: number; clubCent?: number; clubId?: number }

export class LegacyUnionZhongzhiManagerController {
    private form: LegacyForm | null = null;
    private context: Context = {};
    private times: CompetitionTime[] = [];
    private periodType = 0;
    private page = 1;
    private competitionPage = 1;
    private teamPage = 1;
    private alivePage = 1;
    private auditPage = 1;
    private aliveType = 0;
    private detailPid = 0;
    private detailLevel = 1;
    private auxiliaryForm: LegacyForm | null = null;
    private auxiliaryPath = '';
    private auxiliaryPage = 1;
    private auxiliaryClubId = 0;
    private auxiliaryPid = 0;
    private leagueRows: LeagueRow[] = [];
    private competitionRows: CompetitionRow[] = [];
    private totalPointShowStatus = 0;
    private readonly disposers: Array<() => void> = [];
    private readonly rowDisposers: Array<() => void> = [];

    public constructor(private readonly forms: LegacyFormManager, private readonly client: ProtocolClient) {}

    public install(): void {
        this.forms.register('ui/club_2/Skin2UnionManagerZhongZhi', { zOrder: 10, lifecycle: {
            onCreate: (form) => this.bind(form),
            onShow: (form, value, unionId, unionName, unionPostType, minister, unionSign, levelPromotion, defaultPage) => this.show(form, value, unionId, unionName, unionPostType, minister, unionSign, levelPromotion, defaultPage),
            onClose: () => { this.clearRows(); this.form = null; },
        }});
        for (const path of ['ui/club_2/UIClubAddCaptain_2', 'ui/club_2/UIClubChangePromotion_2']) this.forms.register(path, { zOrder: 12, lifecycle: { onCreate: (form) => this.bindAuxiliary(form, path), onShow: (form, clubId, pid) => this.showAuxiliary(form, path, clubId, pid), onClose: () => { this.auxiliaryForm = null; this.clearRows(); } }});
        this.forms.register('ui/club_2/UIPlayerRaceRankInfo', { zOrder: 12, lifecycle: { onCreate: (form) => this.bindRaceInfo(form), onShow: (form, clubId, pid, type) => this.showRaceInfo(form, clubId, pid, type), onClose: () => { this.auxiliaryForm = null; this.clearRows(); } }});
    }

    public dispose(): void { this.clearRows(); for (const dispose of this.disposers.splice(0)) dispose(); }

    private bind(form: LegacyForm): void {
        this.click(form.node, 'btn_close', () => this.closeManager());
        this.click(form.node, 'btn_newRaceRankZhongzhi', () => this.openMain('rank'));
        this.click(form.node, 'btn_RaceManageZhongzhi', () => this.openMain('manage'));
        const rank = this.desc(form.node, 'btn_newRaceRankZhongzhiNode');
        if (rank) {
            this.click(rank, 'btn_liansai', () => this.openRank('league'));
            this.click(rank, 'btn_jingji', () => this.openRank('competition'));
            this.click(rank, 'img_rqdi', () => this.toggle(rank, 'img_sjdi'));
            this.click(rank, 'btn_search', () => { this.page = 1; void this.loadLeague(true); });
            this.click(rank, 'btn_searchjingji', () => { this.competitionPage = 1; void this.loadCompetition(true); });
            this.click(rank, 'btn_showjifen', () => { void this.changeTotalPointStatus(); });
            for (let column = 3; column <= 7; column += 1) this.click(rank, `lb_${column}`, () => this.sortLeague(column));
            this.click(rank, 'lbJingJi_5', () => this.sortCompetition());
            const leagueScroll = this.desc(this.desc(rank, 'liansaiNode') ?? rank, 'rankScrollView');
            const competitionScroll = this.desc(this.desc(rank, 'jingjiNode') ?? rank, 'rankScrollView');
            if (leagueScroll) this.scrollMore(leagueScroll, () => { this.page += 1; void this.loadLeague(false); });
            if (competitionScroll) this.scrollMore(competitionScroll, () => { this.competitionPage += 1; void this.loadCompetition(false); });
        }
        const manage = this.desc(form.node, 'btn_RaceManageZhongzhiNode');
        if (manage) {
            for (const [name, page] of [['toggle1', 'team'], ['toggle2', 'alive'], ['toggle3', 'audit']] as Array<[string, string]>) {
                const toggle = this.desc(this.desc(manage, 'topToggleContainer') ?? manage, name)?.getComponent(Toggle);
                if (!toggle) continue;
                const change = () => { if (toggle.isChecked) this.openManage(page); };
                toggle.node.on(Toggle.EventType.TOGGLE, change);
                this.disposers.push(() => toggle.node.off(Toggle.EventType.TOGGLE, change));
            }
            const team = this.desc(manage, 'zhanduiNode');
            if (team) {
                this.click(team, 'img_rqdi', () => this.toggle(team, 'img_sjdi'));
                this.click(team, 'btn_search', () => { this.teamPage = 1; void this.loadTeams(true); });
                this.click(team, 'lb_4', () => this.active(team, 'selectzd', true));
                this.click(team, 'selectzd', () => { this.active(team, 'selectzd', false); this.teamPage = 1; void this.loadTeams(true); });
                this.click(team, 'btn_huizong', () => { void this.forms.show('ui/club_2/UIPromoterAllReport_2', this.clubId()); });
                this.click(team, 'btn_addDuiZhang', () => { void this.forms.show('ui/club_2/UIClubAddCaptain_2', this.clubId()); });
                const scroll = this.desc(team, 'rankScrollView');
                if (scroll) this.scrollMore(scroll, () => { this.teamPage += 1; void this.loadTeams(false); });
            }
            const detail = this.desc(manage, 'zhanduiDetailNode');
            if (detail) {
                this.click(detail, 'img_rqdi', () => this.toggle(detail, 'img_sjdi'));
                this.click(detail, 'btn_setLevel', () => this.active(detail, 'selectzd', true));
                this.click(detail, 'selectzd', () => { void this.changeTeamLevel(detail); });
                this.click(detail, 'btn_huizong', () => { void this.forms.show('ui/club_2/UIPromoterAllReport_2', this.clubId(), this.detailPid); });
                this.click(detail, 'btn_changePromotion', () => { void this.forms.show('ui/club_2/UIClubChangePromotion_2', this.clubId(), this.detailPid); });
                this.click(detail, 'btn_dissolvezhandui', () => { void this.dissolveTeam(); });
                const scroll = this.desc(detail, 'rankScrollView');
                if (scroll) this.scrollMore(scroll, () => { this.teamPage += 1; void this.loadTeamDetail(false); });
            }
            const alive = this.desc(manage, 'changeAliveNode');
            if (alive) {
                this.click(alive, 'btn_search', () => { this.alivePage = 1; void this.loadAlive(true); });
                this.click(alive, 'btn_allPlayer', () => this.active(alive, 'selectType', true));
                this.click(alive, 'selectType', () => this.active(alive, 'selectType', false));
                for (let type = 0; type < 4; type += 1) this.click(alive, `btn_type_${type}`, () => { this.aliveType = type; this.alivePage = 1; this.active(alive, 'selectType', false); this.label(alive, 'lb_4', ['所有成员', '最近一天无战绩', '最近三天无战绩', '最近七天无战绩'][type] ?? ''); void this.loadAlive(true); });
                this.click(alive, 'btn_changeMulti', () => { void this.changeAliveMulti(alive); });
                this.click(alive, 'btn_record', () => { void this.forms.show('ui/club/ClubScoreRecord', this.clubId(), Number(this.context.unionId ?? 0), String(this.context.unionName ?? ''), Number(this.context.unionSign ?? 0), 0, 0, 'btn_ChooseType_9'); });
                const all = this.desc(alive, 'allToggle')?.getComponent(Toggle);
                if (all) { const change = () => this.selectAllAlive(alive, all.isChecked); all.node.on(Toggle.EventType.TOGGLE, change); this.disposers.push(() => all.node.off(Toggle.EventType.TOGGLE, change)); }
                const scroll = this.desc(alive, 'rankScrollView');
                if (scroll) this.scrollMore(scroll, () => { this.alivePage += 1; void this.loadAlive(false); });
            }
            const audit = this.desc(manage, 'memberExamineNode');
            if (audit) {
                this.click(audit, 'btn_search', () => { this.auditPage = 1; void this.loadAudit(true); });
                this.click(audit, 'btn_record', () => { void this.forms.show('ui/club/ClubScoreRecord', this.clubId(), Number(this.context.unionId ?? 0), String(this.context.unionName ?? ''), Number(this.context.unionSign ?? 0), 0, 0, 'btn_ChooseType_9'); });
                const scroll = this.desc(audit, 'rankScrollView');
                if (scroll) this.scrollMore(scroll, () => { this.auditPage += 1; void this.loadAudit(false); });
            }
        }
    }

    private show(form: LegacyForm, value: unknown, unionId: unknown, unionName: unknown, unionPostType: unknown, minister: unknown, unionSign: unknown, levelPromotion: unknown, defaultPage: unknown): void {
        this.form = form;
        if (value && typeof value === 'object') this.context = value as Context;
        else this.context = { clubId: Number(value ?? 0), unionId: Number(unionId ?? 0), unionName: String(unionName ?? ''), unionPostType: Number(unionPostType ?? 0), minister: Number(minister ?? 0), unionSign: Number(unionSign ?? 0), levelPromotion: Number(levelPromotion ?? 0) };
        this.label(form.node, 'lb_Title', `${this.context.unionName ?? ''}（ID:${this.context.unionSign ?? ''}）`);
        const generalPromoter = Number(this.context.unionPostType ?? 0) === 0 && Number(this.context.levelPromotion ?? 0) > 0;
        this.active(form.node, 'btn_newRaceRankZhongzhi', !generalPromoter);
        this.openMain(generalPromoter || String(defaultPage ?? '').includes('RaceManage') ? 'manage' : 'rank');
        void this.loadTimes();
    }

    private async loadTimes(): Promise<void> {
        try {
            this.times = await this.client.request<CompetitionTime[]>('club.CClubGetCompetitionTime', {});
            if (!this.times.length) return;
            this.periodType = Number(this.times[0]?.type ?? 0);
            this.renderTimeOptions();
            this.openRank('competition');
            this.teamPage = 1;
            void this.loadTeams(true);
        } catch (error) { await this.tip(error instanceof Error ? error.message : '获取比赛周期失败'); }
    }

    private renderTimeOptions(): void {
        const root = this.form?.node;
        if (!root) return;
        for (const hostName of ['btn_newRaceRankZhongzhiNode', 'zhanduiNode']) {
            const host = this.desc(root, hostName);
            const panel = host ? this.desc(host, 'img_sjdi') : null;
            const demo = host ? this.desc(host, 'btn_timeDemo') : null;
            if (!host || !panel || !demo) continue;
            for (const child of [...panel.children]) child.destroy();
            for (const time of this.times) {
                const node = instantiate(demo);
                node.name = `time_${time.type ?? 0}`;
                node.active = true;
                this.label(node, 'lb_btnTime', this.date(time.beginTime));
                this.active(node, 'img_sjxz', Number(time.type ?? 0) === this.periodType);
                this.rowClick(node, () => { this.periodType = Number(time.type ?? 0); this.label(host, 'lb_time', this.date(time.beginTime)); this.label(host, 'lb_statue', Number(time.status ?? 0) === 0 ? '已结束' : '进行中'); this.active(host, 'img_sjdi', false); this.renderTimeOptions(); this.page = 1; this.competitionPage = 1; this.teamPage = 1; void this.loadLeague(true); void this.loadCompetition(true); void this.loadTeams(true); });
                panel.addChild(node);
            }
            this.label(host, 'lb_time', this.date(this.times.find((item) => Number(item.type ?? 0) === this.periodType)?.beginTime));
        }
    }

    private openMain(page: string): void { const root = this.form?.node; if (!root) return; this.active(root, 'btn_newRaceRankZhongzhiNode', page === 'rank'); this.active(root, 'btn_RaceManageZhongzhiNode', page === 'manage'); if (page === 'rank') this.openRank('competition'); else this.openManage('team'); }
    private openRank(page: string): void { const root = this.form ? this.desc(this.form.node, 'btn_newRaceRankZhongzhiNode') : null; if (!root) return; this.active(root, 'liansaiNode', page === 'league'); this.active(root, 'jingjiNode', page === 'competition'); this.active(this.desc(root, 'btn_liansai') ?? root, 'img_jt', page === 'league'); this.active(this.desc(root, 'btn_jingji') ?? root, 'img_jt', page === 'competition'); if (page === 'league') void this.loadLeague(true); else void this.loadCompetition(true); }
    private openManage(page: string): void { const root = this.form ? this.desc(this.form.node, 'btn_RaceManageZhongzhiNode') : null; if (!root) return; this.active(root, 'zhanduiNode', page === 'team'); this.active(root, 'zhanduiDetailNode', false); this.active(root, 'changeAliveNode', page === 'alive'); this.active(root, 'memberExamineNode', page === 'audit'); if (page === 'team') void this.loadTeams(true); else if (page === 'alive') { this.alivePage = 1; void this.loadAlive(true); } else { this.auditPage = 1; void this.loadAudit(true); } }

    private async loadLeague(refresh: boolean): Promise<void> {
        const root = this.form ? this.desc(this.form.node, 'btn_newRaceRankZhongzhiNode') : null;
        if (!root) return;
        const query = this.value(root, 'chazhaoEditBox');
        try {
            const result = await this.client.request<{ unionMemberItemList?: LeagueRow[] }>('Union.CUnionMemberRanked', { unionId: Number(this.context.unionId ?? 0), type: this.periodType, pageNum: this.page, query });
            const rows = result.unionMemberItemList ?? [];
            if (!rows.length && this.page > 1) { this.page -= 1; return; }
            this.leagueRows = refresh ? rows : this.leagueRows.concat(rows);
            this.renderLeague(root, refresh ? this.leagueRows : rows, refresh);
            if (refresh) await this.loadLeagueSum(root);
        } catch (error) { await this.tip(error instanceof Error ? error.message : '获取联赛榜失败'); }
    }

    private renderLeague(root: Node, rows: LeagueRow[], refresh: boolean): void {
        const league = this.desc(root, 'liansaiNode'); const content = league ? this.desc(league, 'content') : null; const demo = league ? this.desc(league, 'demo') : null; if (!content || !demo) return;
        if (refresh) { this.clearRows(); for (const child of [...content.children]) child.destroy(); }
        demo.active = false;
        for (const row of rows) { const node = instantiate(demo); node.active = true; this.label(node, 'lb_rank', String(row.id ?? 0)); this.label(node, 'lb_clubName', String(row.clubName ?? '')); this.label(node, 'lb_clubId', String(row.clubSign ?? '')); this.label(node, 'lb_promotionShareValue', String(row.promotionShareValue ?? 0)); this.label(node, 'lb_unionAllMemberPointTotal', String(row.unionAllMemberPointTotal ?? 0)); this.label(node, 'lb_zhongZhiTotalPoint', String(row.zhongZhiTotalPoint ?? 0)); this.label(node, 'lb_consumeValue', String(row.consumeValue ?? 0)); content.addChild(node); }
        content.getComponent(Layout)?.updateLayout();
    }

    private async loadLeagueSum(root: Node): Promise<void> { try { const sum = await this.client.request<Record<string, number>>('union.CUnionMemberRankedSumInfo', { clubId: this.clubId(), unionId: Number(this.context.unionId ?? 0), type: this.periodType }); const bottom = this.desc(root, 'buttomNode'); if (!bottom) return; this.label(bottom, 'lb_1', `联赛活跃积分：${sum.scorePointSum ?? 0}`); this.label(bottom, 'lb_2', `房卡消耗：${sum.consumeValueSum ?? 0}`); this.label(bottom, 'lb_3', `成员积分总和：${sum.unionAllMemberPointTotalSum ?? 0}`); this.label(bottom, 'lb_4', `最终积分总和：${sum.zhongZhiTotalPointSum ?? 0}`); } catch {} }

    private async loadCompetition(refresh: boolean): Promise<void> {
        const root = this.form ? this.desc(this.form.node, 'btn_newRaceRankZhongzhiNode') : null;
        if (!root) return;
        try {
            const result = await this.client.request<CompetitionResult>('club.CClubCompetitionRanked', { clubId: this.clubId(), type: this.periodType, pageNum: this.competitionPage, query: this.value(root, 'chazhaoEditBoxJingJi') });
            const rows = result.clubPromotionLevelItemList ?? [];
            if (!rows.length && this.competitionPage > 1) { this.competitionPage -= 1; return; }
            this.competitionRows = refresh ? rows : this.competitionRows.concat(rows);
            this.totalPointShowStatus = Number(result.totalPointShowStatus ?? 0);
            this.renderCompetition(root, refresh ? this.competitionRows : rows, refresh);
            this.label(root, 'lb_huoyuezonghe', `竞技赛活跃积分和：${result.scorePointTotal ?? 0}`);
        } catch (error) { await this.tip(error instanceof Error ? error.message : '获取竞技榜失败'); }
    }

    private renderCompetition(root: Node, rows: CompetitionRow[], refresh: boolean): void { const host = this.desc(root, 'jingjiNode'); const content = host ? this.desc(host, 'content') : null; const demo = host ? this.desc(host, 'demo') : null; if (!content || !demo) return; if (refresh) { this.clearRows(); for (const child of [...content.children]) child.destroy(); } demo.active = false; for (const row of rows) { const node = instantiate(demo); node.active = true; this.label(node, 'lb_rank', String(row.id ?? 0)); this.label(node, 'lb_name', String(row.name ?? '')); this.label(node, 'lb_pid', String(row.pid ?? '')); this.label(node, 'lb_scorePoint', String(row.scorePoint ?? 0)); this.label(node, 'lb_playerTotalPoint', `${row.playerTotalPoint ?? 0}${this.totalPointShowStatus ? `(${row.totalPoint ?? 0})` : '(*)'}`); this.rowClick(this.desc(node, 'btn_detailJingJi') ?? node, () => { void this.forms.show('ui/club_2/UIPlayerRaceRankInfo', this.clubId(), Number(row.pid ?? 0), this.periodType); }); content.addChild(node); } content.getComponent(Layout)?.updateLayout(); }

    private async changeTotalPointStatus(): Promise<void> { try { await this.client.request('club.CClubChangeTotalPointShowStatus', { clubId: this.clubId(), type: this.totalPointShowStatus ? 0 : 1 }); this.competitionPage = 1; await this.loadCompetition(true); } catch (error) { await this.tip(error instanceof Error ? error.message : '修改积分显示失败'); } }

    private async loadTeams(refresh: boolean): Promise<void> { const root = this.form ? this.desc(this.form.node, 'zhanduiNode') : null; if (!root) return; const levels: number[] = []; for (let level = 1; level <= 10; level += 1) if (this.desc(root, `btn_zd_${level}`)?.getComponent(Toggle)?.isChecked) levels.push(level); try { const result = await this.client.request<TeamResult>('club.CClubTeamListZhongZhi', { clubId: this.clubId(), type: this.periodType, pageNum: this.teamPage, query: this.value(root, 'chazhaoEditBox'), levelQuery: levels }); const rows = result.clubTeamListInfoList ?? []; if (!rows.length && this.teamPage > 1) { this.teamPage -= 1; return; } const content = this.desc(root, 'content'); const demo = this.desc(root, 'demo'); if (!content || !demo) return; if (refresh) { this.clearRows(); for (const child of [...content.children]) child.destroy(); } demo.active = false; for (const row of rows) { const node = instantiate(demo); node.active = true; this.label(node, 'lb_name', String(row.name ?? '')); this.label(node, 'lb_id', String(row.pid ?? '')); this.label(node, 'lb_scorePoint', String(row.scorePoint ?? 0)); this.label(node, 'lb_level', String(row.level ?? 0)); this.label(node, 'lb_number', String(row.number ?? 0)); this.label(node, 'lb_ClubCentConsume', String(row.clubCentConsume ?? 0)); this.label(node, 'lb_consume', String(row.consume ?? 0)); this.rowClick(this.desc(node, 'btn_detail') ?? node, () => this.openTeamDetail(row)); content.addChild(node); } content.getComponent(Layout)?.updateLayout(); } catch (error) { await this.tip(error instanceof Error ? error.message : '获取战队列表失败'); } }

    private openTeamDetail(row: TeamRow): void { this.detailPid = Number(row.pid ?? 0); this.detailLevel = Number(row.level ?? 1); this.teamPage = 1; const manage = this.form ? this.desc(this.form.node, 'btn_RaceManageZhongzhiNode') : null; if (!manage) return; this.active(manage, 'zhanduiNode', false); this.active(manage, 'zhanduiDetailNode', true); const detail = this.desc(manage, 'zhanduiDetailNode'); if (detail) { this.label(detail, 'lb_btnName', `战队${this.detailLevel}级`); void this.loadTeamDetail(true); } }
    private closeManager(): void { const detail = this.form ? this.desc(this.form.node, 'zhanduiDetailNode') : null; if (detail?.active && Number(this.context.unionPostType ?? 0) !== 0) { detail.active = false; const team = this.form ? this.desc(this.form.node, 'zhanduiNode') : null; if (team) team.active = true; return; } this.forms.close('ui/club_2/Skin2UnionManagerZhongZhi'); }

    private async loadTeamDetail(refresh: boolean): Promise<void> { const root = this.form ? this.desc(this.form.node, 'zhanduiDetailNode') : null; if (!root) return; try { const result = await this.client.request<TeamResult>('Club.CClubTeamListZhongZhi', { clubId: this.clubId(), type: this.periodType, pageNum: this.teamPage, pid: this.detailPid }); const rows = (result.clubTeamListInfoList ?? []) as TeamDetailRow[]; if (!rows.length && this.teamPage > 1) { this.teamPage -= 1; return; } const content = this.desc(root, 'content'); const demo = this.desc(root, 'demo'); if (!content || !demo) return; if (refresh) { this.clearRows(); for (const child of [...content.children]) child.destroy(); } demo.active = false; const positions = ['普通成员', '队长管理员', '队长', '圈主']; for (const row of rows) { const node = instantiate(demo); node.active = true; this.label(node, 'lb_name', String(row.name ?? '')); this.label(node, 'lb_id', String(row.pid ?? '')); this.label(node, 'lb_level', positions[Number(row.position ?? 0)] ?? '普通成员'); this.label(node, 'lb_scorePoint', String(row.scorePoint ?? 0)); this.label(node, 'lb_ClubCentConsume', String(row.clubCentConsume ?? 0)); this.label(node, 'lb_eliminatePoint', String(row.eliminatePoint ?? 0)); this.label(node, 'lb_consume', String(row.consume ?? 0)); this.active(node, 'btn_outPromoter', Number(row.position ?? 0) !== 2); this.rowClick(this.desc(node, 'btn_outPromoter') ?? node, () => { void this.forms.show('ui/club_2/UIPromoterSet_2', this.clubId(), Number(row.pid ?? 0), { pid: row.pid, name: row.name }); }); content.addChild(node); } content.getComponent(Layout)?.updateLayout(); } catch (error) { await this.tip(error instanceof Error ? error.message : '获取战队详情失败'); } }

    private async changeTeamLevel(root: Node): Promise<void> { let level = this.detailLevel; for (let index = 1; index <= 10; index += 1) if (this.desc(root, `btn_zd_${index}`)?.getComponent(Toggle)?.isChecked) { level = index; break; } this.active(root, 'selectzd', false); if (level === this.detailLevel) return; try { await this.client.request('Club.CClubChangeLevelZhongZhi', { clubId: this.clubId(), pid: this.detailPid, value: level }); this.detailLevel = level; this.label(root, 'lb_btnName', `战队${level}级`); this.teamPage = 1; await this.loadTeams(true); } catch (error) { await this.tip(error instanceof Error ? error.message : '修改战队层级失败'); } }
    private async dissolveTeam(): Promise<void> { if (typeof window !== 'undefined' && !window.confirm('取消后该队长下的所有成员归属将发生变化，请确认取消')) return; try { await this.client.request('club.CClubCancleCaptionOpZhongZhi', { clubId: this.clubId(), pid: this.detailPid }); const manage = this.form ? this.desc(this.form.node, 'btn_RaceManageZhongzhiNode') : null; if (manage) { this.active(manage, 'zhanduiDetailNode', false); this.active(manage, 'zhanduiNode', true); } this.teamPage = 1; await this.loadTeams(true); } catch (error) { await this.tip(error instanceof Error ? error.message : '解散战队失败'); } }

    private bindAuxiliary(form: LegacyForm, path: string): void { this.click(form.node, 'btn_close', () => this.forms.close(path)); this.click(form.node, 'btn_search', () => { this.auxiliaryPage = 1; void this.loadAuxiliary(true); }); const scroll = this.desc(form.node, 'rankScrollView'); if (scroll) this.scrollMore(scroll, () => { this.auxiliaryPage += 1; void this.loadAuxiliary(false); }); }
    private showAuxiliary(form: LegacyForm, path: string, clubId: unknown, pid: unknown): void { this.auxiliaryForm = form; this.auxiliaryPath = path; this.auxiliaryClubId = Number(clubId ?? 0); this.auxiliaryPid = Number(pid ?? 0); this.auxiliaryPage = 1; const edit = this.desc(form.node, 'chazhaoEditBox')?.getComponent(EditBox); if (edit) edit.string = ''; void this.loadAuxiliary(true); }
    private async loadAuxiliary(refresh: boolean): Promise<void> { const form = this.auxiliaryForm; if (!form) return; const change = this.auxiliaryPath.includes('ChangePromotion'); const protocol = change ? 'Club.CClubChangePromotionZhongZhi' : 'club.CClubAddCaptainZhongZhi'; try { const rows = await this.client.request<Array<{ shortPlayer?: ShortPlayer; minister?: number; upPlayerName?: string }>>(protocol, { clubId: this.auxiliaryClubId, pid: this.auxiliaryPid, query: this.value(form.node, 'chazhaoEditBox'), pageNum: this.auxiliaryPage }); if (!rows.length && this.auxiliaryPage > 1) { this.auxiliaryPage -= 1; return; } const content = this.desc(form.node, 'content'); const demo = this.desc(form.node, 'demo'); if (!content || !demo) return; if (refresh) { this.clearRows(); for (const child of [...content.children]) child.destroy(); } demo.active = false; for (const row of rows) { const player = row.shortPlayer ?? {}; const node = instantiate(demo); node.active = true; this.label(node, 'lb_name', String(player.name ?? '')); this.label(node, 'lb_id', String(player.pid ?? '')); this.label(node, 'lb_minister', Number(row.minister ?? 0) === 2 ? '圈主' : Number(row.minister ?? 0) === 1 ? '管理员' : '成员'); this.label(node, 'lb_upPlayerName', String(row.upPlayerName ?? '')); this.rowClick(this.desc(node, change ? 'btn_changeCaptain' : 'btn_addCaptain') ?? node, () => { void this.operateAuxiliary(Number(player.pid ?? 0)); }); content.addChild(node); } content.getComponent(Layout)?.updateLayout(); } catch (error) { await this.tip(error instanceof Error ? error.message : '获取成员列表失败'); } }
    private async operateAuxiliary(pid: number): Promise<void> { const change = this.auxiliaryPath.includes('ChangePromotion'); try { await this.client.request(change ? 'Club.CClubChangePromotionBelongDiaoRu' : 'Club.CClubAddCaptionOpZhongZhi', { clubId: this.auxiliaryClubId, pid, ...(change ? { upLevelId: this.auxiliaryPid } : { pageNum: 1 }) }); this.auxiliaryPage = 1; await this.loadAuxiliary(true); this.teamPage = 1; if (change) await this.loadTeamDetail(true); else await this.loadTeams(true); } catch (error) { await this.tip(error instanceof Error ? error.message : '操作失败'); } }

    private bindRaceInfo(form: LegacyForm): void { this.click(form.node, 'img_black', () => this.forms.close('ui/club_2/UIPlayerRaceRankInfo')); const scroll = this.desc(form.node, 'rankScrollView'); if (scroll) this.scrollMore(scroll, () => { this.auxiliaryPage += 1; void this.loadRaceInfo(false); }); }
    private showRaceInfo(form: LegacyForm, clubId: unknown, pid: unknown, type: unknown): void { this.auxiliaryForm = form; this.auxiliaryClubId = Number(clubId ?? 0); this.auxiliaryPid = Number(pid ?? 0); this.periodType = Number(type ?? 0); this.auxiliaryPage = 1; void this.loadRaceInfo(true); }
    private async loadRaceInfo(refresh: boolean): Promise<void> { const form = this.auxiliaryForm; if (!form) return; try { const result = await this.client.request<{ unionDynamicItemList?: Array<Record<string, unknown>>; player?: ShortPlayer; playerTotalPoint?: number; zhongZhiTotalPoint?: number; eliminatePoint?: number }>('club.CClubCentChangeRecordByPid', { clubId: this.auxiliaryClubId, pid: this.auxiliaryPid, getType: this.periodType, pageNum: this.auxiliaryPage }); const rows = result.unionDynamicItemList ?? []; if (!rows.length && this.auxiliaryPage > 1) { this.auxiliaryPage -= 1; return; } const player = result.player ?? {}; this.label(form.node, 'lb_name', `昵称:${player.name ?? ''}`); this.label(form.node, 'lb_beizhu', `群名片:${player.name ?? ''}`); this.label(form.node, 'lb_id', `ID:${player.pid ?? this.auxiliaryPid}`); this.label(form.node, 'lb_playerTotalPoint', `成员积分：${result.playerTotalPoint ?? 0}`); this.label(form.node, 'lb_zhongZhiTotalPoint', `总积分：${result.zhongZhiTotalPoint ?? 0}`); this.label(form.node, 'lb_eliminatePoint', `淘汰：${result.eliminatePoint ?? 0}`); const content = this.desc(form.node, 'content'); const demo = this.desc(form.node, 'demo'); if (!content || !demo) return; if (refresh) { this.clearRows(); for (const child of [...content.children]) child.destroy(); } demo.active = false; const types: Record<number, string> = { 1: '异常操作', 2: '对局输赢', 3: '报名费', 4: '洗牌费用' }; for (const row of rows) { const node = instantiate(demo); node.active = true; this.label(node, 'lb_execTime', this.date(row.execTime)); this.label(node, 'lb_execType', types[Number(row.execType ?? 0)] ?? ''); this.label(node, 'lb_id', String(row.id ?? '')); this.label(node, 'lb_winLoseValue', String(row.winLoseValue ?? 0)); this.label(node, 'lb_consumeValue', String(row.consumeValue ?? 0)); this.label(node, 'lb_eliminatePoint', String(row.eliminatePoint ?? 0)); this.label(node, 'lb_pidCurValue', String(row.pidCurValue ?? 0)); content.addChild(node); } content.getComponent(Layout)?.updateLayout(); } catch (error) { await this.tip(error instanceof Error ? error.message : '获取成员竞技明细失败'); } }

    private async loadAlive(refresh: boolean): Promise<void> {
        const root = this.form ? this.desc(this.form.node, 'changeAliveNode') : null;
        if (!root) return;
        try {
            const rows = await this.client.request<AliveRow[]>('Club.CClubChangeAlivePointList', { clubId: this.clubId(), pageNum: this.alivePage, query: this.value(root, 'chazhaoEditBox'), type: this.aliveType });
            if (!rows.length && this.alivePage > 1) { this.alivePage -= 1; return; }
            const content = this.desc(root, 'content'); const demo = this.desc(root, 'demo'); if (!content || !demo) return;
            if (refresh) { this.clearRows(); for (const child of [...content.children]) child.destroy(); }
            demo.active = false;
            for (const row of rows) {
                const player = row.shortPlayer ?? {}; const pid = Number(player.pid ?? 0); const node = instantiate(demo); node.name = String(pid); node.active = true;
                this.label(node, 'lb_name', String(player.name ?? '')); this.label(node, 'lb_id', String(pid)); this.label(node, 'lb_upPlayerName', String(row.upPlayerName ?? '')); this.label(node, 'lb_eliminatePoint', String(row.eliminatePoint ?? 0)); this.label(node, 'lb_alivePoint', String(row.alivePoint ?? 0)); this.label(node, 'ClubCent', String(row.clubCent ?? 0));
                this.rowClick(this.desc(node, 'btn_changeAlivePoint') ?? node, () => { void this.forms.show('ui/club_2/UIChangeClubCentWarning_2', { clubId: this.clubId(), name: player.name, pid, eliminatePoint: Number(row.eliminatePoint ?? 0), isPersonal: true, onChanged: () => void this.loadAlive(true) }); });
                content.addChild(node);
            }
            content.getComponent(Layout)?.updateLayout();
        } catch (error) { await this.tip(error instanceof Error ? error.message : '获取活跃分成员列表失败'); }
    }

    private selectAllAlive(root: Node, checked: boolean): void { const content = this.desc(root, 'content'); if (!content) return; for (const child of content.children) { const toggle = this.desc(child, 'selectNode') ? this.desc(this.desc(child, 'selectNode')!, 'toggle')?.getComponent(Toggle) : null; if (toggle) toggle.isChecked = checked; } }
    private async changeAliveMulti(root: Node): Promise<void> { const content = this.desc(root, 'content'); if (!content) return; const pidList: number[] = []; for (const child of content.children) { const selected = this.desc(child, 'selectNode') ? this.desc(this.desc(child, 'selectNode')!, 'toggle')?.getComponent(Toggle)?.isChecked : false; if (selected) pidList.push(Number(child.name)); } if (!pidList.length) { await this.tip('请至少选择一个成员'); return; } await this.forms.show('ui/club_2/UIChangeClubCentWarning_2', { clubId: this.clubId(), pidList, isPersonal: true, onChanged: () => void this.loadAlive(true) }); }

    private async loadAudit(refresh: boolean): Promise<void> {
        const root = this.form ? this.desc(this.form.node, 'memberExamineNode') : null;
        if (!root) return;
        try {
            const rows = await this.client.request<AliveRow[]>('Union.CUnionMemberExamineListZhongZhi', { clubId: this.clubId(), unionId: Number(this.context.unionId ?? 0), pageNum: this.auditPage, query: this.value(root, 'chazhaoEditBox') });
            if (!rows.length && this.auditPage > 1) { this.auditPage -= 1; return; }
            const content = this.desc(root, 'content'); const demo = this.desc(root, 'demo'); if (!content || !demo) return;
            if (refresh) { this.clearRows(); for (const child of [...content.children]) child.destroy(); }
            demo.active = false;
            for (const row of rows) {
                const player = row.shortPlayer ?? {}; const pid = Number(player.pid ?? 0); const node = instantiate(demo); node.name = String(pid); node.active = true;
                this.label(node, 'lb_name', String(player.name ?? '')); this.label(node, 'lb_id', String(pid)); this.label(node, 'lb_upPlayerName', String(row.upPlayerName ?? '')); this.label(node, 'lb_eliminatePoint', String(row.eliminatePoint ?? 0)); this.label(node, 'ClubCent', String(row.clubCent ?? 0));
                this.rowClick(this.desc(node, 'btn_agree') ?? node, () => { void this.agreeAudit(row, pid); });
                content.addChild(node);
            }
            content.getComponent(Layout)?.updateLayout();
        } catch (error) { await this.tip(error instanceof Error ? error.message : '获取成员审核列表失败'); }
    }

    private async agreeAudit(row: AliveRow, pid: number): Promise<void> { try { await this.client.request('Union.CUnionMemberExamineOperateZhongZhi', { clubId: this.clubId(), unionId: Number(this.context.unionId ?? 0), opClubId: Number(row.clubId ?? 0), opPid: pid }); this.auditPage = 1; await this.loadAudit(true); } catch (error) { await this.tip(error instanceof Error ? error.message : '审核操作失败'); } }

    private sortLeague(column: number): void { const fields: Record<number, keyof LeagueRow> = { 3: 'clubSign', 4: 'promotionShareValue', 5: 'unionAllMemberPointTotal', 6: 'zhongZhiTotalPoint', 7: 'consumeValue' }; const field = fields[column]; if (!field) return; this.leagueRows.sort((a, b) => Number(b[field] ?? 0) - Number(a[field] ?? 0)); const root = this.form ? this.desc(this.form.node, 'btn_newRaceRankZhongzhiNode') : null; if (root) this.renderLeague(root, this.leagueRows, true); }
    private sortCompetition(): void { this.competitionRows.sort((a, b) => Number(b.playerTotalPoint ?? 0) - Number(a.playerTotalPoint ?? 0)); const root = this.form ? this.desc(this.form.node, 'btn_newRaceRankZhongzhiNode') : null; if (root) this.renderCompetition(root, this.competitionRows, true); }
    private clubId(): number { return Number(this.context.id ?? this.context.clubId ?? 0); }
    private date(value: unknown): string { const date = new Date(Number(value ?? 0)); return Number.isNaN(date.getTime()) ? String(value ?? '') : `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`; }
    private value(root: Node, name: string): string { return this.desc(root, name)?.getComponent(EditBox)?.string.trim() ?? ''; }
    private scrollMore(node: Node, action: () => void): void { const view = node.getComponent(ScrollView); if (view) this.disposers.push(ScrollEvents.onBottom(view, action)); }
    private click(root: Node, name: string, action: () => void): void { const node = this.desc(root, name); if (!node) return; const handler = () => action(); node.on(Button.EventType.CLICK, handler); this.disposers.push(() => node.off(Button.EventType.CLICK, handler)); }
    private rowClick(node: Node, action: () => void): void { const handler = () => action(); node.on(Button.EventType.CLICK, handler); this.rowDisposers.push(() => node.off(Button.EventType.CLICK, handler)); }
    private clearRows(): void { for (const dispose of this.rowDisposers.splice(0)) dispose(); }
    private toggle(root: Node, name: string): void { const node = this.desc(root, name); if (node) node.active = !node.active; }
    private desc(root: Node, name: string): Node | null { if (root.name === name) return root; for (const child of root.children) { const found = this.desc(child, name); if (found) return found; } return null; }
    private label(root: Node, name: string, value: string): void { setClubDynamicLabel(this.desc(root, name)?.getComponent(Label) ?? null, name, value); }
    private active(root: Node, name: string, value: boolean): void { const node = this.desc(root, name); if (node) node.active = value; }
    private async tip(message: string): Promise<void> { await this.forms.show('ui/UIMessage', message); }
}
