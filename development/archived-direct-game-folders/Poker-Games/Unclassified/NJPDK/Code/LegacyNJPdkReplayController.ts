import { Button, Label, Node } from 'cc';
import type { LegacyForm } from '../../../../../../core/runtime/ui/LegacyFormManager';
import type { LegacyNJPdkRuntime } from './LegacyNJPdkRuntime';
import { LegacyNJPdkCardRenderer } from './LegacyNJPdkCardRenderer';

interface ReplayFrame { name?: string; res?: any; setPosCard?: any; }

export class LegacyNJPdkReplayController {
    private form: LegacyForm | null = null;
    private readonly cards = new LegacyNJPdkCardRenderer();
    private readonly chunks: string[] = [];
    private frames: ReplayFrame[] = [];
    private players: any[] = [];
    private frameIndex = 0;
    private paused = false;
    private timer = 0;
    private roomId = 0;
    private tabId = 0;
    private clientPos = 0;
    private disposeChunk: (() => void) | null = null;

    public constructor(
        private readonly runtime: LegacyNJPdkRuntime,
        private readonly requestLeave: (reason: string) => void,
        private readonly showMessage: (message: string) => void,
    ) {}

    public onCreate(form: LegacyForm): void {
        this.form = form;
        this.bind('control/btn_return', () => this.requestLeave('replay-return'));
        this.bind('control/btn_play', () => this.setPaused(false));
        this.bind('control/btn_pause', () => this.setPaused(true));
        this.bind('control/btn_forward', () => { this.setPaused(true); this.step(1); });
        this.bind('control/btn_back', () => { this.setPaused(true); this.step(-1); });
        this.bind('control/btn_last', () => { void this.changeSet(-1); });
        this.bind('control/btn_next', () => { void this.changeSet(1); });
        this.bind('UIMessageNoExist/image01/btnSure', () => this.requestLeave('replay-not-found'));
        this.disposeChunk = this.runtime.on('SPlayer_PlayBackData', (body) => this.onChunk(body as any));
    }

    public onShow(playBackCode: unknown): void { void this.load(String(playBackCode ?? '')); }
    public destroy(): void { this.stop(); this.disposeChunk?.(); this.disposeChunk = null; this.form = null; }

    private async load(playBackCode: string): Promise<void> {
        this.stop();
        this.frames = [];
        this.chunks.length = 0;
        this.frameIndex = 0;
        this.paused = false;
        this.hideTable();
        this.active('UIMessageNoExist', false);
        try {
            const metadata: any = await this.runtime.request('game.CPlayerPlayBack', { playBackCode, chekcPlayBackCode: false });
            this.players = typeof metadata.playerList === 'string' ? JSON.parse(metadata.playerList || '[]') : metadata.playerList ?? [];
            this.roomId = Number(metadata.roomID ?? 0);
            this.tabId = Number(metadata.tabId ?? metadata.setID ?? 0);
            this.clientPos = Number(this.players[0]?.pos ?? 0);
            this.text('room_data/label_player_num', `${this.players.length}人场`);
            this.text('room_data/label_player_ju', `局数：${metadata.setID ?? 0}/${metadata.setCount ?? 0}`);
            this.text('room_data/label_player_roomkey', `房间号：${metadata.roomKey ?? ''}`);
            this.renderPlayers();
        } catch {
            this.active('UIMessageNoExist', true);
        }
    }

    private onChunk(packet: any): void {
        this.chunks[Number(packet.id)] = String(packet.msg ?? '');
        const expected = Number(packet.playBackNum ?? 0);
        if (!expected || this.chunks.filter((chunk) => chunk !== undefined).length !== expected) return;
        try {
            const parsed = JSON.parse(this.chunks.slice(0, expected).join(''));
            this.frames = parsed.playbackList ?? [];
            this.start();
        } catch { this.active('UIMessageNoExist', true); }
    }

    private start(): void {
        this.stop();
        this.timer = globalThis.setInterval(() => { if (!this.paused) this.step(1); }, 2000);
        this.setPaused(false);
        this.step(1);
    }

    private stop(): void { if (this.timer) globalThis.clearInterval(this.timer); this.timer = 0; }
    private setPaused(value: boolean): void {
        this.paused = value;
        this.active('control/btn_play', value);
        this.active('control/btn_pause', !value);
    }

    private step(delta: number): void {
        if (!this.frames.length) return;
        if (delta < 0) {
            this.frameIndex = Math.max(0, this.frameIndex - 2);
            this.hideCards();
        }
        const frame = this.frames[this.frameIndex];
        if (!frame) { this.setPaused(true); return; }
        this.apply(frame);
        this.frameIndex += 1;
        if (this.frameIndex >= this.frames.length) this.setPaused(true);
    }

    private apply(frame: ReplayFrame): void {
        const name = String(frame.name ?? '');
        const body = frame.res ?? {};
        if (name.includes('_Config')) this.text('wanfa', body.roomType === 1 ? '亲友圈' : body.roomType === 4 ? '赛事' : '好友房');
        else if (name.includes('StartVoteDissolve')) this.active(`sp_seat0${this.uiPos(body.createPos)}/jiesan`, true);
        else if (name.includes('_SetStart')) { this.hideCards(); void this.renderHands(frame.setPosCard ?? {}); }
        else if (name.includes('_ChangeStatus')) this.hideOutCards();
        else if (name.includes('_OpCard')) {
            const uiPos = this.uiPos(body.pos);
            this.active(`sp_seat0${uiPos}/pass`, !body.cardList?.length && Number(body.opCardType) === 1);
            void this.renderCards(`outCardList${uiPos}`, body.cardList ?? []);
            if (frame.setPosCard) void this.renderHands(frame.setPosCard);
        } else if (name.includes('_SetEnd')) this.setPaused(true);
    }

    private async renderHands(cardsByPos: any): Promise<void> {
        for (const player of this.players) {
            const cards = cardsByPos[player.pos] ?? [];
            const uiPos = this.uiPos(player.pos);
            if (uiPos === 0) await this.renderCards('handCards', cards);
            else {
                await this.renderCards(`openCardList${uiPos}`, cards);
                this.text(`sp_seat0${uiPos}/cardNum`, `${cards.length}张`);
                this.active(`sp_seat0${uiPos}/card`, true);
            }
        }
    }

    private async renderCards(path: string, values: number[]): Promise<void> {
        const parent = this.node(path); if (!parent) return;
        parent.removeAllChildren(); parent.active = values.length > 0;
        const sorted = [...values].sort((a, b) => this.rank(b) - this.rank(a));
        for (const value of sorted) await this.cards.create(value, parent, false);
    }

    private renderPlayers(): void {
        for (let index = 0; index < 3; index += 1) this.active(`sp_seat0${index}/head`, false);
        for (const player of this.players) {
            const uiPos = this.uiPos(player.pos);
            this.active(`sp_seat0${uiPos}/head`, true);
            this.text(`sp_seat0${uiPos}/head/touxiang/sp_info/lb_name`, String(player.name ?? ''));
            this.text(`sp_seat0${uiPos}/head/touxiang/sp_info/lb_jifen`, String(player.point ?? 0));
        }
    }

    private async changeSet(delta: number): Promise<void> {
        const target = this.tabId + delta;
        if (target < 1) { this.showMessage('当前已经是第一局'); return; }
        try {
            const response: any = await this.runtime.request('njpdk.CNJPDKGetPlayBackCode', { roomId: this.roomId, tabId: target });
            this.tabId = target;
            await this.load(String(response.playBackCode));
        } catch { this.showMessage(delta < 0 ? '当前已经是第一局' : '当前已经是最后一局'); }
    }

    private hideTable(): void { this.hideCards(); for (let i = 0; i < 3; i += 1) this.active(`sp_seat0${i}/head`, false); }
    private hideCards(): void { this.node('handCards')?.removeAllChildren(); this.hideOutCards(); for (let i = 1; i < 3; i += 1) this.node(`openCardList${i}`)?.removeAllChildren(); }
    private hideOutCards(): void { for (let i = 0; i < 3; i += 1) { this.node(`outCardList${i}`)?.removeAllChildren(); this.active(`sp_seat0${i}/pass`, false); } }
    private uiPos(pos: number): number { return (Number(pos) + this.players.length - this.clientPos) % Math.max(1, this.players.length); }
    private rank(card: number): number { const value = card & 0x0f; return value === 1 ? 16 : value === 2 ? 17 : value; }
    private bind(path: string, callback: () => void): void { this.node(path)?.on(Button.EventType.CLICK, callback, this); }
    private node(path: string): Node | null { return this.form?.find(path) ?? null; }
    private active(path: string, value: boolean): void { const node = this.node(path); if (node) node.active = value; }
    private text(path: string, value: string): void { const label = this.node(path)?.getComponent(Label); if (label) label.string = value; }
}
