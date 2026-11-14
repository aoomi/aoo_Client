import { Button, Label, Layout, Node, ScrollView, Sprite, instantiate } from 'cc';
import { PlayerAvatarService } from '../../../Common/Code/UI/PlayerAvatarService';
import { ProtocolClient } from '../../../Common/Code/Runtime/network/ProtocolClient';
import { LegacyForm, LegacyFormManager } from '../../../Common/Code/Runtime/ui/LegacyFormManager';

type Data = Record<string, unknown>;
const PATH = 'ui/club/ClubSwitch';
/** ClubSwitch owns its authored templates; only generated records are removed. */
export class LegacyClubSwitchController {
    private disposers: Array<() => void> = [];
    private rows: Node[] = [];
    private rowDisposers = new Map<Node, Array<() => void>>();
    private entering = false;
    private details = new Map<string, symbol>();
    private session = 0;
    private epoch = 0;
    private roomEpoch = 0;
    private selected: Data = {};
    private root: Node | null = null;
    private clubs!: ScrollView;
    private rooms!: ScrollView;
    private clubDemo!: Node;
    private roomDemo!: Node;
    public constructor(private readonly forms: LegacyFormManager, private readonly client: ProtocolClient,
        private readonly enter: (club: Data) => Promise<boolean>,
        private readonly join: (room: Data, club: Data) => void,
        private readonly mainNode: Node) {}
    public install(): void {
        this.forms.register(PATH, { zOrder: 9, lifecycle: {
            onShow: (form, context) => { this.dispose(); this.root = form.node; this.selected = this.data(context);
                this.bind(form); void this.refresh(); },
            onClose: () => this.dispose(), onDestroy: () => this.dispose(),
        }});
    }
    public dispose(): void {
        ++this.session; ++this.epoch; ++this.roomEpoch;
        for (const off of this.disposers.splice(0)) off();
        this.clearRows();
        this.entering = false; this.details.clear();
        this.root = null;
    }
    private bind(form: LegacyForm): void {
        const root = form.node;
        this.clubs = this.required(root, 'ClubList', ScrollView).getComponent(ScrollView)!;
        this.rooms = this.required(root, 'RoomInfo', ScrollView).getComponent(ScrollView)!;
        for (const scroll of [this.clubs, this.rooms]) {
            if (!scroll.content || !this.within(root, scroll.content)) throw new Error('[ClubSwitch] invalid serialized ScrollView.content');
        }
        this.clubDemo = this.required(this.clubs.node, 'Demo', Button);
        this.roomDemo = this.required(this.rooms.node, 'Demo', Button);
        this.required(this.clubDemo, 'Head', Sprite);
        for (const name of ['RoomCard', 'GoldBean']) this.required(this.required(root, name, Node), 'Value', Label);
        for (const name of ['game_now', 'game_wait']) this.required(this.roomDemo, name, Sprite);
        const play = this.required(this.roomDemo, 'Play', Layout);
        for (let i = 0; i < 4; i++) this.required(play, String(i), Sprite);
        for (const name of ['ClubName', 'ID', 'renshu']) this.required(this.clubDemo, name, Label);
        for (const name of ['game_name', 'room_key', 'renshu', 'jushu', 'wanfa']) this.required(this.roomDemo, name, Label);
        for (const name of ['btn_yaoqing', 'btn_xiangqing ']) this.required(this.roomDemo, name, Button);
        for (const name of ['Btn_Back', 'Btn_Refresh', 'Btn_SwitchInterface', 'Btn_Admin']) this.required(root, name, Button);
        for (const event of ['SClub_RoomStatusChange', 'SUnion_RoomStatusChange', 'SClub_RoomPlayerChange',
            'SUnion_RoomPlayerChange', 'SClub_RoomSetChange', 'SUnion_RoomSetChange']) {
            this.disposers.push(this.client.on(event, body => {
                const clubId = Number(this.data(body).clubId ?? 0);
                if (this.root && (!clubId || clubId === Number(this.selected.id))) void this.loadRooms(this.epoch);
            }));
        }
        // Current member controller consumes these notifications without assuming payload fields.
        for (const event of ['SClub_PlayerNtf', 'OnClubPlayerNtf', 'SUnion_ClubCent']) {
            this.disposers.push(this.client.on(event, () => { if (this.root) void this.refresh(); }));
        }
        this.clubDemo.active = false; this.roomDemo.active = false;
        this.click(this.required(root, 'Btn_Back', Button), () => this.forms.close(PATH));
        this.click(this.required(root, 'Btn_Refresh', Button), () => { void this.refresh(); });
        this.click(this.required(root, 'Btn_SwitchInterface', Button), () => {
            if (this.entering || Number(this.selected.id ?? 0) <= 0) return;
            const session = this.session; this.entering = true;
            void this.enter(this.selected).then(ok => { if (ok && this.liveSession(session)) this.forms.close(PATH); })
                .catch(error => { if (this.liveSession(session)) this.tip(error); })
                .finally(() => { if (this.liveSession(session)) this.entering = false; });
        });
        this.click(this.required(root, 'Btn_Admin', Button), () => {
            if (Number(this.selected.minister ?? this.selected.myisminister ?? 0) > 0)
                void this.forms.show('ui/club/ClubAdmin', this.selected);
        });
    }
    private async refresh(): Promise<void> {
        const epoch = ++this.epoch; ++this.roomEpoch;
        this.clearRows();
        let result: unknown;
        try { result = await this.client.request<unknown>('club.CGetClubListMin', {}); }
        catch (error: unknown) { if (this.live(epoch)) this.tip(error); return; }
        if (!this.live(epoch)) return;
        if (!Array.isArray(result)) { this.tip(new Error('俱乐部列表响应不是数组')); return; }
        const list = result.map(v => this.data(v));
        const selected = list.find(v => Number(v.id) === Number(this.selected.id)) ?? list[0];
        this.selected = selected ?? {};
        for (const club of list) {
            const row = instantiate(this.clubDemo); row.active = true;
            this.label(row, 'ClubName', club.name); this.label(row, 'ID', club.clubsign ?? club.id);
            this.label(row, 'renshu', club.peopleNum ?? club.playerCount ?? club.memberCount ?? '');
            const head = this.required(row, 'Head', Sprite).getComponent(Sprite)!;
            head.spriteFrame = null;
            const heads = Array.isArray(club.headImages) ? club.headImages : [];
            if (heads.length > 0) {
                // The user retained the single portrait design: display the first
                // avatar in the server's ordered headImages list without adding nodes.
                const avatar = this.data(heads[0]);
                const pid = Number(avatar.pid);
                const url = typeof avatar.iconUrl === 'string' ? avatar.iconUrl : '';
                if (Number.isFinite(pid) && pid > 0) {
                    void PlayerAvatarService.frame(pid, url).then(frame => {
                        if (this.live(epoch) && row.isValid && head.isValid) head.spriteFrame = frame;
                    }).catch((error: unknown) => {
                        if (this.live(epoch) && row.isValid) this.tip(error);
                    });
                } else this.tip(new Error(`[ClubSwitch] 圈 ${String(club.id)}: headImages[0].pid 无效`));
            }
            this.addRow(row, this.clubs.content!);
            this.click(row, () => { this.selected = club; this.showSelected(); void this.loadRooms(epoch); }, row);
        }
        this.showSelected(); await this.loadRooms(epoch);
    }
    private showSelected(): void {
        const root = this.root!;
        this.required(root, 'Btn_Admin', Button).active = Number(this.selected.minister ?? this.selected.myisminister ?? 0) > 0;
        const roomCard = this.required(root, 'RoomCard', Node);
        // Old UIClub hides the field when playerClubCard is the negative sentinel.
        const card = this.selected.playerClubCard;
        this.label(roomCard, 'Value', card != null && card !== ''
            && Number.isFinite(Number(card)) && Number(card) >= 0 ? card : '');
        const gold = this.required(root, 'GoldBean', Node);
        // The old club response has no gold-bean balance; do not display authored sample data.
        this.label(gold, 'Value', '');
    }
    private async loadRooms(epoch: number): Promise<void> {
        const serial = ++this.roomEpoch; const club = this.selected;
        this.details.clear();
        this.clearRows(this.rooms.content!);
        const clubId = Number(club.id ?? 0); if (clubId <= 0) return;
        const unionId = Number(club.unionId ?? 0);
        let response: unknown;
        try {
            response = await this.client.request<unknown>(unionId > 0 ? 'union.CUnionGetAllRoomMin' : 'club.CClubGetAllRoomMin',
                { clubId, unionId: unionId || undefined });
        } catch (error: unknown) { if (this.live(epoch) && serial === this.roomEpoch) this.tip(error); return; }
        if (!this.live(epoch) || serial !== this.roomEpoch) return;
        const source = Array.isArray(response) ? response : this.data(response).roomList;
        if (!Array.isArray(source)) { this.tip(new Error('房间列表响应缺少 roomList')); return; }
        const rooms = source.map(v => this.data(v)).filter(v => v.isClose !== true);
        rooms.sort((a, b) => Number(this.roomStarted(a)) - Number(this.roomStarted(b))
            || Number(a.setID ?? a.setId ?? 0) - Number(b.setID ?? b.setId ?? 0)
            || this.occupants(b).length - this.occupants(a).length);
        // Validate every occupied seat before creating any generated room rows.
        const seatMaps = new Map<Data, Map<number, Data>>();
        for (const room of rooms) seatMaps.set(room, this.roomSeats(room));
        for (const room of rooms) {
            const row = instantiate(this.roomDemo); row.active = true;
            const cfg = this.data(room.roomCfg); const occupants = this.occupants(room);
            this.label(row, 'game_name', room.gameName ?? room.gameCode ?? room.gameType);
            this.label(row, 'room_key', room.roomKey);
            this.label(row, 'renshu', `${occupants.length}/${room.playerNum ?? cfg.playerNum ?? ''}`);
            this.label(row, 'jushu', `${room.setID ?? room.setId ?? 0}/${room.setCount ?? cfg.setCount ?? ''}`);
            const description = this.roomDescription(room, cfg);
            this.label(row, 'wanfa', description);
            const started = this.roomStarted(room);
            this.required(row, 'game_now', Node).active = started;
            this.required(row, 'game_wait', Node).active = !started;
            const play = this.required(row, 'Play', Layout);
            const seats = seatMaps.get(room)!;
            for (let i = 0; i < 4; i++) {
                const portrait = this.required(play, String(i), Sprite);
                const player = this.data(seats.get(i)); const pid = Number(player.pid ?? 0);
                const sprite = portrait.getComponent(Sprite)!; sprite.spriteFrame = null; portrait.active = pid > 0;
                if (pid > 0) void PlayerAvatarService.frame(pid, String(player.headImageUrl ?? player.iconUrl ?? player.avatarUrl ?? ''))
                    .then(frame => { if (this.live(epoch) && serial === this.roomEpoch && portrait.isValid) sprite.spriteFrame = frame; })
                    .catch(error => { if (this.live(epoch) && serial === this.roomEpoch && portrait.isValid)
                        this.tip(new Error(`[ClubSwitch] 房间 ${String(room.roomKey)} 座位 ${i} 头像: ${String(error)}`)); });
            }
            this.addRow(row, this.rooms.content!);
            this.click(row, () => this.join(room, club), row);
            const invite = this.required(row, 'btn_yaoqing', Button); invite.active = !started;
            this.click(invite, () => {
                const roomId = Number(room.roomId ?? room.roomID ?? 0);
                if (roomId <= 0) { this.tip(new Error('房间缺少有效 roomId，不能创建邀请')); return; }
                this.mainNode.emit('share-invite-create', { kind: 'ROOM', targetId: roomId, channel: 'wechat',
                    title: `[${String(club.name ?? '')}]亲友团,${String(room.roomKey ?? '')}`, description });
            }, row);
            this.click(this.required(row, 'btn_xiangqing ', Button), () => { void this.detail(room, club, epoch, serial); }, row);
        }
    }
    private async detail(room: Data, club: Data, epoch: number, serial: number): Promise<void> {
        const key = `${String(club.id)}:${String(room.roomKey ?? '')}`;
        if (!room.roomKey || this.details.has(key)) return;
        const token = Symbol(key); this.details.set(key, token);
        try {
            const unionId = Number(club.unionId ?? 0);
            const body = await this.client.request<unknown>(unionId > 0 ? 'union.CUnionRoomInfoDetails' : 'club.CClubRoomInfoDetails',
                { clubId: club.id, unionId: unionId || undefined, roomKey: room.roomKey });
            if (this.live(epoch) && serial === this.roomEpoch) await this.forms.show('ui/club/UIClubRoomJoin', body);
        } catch (error: unknown) { if (this.live(epoch) && serial === this.roomEpoch) this.tip(error); }
        finally { if (this.details.get(key) === token) this.details.delete(key); }
    }
    private roomDescription(room: Data, cfg: Data): string {
        const rules = String(room.wanfaDesc ?? room.ruleDescription ?? '');
        if (!rules) this.tip(new Error(`[ClubSwitch] 房间 ${String(room.roomKey)} 缺少玩法描述；当前无旧 RoomCfgManager.WanFa 等价公共服务`));
        const type = cfg.paymentRoomCardType;
        if (type === undefined || type === null) return rules;
        const payment = Number(type);
        if (payment === 0) return `${rules},管理付`;
        if (payment === 1 || payment === 2) {
            if (cfg.clubWinnerPayConsume === undefined || cfg.clubWinnerPayConsume === null) {
                this.tip(new Error(`[ClubSwitch] 房间 ${String(room.roomKey)} 缺少 clubWinnerPayConsume，不能展示付款描述`));
                return rules;
            }
            return `${rules},${payment === 1 ? 'AA付' : '胜家付'}${String(cfg.clubWinnerPayConsume)}圈卡`;
        }
        this.tip(new Error(`[ClubSwitch] 房间 ${String(room.roomKey)} 未知 paymentRoomCardType: ${String(type)}`));
        return rules;
    }
    private roomStarted(room: Data): boolean {
        // Current hall responses carry state while setId can remain zero.
        if (room.state === 'PLAYING') return true;
        if (room.state === 'OPEN') return false;
        return Number(room.setID ?? room.setId ?? 0) > 0;
    }
    private roomSeats(room: Data): Map<number, Data> {
        const source = Array.isArray(room.posList) ? room.posList : [];
        const candidates = new Map<number, Array<{ player: Data; path: string }>>();
        source.forEach((value, index) => {
            const player = this.data(value);
            if (Number(player.pid ?? 0) <= 0) return;
            // Legacy responses are dense; current responses explicitly identify sparse seats.
            const position = player.pos === undefined ? index : Number(player.pos);
            const path = `room[${String(room.roomKey)}]/posList[${index}] (pos=${String(player.pos ?? index)})`;
            if (!Number.isInteger(position) || position < 0 || position >= 4)
                throw new Error(`[ClubSwitch] 无法绑定占用座位: ${path}`);
            const entries = candidates.get(position) ?? [];
            entries.push({ player, path }); candidates.set(position, entries);
        });
        const duplicates = [...candidates.values()].filter(entries => entries.length > 1);
        if (duplicates.length) throw new Error(`[ClubSwitch] 重复座位候选: ${duplicates.flat().map(entry => entry.path).join(', ')}`);
        const seats = new Map<number, Data>();
        for (const [position, entries] of candidates) seats.set(position, entries[0].player);
        return seats;
    }
    private occupants(room: Data): Data[] { return Array.isArray(room.posList) ? room.posList.map(v => this.data(v)).filter(v => Number(v.pid ?? 0) > 0) : []; }
    private data(v: unknown): Data { return v && typeof v === 'object' && !Array.isArray(v) ? v as Data : {}; }
    private live(epoch: number): boolean { return !!this.root?.isValid && epoch === this.epoch; }
    private liveSession(session: number): boolean { return !!this.root?.isValid && session === this.session; }
    private tip(error: unknown): void { void this.forms.show('UIMessage_Drift', null, null, error instanceof Error ? error.message : String(error)); }
    private addRow(row: Node, parent: Node): void { parent.addChild(row); this.rows.push(row); parent.getComponent(Layout)?.updateLayout(); }
    private clearRows(parent?: Node): void {
        const kept: Node[] = [];
        for (const row of this.rows) { if (!parent || row.parent === parent) {
            for (const off of this.rowDisposers.get(row) ?? []) off();
            this.rowDisposers.delete(row); row.removeFromParent(); row.destroy();
        } else kept.push(row); }
        this.rows = kept;
    }
    private click(node: Node, action: () => void, row?: Node): void {
        node.on(Button.EventType.CLICK, action);
        const off = () => node.off(Button.EventType.CLICK, action);
        if (row) { const list = this.rowDisposers.get(row) ?? []; list.push(off); this.rowDisposers.set(row, list); }
        else this.disposers.push(off);
    }
    private label(root: Node, name: string, value: unknown): void { this.required(root, name, Label).getComponent(Label)!.string = String(value ?? ''); }
    private within(root: Node, node: Node): boolean { for (let n: Node | null = node; n; n = n.parent) if (n === root) return true; return false; }
    private required(root: Node, name: string, component: any): Node {
        const found: Array<{node: Node; path: string}> = [];
        const visit = (node: Node, path: string): void => { if (node.name === name && (component === Node || node.getComponent(component))) found.push({node, path});
            for (const child of node.children) visit(child, `${path}/${child.name}`); };
        visit(root, root.name);
        if (found.length !== 1) throw new Error(`[ClubSwitch] ${name}: expected one matching component, found ${found.length}: ${found.map(v => v.path).join(', ')}`);
        return found[0].node;
    }
}
