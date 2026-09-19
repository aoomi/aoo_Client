import { Button, Label, Layout, Node, ScrollView, instantiate } from 'cc';
import { ProtocolClient } from '../../../Common/Code/Runtime/network/ProtocolClient';
import { LegacyForm, LegacyFormManager } from '../../../Common/Code/Runtime/ui/LegacyFormManager';
import { ScrollEvents } from '../../../Common/Code/UI/UnifiedScroll';
import { setClubDynamicLabel } from './ClubDynamicLabel';

interface DayPlayer { pid?: number; name?: string; iconUrl?: string; point?: number; clubCent?: number }
interface DayResult { pid?: number; point?: number; clubCent?: number }
interface DayRecord { roomId?: number; roomID?: number; roomKey?: string | number; configName?: string; gameType?: number; setCount?: number; endTime?: string | number; playerList?: string | DayPlayer[]; dataJsonRes?: string | { resultsList?: DayResult[]; countRecords?: DayResult[] } }

export class LegacyClubRecordUserDayController {
    private form: LegacyForm | null = null;
    private clubId = 0;
    private unionId = 0;
    private type = 0;
    private sort = 1;
    private page = 1;
    private loading = false;
    private readonly disposers: Array<() => void> = [];
    private readonly rowDisposers: Array<() => void> = [];

    public constructor(private readonly forms: LegacyFormManager, private readonly client: ProtocolClient,
        private readonly playerId: number, private readonly lobbyNode: Node) {}

    public install(): void {
        this.forms.register('ui/club/UIClubRecordUserDay', { zOrder: 9, lifecycle: {
            onCreate: (form) => this.bind(form),
            onShow: (form, clubId, unionId) => this.show(form, Number(clubId ?? 0), Number(unionId ?? 0)),
            onClose: () => { this.form = null; this.clearRows(); },
        }});
    }

    public dispose(): void { this.clearRows(); for (const dispose of this.disposers.splice(0)) dispose(); }

    private bind(form: LegacyForm): void {
        this.click(form.node, 'btn_close', () => this.forms.close('ui/club/UIClubRecordUserDay'));
        this.click(form.node, 'btn_shuaxin', () => { this.page = 1; void this.load(true); });
        this.click(form.node, 'btn_time_sort', () => { this.sort = this.sort === 0 ? 1 : 0; this.page = 1; void this.load(true); });
        this.click(form.node, 'btn_tongji', () => { void this.forms.show('ui/club/ClubPlayerLog', this.clubId, this.unionId); });
        for (let i = 0; i <= 6; i += 1) this.click(form.node, `btn_tian${i}`, () => { this.type = i; this.page = 1; this.updateTabs(); void this.load(true); });
        const scroll = this.desc(form.node, 'mask')?.getComponent(ScrollView); if (scroll) { const fn = () => { if (!this.loading) { this.page += 1; void this.load(false); } }; this.disposers.push(ScrollEvents.onBottom(scroll, fn)); }
    }

    private show(form: LegacyForm, clubId: number, unionId: number): void { this.form = form; this.clubId = clubId; this.unionId = unionId; this.type = 0; this.sort = 1; this.page = 1; this.updateDateLabels(); this.updateTabs(); void this.load(true); }

    private async load(refresh: boolean): Promise<void> { const form = this.form; if (!form || this.loading) return; this.loading = true; try { if (refresh) await this.loadCount(); const result = await this.client.request<{ pRoomRecords?: DayRecord[] }>('club.CClubMemberRoomRecord', { clubId: this.clubId, gameType: -1, pageNum: this.page, sort: this.sort, getType: this.type }); this.render(result.pRoomRecords ?? [], refresh); } catch (e) { if (refresh) this.render([], true); await this.tip(e instanceof Error ? e.message : '获取成员战绩失败'); } finally { this.loading = false; } }
    private async loadCount(): Promise<void> { const form = this.form; if (!form) return; try { const result = await this.client.request<{ size?: number; winner?: number; sumPoint?: number }>('club.CClubPlayerRecordCount', { clubId: this.clubId, unionId: this.unionId, getType: this.type }); this.label(form.node, 'lb_jushu', `对局数：${result.size ?? 0}`); this.label(form.node, 'lb_dayingjia', `大赢家：${result.winner ?? 0}`); this.label(form.node, 'lb_shuyingfen', `${this.unionId > 0 ? '俱乐部积分' : '输赢分'}：${result.sumPoint ?? 0}`); } catch { this.label(form.node, 'lb_jushu', ''); this.label(form.node, 'lb_dayingjia', ''); this.label(form.node, 'lb_shuyingfen', ''); } }

    private render(records: DayRecord[], refresh: boolean): void { const form = this.form; if (!form) return; const content = this.content(form.node); const demo = this.desc(form.node, 'demo'); if (!content || !demo) return; if (refresh) { this.clearRows(); for (const child of [...content.children]) child.destroy(); } demo.active = false; for (const record of records) { const node = instantiate(demo); node.active = true; this.label(node, 'lb_configName', String(record.configName ?? '')); this.label(node, 'lb_game', `游戏${record.gameType ?? ''}`); this.label(node, 'lb_roomkey', String(record.roomKey ?? '')); this.label(node, 'lb_setcount', this.roundText(Number(record.setCount ?? 0))); this.label(node, 'lb_time', String(record.endTime ?? '')); const players = this.players(record.playerList); const results = this.results(record.dataJsonRes); this.renderPlayers(node, players, results); const winner = players.reduce<DayPlayer | null>((best, player) => !best || this.point(player.pid, results) > this.point(best.pid, results) ? player : best, null); this.label(node, 'lb_winname', String(winner?.name ?? '')); this.label(node, 'lb_winid', winner?.pid ? `ID:${winner.pid}` : ''); const mine = this.unionId > 0 ? this.sports(this.playerId, results) : this.point(this.playerId, results); this.active(node, 'img_win', mine > 0); this.active(node, 'img_lost', mine <= 0); this.rowClick(node, 'btn_djxq', () => this.lobbyNode.emit('legacy-replay-room', { roomId: Number(record.roomId ?? record.roomID ?? 0), source: 'CLUB', returnForm: 'ui/club/UIClubRecordUserDay' })); content.addChild(node); } content.getComponent(Layout)?.updateLayout(); }
    private renderPlayers(recordNode: Node, players: DayPlayer[], results: DayResult[]): void { const mask = recordNode.children.find((node) => node.name === 'mask'); const layout = mask?.children.find((node) => node.name === 'layout'); const demo = mask?.children.find((node) => node.name === 'user_demo'); if (!layout || !demo) return; demo.active = false; for (const player of players) { const node = instantiate(demo); node.active = true; const point = this.point(player.pid, results); const sports = this.sports(player.pid, results); this.label(node, 'lb_name', String(player.name ?? '')); this.label(node, 'lb_point', point > 0 ? `+${point}` : String(point)); this.label(node, 'lb_sportPoint', this.unionId > 0 ? `赛:${sports > 0 ? '+' : ''}${sports}` : ''); layout.addChild(node); } layout.getComponent(Layout)?.updateLayout(); }

    private updateTabs(): void { const tab = this.form ? this.desc(this.form.node, 'tab') : null; for (let i = 0; i < (tab?.children.length ?? 0); i += 1) { const child = tab?.children[i]; if (!child) continue; this.active(child, 'on', i === this.type); this.active(child, 'off', i !== this.type); } }
    private updateDateLabels(): void { const tab = this.form ? this.desc(this.form.node, 'tab') : null; for (let i = 3; i < (tab?.children.length ?? 0); i += 1) { const child = tab?.children[i]; if (!child) continue; const date = new Date(Date.now() - i * 86400000); const text = `${date.getMonth() + 1}月${date.getDate()}日`; this.label(this.desc(child, 'on') ?? child, 'lb', text); this.label(this.desc(child, 'off') ?? child, 'lb', text); } }
    private players(value: DayRecord['playerList']): DayPlayer[] { if (Array.isArray(value)) return value; try { const result = JSON.parse(String(value ?? '[]')) as unknown; return Array.isArray(result) ? result as DayPlayer[] : []; } catch { return []; } }
    private results(value: DayRecord['dataJsonRes']): DayResult[] { try { const data = typeof value === 'string' ? JSON.parse(value) as { resultsList?: DayResult[]; countRecords?: DayResult[] } : value; return data?.resultsList ?? data?.countRecords ?? []; } catch { return []; } }
    private point(pid: number | undefined, rows: DayResult[]): number { const row = rows.find((item) => Number(item.pid) === Number(pid)); return Number(row?.point ?? row?.clubCent ?? 0); }
    private sports(pid: number | undefined, rows: DayResult[]): number { return Number(rows.find((item) => Number(item.pid) === Number(pid))?.clubCent ?? 0); }
    private roundText(value: number): string { if (value === 100) return '1考'; if (value === 201) return '1拷'; if (value === 310) return '1课:10分'; if (value === 311) return '1课:100分'; if (value === 312) return '局麻'; if (value === 401) return '1次'; return String(value); }
    private content(root: Node): Node | null { const masks = this.all(root, 'mask'); return masks.find((mask) => mask.children.some((child) => child.name === 'layout' && !child.children.some((node) => node.name === 'user_demo')))?.children.find((node) => node.name === 'layout') ?? null; }
    private all(root: Node, name: string): Node[] { const result: Node[] = []; if (root.name === name) result.push(root); for (const child of root.children) result.push(...this.all(child, name)); return result; }
    private click(root: Node, name: string, fn: () => void): void { const node = this.desc(root, name); if (!node) return; node.on(Button.EventType.CLICK, fn); this.disposers.push(() => node.off(Button.EventType.CLICK, fn)); }
    private rowClick(root: Node, name: string, fn: () => void): void { const node = this.desc(root, name); if (!node) return; node.on(Button.EventType.CLICK, fn); this.rowDisposers.push(() => node.off(Button.EventType.CLICK, fn)); }
    private clearRows(): void { for (const dispose of this.rowDisposers.splice(0)) dispose(); }
    private desc(root: Node, name: string): Node | null { if (root.name === name) return root; for (const child of root.children) { const result = this.desc(child, name); if (result) return result; } return null; }
    private label(root: Node, name: string, value: string): void { setClubDynamicLabel(this.desc(root, name)?.getComponent(Label) ?? null, name, value); }
    private active(root: Node, name: string, value: boolean): void { const node = this.desc(root, name); if (node) node.active = value; }
    private async tip(message: string): Promise<void> { await this.forms.show('UIMessage_Drift', null, null, message); }
}
