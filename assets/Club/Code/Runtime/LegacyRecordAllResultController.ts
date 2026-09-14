import { Button, director, Director, EditBox, Label, Layout, Node } from 'cc';
import { ProtocolClient } from '../../../Common/Code/Runtime/network/ProtocolClient';
import { LegacyForm, LegacyFormManager } from '../../../Common/Code/Runtime/ui/LegacyFormManager';
import { LegacyPrefabRenderer } from '../../../Common/Code/Runtime/ui/LegacyPrefabRenderer';
import { settlementBundlePreloader } from '../../../Games/Common/Code/Settlement/SettlementBundlePreloader';
import type { ClubTopBarPort } from './ClubTopBarPort';

interface RecordPlayer { pid?: number; name?: string; }
interface SetRoomRecord { setID?: number; endTime?: number; playbackCode?: number; dataJsonRes?: string | Record<string, unknown>; }
interface SetRoomRecordResponse { pSetRoomRecords?: SetRoomRecord[]; }

/** Restores the shared room-record form and its PDK-family detail view. */
export class LegacyRecordAllResultController {
    private readonly renderer = new LegacyPrefabRenderer();
    private form: LegacyForm | null = null;
    private roomId = 0;
    private roomKey = '';
    private players: RecordPlayer[] = [];
    private records: SetRoomRecord[] = [];
    private page = 1;
    private epoch = 0;
    private renderEpoch = 0;
    private openingReplay = false;
    private headerRevision = 0;

    public constructor(
        private readonly forms: LegacyFormManager,
        private readonly client: ProtocolClient,
        private readonly lobbyNode: Node,
        private readonly playerName: string,
        private readonly top: ClubTopBarPort,
    ) {}

    public install(): void {
        this.forms.register('UILobbyRecordResult', {
            zOrder: 9,
            lifecycle: {
                onCreate: (form) => this.bind(form),
                onShow: (form, roomId, players, _gameType, _unionId, roomKey, defaultPage) => {
                    void this.show(form, Number(roomId ?? 0), Array.isArray(players) ? players as RecordPlayer[] : [],
                        String(roomKey ?? ''), Number(defaultPage ?? 1));
                },
                onClose: () => {
                    this.epoch += 1;
                    this.renderEpoch += 1;
                    this.form = null;
                    this.top.pop('UILobbyRecordResult');
                },
            },
        });
    }

    private bind(form: LegacyForm): void {
        this.click(form.find('btn_last'), () => void this.changePage(-1));
        this.click(form.find('btn_next'), () => void this.changePage(1));
        this.click(form.find('btn_search'), () => void this.searchPage());
        this.click(form.find('btn_replay'), () => void this.openReplay());
        this.click(form.find('btn_share'), () => this.shareReplay());
    }

    private async show(form: LegacyForm, roomId: number, players: RecordPlayer[], roomKey: string, page: number): Promise<void> {
        this.form = form;
        this.roomId = roomId;
        this.roomKey = roomKey;
        this.players = players;
        this.records = [];
        this.page = Math.max(1, page);
        const requestEpoch = ++this.epoch;
        this.clearPlayers(form);
        this.header(form, null);
        await this.top.push('UILobbyRecordResult');
        try {
            const response = await this.client.request<SetRoomRecordResponse>('game.CPlayerSetRoomRecord', { roomID: roomId });
            if (requestEpoch !== this.epoch || this.form !== form) return;
            this.records = response.pSetRoomRecords ?? [];
            this.page = Math.min(this.page, Math.max(1, this.records.length));
            await this.render();
        } catch (error: unknown) {
            if (requestEpoch === this.epoch) await this.forms.show('UIMessage_Drift', null, null,
                error instanceof Error ? error.message : '战绩详情加载失败，请稍后重试');
        }
    }

    private async render(): Promise<void> {
        const form = this.form;
        const record = this.records[this.page - 1];
        if (!form || !record) { this.header(form, null); return; }
        const renderEpoch = ++this.renderEpoch;
        const data = this.json(record.dataJsonRes);
        const results = Array.isArray(data.posResultList) ? data.posResultList as Array<Record<string, unknown>> : [];
        this.clearPlayers(form);
        if (this.form !== form || renderEpoch !== this.renderEpoch) return;
        const container = form.find('PokerScrollView/view/PokerPlayers');
        if (!container) return;
        for (const [index, result] of results.entries()) {
            if (this.form !== form || renderEpoch !== this.renderEpoch) return;
            if (Number(result.pid ?? 0) <= 0) continue;
            await settlementBundlePreloader.loadForDisplay('Poker', 'BigSettle');
            const child = await this.renderer.instantiatePrefab(
                'poker-common',
                'Prefab/BigSettle/BigSettlement',
                container,
            );
            if (this.form !== form || renderEpoch !== this.renderEpoch) { child.destroy(); return; }
            this.renderPlayer(child, result, index);
        }
        if (Layout) container.getComponent(Layout)?.updateLayout();
        this.header(form, record);
    }

    private renderPlayer(node: Node, result: Record<string, unknown>, index: number): void {
        const revision = this.renderEpoch;
        this.applyPlayer(node, result, index);
        director.once(Director.EVENT_AFTER_UPDATE, () => {
            if (node.isValid && revision === this.renderEpoch) this.applyPlayer(node, result, index);
        });
    }

    private applyPlayer(node: Node, result: Record<string, unknown>, index: number): void {
        const pid = Number(result.pid ?? 0);
        const player = this.players.find((item) => Number(item.pid ?? 0) === pid);
        const point = Number(result.point ?? 0);
        this.text(node, 'user_info/lable_name', this.shortName(String(player?.name ?? pid)));
        this.text(node, 'user_info/label_id', `ID:${pid}`);
        this.active(node, 'lb_win_num', point > 0);
        this.active(node, 'lb_lose_num', point <= 0);
        this.text(node, 'lb_win_num', point > 0 ? `+${point}` : '');
        this.text(node, 'lb_lose_num', point <= 0 ? String(point) : '');
        const clubCent = Number(result.clubCent ?? 0);
        this.active(node, 'lb_ClubCentTitle', clubCent !== 0);
        this.text(node, 'lb_ClubCentTitle/lb_ClubCent', clubCent > 0 ? `+${clubCent}` : String(clubCent));
        const surplus = Array.isArray(result.surplusCardList)
            ? Number(result.surplusCardList[index] ?? 0)
            : Number(result.surplusCardNum ?? 0);
        this.text(node, 'lb_paishu', String(surplus));
        this.active(node, 'lb_beiShu', false);
        this.active(node, 'lb_beishuTitle', false);
        this.active(node, 'icon_robClose', false);
    }

    private header(form: LegacyForm | null, record: SetRoomRecord | null): void {
        if (!form) return;
        const revision = ++this.headerRevision;
        this.applyHeader(form, record);
        director.once(Director.EVENT_AFTER_UPDATE, () => {
            if (form.node.isValid && this.form === form && revision === this.headerRevision) this.applyHeader(form, record);
        });
    }

    private applyHeader(form: LegacyForm, record: SetRoomRecord | null): void {
        this.text(form.node, 'room_info/roomID', this.roomKey ? `房间号:${this.roomKey}` : `房间ID:${this.roomId}`);
        this.text(form.node, 'room_info/jushu', record ? `第${record.setID ?? this.page}局` : '');
        this.text(form.node, 'room_info/endTime', record ? this.date(record.endTime) : '');
        this.text(form.node, 'room_info/backCode', record?.playbackCode ? `回放码:${record.playbackCode}` : '');
        this.active(form.node, 'btn_replay', Number(record?.playbackCode ?? 0) > 0);
        this.active(form.node, 'btn_share', Number(record?.playbackCode ?? 0) > 0);
        this.editText(form, 'page/editbox_page', `${this.page}/${Math.max(1, this.records.length)}`);
        this.editText(form, 'page2/editbox_page', String(this.page));
    }

    private async changePage(delta: number): Promise<void> {
        const next = this.page + delta;
        if (next < 1) {
            await this.forms.show('UIMessage_Drift', null, null, '已经是第一局');
            return;
        }
        if (next > this.records.length) {
            await this.forms.show('UIMessage_Drift', null, null, '已经是最后一局');
            return;
        }
        this.page = next;
        await this.render();
    }

    private async searchPage(): Promise<void> {
        const editNode = this.form?.find('page2/editbox_page') ?? null;
        const value = (editNode ? this.editBox(editNode)?.string : '')?.trim() ?? '';
        if (!/^\d+$/.test(value) || this.records.length === 0) return;
        this.page = Math.min(Math.max(Number(value), 1), this.records.length);
        await this.render();
    }

    private async openReplay(): Promise<void> {
        const form = this.form;
        const requestEpoch = this.epoch;
        const record = this.records[this.page - 1];
        const playBackCode = String(record?.playbackCode ?? '');
        if (this.openingReplay || !playBackCode || playBackCode === '0') return;
        this.openingReplay = true;
        try {
            const response = await this.client.request<{ Name?: string }>('game.CPlayerPlayBack', {
                playBackCode,
                chekcPlayBackCode: true,
            });
            if (this.form !== form || this.epoch !== requestEpoch) return;
            const gameName = String(response.Name ?? '').toLowerCase();
            if (!gameName) throw new Error('回放记录不存在');
            this.lobbyNode.emit('legacy-club-open-replay', { gameName, playBackCode });
        } catch (error: unknown) {
            await this.forms.show('UIMessage_Drift', null, null,
                error instanceof Error ? error.message : '回放记录不存在');
        } finally {
            this.openingReplay = false;
        }
    }

    private shareReplay(): void {
        const record = this.records[this.page - 1];
        const playBackCode = Number(record?.playbackCode ?? 0);
        if (playBackCode <= 0) return;
        this.lobbyNode.emit('legacy-share-request', {
            mode: 'link',
            title: `回放码为【${playBackCode}】`,
            description: `【${this.playerName}】邀请您观看【内江跑得快】中牌局回放记录`,
            roomId: this.roomId,
            roomKey: this.roomKey,
        });
    }

    private clearPlayers(form: LegacyForm): void {
        for (const path of ['PokerScrollView/view/PokerPlayers', 'MJPlayers', 'VerticalScrollView/view/players']) {
            const node = form.find(path);
            if (node) for (const child of [...node.children]) child.destroy();
        }
        this.active(form.node, 'PokerScrollView', true);
        this.active(form.node, 'MJPlayers', false);
        this.active(form.node, 'VerticalScrollView', false);
    }

    private json(value: SetRoomRecord['dataJsonRes']): Record<string, unknown> {
        if (value && typeof value === 'object') return value;
        try { return JSON.parse(String(value ?? '{}')) as Record<string, unknown>; }
        catch { return {}; }
    }

    private date(value: unknown): string {
        const raw = Number(value ?? 0); if (!raw) return '';
        const date = new Date(raw < 100000000000 ? raw * 1000 : raw);
        const pad = (number: number) => number < 10 ? `0${number}` : String(number);
        return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
    }

    private shortName(value: string): string { return value.length > 6 ? `${value.slice(0, 6)}...` : value; }
    private editText(form: LegacyForm, path: string, value: string): void {
        const editNode = this.find(form.node, path);
        if (!editNode) throw new Error(`UIGameRecordResult missing node: ${path}`);
        const edit = this.editBox(editNode);
        if (!edit) throw new Error(`UIGameRecordResult missing EditBox: ${path}`);
        if (edit) {
            edit.string = value;
            if (edit.textLabel) {
                edit.textLabel.string = value;
                edit.textLabel.updateRenderData(true);
            }
        }
        this.text(form.node, `${path}/TEXT_LABEL`, value);
        if (edit.string !== value) throw new Error(`UIGameRecordResult rejected value: ${path}=${value}`);
    }
    /**
     * Components created from converted 2.4 prefabs can be reached before the
     * engine's named constructor table has settled. Never pass a missing class
     * token to Node.getComponent: Cocos logs and swallows that failure. The
     * structural fallback resolves the already-attached native component and
     * keeps converted prefab state on the same component instance.
     */
    private editBox(node: Node): EditBox | null {
        if (EditBox) {
            const component = node.getComponent(EditBox);
            if (component) return component;
        }
        return (node.components.find((component) => {
            const candidate = component as unknown as Partial<EditBox>;
            return typeof candidate.string === 'string' && 'textLabel' in candidate && 'placeholderLabel' in candidate;
        }) as EditBox | undefined) ?? null;
    }
    private find(root: Node, path: string): Node | null {
        const parts = path.split('/');
        let node: Node | null = root;
        for (const part of parts) node = node?.getChildByName(part) ?? null;
        if (node) return node;

        const leaf = parts[parts.length - 1];
        const pending = [...root.children];
        while (pending.length > 0) {
            const candidate = pending.shift()!;
            pending.push(...candidate.children);
            if (candidate.name !== leaf) continue;
            let ancestor: Node | null = candidate;
            let matches = true;
            for (let index = parts.length - 1; index >= 0; index -= 1) {
                if (ancestor?.name !== parts[index]) { matches = false; break; }
                ancestor = ancestor?.parent ?? null;
            }
            if (matches) return candidate;
        }
        return null;
    }
    private text(root: Node, path: string, value: string): void {
        const label = Label ? this.find(root, path)?.getComponent(Label) : null;
        if (label) {
            label.string = value;
            label.updateRenderData(true);
        }
    }
    private active(root: Node, path: string, value: boolean): void { const node = this.find(root, path); if (node) node.active = value; }
    private click(node: Node | null, listener: () => void): void { if (Button) node?.on(Button.EventType.CLICK, listener, this); }
}
