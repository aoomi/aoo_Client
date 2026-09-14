import { Button, Label, Node } from 'cc';
import type { LegacyForm } from '../../../../../../core/runtime/ui/LegacyFormManager';
import type { LegacyNJPdkRuntime } from './LegacyNJPdkRuntime';
import type { LegacyNJPdkShareController } from './LegacyNJPdkShareController';

export class LegacyNJPdkRecordController {
    private form: LegacyForm | null = null;

    public constructor(
        private readonly runtime: LegacyNJPdkRuntime,
        private readonly requestLeave: (reason: string) => void,
        private readonly showMessage: (message: string) => void,
        private readonly shareController: LegacyNJPdkShareController,
        private readonly openShare: () => void,
    ) {}

    public onCreate(form: LegacyForm): void {
        this.form = form;
        form.find('btn_exitRoom')?.on(Button.EventType.CLICK, () => this.requestLeave('record-exit'), this);
        form.find('btn_list/btn_continue')?.on(Button.EventType.CLICK, () => { void this.continueRoom(); }, this);
        form.find('btn_list/btn_sharelink')?.on(Button.EventType.CLICK, () => this.shareController.shareLink(), this);
        form.find('btn_list/btn_sharemore')?.on(Button.EventType.CLICK, this.openShare, this);
    }

    public onShow(): void { this.render(); }
    public destroy(): void { this.form = null; }

    private render(): void {
        const room = this.runtime.getRoom();
        const roomEnd = room.GetRoomProperty('roomEnd') ?? {};
        const record = roomEnd.record ?? roomEnd;
        const playersByPos = this.runtime.getRoomPosManager().GetRoomAllPlayerInfo() ?? {};
        const players = Object.keys(playersByPos).map((key) => playersByPos[key]).sort((a, b) => Number(a.pos) - Number(b.pos));
        const infos = record.recordPosInfosList ?? [];
        const maxPoint = infos.reduce((max: number, item: any) => Math.max(max, Number(item?.point ?? 0)), Number.NEGATIVE_INFINITY);
        this.text('RoomInfo/roomID', `房间号:${record.roomKey ?? room.GetRoomProperty('key') ?? ''}`);
        this.text('RoomInfo/jushu', `局数:${record.setCnt ?? room.GetRoomProperty('setID') ?? 0}`);
        this.text('RoomInfo/endTime', `结束时间：${this.date(record.endSec)}`);
        this.active('btn_list/btn_continue', Number(room.GetRoomConfigByProperty('clubId') ?? 0) !== 0);
        for (let index = 0; index < 4; index += 1) {
            const root = `layout/player${index + 1}`;
            const player = players[index];
            const info = infos[index] ?? {};
            this.active(root, Boolean(player));
            if (!player) continue;
            const point = Number(info.point ?? 0);
            this.text(`${root}/touxiang/lb_name`, String(player.name ?? ''));
            this.text(`${root}/touxiang/lb_id`, `ID：${player.pid ?? ''}`);
            this.active(`${root}/touxiang/fangzhu`, Number(player.pid) === Number(room.GetRoomProperty('ownerID')));
            this.active(`${root}/dayingjia`, point === maxPoint);
            this.text(`${root}/lb_zhadan`, String(info.bombPoint ?? 0));
            this.text(`${root}/lb_paiju`, String(info.setPoint ?? 0));
            this.text(`${root}/lb_zuigao`, String(info.setMaxPoint ?? 0));
            this.text(`${root}/lb_jushu`, `${info.winCount ?? 0}赢${info.loseCount ?? 0}输`);
            this.active(`${root}/lb_point_win`, point > 0);
            this.active(`${root}/lb_point_lost`, point <= 0);
            this.text(`${root}/lb_point_win`, point > 0 ? `+${point}` : '');
            this.text(`${root}/lb_point_lost`, point <= 0 ? String(point) : '');
            this.text(`${root}/lb_sportsPoint`, info.sportsPoint == null ? '' : `${Number(info.sportsPoint) > 0 ? '+' : ''}${info.sportsPoint}`);
        }
    }

    private async continueRoom(): Promise<void> {
        try {
            await this.runtime.request('njpdk.CNJPDKContinueEnterRoom', {});
            this.runtime.getRoomManager().SendGetCurRoomID();
        } catch (error: any) {
            this.showMessage(error?.message ?? '无法继续游戏，请联系赛事举办方');
        }
    }

    private date(value: unknown): string {
        const raw = Number(value ?? Date.now());
        const date = new Date(raw < 100000000000 ? raw * 1000 : raw);
        const pad = (number: number) => number < 10 ? `0${number}` : String(number);
        return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
    }

    private node(path: string): Node | null { return this.form?.find(path) ?? null; }
    private active(path: string, value: boolean): void { const node = this.node(path); if (node) node.active = value; }
    private text(path: string, value: string): void { const label = this.node(path)?.getComponent(Label); if (label) label.string = value; }
}
