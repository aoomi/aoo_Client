import {
    BlockInputEvents, Button, Color, EventMouse, EventTouch, Graphics, Label, Node, UITransform,
} from 'cc';
import type { CommonRoomSession } from '../../../../Common/Code/Runtime/network/ProtocolClient';
import type { CommonRoomFormHandle, CommonRoomFormHost } from './RoomNetworkControllerMount';

/** The one logical key shared by every room skin. */
export const COMMON_ROOM_DISSOLVE_FORM = 'room/DissolveRoom';

export interface CommonRoomDissolvePlayer {
    readonly name?: string;
}

export interface CommonRoomDissolveSnapshot {
    readonly roomId: number;
    readonly clientSeat: number;
    readonly createPos: number;
    readonly endSec: number;
    readonly votes: readonly number[];
    readonly players: Readonly<Record<string, CommonRoomDissolvePlayer | undefined>>;
}

export interface CommonRoomDissolveCallbacks {
    readonly onStartVote: () => void;
    readonly onVote: () => void;
    readonly onRejected: (seat?: number) => void;
    readonly onTerminal: (result: unknown) => void;
}

/**
 * Common owns the dissolve button, form, vote transport and pointer lifecycle.
 * The gameplay adapter contributes only authoritative room data and terminal
 * callbacks; no Node, form manager or protocol string crosses this boundary.
 */
export interface CommonRoomDissolvePort {
    readonly read: () => CommonRoomDissolveSnapshot;
    readonly clear: () => void;
    readonly reconcile: () => void;
    readonly acceptVoteResult: (result: unknown, agree: boolean) => boolean;
    readonly message: (message: string) => void;
    readonly terminal: (result: unknown) => void;
    readonly subscribe: (callbacks: CommonRoomDissolveCallbacks) => () => void;
}

export class CommonRoomDissolveController {
    private root: CommonRoomFormHandle | null = null;
    private timer = 0;
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
    private readonly unsubscribe: () => void;

    public constructor(
        private readonly session: CommonRoomSession,
        private readonly formHost: CommonRoomFormHost,
        private readonly port: CommonRoomDissolvePort,
        private readonly report: (error: unknown) => void = () => undefined,
    ) {
        this.unsubscribe = port.subscribe({
            onStartVote: () => { void this.openFromAuthority(); },
            onVote: () => {
                if (this.disposed) return;
                if (this.root?.node.isValid) this.render();
                else void this.openFromAuthority();
            },
            onRejected: seat => this.onRejected(seat),
            onTerminal: result => this.onTerminal(result),
        });
    }

    public async open(): Promise<void> {
        if (this.disposed) return;
        try {
            const state = this.port.read();
            if (!this.validRoomId(state.roomId)) {
                this.port.message('当前房间数据无效，无法申请解散');
                return;
            }
            await this.openFromAuthority();
            if (this.disposed) return;
            const current = this.port.read();
            if (this.voteActive(current)) return;
            const result = await this.session.dispatch('dissolve.request', { roomID: current.roomId });
            if (this.disposed) return;
            // The owner can receive a terminal response directly when the room
            // is still waiting. Otherwise the authoritative start-vote push
            // reaches the gameplay adapter and opens the same Common form.
            this.port.acceptVoteResult(result, true);
        } catch (error: unknown) {
            this.failRequest(error, '申请解散失败，请重试');
        }
    }

    public destroy(): void {
        if (this.disposed) return;
        this.disposed = true;
        this.requestGeneration += 1;
        this.unsubscribe();
        this.unbindVoteButton('Btn_Reject', this.onRefuse);
        this.unbindVoteButton('Btn_Agree', this.onAgree);
        this.unbindPointerButton('Bg_Header/Btn_Close', this.onClose);
        this.bindInputRoot(null);
        globalThis.clearInterval(this.timer);
        this.timer = 0;
        if (this.root?.node.isValid) this.root.node.active = false;
        this.root = null;
    }

    private async openFromAuthority(): Promise<void> {
        if (this.disposed) return;
        const form = await this.showForm();
        if (!form || this.disposed) return;
        this.ensureModalMask();
        form.node.active = true;
        this.render();
        globalThis.clearInterval(this.timer);
        this.timer = globalThis.setInterval(() => {
            if (!this.root?.node.activeInHierarchy) {
                globalThis.clearInterval(this.timer);
                this.timer = 0;
                return;
            }
            this.renderTime();
            this.port.reconcile();
        }, 500);
    }

    private async showForm(): Promise<CommonRoomFormHandle | null> {
        const form = await this.formHost.show(COMMON_ROOM_DISSOLVE_FORM);
        if (!form?.node.isValid) return null;
        if (this.root !== form) {
            if (this.root) {
                this.unbindVoteButton('Btn_Reject', this.onRefuse);
                this.unbindVoteButton('Btn_Agree', this.onAgree);
                this.unbindPointerButton('Bg_Header/Btn_Close', this.onClose);
                this.bindInputRoot(null);
            }
            this.root = form;
            this.bindVoteButton('Btn_Reject', this.onRefuse);
            this.bindVoteButton('Btn_Agree', this.onAgree);
            this.bindPointerButton('Bg_Header/Btn_Close', this.onClose);
            this.bindInputRoot(form.node);
        }
        const parent = form.node.parent;
        if (parent?.isValid) form.node.setSiblingIndex(Math.max(0, parent.children.length - 1));
        return form;
    }

    /** Full-screen modal shield. It is deliberately the first sibling. */
    private ensureModalMask(): void {
        if (!this.root?.node.isValid) return;
        let mask = this.root.find('ModalMask');
        if (!mask) {
            mask = new Node('ModalMask');
            mask.layer = this.root.node.layer;
            mask.addComponent(UITransform);
            mask.addComponent(Graphics);
            mask.addComponent(BlockInputEvents);
            mask.parent = this.root.node;
        }
        mask.setSiblingIndex(0);
        const parentSize = this.root.node.parent?.getComponent(UITransform)?.contentSize;
        const rootSize = this.root.node.getComponent(UITransform)?.contentSize;
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

    private render(): void {
        if (this.disposed || !this.root?.node.isValid) return;
        const state = this.port.read();
        const voteEstablished = Number.isSafeInteger(state.createPos)
            && state.createPos >= 0
            && Number.isFinite(state.endSec)
            && state.endSec > Date.now() / 1000;
        const initiator = state.players[String(state.createPos)];
        this.text('Content/Message/Label', `${initiator?.name ?? '玩家'}发起解散`);
        for (let index = 0; index < 10; index += 1) {
            const item = `PlayerList/PlayerItem_${index + 1}`;
            const player = state.players[String(index)];
            const vote = Number(state.votes[index] ?? 0);
            this.active(item, Boolean(player));
            this.text(`${item}/Label`, String(player?.name ?? ''));
            this.active(`${item}/Icon_Agreed`, vote === 1);
            this.active(`${item}/Icon_Rejected`, vote === 2);
        }
        const clientVote = Number(state.votes[state.clientSeat] ?? 0);
        const canVote = voteEstablished && state.createPos !== state.clientSeat && clientVote === 0;
        this.active('Btn_Reject', canVote);
        this.active('Btn_Agree', canVote);
        this.interactable('Btn_Reject', canVote);
        this.interactable('Btn_Agree', canVote);
        this.renderTime();
    }

    private renderTime(): void {
        if (this.disposed || !this.root?.node.isValid) return;
        const state = this.port.read();
        const remaining = Math.max(0, Math.ceil(state.endSec - Date.now() / 1000));
        this.text('Content/Countdown/Lb_Time', String(remaining));
        if (remaining === 0 && state.endSec > 0) this.hide();
    }

    private vote(agree: boolean): void {
        if (this.disposed) return;
        const state = this.port.read();
        if (!this.voteActive(state)) {
            console.warn('[CommonRoomDissolveVote] blocked before authoritative ballot', {
                roomId: state.roomId, agree, createPos: state.createPos, endSec: state.endSec,
            });
            this.render();
            return;
        }
        const generation = ++this.requestGeneration;
        this.interactable('Btn_Reject', false);
        this.interactable('Btn_Agree', false);
        const command = agree ? 'dissolve.agree' : 'dissolve.refuse';
        void this.session.dispatch(command, { roomID: state.roomId })
            .then(result => {
                if (this.disposed || generation !== this.requestGeneration) return;
                if (agree && !this.port.acceptVoteResult(result, true)) this.port.reconcile();
            })
            .catch((error: unknown) => {
                if (this.disposed || generation !== this.requestGeneration) return;
                this.failRequest(error, '投票失败，请重试');
                this.render();
            });
    }

    private voteFromPointer(agree: boolean): void {
        const now = Date.now();
        if (now - this.lastVotePointerAt < 180) return;
        this.lastVotePointerAt = now;
        const path = agree ? 'Btn_Agree' : 'Btn_Reject';
        if (this.node(path)?.getComponent(Button)?.interactable !== true) return;
        this.vote(agree);
    }

    private onRejected(rejectedSeat?: number): void {
        if (this.disposed) return;
        const player = Number.isSafeInteger(rejectedSeat)
            ? this.port.read().players[String(Number(rejectedSeat))] : undefined;
        this.port.clear();
        this.close();
        this.port.message(`${player?.name ?? '玩家'}拒绝解散房间`);
    }

    private onTerminal(result: unknown): void {
        if (this.disposed) return;
        this.close();
        this.port.terminal(result);
    }

    private failRequest(error: unknown, fallback: string): void {
        const message = error instanceof Error ? error.message : String(error ?? '');
        if (/room (?:is )?dissolved|room (?:not found|does not exist)|room authority is not active|room route not found|request_not_found|\b3001\b/i.test(message)) {
            this.port.reconcile();
            return;
        }
        this.report(error);
        this.port.message(message || fallback);
    }

    private voteActive(state: CommonRoomDissolveSnapshot): boolean {
        return Number.isSafeInteger(state.createPos)
            && state.createPos >= 0
            && Number.isFinite(state.endSec)
            && state.endSec > Date.now() / 1000;
    }

    private validRoomId(value: number): boolean {
        return Number.isSafeInteger(value) && value > 0;
    }

    private hide(): void {
        globalThis.clearInterval(this.timer);
        this.timer = 0;
        if (!this.disposed && this.root?.node.isValid) this.root.node.active = false;
    }

    private close(): void {
        const now = Date.now();
        if (now - this.lastClosePointerAt < 180) return;
        this.lastClosePointerAt = now;
        this.hide();
        if (this.formHost.closeAfterPointer) this.formHost.closeAfterPointer(COMMON_ROOM_DISSOLVE_FORM);
        else this.formHost.close(COMMON_ROOM_DISSOLVE_FORM);
    }

    private node(path: string): Node | null {
        return this.root?.find(path) ?? null;
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

    private bindInputRoot(root: Node | null): void {
        if (this.inputRoot === root) return;
        this.inputRoot?.off(Node.EventType.TOUCH_END, this.onFormPointerEnd, this, true);
        this.inputRoot?.off(Node.EventType.MOUSE_UP, this.onFormPointerEnd, this, true);
        this.inputRoot = root;
        this.inputRoot?.on(Node.EventType.TOUCH_END, this.onFormPointerEnd, this, true);
        this.inputRoot?.on(Node.EventType.MOUSE_UP, this.onFormPointerEnd, this, true);
    }

    private active(path: string, value: boolean): void {
        const node = this.node(path);
        if (node) node.active = value;
    }

    private text(path: string, value: string): void {
        const label = this.node(path)?.getComponent(Label);
        if (label) label.string = value;
    }

    private interactable(path: string, value: boolean): void {
        const button = this.node(path)?.getComponent(Button);
        if (button) button.interactable = value;
    }
}
