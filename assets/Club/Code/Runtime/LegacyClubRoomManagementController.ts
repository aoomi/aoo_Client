import { Button, Label, Layout, Node, instantiate } from 'cc';
import { ProtocolClient } from '../../../Common/Code/Runtime/network/ProtocolClient';
import { LegacyForm, LegacyFormManager } from '../../../Common/Code/Runtime/ui/LegacyFormManager';
import { setClubDynamicLabel } from './ClubDynamicLabel';

interface RoomContext {
    id?: number;
    clubId?: number;
    unionId?: number;
    gameList?: Array<number | string>;
    onTemplateSaved?: (room?: unknown) => void | Promise<void>;
}
interface RoomConfigData { gameIndex?: number; playerNum?: number; paymentRoomCardType?: number; clubWinnerPayConsume?: number; [key: string]: unknown }
interface ManagedRoom { bRoomConfigure?: RoomConfigData; gameType?: string; roomCount?: number; status?: number; roomName?: string }
interface RoomListResult { clubId?: number; clubCreateGameSets?: ManagedRoom[]; waitRoomCount?: number; playingRoomCount?: number }

export class LegacyClubRoomManagementController {
    private readonly disposers: Array<() => void> = [];
    private readonly rowDisposers: Array<() => void> = [];
    private form: LegacyForm | null = null;
    private context: RoomContext = {};
    private rooms: ManagedRoom[] = [];

    public constructor(private readonly forms: LegacyFormManager, private readonly client: ProtocolClient) {}

    public install(): void {
        this.forms.register('ui/club/ClubRooms', { zOrder: 9, lifecycle: {
            onCreate: (form) => this.bind(form), onShow: (form, value) => this.show(form, value),
            onClose: () => { this.form = null; this.clearRows(); },
        }});
        for (const event of ['OnClubRoomCfgs', 'SClub_GetCreateGameSet', 'SClub_CreateGameSetChange',
            'OnClubRoomCfgChange', 'club.room_templates_changed']) {
            this.disposers.push(this.client.on(event, (body) => this.onRoomEvent(body)));
        }
    }

    public dispose(): void { this.clearRows(); for (const dispose of this.disposers.splice(0)) dispose(); this.form = null; }

    private bind(form: LegacyForm): void {
        this.click(form.node, 'btn_close', () => this.forms.close('ui/club/ClubRooms'));
        this.click(form.node, 'btn_createRoom', () => this.openEditor());
    }

    private show(form: LegacyForm, value: unknown): void { this.form = form; this.context = this.value(value); void this.load(); }

    private async load(): Promise<void> {
        try {
            const result = await this.client.request<RoomListResult | ManagedRoom[]>('club.CClubGetCreateGameSet', { clubId: this.clubId() });
            if (Array.isArray(result)) { this.rooms = result; this.render(); }
            else this.applyList(result);
        } catch (error: unknown) { await this.tip(error instanceof Error ? error.message : '获取房间配置失败'); }
    }

    private onRoomEvent(body: unknown): void {
        if (!this.form || !body || typeof body !== 'object') return; const event = body as RoomListResult & { isCreate?: boolean; clubCreateGameSet?: ManagedRoom };
        if (Number(event.clubId ?? this.clubId()) !== this.clubId()) return;
        if (!event.clubCreateGameSets && !event.clubCreateGameSet) { void this.load(); return; }
        if (event.clubCreateGameSets) this.applyList(event);
        else if (event.clubCreateGameSet) { const room = event.clubCreateGameSet; const index = Number(room.bRoomConfigure?.gameIndex ?? 0); const at = this.rooms.findIndex((item) => Number(item.bRoomConfigure?.gameIndex ?? 0) === index); if (Number(room.status ?? 0) === 2 && at >= 0) this.rooms.splice(at, 1); else if (at >= 0) this.rooms[at] = room; else this.rooms.push(room); this.counts(event); this.render(); }
    }

    private applyList(result: RoomListResult): void { this.rooms = result.clubCreateGameSets ?? []; this.counts(result); this.render(); }
    private counts(result: RoomListResult): void { const form = this.form; if (!form) return; const bottom = this.desc(form.node, 'bottom'); const wait = bottom ? this.desc(this.desc(bottom, 'wait') ?? bottom, 'num') : null; const game = bottom ? this.desc(this.desc(bottom, 'game') ?? bottom, 'num') : null; const waitLabel = wait?.getComponent(Label); const gameLabel = game?.getComponent(Label); if (waitLabel) waitLabel.string = String(result.waitRoomCount ?? 0); if (gameLabel) gameLabel.string = String(result.playingRoomCount ?? 0); }

    private render(): void {
        const form = this.form; const content = form ? this.desc(form.node, 'layout') : null; const demo = form ? this.desc(form.node, 'room_demo') : null; if (!content || !demo) return;
        this.clearRows(); for (const child of [...content.children]) if (child !== demo) child.destroy(); demo.active = false;
        for (const room of this.rooms) { const cfg = room.bRoomConfigure ?? {}; const index = Number(cfg.gameIndex ?? 0); const node = instantiate(demo); node.name = String(index); node.active = true;
            this.label(node, 'name', room.roomName || String(room.gameType ?? '')); this.label(node, 'renshu', String(cfg.playerNum ?? 0)); this.label(node, 'zhuoshu', String(room.roomCount ?? 0)); this.label(node, 'wanfa', this.describe(cfg));
            const manage = this.desc(node, 'manage'); if (manage) manage.active = true; for (const name of ['btn_xiugai', 'btn_jinyong', 'btn_qiyong', 'btn_jiesan']) this.active(node, name, false);
            this.rowClick(node, 'btn_manage', () => this.toggleManage(node, Number(room.status ?? 0)));
            this.rowClick(node, 'btn_qiyong', () => { void this.change(index, 0); }); this.rowClick(node, 'btn_jinyong', () => { void this.change(index, 1); });
            this.rowClick(node, 'btn_jiesan', () => { void this.confirmDelete(index); }); this.rowClick(node, 'btn_xiugai', () => this.openEditor(room)); content.addChild(node); }
        content.getComponent(Layout)?.updateLayout();
    }

    private toggleManage(node: Node, status: number): void { const opening = !Boolean(this.desc(node, 'btn_jiesan')?.active); this.active(node, 'btn_jiesan', opening); this.active(node, 'btn_xiugai', opening); this.active(node, 'btn_jinyong', opening && status === 0); this.active(node, 'btn_qiyong', opening && status !== 0); }
    private async change(gameIndex: number, status: number): Promise<void> { try { await this.client.request('club.CClubCreateGameSetChangge', { clubId: this.clubId(), gameIndex, status }); await this.load(); } catch (error: unknown) { await this.tip(error instanceof Error ? error.message : '修改房间配置失败'); } }
    /** Refresh display only after the server confirms the room-authority commit. */
    public async kickPlayer(roomId: string, targetSeatId: number, playVersion: string, stateVersion: number): Promise<void> {
        try { const result = await this.client.request<{ authorityCommitted?: boolean }>('club.room_kick', { action: 'room_kick', clubId: this.clubId(), roomId, targetSeatId, playVersion, stateVersion }); if (!result.authorityCommitted) throw new Error('ROOM_AUTHORITY_NOT_COMMITTED'); await this.load(); }
        catch (error: unknown) { await this.tip(error instanceof Error ? error.message : '踢人失败，可使用原请求重试'); }
    }
    private async confirmDelete(gameIndex: number): Promise<void> { const form = await this.forms.show('UIMessage', null, null, '确定解散并删除该房间配置吗？'); if (!form) return; const sure = this.desc(form.node, 'btnSure'); const cancel = this.desc(form.node, 'btnCancel'); if (cancel) { cancel.active = true; cancel.once(Button.EventType.CLICK, () => this.forms.close('UIMessage')); } sure?.once(Button.EventType.CLICK, () => { this.forms.close('UIMessage'); void this.change(gameIndex, 2); }); }

    private openEditor(room?: ManagedRoom): void {
        const cfg = room?.bRoomConfigure;
        const unionId = Number(this.context.unionId ?? 0);
        void this.forms.show('UICreateRoom', {
            // 新增模板必须展示权威目录中的全部可创建玩法。club.gameList 是已有模板
            // 派生出的旧兼容编号（例如跑得快会得到 201），它不是 Catalog gameId；
            // 用它过滤会把 8/629/90005 全部排除，最终出现“当前没有可创建玩法”。
            // 只有编辑既有模板时才锁定到该模板自己的稳定业务编码。
            gameList: room?.gameType ? [room.gameType] : [],
        }, '', {
            clubId: this.clubId(),
            unionId,
            roomKey: '0',
            gameIndex: Number(cfg?.gameIndex ?? 0),
            enableGameType: room?.gameType ?? '',
            cfgData: cfg ?? null,
            roomConfig: cfg ?? null,
            // 只要从俱乐部房间管理进入，就必须先提交玩法规则，再进入联盟参数页。
            // unionId 属于保存阶段的业务上下文，不能反向决定“下一步”按钮是否显示。
            templateRoomMode: true,
            onTemplateSaved: this.context.onTemplateSaved,
        });
    }
    private describe(cfg: RoomConfigData): string { const payment = Number(cfg.paymentRoomCardType ?? 0) === 2 ? '大赢家付' : Number(cfg.paymentRoomCardType ?? 0) === 1 ? 'AA付' : '管理付'; return `${payment}${cfg.clubWinnerPayConsume ?? ''}圈卡`; }
    private value(value: unknown): RoomContext { return value && typeof value === 'object' ? value as RoomContext : {}; }
    private clubId(): number { return Number(this.context.id ?? this.context.clubId ?? 0); }
    private label(root: Node, name: string, value: string): void { setClubDynamicLabel(this.desc(root, name)?.getComponent(Label) ?? null, name, value); }
    private active(root: Node, name: string, value: boolean): void { const node = this.desc(root, name); if (node) node.active = value; }
    private click(root: Node, name: string, fn: () => void): void { const node = this.desc(root, name); if (!node) return; node.on(Button.EventType.CLICK, fn); this.disposers.push(() => node.off(Button.EventType.CLICK, fn)); }
    private rowClick(root: Node, name: string, fn: () => void): void { const node = this.desc(root, name); if (!node) return; node.on(Button.EventType.CLICK, fn); this.rowDisposers.push(() => node.off(Button.EventType.CLICK, fn)); }
    private clearRows(): void { for (const dispose of this.rowDisposers.splice(0)) dispose(); }
    private desc(root: Node, name: string): Node | null { if (root.name === name) return root; for (const child of root.children) { const found = this.desc(child, name); if (found) return found; } return null; }
    private async tip(message: string): Promise<void> { await this.forms.show('UIMessage_Drift', null, null, message); }
}
