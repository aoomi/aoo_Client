import { Button, Label, Node } from 'cc';
import type { LegacyForm, LegacyFormManager } from '../../../../../../core/runtime/ui/LegacyFormManager';
import type { LegacyNJPdkRuntime } from './LegacyNJPdkRuntime';

export class LegacyNJPdkDissolveController {
    private form: LegacyForm | null = null;
    private timer = 0;

    public constructor(
        private readonly runtime: LegacyNJPdkRuntime,
        private readonly forms: LegacyFormManager,
        private readonly showMessage: (message: string) => void,
    ) {}

    public onCreate(form: LegacyForm): void {
        this.form = form;
        form.find('btnCancel')?.on(Button.EventType.CLICK, () => this.vote(false), this);
        form.find('btnSure')?.on(Button.EventType.CLICK, () => this.vote(true), this);
        form.find('bg_creator/close')?.on(Button.EventType.CLICK, () => this.close(), this);
    }

    public onShow(): void {
        this.render();
        globalThis.clearInterval(this.timer);
        this.timer = globalThis.setInterval(() => this.renderTime(), 500);
    }

    public onVote(dissolve: any): void {
        if (!dissolve) return;
        const refused = (dissolve.posAgreeList ?? []).findIndex((value: number) => Number(value) === 2);
        if (refused >= 0) {
            const player = this.runtime.getRoomPosManager().GetPlayerInfoByPos(refused);
            this.runtime.getRoom().ClearDissolve();
            this.close();
            this.showMessage(`${player?.name ?? '玩家'}拒绝解散房间`);
            return;
        }
        this.render();
    }

    public destroy(): void {
        globalThis.clearInterval(this.timer);
        this.timer = 0;
        this.form = null;
    }

    private render(): void {
        const room = this.runtime.getRoom();
        const posManager = this.runtime.getRoomPosManager();
        const dissolve = room.GetRoomProperty('dissolve') || {};
        const createPos = Number(dissolve.createPos ?? -1);
        const clientPos = Number(posManager.GetClientPos());
        const initiator = posManager.GetPlayerInfoByPos(createPos);
        this.text('image01/LabelMessage', `${initiator?.name ?? '玩家'}发起解散`);
        const players = posManager.GetRoomAllPlayerInfo() ?? {};
        for (let index = 0; index < 10; index += 1) {
            const root = `playerNode/item${index}`;
            const player = players[index];
            const vote = Number(dissolve.posAgreeList?.[index] ?? 0);
            this.active(root, Boolean(player?.pid));
            this.text(`${root}/name`, String(player?.name ?? ''));
            this.active(`${root}/icon_tongyi`, vote === 1);
            this.active(`${root}/icon_jujue`, vote === 2);
        }
        const clientVote = Number(dissolve.posAgreeList?.[clientPos] ?? 0);
        const canVote = createPos !== clientPos && clientVote === 0;
        this.interactable('btnCancel', canVote);
        this.interactable('btnSure', canVote);
        this.renderTime();
    }

    private renderTime(): void {
        const dissolve = this.runtime.getRoom().GetRoomProperty('dissolve') || {};
        const remaining = Math.max(0, Math.ceil(Number(dissolve.endSec ?? 0) - Date.now() / 1000));
        this.text('image01/TimeMessage/lb_time', String(remaining));
        if (remaining === 0 && Number(dissolve.endSec) > 0) this.close();
    }

    private vote(agree: boolean): void {
        const manager = this.runtime.getRoomManager();
        const roomId = Number(manager.GetEnterRoomID());
        if (agree) manager.SendDissolveRoomAgree(roomId);
        else manager.SendDissolveRoomRefuse(roomId);
        this.interactable('btnCancel', false);
        this.interactable('btnSure', false);
    }

    private close(): void {
        globalThis.clearInterval(this.timer);
        this.timer = 0;
        this.forms.close('njpdk/ui/njpdk_UIMessage02');
    }

    private node(path: string): Node | null { return this.form?.find(path) ?? null; }
    private active(path: string, value: boolean): void { const node = this.node(path); if (node) node.active = value; }
    private text(path: string, value: string): void { const label = this.node(path)?.getComponent(Label); if (label) label.string = value; }
    private interactable(path: string, value: boolean): void { const button = this.node(path)?.getComponent(Button); if (button) button.interactable = value; }
}
