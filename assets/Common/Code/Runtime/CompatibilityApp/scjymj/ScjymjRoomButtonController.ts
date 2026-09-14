import { Button, Node } from 'cc';
import { ScjymjRuntime } from './ScjymjRuntime';

/** Native Creator 3.8.8 replacement for the 2.2.2 BaseMaJiangForm room controls. */
export class ScjymjRoomButtonController {
    private readonly disposers: Array<() => void> = [];
    private timer: ReturnType<typeof setInterval> | null = null;

    public constructor(
        private readonly root: Node,
        private readonly runtime: ScjymjRuntime,
        private readonly onSync?: () => void,
    ) {}

    public bind(): void {
        this.onClick('btn_ready', () => this.ready());
        this.onClick('btn_cancel', () => this.cancelReady());
        this.onClick('btn_go', () => this.startGame());
        this.refresh();
        this.timer = setInterval(() => {
            this.refresh();
            this.onSync?.();
        }, 250);
    }

    public unbind(): void {
        if (this.timer !== null) clearInterval(this.timer);
        this.timer = null;
        for (const dispose of this.disposers.splice(0)) dispose();
    }

    private ready(): void {
        const roomId = this.runtime.getRoomManager().GetEnterRoomID();
        const pos = this.runtime.getRoomPositionManager().GetClientPos();
        if (roomId && pos !== undefined && pos !== null) this.runtime.getRoomManager().SendReady(roomId, pos);
    }

    private cancelReady(): void {
        const roomId = this.runtime.getRoomManager().GetEnterRoomID();
        const pos = this.runtime.getRoomPositionManager().GetClientPos();
        if (roomId && pos !== undefined && pos !== null) this.runtime.getRoomManager().SendUnReady(roomId, pos);
    }

    private startGame(): void {
        const roomId = this.runtime.getRoomManager().GetEnterRoomID();
        if (!roomId) return;
        const pos = this.runtime.getRoomPositionManager().GetClientPos();
        const player = this.runtime.getRoomPositionManager().GetPlayerInfoByPos(pos);
        if (!player?.roomReady && !player?.gameReady) {
            this.runtime.getRoomManager().SendReady(roomId, pos);
            setTimeout(() => this.runtime.getRoomManager().SendStartRoomGame(roomId), 150);
            return;
        }
        this.runtime.getRoomManager().SendStartRoomGame(roomId);
    }

    private refresh(): void {
        const room = this.runtime.getRoomManager().GetEnterRoom();
        if (!room) return;
        const positions = this.runtime.getRoomPositionManager();
        const clientPos = positions.GetClientPos();
        const client = positions.GetPlayerInfoByPos(clientPos);
        const players = Object.values((positions as unknown as { dataInfo?: Record<string, unknown> }).dataInfo ?? {})
            .filter(Boolean) as Array<Record<string, unknown>>;
        const isOwner = Boolean(room.IsClientIsOwner?.());
        const waiting = Number(this.runtime.getRoomSet().GetRoomSetProperty('setID') ?? 0) === 0;
        const ready = Boolean(client?.roomReady || client?.gameReady);
        const allGuestsReady = players.length > 1 && players
            .filter((player) => Number(player.pos) !== Number(clientPos))
            .every((player) => Boolean(player.roomReady || player.gameReady));
        this.setActive('btn_ready', waiting && !isOwner && !ready);
        this.setActive('btn_cancel', waiting && !isOwner && ready);
        this.setActive('btn_go', waiting && isOwner && allGuestsReady);
    }

    private onClick(name: string, listener: () => void): void {
        const node = this.find(name);
        if (!node) return;
        node.on(Button.EventType.CLICK, listener);
        this.disposers.push(() => node.off(Button.EventType.CLICK, listener));
    }

    private setActive(name: string, active: boolean): void {
        const node = this.find(name);
        if (node) node.active = active;
    }

    private find(name: string): Node | null {
        if (this.root.name === name) return this.root;
        for (const child of this.root.children) {
            const found = new ScjymjRoomButtonController(child, this.runtime, this.onSync).find(name);
            if (found) return found;
        }
        return null;
    }
}
