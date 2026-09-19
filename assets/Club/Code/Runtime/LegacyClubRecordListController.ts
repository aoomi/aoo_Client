import { Button, EditBox, Label, Layout, Node, ScrollView, Toggle, instantiate } from 'cc';
import { ProtocolClient } from '../../../Common/Code/Runtime/network/ProtocolClient';
import { LegacyForm, LegacyFormManager } from '../../../Common/Code/Runtime/ui/LegacyFormManager';
import { setClubDynamicLabel } from './ClubDynamicLabel';
import { ScrollEvents } from '../../../Common/Code/UI/UnifiedScroll';

interface ClubRecordPlayer {
    pid?: number;
    name?: string;
    point?: number;
    clubCent?: number;
    clubName?: string;
}

interface ClubRecordInfo {
    roomID?: number;
    roomKey?: number | string;
    roomState?: number;
    endTime?: number | string;
    sportsDouble?: number;
    gameType?: number;
    configName?: string;
    valueType?: number;
    roomCard?: number;
    unionId?: number;
    roomSportsConsume?: number;
    isViewed?: boolean;
    playerList?: string | ClubRecordPlayer[];
}

interface RecordResponse {
    clubRecordInfos?: ClubRecordInfo[];
    pageNumTotal?: number;
}

interface RecordSummary {
    pageNumTotal?: number;
    roomCardTotalCount?: number;
    roomTotalCount?: number;
}

export class LegacyClubRecordListController {
    private form: LegacyForm | null = null;
    private clubId = 0;
    private unionId = 0;
    private recordType = 0;
    private page = 1;
    private pageTotal = 1;
    private epoch = 0;
    private loading = false;
    private selectAll = true;
    private readonly rowRecords = new Map<Node, ClubRecordInfo>();

    public constructor(
        private readonly forms: LegacyFormManager,
        private readonly client: ProtocolClient,
        private readonly playerId: number,
        private readonly lobbyNode: Node,
    ) {}

    public install(): void {
        this.forms.register('ui/club/UIClubRecordList', {
            zOrder: 9,
            lifecycle: {
                onCreate: (form) => this.bind(form),
                onShow: (form, clubId, unionId, _clubName, unionPostType, minister) => {
                    this.show(form, Number(clubId ?? 0), Number(unionId ?? 0),
                        Number(unionPostType ?? -1), Number(minister ?? 0));
                },
                onClose: () => {
                    this.epoch += 1;
                    this.form = null;
                    this.loading = false;
                },
            },
        });
    }

    private bind(form: LegacyForm): void {
        this.clearLegacyToggleHandlers(form.node);
        this.click(form.find('btn_close'), () => this.forms.close('ui/club/UIClubRecordList'));
        this.active(form, 'btn_next', false);
        this.active(form, 'btn_last', false);
        this.active(form, 'page', false);
        this.active(form, 'pageGo', false);
        const scroll = form.find('mark')?.getComponent(ScrollView);
        if (scroll) ScrollEvents.onBottom(scroll, () => {
            if (!this.loading && this.page < this.pageTotal) { this.page += 1; void this.load(false, undefined, true); }
        });
        this.click(form.find('top/btn_list/btn_all'), () => void this.selectType(6));
        this.click(form.find('top/btn_list/btn_zuotian'), () => void this.selectType(1));
        this.click(form.find('top/btn_list/btn_jintian'), () => void this.selectType(0));
        this.click(form.find('top/btn_list/btn_anren'), () => this.openReport());
        this.click(form.find('top/btn_quanxuan'), () => this.toggleAll());
        this.click(form.find('btn_huizong'), () => this.openReport());
        this.click(form.find('pageGo/btn_tz'), () => void this.jumpPage());
        this.click(form.find('roomGo/btn_searchroom'), () => void this.searchRoom());
        this.toggle(form.find('clubToggle'), () => void this.reloadFirstPage());
        this.toggle(form.find('recordToggle'), () => void this.reloadFirstPage());
    }

    private show(form: LegacyForm, clubId: number, unionId: number, unionPostType: number, minister: number): void {
        this.form = form;
        this.clubId = clubId;
        this.unionId = unionId;
        this.recordType = 0;
        this.page = 1;
        this.pageTotal = 1;
        this.selectAll = true;
        this.epoch += 1;
        this.loading = false;
        const canSwitchClub = unionId > 0 && (unionPostType === 0 || unionPostType === 1 || minister > 0);
        this.active(form, 'clubToggle', canSwitchClub);
        this.active(form, 'recordToggle', true);
        const clubToggle = this.toggleComponent(form.find('clubToggle'));
        if (clubToggle) this.setToggleChecked(clubToggle, true);
        const recordToggle = this.toggleComponent(form.find('recordToggle'));
        if (recordToggle) this.setToggleChecked(recordToggle, true);
        const pageEdit = form.find('pageGo/pageEditBox')?.getComponent(EditBox);
        if (pageEdit) pageEdit.string = '';
        const roomEdit = form.find('roomGo/pageEditBox')?.getComponent(EditBox);
        if (roomEdit) roomEdit.string = '';
        const demo = form.find('mark/demo');
        if (demo) demo.active = false;
        this.clearRows();
        this.setLabel(form.node, 'page/lb_page', '1/1');
        void this.load(true);
    }

    private async load(refreshSummary: boolean, query?: string, append = false): Promise<void> {
        if (!this.form || this.clubId <= 0 || this.loading) return;
        const form = this.form;
        const requestEpoch = ++this.epoch;
        this.loading = true;
        this.markType(form);
        const packet: Record<string, unknown> = {
            clubId: this.clubId,
            getType: this.recordType,
            pageNum: query ? 1 : this.page,
            type: this.toggleComponent(form.find('recordToggle'))?.isChecked ? 1 : 0,
        };
        const clubToggle = form.find('clubToggle');
        if (this.unionId > 0 && clubToggle?.active && !this.toggleComponent(clubToggle)?.isChecked) {
            packet.unionId = this.unionId;
        }
        if (query) {
            packet.query = query;
            packet.type = 0;
        }
        try {
            const summaryPromise = refreshSummary
                ? this.client.request<RecordSummary>('club.CClubTotalInfo', { ...packet, pageNum: undefined, type: undefined, query: undefined })
                : Promise.resolve<RecordSummary | null>(null);
            const [records, summary] = await Promise.all([
                this.client.request<RecordResponse>('club.CClubGetRecord', packet),
                summaryPromise,
            ]);
            if (!this.form || this.form !== form || requestEpoch !== this.epoch) return;
            if (summary) this.renderSummary(form, summary);
            this.pageTotal = query ? 1 : Math.max(1, Number(summary?.pageNumTotal ?? records.pageNumTotal ?? this.pageTotal));
            if (!append) this.clearRows();
            for (const record of records.clubRecordInfos ?? []) this.addRecord(form, record);
        } catch (error: unknown) {
            if (requestEpoch === this.epoch) {
                await this.forms.show('UIMessage_Drift', null, null,
                    error instanceof Error ? error.message : '战绩加载失败，请稍后重试');
            }
        } finally {
            if (requestEpoch === this.epoch) this.loading = false;
        }
    }

    private renderSummary(form: LegacyForm, summary: RecordSummary): void {
        this.setLabel(form.node, 'top/lb_fangka', `钻石:${summary.roomCardTotalCount ?? 0}个`);
        this.setLabel(form.node, 'top/lb_quanka', '');
        this.setLabel(form.node, 'top/lb_jushu', `开房总次数:${summary.roomTotalCount ?? 0}`);
    }

    private addRecord(form: LegacyForm, record: ClubRecordInfo): void {
        const layout = form.find('mark/layout');
        const demo = form.find('mark/demo');
        if (!layout || !demo) return;
        const row = instantiate(demo);
        row.name = `record-${record.roomID ?? layout.children.length}`;
        row.active = true;
        this.rowRecords.set(row, record);
        this.setLabel(row, 'lb_roomState', Number(record.roomState ?? 0) === 1 ? '游戏中' : '');
        this.setLabel(row, 'date', Number(record.roomState ?? 0) === 1 ? '' : this.formatDate(record.endTime));
        this.setLabel(row, 'lb_beishu', record.sportsDouble === undefined ? '' : `${record.sportsDouble}倍`);
        this.setLabel(row, 'room_key', String(record.roomKey ?? ''));
        this.setLabel(row, 'game_name/lb_gameName', String(record.configName || record.gameType || ''));
        this.activeNode(row, 'icon_fk', record.valueType === 2);
        this.activeNode(row, 'icon_qk', false);
        this.setLabel(row, 'lb_card', record.valueType === 2 ? `X${record.roomCard ?? 0}` : '');
        this.activeNode(row, 'icon_ClubCent', Number(record.unionId ?? 0) > 0);
        this.setLabel(row, 'lb_ClubCent', Number(record.unionId ?? 0) > 0 ? `X${record.roomSportsConsume ?? 0}` : '');
        const viewed = this.toggleComponent(this.find(row, 'isCheckToggle'));
        if (viewed) this.setToggleChecked(viewed, Boolean(record.isViewed));
        this.toggle(this.find(row, 'isCheckToggle'), () => void this.updateViewed(row));
        this.click(this.find(row, 'btn_record_info'), () => this.openDetail(row));
        this.renderPlayers(row, this.players(record.playerList));
        layout.addChild(row);
        if (Layout) layout.getComponent(Layout)?.updateLayout();
    }

    private renderPlayers(row: Node, players: ClubRecordPlayer[]): void {
        const layout = this.find(row, 'user_layout');
        const demo = this.find(row, 'userDemo');
        if (!layout || !demo) return;
        for (const child of [...layout.children]) child.destroy();
        demo.active = false;
        for (const player of players) {
            const node = instantiate(demo);
            node.active = true;
            this.setLabel(node, 'lb_name', String(player.name ?? ''));
            this.setLabel(node, 'lb_id', `ID:${player.pid ?? ''}`);
            const point = Number(player.point ?? 0);
            this.setLabel(node, 'lb_code', point > 0 ? `+${point}` : String(point));
            this.setLabel(node, 'lb_clubName', player.clubName ? `圈:${player.clubName}` : '');
            this.setLabel(node, 'lb_ClubCent', this.unionId > 0 ? `赛:${Number(player.clubCent ?? 0) > 0 ? '+' : ''}${player.clubCent ?? 0}` : '');
            layout.addChild(node);
        }
        if (Layout) layout.getComponent(Layout)?.updateLayout();
    }

    private async updateViewed(row: Node): Promise<void> {
        const record = this.rowRecords.get(row);
        if (!record) return;
        const checked = this.toggleComponent(this.find(row, 'isCheckToggle'))?.isChecked ?? false;
        try {
            await this.client.request('club.CClubRoomIdOperation', {
                clubId: this.clubId,
                unionId: this.unionId,
                endTime: record.endTime,
                roomID: record.roomID,
                type: checked ? 1 : 0,
            });
        } catch (error: unknown) {
            const toggle = this.toggleComponent(this.find(row, 'isCheckToggle'));
            if (toggle) this.setToggleChecked(toggle, !checked);
            await this.forms.show('UIMessage_Drift', null, null,
                error instanceof Error ? error.message : '战绩查看状态更新失败');
        }
    }

    private async selectType(type: number): Promise<void> {
        if (this.loading) return;
        this.recordType = type;
        this.page = 1;
        await this.load(true);
    }

    private async reloadFirstPage(): Promise<void> {
        if (this.loading) return;
        this.page = 1;
        await this.load(true);
    }

    private async jumpPage(): Promise<void> {
        const value = this.form?.find('pageGo/pageEditBox')?.getComponent(EditBox)?.string.trim() ?? '';
        if (!/^\d+$/.test(value) || Number(value) < 1) {
            await this.forms.show('UIMessage_Drift', null, null, '请输入纯数字的页数');
            return;
        }
        if (Number(value) > this.pageTotal) {
            await this.forms.show('UIMessage_Drift', null, null, '输入的页数超出总页数');
            return;
        }
        this.page = Number(value);
        await this.load(true);
    }

    private async searchRoom(): Promise<void> {
        const value = this.form?.find('roomGo/pageEditBox')?.getComponent(EditBox)?.string.trim() ?? '';
        if (!/^\d+$/.test(value) || Number(value) <= 0) {
            await this.forms.show('UIMessage_Drift', null, null, '请输入纯数字的房间号');
            return;
        }
        await this.load(true, value);
    }

    private toggleAll(): void {
        this.selectAll = !this.selectAll;
        for (const row of this.rowRecords.keys()) {
            const toggle = this.toggleComponent(this.find(row, 'toggle'));
            if (toggle) this.setToggleChecked(toggle, this.selectAll);
        }
    }

    private openReport(): void {
        const roomIds = [...this.rowRecords.entries()]
            .filter(([row]) => this.toggleComponent(this.find(row, 'toggle'))?.isChecked)
            .map(([, record]) => record.roomID).filter((id): id is number => Number(id ?? 0) > 0);
        if (!this.selectAll && roomIds.length === 0) return;
        const showAllClub = this.unionId > 0
            && !(this.toggleComponent(this.form?.find('clubToggle') ?? null)?.isChecked ?? true);
        void this.forms.show('ui/club/UIClubReport', this.clubId, roomIds, this.selectAll,
            this.recordType, showAllClub, this.unionId);
    }

    private openDetail(row: Node): void {
        const record = this.rowRecords.get(row);
        if (!record) return;
        // Every gameplay family owns its settlement presentation. Record detail
        // therefore enters the shared authoritative history boundary and lets
        // the catalog resolve that game's real SmallSettlement prefab.
        this.lobbyNode.emit('legacy-replay-room', {
            roomId: record.roomID,
            source: 'CLUB',
            returnForm: 'ui/club/UIClubRecordList',
        });
    }

    private markType(form: LegacyForm): void {
        const mapping: Record<number, string> = { 6: 'btn_all', 1: 'btn_zuotian', 0: 'btn_jintian', 3: 'btn_anren' };
        for (const name of ['btn_all', 'btn_zuotian', 'btn_jintian', 'btn_anren']) {
            const selected = mapping[this.recordType] === name;
            this.active(form, `top/btn_list/${name}/on`, selected);
            this.active(form, `top/btn_list/${name}/off`, !selected);
        }
    }

    private clearRows(): void {
        const layout = this.form?.find('mark/layout');
        if (layout) for (const child of [...layout.children]) child.destroy();
        this.rowRecords.clear();
    }

    private players(value: ClubRecordInfo['playerList']): ClubRecordPlayer[] {
        if (Array.isArray(value)) return value;
        if (!value) return [];
        try {
            const parsed = JSON.parse(value) as unknown;
            return Array.isArray(parsed) ? parsed as ClubRecordPlayer[] : [];
        } catch {
            return [];
        }
    }

    private formatDate(value: ClubRecordInfo['endTime']): string {
        if (value === undefined || value === null || value === '') return '';
        const raw = Number(value);
        const date = new Date(raw < 10_000_000_000 ? raw * 1000 : raw);
        if (Number.isNaN(date.getTime())) return String(value);
        const pad = (part: number) => String(part).padStart(2, '0');
        return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
    }

    private click(node: Node | null, listener: () => void): void {
        node?.on(Button.EventType.CLICK, listener);
    }

    private toggle(node: Node | null, listener: () => void): void {
        node?.on(Toggle.EventType.TOGGLE, listener);
    }

    private active(form: LegacyForm, path: string, active: boolean): void {
        const node = form.find(path);
        if (node) node.active = active;
    }

    private activeNode(root: Node, path: string, active: boolean): void {
        const node = this.find(root, path);
        if (node) node.active = active;
    }

    private setLabel(root: Node, path: string, value: string): void {
        const label = Label ? this.find(root, path)?.getComponent(Label) : null;
        setClubDynamicLabel(label, path, value);
    }

    private toggleComponent(node: Node | null): Toggle | null {
        return (node?.components.find((component) => 'isChecked' in component && 'checkEvents' in component) as Toggle | undefined) ?? null;
    }

    private clearLegacyToggleHandlers(root: Node): void {
        for (const component of root.components) {
            const toggle = component as unknown as Partial<Toggle>;
            if (Array.isArray(toggle.checkEvents)) toggle.checkEvents.length = 0;
        }
        for (const child of root.children) this.clearLegacyToggleHandlers(child);
    }

    private setToggleChecked(toggle: Toggle, checked: boolean): void {
        (toggle as unknown as { _isChecked: boolean })._isChecked = checked;
        if (toggle.checkMark) toggle.checkMark.node.active = checked;
    }

    private find(root: Node, path: string): Node | null {
        let node: Node | null = root;
        for (const part of path.split('/')) node = node?.getChildByName(part) ?? null;
        return node;
    }
}
