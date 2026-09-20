import { BlockInputEvents, Button, Color, EventMouse, EventTouch, Graphics, Label, Node, UITransform } from 'cc';
import type { CommonPdkRuntime } from './CommonPdkRuntime';

export class CommonPdkDissolveController {
    private root: Node | null = null;
    private timer = 0;
    private dissolve: any = null;
    private disposed = false;
    private requestGeneration = 0;
    private inputRoot: Node | null = null;
    private lastVotePointerAt = 0;
    private lastClosePointerAt = 0;
    private readonly onRefuse = (): void => this.voteFromPointer(false);
    private readonly onAgree = (): void => this.voteFromPointer(true);
    private readonly onClose = (): void => this.close();
    private readonly onFormPointerEnd = (event: EventMouse | EventTouch): void => {
        const location = event.getUILocation();
        for (const [path, agree] of [['Btn_Reject', false], ['Btn_Agree', true]] as const) {
            const node = this.node(path);
            const button = node?.getComponent(Button);
            if (button?.interactable && node?.activeInHierarchy
                && node.getComponent(UITransform)?.hitTest(location)) {
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
            this.unbindPointerButton('Btn_Close', this.onClose);
            this.bindInputRoot(null);
        }
        this.root = root;
        this.ensureModalMask();
        this.root.active = false;
        this.bindVoteButton('Btn_Reject', this.onRefuse);
        this.bindVoteButton('Btn_Agree', this.onAgree);
        this.bindPointerButton('Btn_Close', this.onClose);
        this.bindInputRoot(root);
    }

    public onShow(): void {
        if (this.disposed || !this.root?.isValid) return;
        this.ensureModalMask();
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

    /** Full-screen modal shield. It is deliberately the first sibling so the
     * dialog buttons remain clickable while every uncovered room area is blocked. */
    private ensureModalMask(): void {
        if (!this.root?.isValid) return;
        let mask = this.root.getChildByName('ModalMask');
        if (!mask) {
            mask = new Node('ModalMask');
            mask.layer = this.root.layer;
            mask.addComponent(UITransform);
            mask.addComponent(Graphics);
            mask.addComponent(BlockInputEvents);
            mask.parent = this.root;
        }
        mask.setSiblingIndex(0);
        const parentSize = this.root.parent?.getComponent(UITransform)?.contentSize;
        const rootSize = this.root.getComponent(UITransform)?.contentSize;
        const width = Math.max(parentSize?.width ?? 0, rootSize?.width ?? 0, 1280);
        const height = Math.max(parentSize?.height ?? 0, rootSize?.height ?? 0, 720);
        mask.getComponent(UITransform)?.setContentSize(width, height);
        const graphics = mask.getComponent(Graphics);
        if (graphics) {
            graphics.clear();
            graphics.fillColor = new Color(0, 0, 0, 90);
            graphics.rect(-width / 2, -height / 2, width, height);
            graphics.fill();
        }
        mask.setPosition(0, 0, 0);
        mask.active = true;
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
        this.unbindPointerButton('Btn_Close', this.onClose);
        this.bindInputRoot(null);
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
        const endSec = Number(dissolve.endSec ?? 0);
        const voteEstablished = Number.isSafeInteger(createPos)
            && createPos >= 0
            && Number.isFinite(endSec)
            && endSec > Date.now() / 1000;
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
        // The form is mounted before dissolve_req finishes so the initiating
        // click gets immediate visual feedback. It must remain read-only until
        // an authoritative ballot arrives; otherwise a fast second click sends
        // dissolve_agree_req before the server has created the vote.
        const canVote = voteEstablished && createPos !== clientPos && clientVote === 0;
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
        const roomId = Number(this.runtime.getRoomManager().GetEnterRoomID());
        const dissolve = this.runtime.getRoom().GetRoomProperty('dissolve') || this.dissolve || {};
        const createPos = Number(dissolve.createPos ?? -1);
        const endSec = Number(dissolve.endSec ?? 0);
        if (!Number.isSafeInteger(createPos) || createPos < 0
            || !Number.isFinite(endSec) || endSec <= Date.now() / 1000) {
            console.warn('[RoomDissolveVote] blocked before authoritative ballot', {
                roomId, agree, createPos, endSec,
            });
            this.render();
            return;
        }
        const generation = ++this.requestGeneration;
        this.interactable('Btn_Reject', false);
        this.interactable('Btn_Agree', false);
        const event = agree ? 'common.room.dissolve_agree_req' : 'common.room.dissolve_refuse_req';
        console.info('[RoomDissolveVote] submit', { roomId, agree, generation });
        void this.runtime.action('dissolve-vote', event, { roomID: roomId })
            .then((result) => {
                console.info('[RoomDissolveVote] accepted', { roomId, agree, generation });
                // The vote acknowledgement is not a room snapshot. As in 2.2.2,
                // leaving is driven only by the authoritative dissolve result. The
                // final voter receives that terminal marker in the response itself;
                // other voters normally receive the state push. Reconcile only when
                // the response was non-terminal in case that push raced teardown.
                if (agree && !this.runtime.acceptDissolveVoteResult(result)) this.runtime.reconcileAuthority();
            })
            .catch((error: unknown) => {
                if (this.disposed || generation !== this.requestGeneration) return;
                console.error('[RoomDissolveVote] failed', { roomId, agree, generation, error });
                const message = error instanceof Error ? error.message : String(error ?? '');
                if (/room (?:is )?dissolved|room (?:not found|does not exist)|room authority is not active|room route not found|request_not_found|\b3001\b/i.test(message)) {
                    // The ballot may become terminal before this seat receives its final
                    // push. Reconcile immediately instead of reviving an obsolete dialog.
                    this.runtime.reconcileAuthority();
                    return;
                }
                this.showMessage(message || '投票失败，请重试');
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
        this.bindPointerButton(path, listener);
    }

    private bindPointerButton(path: string, listener: () => void): void {
        const node = this.node(path);
        if (!node) return;
        node.on(Button.EventType.CLICK, listener, this);
        node.on(Node.EventType.TOUCH_END, listener, this);
        node.on(Node.EventType.MOUSE_UP, listener, this);
    }

    private unbindVoteButton(path: string, listener: () => void): void {
        this.unbindPointerButton(path, listener);
    }

    private unbindPointerButton(path: string, listener: () => void): void {
        const node = this.node(path);
        if (!node) return;
        node.off(Button.EventType.CLICK, listener, this);
        node.off(Node.EventType.TOUCH_END, listener, this);
        node.off(Node.EventType.MOUSE_UP, listener, this);
    }

    /**
     * Safari/Web Preview 偶尔不合成 Button.CLICK。弹窗根节点在捕获阶段按真实
     * UITransform 命中投票按钮，和按钮自身监听共享 voteFromPointer 去重。
     */
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
        const now = Date.now();
        if (now - this.lastClosePointerAt < 180) return;
        this.lastClosePointerAt = now;
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
