import { Button, Label, Node } from 'cc';
import type { LegacyForm, LegacyFormManager } from '../ui/LegacyFormManager';
import type { AypdkRuntime } from './AypdkRuntime';

export class AypdkResultController {
    private form: LegacyForm | null = null;
    private setEnd: any = null;

    public constructor(
        private readonly runtime: AypdkRuntime,
        private readonly forms: LegacyFormManager,
        private readonly requestLeave: (reason: string) => void,
    ) {}

    public onCreate(form: LegacyForm): void {
        this.form = form;
        form.find('btn_jixu')?.on(Button.EventType.CLICK, () => this.continueGame(), this);
        form.find('btn_out')?.on(Button.EventType.CLICK, () => this.requestLeave('result-exit'), this);
    }

    public onShow(setEnd?: unknown): void {
        this.setEnd = setEnd ?? this.runtime.getRoomSet().GetRoomSetProperty('setEnd') ?? {};
        this.render();
    }

    public destroy(): void { this.form = null; }

    private render(): void {
        const room = this.runtime.getRoom();
        const playersByPos = this.runtime.getRoomPosManager().GetRoomAllPlayerInfo() ?? {};
        const players = Object.keys(playersByPos).map((key) => playersByPos[key]).sort((a, b) => Number(a.pos) - Number(b.pos));
        const result = this.setEnd ?? {};
        this.text('roomID', `房间号:${room.GetRoomProperty('key') ?? ''}`);
        this.text('jushu', `局数:${room.GetRoomProperty('setID') ?? 0}/${room.GetRoomConfigByProperty('setCount') ?? 0}`);
        this.text('backcode', `回放码：${result.playBackCode ?? ''}`);
        this.text('endTime', this.date(result.startTime));
        const roomEnded = Number(room.GetRoomProperty('state')) === 2;
        this.active('btn_out', roomEnded);
        for (let index = 0; index < 3; index += 1) {
            const root = `playerList/player${index + 1}`;
            const player = players[index];
            this.active(root, Boolean(player));
            if (!player) continue;
            const point = Number(result.pointList?.[index] ?? 0);
            const total = Number(result.totalPointList?.[index] ?? point);
            this.text(`${root}/touxiang/lb_name`, String(player.name ?? ''));
            this.active(`${root}/touxiang/fangzhu`, Number(player.pid) === Number(room.GetRoomProperty('ownerID')));
            this.active(`${root}/lb_win_num`, point > 0);
            this.active(`${root}/lb_lose_num`, point <= 0);
            this.text(`${root}/lb_win_num`, point > 0 ? `+${point}` : '');
            this.text(`${root}/lb_lose_num`, point <= 0 ? String(point) : '');
            this.text(`${root}/lb_point`, String(total));
            this.text(`${root}/lb_num`, String(result.surplusCardList?.[index] ?? 0));
            this.text(`${root}/lb_zhadan`, String(result.bomList?.[index] ?? 0));
            this.text(`${root}/lb_ClubCent`, result.clubCentList ? String(result.clubCentList[index] ?? 0) : '');
        }
    }

    private continueGame(): void {
        const room = this.runtime.getRoom();
        if (Number(room.GetRoomProperty('state')) === 2) {
            this.forms.close('game/AYPDK/UIAYPDK_Result');
            return;
        }
        this.runtime.getRoomManager().SendContinueGame(Number(room.GetRoomProperty('roomID')));
        this.forms.close('game/AYPDK/UIAYPDK_Result');
    }

    private date(value: unknown): string {
        const milliseconds = Number(value ?? Date.now());
        const date = new Date(milliseconds < 100000000000 ? milliseconds * 1000 : milliseconds);
        const pad = (number: number) => number < 10 ? `0${number}` : String(number);
        return `时间：${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
    }

    private node(path: string): Node | null { return this.form?.find(path) ?? null; }
    private active(path: string, value: boolean): void { const node = this.node(path); if (node) node.active = value; }
    private text(path: string, value: string): void { const label = this.node(path)?.getComponent(Label); if (label) label.string = value; }
}
