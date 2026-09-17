import type { Node } from 'cc';
import { CN297ProtocolAdapter } from './CN297Protocol';
import { CN297RoomPresenter } from './CN297RoomPresenter';
import { CN297RoomViewAdapter, type CN297RoomAction, type CN297RoomActionSink } from './CN297RoomViewAdapter';
import type { CN297Snapshot } from './CN297RoomState';

/** Owns CN297 UI actions and accepts only server snapshots as render state. */
export class CN297RoomController implements CN297RoomActionSink {
    private readonly view: CN297RoomViewAdapter;
    private readonly presenter: CN297RoomPresenter;
    private pending = false;
    private snapshot: CN297Snapshot | null = null;

    public constructor(private readonly protocol: CN297ProtocolAdapter, root: Node,
        private readonly localPlayerId: number) {
        this.view = new CN297RoomViewAdapter(root, this);
        this.presenter = new CN297RoomPresenter(this.view, localPlayerId);
    }

    public async initialize(): Promise<CN297Snapshot> {
        const snapshot = await this.protocol.state(); this.accept(snapshot); return snapshot;
    }

    public invoke(action: CN297RoomAction): void {
        if (this.pending) return;
        this.pending = true;
        void this.execute(action).catch((error: unknown) => {
            console.error('[CN297] room action failed', { action, roomId: this.snapshot?.roomId ?? 0,
                playerId: this.localPlayerId, stateVersion: this.snapshot?.stateVersion ?? -1, error });
        }).finally(() => { this.pending = false; });
    }

    public sit(seatId: number): void {
        const snapshot = this.snapshot;
        if (this.pending || !snapshot || snapshot.state !== 'WAITING' || snapshot.viewerRole !== 'SPECTATOR'
            || !Number.isSafeInteger(seatId) || seatId < 0 || seatId >= snapshot.seatLimit
            || snapshot.seats[seatId]) return;
        this.pending = true;
        void this.protocol.sit(seatId).then(value => this.accept(value)).catch((error: unknown) => {
            console.error('[CN297] sit failed', { action: 'sit', roomId: snapshot.roomId,
                playerId: this.localPlayerId, stateVersion: snapshot.stateVersion, seatId, error });
            return this.protocol.state().then(value => this.accept(value));
        }).finally(() => { this.pending = false; });
    }

    public destroy(): void { this.view.dispose(); this.presenter.dispose(); }

    private async execute(action: CN297RoomAction): Promise<void> {
        const snapshot = this.snapshot;
        if (!snapshot || snapshot.viewerRole !== 'SEATED') {
            throw new Error(`[CN297] seated action rejected action=${action} roomId=${snapshot?.roomId ?? 0}`);
        }
        if ((action === 'start' || action === 'continue') && snapshot.ownerPlayerId !== this.localPlayerId) {
            throw new Error(`[CN297] owner action rejected action=${action} roomId=${snapshot.roomId}`);
        }
        const response = await (() => {
            switch (action) {
                case 'start': return this.protocol.start();
                case 'look': return this.protocol.look();
                case 'bet': return this.protocol.bet(this.minimumBet());
                case 'preBet': return this.protocol.preBet(this.minimumBet());
                case 'fold': return this.protocol.fold();
                case 'compare': return this.protocol.compare(this.compareTarget()).then(value => value.view);
                case 'continue': return this.protocol.continueRound();
            }
        })();
        this.accept(response);
    }

    private accept(snapshot: CN297Snapshot): void {
        if (this.presenter.applySnapshot(snapshot)) this.snapshot = snapshot;
    }

    private compareTarget(): number {
        const snapshot = this.snapshot;
        if (!snapshot) throw new Error('[CN297] authoritative snapshot is required');
        const localSeat = Number(Object.entries(snapshot.seats)
            .find(([, seat]) => seat.playerId === this.localPlayerId)?.[0] ?? -1);
        const target = Object.entries(snapshot.seats)
            .find(([seat, state]) => Number(seat) !== localSeat && state.active)?.[0];
        if (target === undefined) throw new Error('[CN297] compare target is unavailable');
        return Number(target);
    }

    private minimumBet(): number {
        const local = this.snapshot && Object.values(this.snapshot.seats)
            .find(seat => seat.playerId === this.localPlayerId);
        const baseBet = this.snapshot?.baseBet ?? 1;
        return local?.looked ? baseBet * 2 : baseBet;
    }
}
