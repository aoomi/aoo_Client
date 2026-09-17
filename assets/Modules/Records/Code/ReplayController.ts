import { Button, Color, instantiate, isValid, Label, Layout, Node, UITransform, Vec3 } from 'cc';
import type { LegacyForm, LegacyFormManager } from '../../../Common/Code/Runtime/ui/LegacyFormManager';
import { ReplayGateway } from '../../../Common/Code/Runtime/Replay/ReplayGateway';
import { PdkReplayController, type PdkReplayTarget } from './PdkReplayController';
import { CardPresenter } from '../../../Games/Poker/PDK/Common/Code/Runtime/Room/CardPresenter';
import { StaticList } from '../../../Common/Code/UI/StaticList';
import { formatPdkRuleSummary } from '../../../Games/Poker/PDK/Common/Code/Rules/PdkRuleSummaryFormatter';

const HISTORY_SMALL_SETTLEMENT = 'history/poker/SmallSettlement';
const HISTORY_PLAYED_HAND_GAP = 2;

interface HistoryEntry { readonly playerId?: number | string; readonly scoreDelta?: number; readonly name?: string;
    readonly remainingCards?: readonly number[]; readonly playedCards?: readonly number[];
    readonly playedHands?: ReadonlyArray<{ readonly playIndex?: number; readonly cards?: readonly number[] }> }
interface HistorySettlement { readonly roundNo?: number; readonly playVersion?: string; readonly entries?: readonly HistoryEntry[] }
interface HistoryItem { readonly roomId?: number | string; readonly lastSetId?: number; readonly playedAt?: string | number; readonly playVersion?: string; readonly settlement?: HistorySettlement | null }
interface HistoryPage { readonly items?: readonly HistoryItem[]; readonly nextBeforeRoomId?: number | string; readonly hasMore?: boolean;
    readonly totalCount?: number; readonly bigWinnerCount?: number }
interface HistoryRound { readonly roundNo?: number; readonly playVersion?: string; readonly settledAt?: string | number; readonly replayCode?: string; readonly settlement?: HistorySettlement | null }
interface HistoryDetail { readonly roomId?: number | string; readonly gameCode?: string; readonly playFamily?: string;
    readonly smallSettleTemplate?: string; readonly rounds?: ReadonlyArray<HistoryRound>;
    readonly ruleSnapshot?: Record<string, unknown>; readonly ruleFields?: readonly Record<string, unknown>[] }
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
    private selectedReplay: PdkReplayTarget | null = null;
    private replayLoading = false;
    private dateOffset = 0;
    private historyRoundIndex = -1;
    private historyDetail: HistoryDetail | null = null;
    private historyReplayTarget: PdkReplayTarget | null = null;
    private readonly replayPlayer: PdkReplayController;
    private historyClubId = 0;
    private readonly historyCards = new CardPresenter();

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
        this.forms.register(HISTORY_SMALL_SETTLEMENT, { zOrder: 12, lifecycle: {
            onCreate: form => this.bindHistorySettlement(form),
            onShow: (form, detail) => { void this.renderHistorySettlement(form, this.object(detail) as HistoryDetail); },
        }});
        this.on('legacy-replay-room', value => { void this.room(value); });
        this.on('legacy-replay-play', value => { void this.play(value); });
        this.on('legacy-open-records', value => { void this.open(value); });
    }

    public async open(context?: unknown): Promise<void> {
        if (this.forms.isShown('UILobbyRecords')) return;
        const entry = this.object(context);
        this.historyClubId = String(entry.source ?? '').toUpperCase() === 'CLUB'
            ? Math.max(0, Number(entry.clubId ?? 0)) : 0;
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
        const dateNavigation = 'DateFilterBar/DatePagination/DateNavigation';
        this.ensureButtonAt(form.node, `${dateNavigation}/Btn_PreviousDate`);
        this.ensureButtonAt(form.node, `${dateNavigation}/Btn_NextDate`);
        this.clickAt(form.node, `${dateNavigation}/Btn_PreviousDate`, () => { void this.shiftDate(form, 1); });
        this.clickAt(form.node, `${dateNavigation}/Btn_NextDate`, () => { void this.shiftDate(form, -1); });
        this.updateDatePagination(form);
    }

    private ensureButtonAt(root: Node, path: string): void {
        const node = this.at(root, path);
        if (!node) return;
        const button = node.getComponent(Button) ?? node.addComponent(Button);
        button.interactable = true;
    }
    private bindHistorySettlement(form: LegacyForm): void {
        const close = form.find('Bottom/Btn/Btn_Return') ?? this.desc(form.node, 'Btn_Return');
        close?.on(Button.EventType.CLICK, () => this.forms.close(form.path), this);
        this.clickAt(form.node, 'Bottom/Page/Btn_Previous', () => { void this.shiftHistoryRound(form, -1); });
        this.clickAt(form.node, 'Bottom/Page/Btn_Next', () => { void this.shiftHistoryRound(form, 1); });
        this.click(form.node, 'Btn_Replay', () => {
            if (this.historyReplayTarget) void this.replayPlayer.open(this.historyReplayTarget);
            else this.error(new Error('当前小局回放码不可用'));
        });
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
            const page = this.object(await this.api.history(
                cursor, 20, range.startAt, range.endAt, this.historyClubId,
            )) as HistoryPage;
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
        const bigWinnerCount = Math.max(0, Number(page.bigWinnerCount ?? 0));
        this.textAt(form.node, 'DateFilterBar/PlayersLabel', `大赢家次数:${bigWinnerCount}`);
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
        try { const detail = this.object(await this.api.room(roomId)) as HistoryDetail;
            // Hall and club record details have one visual authority. Never resolve
            // a catalog-specific or legacy record-result prefab on this boundary.
            const formPath = HISTORY_SMALL_SETTLEMENT;
            this.forms.register(formPath, { zOrder: 12, lifecycle: {
                onCreate: form => this.bindHistorySettlement(form),
                onShow: (form, payload) => { void this.renderHistorySettlement(form, this.object(payload) as HistoryDetail); },
            }});
            await this.forms.show(formPath, { ...detail, recordContext: {
                source: context.source ?? 'HALL', returnForm: context.returnForm ?? 'UILobbyRecords', roomId,
            }});
            this.node.emit('legacy-room-history-loaded', { roomId, source: context.source ?? 'HALL',
                gameCode: detail.gameCode ?? '', playFamily: detail.playFamily ?? '',
                settlementForm: formPath, templateId: 'SmallSettlement' }); }
        catch (failure: unknown) { this.error(failure); }
    }

    private async renderHistorySettlement(form: LegacyForm, detail: HistoryDetail): Promise<void> {
        const rounds = Array.isArray(detail.rounds) ? detail.rounds : [];
        this.historyDetail = detail;
        this.historyRoundIndex = 0;
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
        this.label(form.node, 'Lb_PlaybackCode', hasDirectCode
            ? `回放码:${directCode}` : '回放码:暂不可用');
        this.textAt(form.node, 'Bottom/Page/Label', rounds.length ? `${index + 1}/${rounds.length}` : '0/0');
        this.textAt(form.node, 'Bottom/Bg_Rule/Label', formatPdkRuleSummary(detail.ruleSnapshot, detail.ruleFields));
        const previousPage = this.at(form.node, 'Bottom/Page/Btn_Previous')?.getComponent(Button);
        const nextPage = this.at(form.node, 'Bottom/Page/Btn_Next')?.getComponent(Button);
        if (previousPage) previousPage.interactable = index > 0;
        if (nextPage) nextPage.interactable = index < rounds.length - 1;
        this.active(form.node, 'Btn_Continue', false);
        this.active(form.node, 'Btn_FinalSettlement', false);
        this.active(form.node, 'Btn_Final', false);
        this.active(form.node, 'Btn_ReturnLobby', false);
        this.active(form.node, 'Btn_Return', true);
        this.textAt(form.node, 'Bottom/Btn/Btn_Return/Label', '返 回');
        const roomId = String(detail.roomId ?? '');
        const roundNo = Number(round?.roundNo ?? index + 1);
        const setId = String(Math.max(0, roundNo - 1));
        // Replay chunks are addressed by roomId/setId. A short replay code is
        // display/share metadata and must never disable playback of a valid round.
        this.historyReplayTarget = /^\d+$/.test(roomId) && roomId !== '0'
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
                    this.label(form.node, 'Lb_PlaybackCode', `回放码:${code}`);
                    this.historyReplayTarget = { roomId, setId };
                    if (replayButton) replayButton.interactable = true;
                } else this.label(form.node, 'Lb_PlaybackCode', '回放码:暂不可用');
            } catch {
                if (form.isShown()) this.label(form.node, 'Lb_PlaybackCode', '回放码:暂不可用');
            }
        }
        this.label(form.node, 'ReturnLobbyLabel', '关闭');
        this.active(form.node, 'Btn_Share', false);
        const content = this.desc(form.node, 'Content');
        const list = content?.getComponent(StaticList);
        if (!list) throw new Error('历史小结算缺少 StaticList');
        list.setData(entries, (item, entry: HistoryEntry) => {
            const score = this.cumulativeScore(rounds, index, entry.playerId);
            this.label(item, 'Head/Label', String(entry.name ?? `玩家${entry.playerId ?? ''}`));
            this.active(item, 'Score/Lb_Lose', score < 0);
            this.active(item, 'Score/Lb_Win', score >= 0);
            this.label(item, 'Score/Lb_Lose', score < 0 ? String(score) : '');
            this.label(item, 'Score/Lb_Win', score >= 0 ? `+${score}` : '');
            const remaining = Array.isArray(entry.remainingCards) ? entry.remainingCards.map(Number).filter(Number.isFinite) : [];
            const playedHands = Array.isArray(entry.playedHands) ? entry.playedHands : [];
            this.active(item, 'RemCards', remaining.length > 0);
            this.label(item, 'RemCards/Count/Label', `余:${remaining.length}`);
            void this.renderHistoryRemainingCards(item, remaining);
            this.active(item, 'PlayedCards', playedHands.some(hand => Array.isArray(hand.cards) && hand.cards.length > 0));
            void this.renderHistoryPlayedCards(item, playedHands);
            this.active(item, 'Pattern', false);
            this.active(item, 'CloseDoor', false);
        });
    }

    private cumulativeScore(rounds: readonly HistoryRound[], index: number,
                            playerId: number | string | undefined): number {
        const key = String(playerId ?? '');
        let total = 0;
        for (let roundIndex = 0; roundIndex <= index && roundIndex < rounds.length; roundIndex += 1) {
            const entries = rounds[roundIndex]?.settlement?.entries;
            if (!Array.isArray(entries)) continue;
            const entry = entries.find(candidate => String(candidate.playerId ?? '') === key);
            const delta = Number(entry?.scoreDelta ?? 0);
            if (Number.isFinite(delta)) total += delta;
        }
        return total;
    }

    private async renderHistoryRemainingCards(item: Node, values: readonly number[]): Promise<void> {
        const parent = this.at(item, 'RemCards/Cards'); if (!parent) return;
        const template = parent.getChildByName('Card');
        const layout = parent.getComponent(Layout);
        const step = this.historyCardStep(parent, template);
        const origin = template?.position.clone() ?? new Vec3();
        const sorted = this.sortedHistoryCards(values);
        for (const child of [...parent.children]) if (child.name.startsWith('HistoryRemain_')) child.destroy();
        if (template) template.active = false;
        if (layout) layout.enabled = false;
        for (const [index, value] of sorted.entries()) {
            const slot = await this.createHistoryCardSlot(parent, template, value, `HistoryRemain_${index}`);
            if (!slot) return;
            slot.setPosition(origin.x - (sorted.length - 1 - index) * step, origin.y, origin.z);
        }
    }

    private async renderHistoryPlayedCards(item: Node,
        source: ReadonlyArray<{ readonly playIndex?: number; readonly cards?: readonly number[] }>): Promise<void> {
        const parent = this.at(item, 'PlayedCards'); if (!parent) return;
        const cardTemplate = parent.getChildByName('Card');
        const countTemplate = parent.getChildByName('Count');
        const layout = parent.getComponent(Layout);
        const step = this.historyCardStep(parent, cardTemplate);
        const origin = cardTemplate?.position.clone() ?? new Vec3();
        const countOffset = countTemplate
            ? new Vec3(countTemplate.position.x - origin.x, countTemplate.position.y - origin.y,
                countTemplate.position.z - origin.z) : new Vec3();
        for (const child of [...parent.children]) {
            if (child.name.startsWith('HistoryPlayed_') || child.name.startsWith('HistoryPlayCount_')) child.destroy();
        }
        if (cardTemplate) cardTemplate.active = false;
        if (countTemplate) countTemplate.active = false;
        if (layout) layout.enabled = false;
        const hands = source.map((hand, order) => ({
            playIndex: Number.isSafeInteger(Number(hand.playIndex)) && Number(hand.playIndex) > 0
                ? Number(hand.playIndex) : order + 1,
            cards: Array.isArray(hand.cards) ? hand.cards.map(Number).filter(Number.isFinite) : [],
        })).filter(hand => hand.cards.length > 0).sort((left, right) => left.playIndex - right.playIndex);
        let nextHandX = origin.x;
        const renderedWidth = (cardTemplate?.getComponent(UITransform)?.contentSize.width ?? step)
            * Math.abs(cardTemplate?.scale.x ?? 1);
        for (const hand of hands) {
            const cards = this.sortedHistoryCards(hand.cards);
            let lastCardX = nextHandX;
            for (const [index, value] of cards.entries()) {
                const slot = await this.createHistoryCardSlot(parent, cardTemplate, value,
                    `HistoryPlayed_${hand.playIndex}_${index}`);
                if (!slot) return;
                lastCardX = nextHandX + index * step;
                slot.setPosition(lastCardX, origin.y, origin.z);
            }
            if (countTemplate) {
                const count = instantiate(countTemplate);
                count.name = `HistoryPlayCount_${hand.playIndex}`;
                count.active = true;
                count.setPosition(lastCardX + countOffset.x, origin.y + countOffset.y, origin.z + countOffset.z);
                parent.addChild(count);
                this.label(count, 'Label', String(hand.playIndex));
            }
            nextHandX = lastCardX + renderedWidth + HISTORY_PLAYED_HAND_GAP;
        }
    }

    private async createHistoryCardSlot(parent: Node, template: Node | null,
        value: number, name: string): Promise<Node | null> {
        if (!template || !parent.isValid) return null;
        const slot = instantiate(template); slot.name = name; slot.active = true;
        const card = await this.historyCards.create(slot, value);
        if (!parent.isValid || !slot.isValid) { if (slot.isValid) slot.destroy(); return null; }
        parent.addChild(slot);
        const target = slot.getComponent(UITransform)?.contentSize;
        const source = card.getComponent(UITransform)?.contentSize;
        card.setPosition(0, 0, 0);
        card.setScale(target && source && source.width > 0 ? target.width / source.width : 1,
            target && source && source.height > 0 ? target.height / source.height : 1, 1);
        return slot;
    }

    private historyCardStep(parent: Node, template: Node | null): number {
        const width = template?.getComponent(UITransform)?.contentSize.width ?? 0;
        const step = width + (parent.getComponent(Layout)?.spacingX ?? 0);
        return step > 0 ? step : Math.max(1, width * 0.3);
    }

    private sortedHistoryCards(values: readonly number[]): number[] {
        return [...values].sort((left, right) => {
            const rank = (card: number): number => {
                const value = card > 500 ? card - 500 : card;
                return value >= 100 ? value % 100 : value & 0x0f;
            };
            const color = (card: number): number => {
                const value = card > 500 ? card - 500 : card;
                return value >= 100 ? Math.floor(value / 100) : value & 0xf0;
            };
            return rank(right) - rank(left) || color(right) - color(left);
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
        const dateNavigation = 'DateFilterBar/DatePagination/DateNavigation';
        this.textAt(form.node, `${dateNavigation}/DateLabel`, ['今天', '昨天', '前天'][this.dateOffset]);
        const previous = this.at(form.node, `${dateNavigation}/Btn_PreviousDate`)?.getComponent(Button);
        const next = this.at(form.node, `${dateNavigation}/Btn_NextDate`)?.getComponent(Button);
        if (previous) previous.interactable = this.dateOffset < 2;
        if (next) next.interactable = this.dateOffset > 0;
    }
    private dateRange(): { startAt: number; endAt: number } {
        const start = new Date();
        start.setHours(0, 0, 0, 0);
        start.setDate(start.getDate() - this.dateOffset);
        const end = new Date(start);
        end.setDate(end.getDate() + 1);
        return { startAt: start.getTime(), endAt: end.getTime() };
    }
    private active(root: Node, name: string, value: boolean): void { const node = name.includes('/') ? this.at(root, name) : this.desc(root, name); if (node) node.active = value; }
    private interactable(root: Node, name: string, value: boolean): void { const button = this.desc(root, name)?.getComponent(Button); if (button) button.interactable = value; }
    private label(root: Node, name: string, value: string): void { const node = name.includes('/') ? this.at(root, name) : this.desc(root, name); const label = node?.getComponent(Label); if (label) label.string = value; }
    private textAt(root: Node, path: string, value: string): void { const label = this.at(root, path)?.getComponent(Label); if (label) label.string = value; }
    private click(root: Node, name: string, action: () => void, persistent = true): void { const target = this.desc(root, name); if (!target) return;
        target.on(Button.EventType.CLICK, action); if (persistent) this.disposers.push(() => { if (isValid(target, true)) target.off(Button.EventType.CLICK, action); }); }
    private clickAt(root: Node, path: string, action: () => void): void { const target = this.at(root, path); if (!target) return;
        target.on(Button.EventType.CLICK, action); this.disposers.push(() => { if (isValid(target, true)) target.off(Button.EventType.CLICK, action); }); }
    private on(name: string, action: (value: unknown) => void): void { this.node.on(name, action); this.disposers.push(() => this.node.off(name, action)); }
    private desc(root: Node, name: string): Node | null { if (root.name === name) return root; for (const child of root.children) { const found = this.desc(child, name); if (found) return found; } return null; }
    private at(root: Node, path: string): Node | null { let node: Node | null = root; for (const name of path.split('/')) node = node?.getChildByName(name) ?? null; return node; }
    private object(value: unknown): Record<string, unknown> { return value && typeof value === 'object' ? value as Record<string, unknown> : {}; }
    private message(failure: unknown, fallback: string): string { return failure instanceof Error && failure.message.trim() ? failure.message : fallback; }
    private date(value: unknown): { date: string; time: string; full: string } { const parsed = new Date(typeof value === 'number' && value < 100000000000 ? value * 1000 : String(value ?? ''));
        if (!Number.isFinite(parsed.getTime())) return { date: '-', time: '', full: '' };
        const date = parsed.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' }); const time = parsed.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false });
        return { date, time, full: `${date} ${time}` }; }
}
