import { assetManager, Button, Color, instantiate, isValid, Label, Layout, Node, Prefab, UITransform } from 'cc';
import type { LegacyForm, LegacyFormManager } from '../../../Common/Code/Runtime/ui/LegacyFormManager';
import { ReplayGateway } from '../../../Common/Code/Runtime/Replay/ReplayGateway';
import { PdkReplayController, type PdkReplayTarget } from './PdkReplayController';
import { StaticList } from '../../../Common/Code/UI/StaticList';
import { formatPdkRuleSummary } from '../../../Games/Poker/PDK/Common/Code/Rules/PdkRuleSummaryFormatter';

const HISTORY_SMALL_SETTLEMENT = 'history/poker/SmallSettlement';

interface HistoryEntry { readonly playerId?: number | string; readonly scoreDelta?: number; readonly name?: string }
interface HistorySettlement { readonly roundNo?: number; readonly playVersion?: string; readonly entries?: readonly HistoryEntry[] }
interface HistoryItem { readonly roomId?: number | string; readonly lastSetId?: number; readonly playedAt?: string | number; readonly playVersion?: string; readonly settlement?: HistorySettlement | null }
interface HistoryPage { readonly items?: readonly HistoryItem[]; readonly nextBeforeRoomId?: number | string; readonly hasMore?: boolean; readonly totalCount?: number }
interface HistoryRound { readonly roundNo?: number; readonly playVersion?: string; readonly settledAt?: string | number; readonly replayCode?: string; readonly settlement?: HistorySettlement | null }
interface HistoryDetail { readonly roomId?: number | string; readonly rounds?: ReadonlyArray<HistoryRound>; readonly ruleSnapshot?: Record<string, unknown>; readonly ruleFields?: readonly Record<string, unknown>[] }
interface HistoryOpenContext { readonly roomId?: number | string; readonly source?: 'HALL' | 'CLUB'; readonly returnForm?: string }

/** Runtime binding for the 2.22 UILobbyRecords/Records prefab family. */
export class ReplayController {
    private readonly disposers: Array<() => void> = [];
    private form: LegacyForm | null = null;
    private pageIndex = 0;
    private cursors: number[] = [0];
    private currentPage: HistoryPage = {};
    private generation = 0;
    private loading = false;
    private recordItemPrefab: Promise<Prefab> | null = null;
    private resultItemPrefab: Promise<Prefab> | null = null;
    private selectedReplay: PdkReplayTarget | null = null;
    private replayLoading = false;
    private dateOffset = 0;
    private historyRoundIndex = -1;
    private historyDetail: HistoryDetail | null = null;
    private historyReplayTarget: PdkReplayTarget | null = null;
    private readonly replayPlayer: PdkReplayController;

    public constructor(private readonly forms: LegacyFormManager, private readonly node: Node,
        private readonly api: ReplayGateway, private readonly playerId: string,
        private readonly error: (error: unknown) => void) {
        this.replayPlayer = new PdkReplayController(forms, api, playerId, error);
    }

    public install(): void {
        this.replayPlayer.install();
        this.forms.register('UILobbyRecords', { zOrder: 10, lifecycle: {
            onCreate: form => this.bindRecords(form), onShow: form => { this.form = form; },
            onClose: form => this.resetRecords(form), onDestroy: form => this.resetRecords(form),
        }});
        this.forms.register('UILobbyRecordDetail', { zOrder: 11, lifecycle: {
            onCreate: form => this.bindDetail(form),
            onShow: (form, detail) => { void this.renderDetail(form, this.object(detail) as HistoryDetail); },
            onClose: form => this.clearGenerated(form.node), onDestroy: form => this.clearGenerated(form.node),
        }});
        this.forms.register(HISTORY_SMALL_SETTLEMENT, { zOrder: 12, lifecycle: {
            onCreate: form => this.bindHistorySettlement(form),
            onShow: (form, detail) => { void this.renderHistorySettlement(form, this.object(detail) as HistoryDetail); },
        }});
        this.on('legacy-replay-room', value => { void this.room(value); });
        this.on('legacy-replay-play', value => { void this.play(value); });
        this.on('legacy-open-records', () => { void this.open(); });
    }

    public async open(): Promise<void> {
        if (this.forms.isShown('UILobbyRecords')) return;
        const form = await this.forms.show('UILobbyRecords');
        if (!form) return;
        this.form = form; this.pageIndex = 0; this.cursors = [0];
        await this.loadPage(0);
    }

    public destroy(): void {
        this.generation += 1; this.loading = false; this.form = null;
        if (isValid(this.node, true) && (this.node as unknown as { _eventProcessor?: unknown })._eventProcessor) {
            for (const dispose of this.disposers.splice(0)) dispose();
        } else this.disposers.length = 0;
    }

    private bindRecords(form: LegacyForm): void {
        this.click(form.node, 'Btn_Close', () => this.forms.close('UILobbyRecords'));
        this.click(form.node, 'Btn_Replay', () => { void this.forms.show('UIReplayCode'); });
        this.ensureButton(form.node, 'Btn_PreviousDate');
        this.ensureButton(form.node, 'Btn_NextDate');
        this.click(form.node, 'Btn_PreviousDate', () => { void this.shiftDate(form, 1); });
        this.click(form.node, 'Btn_NextDate', () => { void this.shiftDate(form, -1); });
        this.updateDatePagination(form);
    }

    private ensureButton(root: Node, name: string): void {
        const node = this.desc(root, name);
        if (!node) return;
        const button = node.getComponent(Button) ?? node.addComponent(Button);
        button.interactable = true;
    }
    private bindHistorySettlement(form: LegacyForm): void {
        const close = form.find('Bottom/Btn/Btn_Return');
        close?.on(Button.EventType.CLICK, () => this.forms.close(HISTORY_SMALL_SETTLEMENT), this);
        this.click(form.node, 'Btn_Previous', () => { void this.shiftHistoryRound(form, -1); });
        this.click(form.node, 'Btn_Next', () => { void this.shiftHistoryRound(form, 1); });
        this.click(form.node, 'Btn_Replay', () => {
            if (this.historyReplayTarget) void this.replayPlayer.open(this.historyReplayTarget);
            else this.error(new Error('当前小局回放码不可用'));
        });
    }
    private bindDetail(form: LegacyForm): void {
        this.click(form.node, 'btn_exit', () => this.forms.close('UILobbyRecordDetail'));
        this.click(form.node, 'btn_closeshare', () => this.forms.close('UILobbyRecordDetail'));
    }
    private resetRecords(form: LegacyForm): void {
        this.generation += 1; this.loading = false; this.form = null; this.pageIndex = 0;
        this.cursors = [0]; this.currentPage = {}; this.selectedReplay = null; this.replayLoading = false;
        this.dateOffset = 0;
        this.clearGenerated(form.node); this.pageLabel(form, 1); this.replayButtonLabel(form, '查看他人回放');
    }

    private async nextPage(): Promise<void> {
        if (this.loading || !this.currentPage.hasMore) return;
        const next = Number(this.currentPage.nextBeforeRoomId ?? 0);
        if (!Number.isSafeInteger(next) || next <= 0) return;
        const target = this.pageIndex + 1; this.cursors[target] = next; await this.loadPage(target);
    }
    private async previousPage(): Promise<void> { if (!this.loading && this.pageIndex > 0) await this.loadPage(this.pageIndex - 1); }

    private async loadPage(index: number): Promise<void> {
        const form = this.form; if (!form?.isShown() || this.loading) return;
        const cursor = this.cursors[index]; if (!Number.isSafeInteger(cursor) || cursor < 0) return;
        const generation = ++this.generation; this.loading = true;
        this.renderState(form, '正在加载战绩…', Color.WHITE);
        try {
            const range = this.dateRange();
            const page = this.object(await this.api.history(cursor, 20, range.startAt, range.endAt)) as HistoryPage;
            if (!this.accept(generation, form)) return;
            this.pageIndex = index; this.currentPage = page;
            await this.renderPage(form, page, generation);
            if (!this.accept(generation, form)) return;
            this.node.emit('legacy-history-loaded', { page: index + 1,
                itemCount: Array.isArray(page.items) ? page.items.length : 0,
                hasMore: Boolean(page.hasMore), nextBeforeRoomId: Number(page.nextBeforeRoomId ?? 0) });
        } catch (failure: unknown) {
            if (!this.accept(generation, form)) return;
            this.currentPage = {};
            this.renderState(form, this.message(failure, '战绩加载失败，请稍后重试'), new Color(255, 205, 205, 255));
            this.node.emit('legacy-history-failed', { page: index + 1, message: this.message(failure, '战绩加载失败') });
            this.error(failure);
        } finally { if (generation === this.generation) this.loading = false; }
    }

    private async renderPage(form: LegacyForm, page: HistoryPage, generation: number): Promise<void> {
        const content = form.find('RecordPanel/Viewport/RecordContent');
        if (!content) throw new Error('Records/RecordContent contract is missing');
        this.clearGenerated(form.node);
        const rows = Array.isArray(page.items) ? page.items : [];
        this.selectedReplay = null;
        this.pageLabel(form, this.pageIndex + 1);
        const totalCount = Math.max(0, Number(page.totalCount ?? rows.length));
        this.label(form.node, 'TodayRoundCountLabel', `${['今日', '昨日', '前日'][this.dateOffset]}${totalCount}局`);
        if (!rows.length) { this.renderState(form, '暂无战绩', new Color(225, 235, 242, 255)); return; }
        const template = form.find('RecordPanel/RecordItemTemplate');
        if (!template) throw new Error('Records/RecordItemTemplate contract is missing');
        rows.forEach((row, offset) => {
            const item = instantiate(template), roomId = Number(row.roomId ?? 0);
            item.name = `runtime-record-${roomId || offset}`;
            item.active = true;
            const settlement = this.object(row.settlement) as HistorySettlement;
            const entries = Array.isArray(settlement.entries) ? settlement.entries : [];
            const own = entries.find(entry => String(entry.playerId ?? '') === this.playerId);
            const score = Number(own?.scoreDelta ?? 0), played = this.date(row.playedAt);
            this.label(item, 'DateLabel', played.date); this.label(item, 'TimeLabel', played.time);
            this.label(item, 'PlayersLabel', entries.length ? entries.map(entry => `ID:${entry.playerId ?? ''}`).join('  ') : '对局成员');
            this.label(item, 'VersionLabel', `版本 ${row.playVersion ?? settlement.playVersion ?? '-'}`);
            this.label(item, 'TotalScoreLabel', score > 0 ? `+${score}` : '');
            this.label(item, 'ScoreDetailLabel', score < 0 ? String(score) : score === 0 ? '0' : '');
            this.label(item, 'RoomNumberLabel', `房间:${roomId || '-'}`);
            const target = this.replayTarget(row);
            if (!this.selectedReplay && target) this.selectedReplay = target;
            this.click(item, 'Btn_Details', () => { if (target) this.selectedReplay = target;
                void this.room({ roomId, source: 'HALL', returnForm: 'UILobbyRecords' }); }, false);
            content.addChild(item);
        });
        content.getComponent(Layout)?.updateLayout();
    }

    private renderState(form: LegacyForm, text: string, color: Color): void {
        const content = form.find('RecordPanel/Viewport/RecordContent'); if (!content) return;
        this.clearGenerated(form.node);
        const node = new Node('runtime-record-state'); node.addComponent(UITransform).setContentSize(900, 120);
        const label = node.addComponent(Label); label.string = text; label.fontSize = 28; label.lineHeight = 36;
        label.color = color; label.horizontalAlign = Label.HorizontalAlign.CENTER; label.verticalAlign = Label.VerticalAlign.CENTER;
        content.addChild(node); content.getComponent(Layout)?.updateLayout();
    }

    private async room(value: unknown): Promise<void> {
        const context = this.object(value) as HistoryOpenContext;
        const roomId = String(context.roomId ?? ''); if (!/^\d+$/.test(roomId) || roomId === '0') return;
        try { const detail = this.object(await this.api.room(roomId));
            await this.forms.show(HISTORY_SMALL_SETTLEMENT, { ...detail, recordContext: {
                source: context.source ?? 'HALL', returnForm: context.returnForm ?? 'UILobbyRecords', roomId,
            }});
            this.node.emit('legacy-room-history-loaded', { roomId }); }
        catch (failure: unknown) { this.error(failure); }
    }

    private async renderHistorySettlement(form: LegacyForm, detail: HistoryDetail): Promise<void> {
        const rounds = Array.isArray(detail.rounds) ? detail.rounds : [];
        this.historyDetail = detail;
        this.historyRoundIndex = Math.max(0, rounds.length - 1);
        await this.renderHistoryRound(form, detail, rounds, this.historyRoundIndex);
    }

    private async renderHistoryRound(form: LegacyForm, detail: HistoryDetail,
                                     rounds: readonly HistoryRound[], index: number): Promise<void> {
        const round = rounds[index];
        const settlement = round?.settlement ?? {};
        const entries = Array.isArray(settlement.entries) ? settlement.entries : [];
        this.label(form.node, 'Lb_RoomId', `房号:${detail.roomId ?? '-'}`);
        this.label(form.node, 'RoundLabel', `局数:${round?.roundNo ?? rounds.length}`);
        this.label(form.node, 'Lb_Time', this.date(round?.settledAt).full);
        const directCode = String(round?.replayCode ?? '');
        const hasDirectCode = /^(?:\d{6}|\d{7}|\d{8}|\d{11})$/.test(directCode);
        this.label(form.node, 'PlaybackCode', hasDirectCode
            ? `回放码:${directCode}` : '回放码:暂不可用');
        this.label(form.node, 'Label', rounds.length ? `${index + 1}/${rounds.length}` : '0/0');
        this.label(form.node, 'Label', formatPdkRuleSummary(detail.ruleSnapshot, detail.ruleFields));
        this.active(form.node, 'Btn_Continue', false);
        this.active(form.node, 'Btn_FinalSettlement', false);
        this.active(form.node, 'Btn_ReturnLobby', true);
        const roomId = String(detail.roomId ?? '');
        const roundNo = Number(round?.roundNo ?? index + 1);
        const setId = String(Math.max(0, roundNo - 1));
        this.historyReplayTarget = /^\d+$/.test(roomId) && roomId !== '0'
            && hasDirectCode
            ? { roomId, setId } : null;
        this.active(form.node, 'Btn_Replay', true);
        const replayButton = this.desc(form.node, 'Btn_Replay')?.getComponent(Button);
        if (replayButton) replayButton.interactable = Boolean(this.historyReplayTarget);
        if (!hasDirectCode && /^\d+$/.test(roomId) && roomId !== '0') {
            try {
                const response = this.object(await this.api.currentReplayCode(roomId, setId));
                if (!form.isShown()) return;
                const code = String(response.code ?? '');
                if (/^(?:\d{6}|\d{7}|\d{8}|\d{11})$/.test(code)) {
                    this.label(form.node, 'PlaybackCode', `回放码:${code}`);
                    this.historyReplayTarget = { roomId, setId };
                    if (replayButton) replayButton.interactable = true;
                } else this.label(form.node, 'PlaybackCode', '回放码:暂不可用');
            } catch {
                if (form.isShown()) this.label(form.node, 'PlaybackCode', '回放码:暂不可用');
            }
        }
        this.label(form.node, 'ReturnLobbyLabel', '关闭');
        this.active(form.node, 'Btn_Share', false);
        const content = this.desc(form.node, 'Content');
        const list = content?.getComponent(StaticList);
        if (!list) throw new Error('历史小结算缺少 StaticList');
        list.setData(entries, (item, entry: HistoryEntry) => {
            const score = Number(entry.scoreDelta ?? 0);
            this.label(item, 'Head/Label', String(entry.name ?? `玩家${entry.playerId ?? ''}`));
            this.active(item, 'Score/Lb_Lose', score < 0);
            this.active(item, 'Score/Lb_Win', score >= 0);
            this.label(item, 'Score/Lb_Lose', score < 0 ? String(score) : '');
            this.label(item, 'Score/Lb_Win', score >= 0 ? `+${score}` : '');
            this.active(item, 'RemainingCards/Panel', false);
            this.active(item, 'PlayedCards', false);
            this.active(item, 'Pattern', false);
            this.active(item, 'CloseDoor', false);
        });
    }

    private async shiftHistoryRound(form: LegacyForm, delta: number): Promise<void> {
        const detail = this.historyDetail;
        if (!detail) return;
        const rounds = Array.isArray(detail.rounds) ? detail.rounds : [];
        const next = Math.max(0, Math.min(rounds.length - 1, this.historyRoundIndex + delta));
        if (!rounds.length || next === this.historyRoundIndex) return;
        this.historyRoundIndex = next;
        await this.renderHistoryRound(form, detail, rounds, next);
    }

    private async renderDetail(form: LegacyForm, detail: HistoryDetail): Promise<void> {
        this.clearGenerated(form.node); const rounds = Array.isArray(detail.rounds) ? detail.rounds : [];
        this.label(form.node, 'roomID', `房间号:${detail.roomId ?? '-'}`); this.label(form.node, 'jushu', `共${rounds.length}局`);
        this.label(form.node, 'endTime', rounds.length ? this.date(rounds[rounds.length - 1]?.settledAt).full : '');
        const target = this.desc(form.node, 'mj_layout_player') ?? this.desc(form.node, 'poker_layout_player'); if (!target) return;
        const last = rounds[rounds.length - 1];
        const entries = Array.isArray(last?.settlement?.entries) ? last?.settlement?.entries ?? [] : [];
        if (!entries.length) return;
        const prefab = await this.loadLobbyPrefab('ResultItem', '', '战绩详情条目'); if (!form.isShown()) return;
        for (const entry of entries) {
            const item = instantiate(prefab), score = Number(entry.scoreDelta ?? 0); item.name = `runtime-result-${entry.playerId ?? ''}`;
            this.label(item, 'lable_name', `玩家${entry.playerId ?? ''}`); this.label(item, 'label_id', `ID:${entry.playerId ?? ''}`);
            this.label(item, 'lb_win', score > 0 ? `+${score}` : '0'); this.label(item, 'lb_lose', score < 0 ? String(score) : '0');
            this.label(item, 'lb_ping', score === 0 ? '1' : '0'); target.addChild(item);
        }
        target.getComponent(Layout)?.updateLayout();
    }

    private async play(value: unknown): Promise<void> {
        const packet = this.object(value);
        try { this.node.emit('legacy-replay-loaded', await this.api.chunks(String(packet.roomId ?? ''), String(packet.setId ?? ''), Number(packet.afterSequence ?? 0))); }
        catch (failure: unknown) { this.error(failure); }
    }

    private async playSelected(form: LegacyForm): Promise<void> {
        if (this.replayLoading) return;
        const target = this.selectedReplay;
        if (!target) { await this.forms.show('UIMessage_Drift', null, null, '当前页没有可回放的战绩'); return; }
        this.replayLoading = true;
        this.interactable(form.node, 'Btn_Replay', false);
        this.replayButtonLabel(form, '正在加载…');
        try {
            await this.replayPlayer.open(target);
            this.node.emit('legacy-authoritative-replay-opened', target);
        } catch (failure: unknown) {
            await this.forms.show('UIMessage_Drift', null, null, this.message(failure, '回放加载失败，请稍后重试'));
            this.error(failure);
        } finally {
            this.replayLoading = false;
            if (form.isShown()) { this.interactable(form.node, 'Btn_Replay', true); this.replayButtonLabel(form, '查看他人回放'); }
        }
    }

    private replayTarget(row: HistoryItem): PdkReplayTarget | null {
        const roomId = Number(row.roomId ?? 0), setId = Number(row.lastSetId ?? 0);
        if (!row.settlement || !Number.isSafeInteger(roomId) || roomId <= 0
            || !Number.isSafeInteger(setId) || setId < 0) return null;
        return { roomId: String(roomId), setId: String(setId) };
    }

    private replayButtonLabel(form: LegacyForm, value: string): void {
        const button = this.desc(form.node, 'Btn_Replay');
        if (button) this.label(button, 'Label', value);
    }

    private loadLobbyPrefab(asset: string, expectedUuid: string, label: string): Promise<Prefab> {
        const existing = asset === 'RecordItem' ? this.recordItemPrefab : this.resultItemPrefab; if (existing) return existing;
        const pending = new Promise<Prefab>((resolve, reject) => {
            const load = (): void => { const bundle = assetManager.getBundle('records-ui');
                if (!bundle) { reject(new Error(`缺少 records-ui，无法加载${label}`)); return; }
                bundle.load(`Prefab/${asset}`, Prefab, (failure, prefab) => { if (failure || !prefab) { reject(new Error(`${label}加载失败: ${failure?.message ?? asset}`)); return; }
                    if (expectedUuid && prefab.uuid !== expectedUuid) { reject(new Error(`${label} UUID 不匹配: ${prefab.uuid}`)); return; } resolve(prefab); }); };
            if (assetManager.getBundle('records-ui')) load(); else assetManager.loadBundle('records-ui', failure => failure ? reject(failure) : load());
        });
        if (asset === 'RecordItem') this.recordItemPrefab = pending; else this.resultItemPrefab = pending; return pending;
    }

    private clearGenerated(root: Node): void {
        for (const name of ['RecordContent', 'mj_layout_player', 'poker_layout_player']) { const parent = this.desc(root, name); if (!parent) continue;
            for (const child of [...parent.children]) if (child.name.startsWith('runtime-record-') || child.name.startsWith('runtime-result-')) child.destroy(); }
    }
    private accept(generation: number, form: LegacyForm): boolean { return generation === this.generation && this.form === form && form.isShown(); }
    private pageLabel(form: LegacyForm, page: number): void { this.label(form.node, 'PageLabel', String(page)); }
    private async shiftDate(form: LegacyForm, delta: number): Promise<void> {
        if (this.loading) return;
        this.dateOffset = Math.max(0, Math.min(2, this.dateOffset + delta));
        this.updateDatePagination(form);
        this.pageIndex = 0;
        this.cursors = [0];
        this.currentPage = {};
        await this.loadPage(0);
    }
    private updateDatePagination(form: LegacyForm): void {
        this.label(form.node, 'DateLabel', ['今天', '昨天', '前天'][this.dateOffset]);
        this.interactable(form.node, 'Btn_PreviousDate', this.dateOffset < 2);
        this.interactable(form.node, 'Btn_NextDate', this.dateOffset > 0);
    }
    private dateRange(): { startAt: number; endAt: number } {
        const start = new Date();
        start.setHours(0, 0, 0, 0);
        start.setDate(start.getDate() - this.dateOffset);
        const end = new Date(start);
        end.setDate(end.getDate() + 1);
        return { startAt: start.getTime(), endAt: end.getTime() };
    }
    private active(root: Node, name: string, value: boolean): void { const node = this.desc(root, name); if (node) node.active = value; }
    private interactable(root: Node, name: string, value: boolean): void { const button = this.desc(root, name)?.getComponent(Button); if (button) button.interactable = value; }
    private label(root: Node, name: string, value: string): void { const label = this.desc(root, name)?.getComponent(Label); if (label) label.string = value; }
    private click(root: Node, name: string, action: () => void, persistent = true): void { const target = this.desc(root, name); if (!target) return;
        target.on(Button.EventType.CLICK, action); if (persistent) this.disposers.push(() => { if (isValid(target, true)) target.off(Button.EventType.CLICK, action); }); }
    private on(name: string, action: (value: unknown) => void): void { this.node.on(name, action); this.disposers.push(() => this.node.off(name, action)); }
    private desc(root: Node, name: string): Node | null { if (root.name === name) return root; for (const child of root.children) { const found = this.desc(child, name); if (found) return found; } return null; }
    private object(value: unknown): Record<string, unknown> { return value && typeof value === 'object' ? value as Record<string, unknown> : {}; }
    private message(failure: unknown, fallback: string): string { return failure instanceof Error && failure.message.trim() ? failure.message : fallback; }
    private date(value: unknown): { date: string; time: string; full: string } { const parsed = new Date(typeof value === 'number' && value < 100000000000 ? value * 1000 : String(value ?? ''));
        if (!Number.isFinite(parsed.getTime())) return { date: '-', time: '', full: '' };
        const date = parsed.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' }); const time = parsed.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false });
        return { date, time, full: `${date} ${time}` }; }
}
