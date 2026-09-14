import { Button, EventMouse, EventTouch, Label, Node, UITransform } from 'cc';
import type { CommonPdkRuntime } from './CommonPdkRuntime';

export class CommonPdkDissolveController {
    private root: Node | null = null;
    private timer = 0;
    private dissolve: any = null;
    private disposed = false;
    private requestGeneration = 0;
    private inputRoot: Node | null = null;
    private lastVotePointerAt = 0;
    private readonly onRefuse = (): void => this.voteFromPointer(false);
    private readonly onAgree = (): void => this.voteFromPointer(true);
    private readonly onClose = (): void => this.close();
    private readonly onFormPointerEnd = (event: EventMouse | EventTouch): void => {
        const location = event.getUILocation();
        for (const [path, agree] of [['Btn_Reject', false], ['Btn_Agree', true]] as const) {
            const node = this.node(path);
            const button = node?.getComponent(Button);
            if (button?.interactable && node?.getComponent(UITransform)?.hitTest(location)) {
                this.voteFromPointer(agree);
                return;
            }
        }
    };

    public constructor(
        private readonly runtime: CommonPdkRuntime,
        private readonly showMessage: (message: string) => void,
        private readonly closeForm: () => void,
    ) {}

    public onCreate(root: Node): void {
        if (this.root === root) {
            this.bindInputRoot(root);
            return;
        }
        if (this.root) {
            this.unbindVoteButton('Btn_Reject', this.onRefuse);
            this.unbindVoteButton('Btn_Agree', this.onAgree);
            this.node('Bg_Header/Btn_Close')?.off(Button.EventType.CLICK, this.onClose, this);
            this.inputRoot?.off(Node.EventType.TOUCH_END, this.onFormPointerEnd, this, true);
            this.inputRoot?.off(Node.EventType.MOUSE_UP, this.onFormPointerEnd, this, true);
        }
        this.root = root;
        this.root.active = false;
        this.bindVoteButton('Btn_Reject', this.onRefuse);
        this.bindVoteButton('Btn_Agree', this.onAgree);
        this.bindInputRoot(root);
        this.node('Bg_Header/Btn_Close')?.on(Button.EventType.CLICK, this.onClose, this);
    }

    public onShow(): void {
        if (this.disposed || !this.root?.isValid) return;
        this.root.active = true;
        this.render();
        globalThis.clearInterval(this.timer);
        this.timer = globalThis.setInterval(() => {
            if (!this.root?.activeInHierarchy) {
                globalThis.clearInterval(this.timer);
                this.timer = 0;
                return;
            }
            this.renderTime();
            // The terminal dissolve snapshot is not broadcast to every seat by
            // all gateways. Poll only while this modal is active so non-voters
            // observe the authoritative room revocation promptly.
            this.runtime.reconcileAuthority();
        }, 500);
    }

    public onVote(dissolve: any): void {
        if (this.disposed || !dissolve) return;
        this.dissolve = dissolve;
        const refused = (dissolve.posAgreeList ?? []).findIndex((value: number) => Number(value) === 2);
        if (refused >= 0) {
            const player = this.runtime.getRoomPosManager().GetPlayerInfoByPos(refused);
            this.runtime.getRoom().ClearDissolve();
            this.dissolve = null;
            this.close();
            this.showMessage(`${player?.name ?? '玩家'}拒绝解散房间`);
            return;
        }
        this.render();
    }

    public onRejected(rejectedSeat?: number): void {
        if (this.disposed) return;
        const player = Number.isSafeInteger(rejectedSeat)
            ? this.runtime.getRoomPosManager().GetPlayerInfoByPos(Number(rejectedSeat))
            : null;
        this.runtime.getRoom().ClearDissolve();
        this.dissolve = null;
        this.close();
        this.showMessage(`${player?.name ?? '玩家'}拒绝解散房间`);
    }

    public destroy(): void {
        if (this.disposed) return;
        this.disposed = true;
        this.requestGeneration += 1;
        this.unbindVoteButton('Btn_Reject', this.onRefuse);
        this.unbindVoteButton('Btn_Agree', this.onAgree);
        this.node('Bg_Header/Btn_Close')?.off(Button.EventType.CLICK, this.onClose, this);
        this.inputRoot?.off(Node.EventType.TOUCH_END, this.onFormPointerEnd, this, true);
        this.inputRoot?.off(Node.EventType.MOUSE_UP, this.onFormPointerEnd, this, true);
        this.inputRoot = null;
        globalThis.clearInterval(this.timer);
        this.timer = 0;
        if (this.root?.isValid) this.root.active = false;
        this.root = null;
        this.dissolve = null;
    }

    private render(): void {
        const room = this.runtime.getRoom();
        const posManager = this.runtime.getRoomPosManager();
        const dissolve = room.GetRoomProperty('dissolve') || this.dissolve || {};
        if (Number(dissolve.endSec ?? 0) > 0) this.dissolve = dissolve;
        const createPos = Number(dissolve.createPos ?? -1);
        const clientPos = Number(posManager.GetClientPos());
        const initiator = posManager.GetPlayerInfoByPos(createPos);
        this.text('Content/Message/Label', `${initiator?.name ?? '玩家'}发起解散`);
        const players = posManager.GetRoomAllPlayerInfo() ?? {};
        for (let index = 0; index < 10; index += 1) {
            const root = `PlayerList/PlayerItem_${index + 1}`;
            const player = players[index];
            const vote = Number(dissolve.posAgreeList?.[index] ?? 0);
            this.active(root, Boolean(player?.pid));
            this.text(`${root}/Label`, String(player?.name ?? ''));
            this.active(`${root}/Icon_Agreed`, vote === 1);
            this.active(`${root}/Icon_Rejected`, vote === 2);
        }
        const clientVote = Number(dissolve.posAgreeList?.[clientPos] ?? 0);
        const canVote = createPos !== clientPos && clientVote === 0;
        // The applicant has already cast the implicit approval by initiating
        // the ballot. Hide both actions instead of showing disabled controls.
        this.active('Btn_Reject', canVote);
        this.active('Btn_Agree', canVote);
        this.interactable('Btn_Reject', canVote);
        this.interactable('Btn_Agree', canVote);
        this.renderTime();
    }

    private renderTime(): void {
        const dissolve = this.runtime.getRoom().GetRoomProperty('dissolve') || this.dissolve || {};
        const remaining = Math.max(0, Math.ceil(Number(dissolve.endSec ?? 0) - Date.now() / 1000));
        this.text('Content/Countdown/Lb_Time', String(remaining));
        if (remaining === 0 && Number(dissolve.endSec) > 0) this.hide();
    }

    private vote(agree: boolean): void {
        if (this.disposed) return;
        const generation = ++this.requestGeneration;
        const roomId = Number(this.runtime.getRoomManager().GetEnterRoomID());
        this.interactable('Btn_Reject', false);
        this.interactable('Btn_Agree', false);
        const event = agree ? 'common.room.dissolve_agree_req' : 'common.room.dissolve_refuse_req';
        void this.runtime.action('dissolve-vote', event, { roomID: roomId })
            .then(() => {
                // The vote acknowledgement is not a room snapshot. As in 2.2.2,
                // leaving is driven only by the authoritative dissolve result;
                // reconcile immediately in case the terminal push raced teardown.
                if (agree) this.runtime.reconcileAuthority();
            })
            .catch((error: unknown) => {
                if (this.disposed || generation !== this.requestGeneration) return;
                this.showMessage(error instanceof Error ? error.message : '投票失败，请重试');
                this.render();
            });
    }

    private voteFromPointer(agree: boolean): void {
        const now = Date.now();
        // Creator Web Preview may deliver MOUSE_UP/TOUCH_END without synthesizing
        // Button.CLICK. Accept all three while collapsing one physical gesture.
        if (now - this.lastVotePointerAt < 180) return;
        this.lastVotePointerAt = now;
        const path = agree ? 'Btn_Agree' : 'Btn_Reject';
        if (this.node(path)?.getComponent(Button)?.interactable !== true) return;
        this.vote(agree);
    }

    private bindVoteButton(path: string, listener: () => void): void {
        const node = this.node(path);
        if (!node) return;
        node.on(Button.EventType.CLICK, listener, this);
        node.on(Node.EventType.TOUCH_END, listener, this);
        node.on(Node.EventType.MOUSE_UP, listener, this);
    }

    private unbindVoteButton(path: string, listener: () => void): void {
        const node = this.node(path);
        if (!node) return;
        node.off(Button.EventType.CLICK, listener, this);
        node.off(Node.EventType.TOUCH_END, listener, this);
        node.off(Node.EventType.MOUSE_UP, listener, this);
    }

    private bindInputRoot(root: Node | null): void {
        if (this.inputRoot === root) return;
        this.inputRoot?.off(Node.EventType.TOUCH_END, this.onFormPointerEnd, this, true);
        this.inputRoot?.off(Node.EventType.MOUSE_UP, this.onFormPointerEnd, this, true);
        this.inputRoot = root;
        this.inputRoot?.on(Node.EventType.TOUCH_END, this.onFormPointerEnd, this, true);
        this.inputRoot?.on(Node.EventType.MOUSE_UP, this.onFormPointerEnd, this, true);
    }

    public hide(): void {
        globalThis.clearInterval(this.timer);
        this.timer = 0;
        if (!this.disposed && this.root?.isValid) this.root.active = false;
    }

    private close(): void {
        this.hide();
        this.closeForm();
    }

    private node(path: string): Node | null {
        let current = this.root;
        for (const part of path.split('/')) current = current?.getChildByName(part) ?? null;
        return current;
    }
    private active(path: string, value: boolean): void { const node = this.node(path); if (node) node.active = value; }
    private text(path: string, value: string): void { const label = this.node(path)?.getComponent(Label); if (label) label.string = value; }
    private interactable(path: string, value: boolean): void { const button = this.node(path)?.getComponent(Button); if (button) button.interactable = value; }
}
