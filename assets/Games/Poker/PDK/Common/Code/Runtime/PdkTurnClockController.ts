




import { createSeatEntries } from './Room/PdkSeatPresenter';











import { projectPdkOperationClock } from './PdkAuthoritativeViewAdapter';

/** Internal behavior module; state remains in its PdkPlayController host. */
export class PdkTurnClockController {
    public constructor(private readonly host: any) {}

public startClockFromSetInfo(packet: Record<string, unknown>): void {
        // Legacy turn-only events have no deadline. Reuse the latest authority
        // projection instead of treating their absent field as a closed turn.
        const authority = this.host.runtime.getRoomSet().GetRoomSetInfo() ?? {};
        const hasDeadline = Object.prototype.hasOwnProperty.call(packet, 'operationDeadline');
        const deadline = this.host.record(hasDeadline ? packet.operationDeadline : authority.operationDeadline);
        const clock = projectPdkOperationClock(deadline ?? {},
            hasDeadline ? packet.serverEpochMillis : authority.serverEpochMillis);
        if (clock.mode === 'unlimited') this.startClock(clock.seatId, null);
        else if (clock.mode === 'timed') this.startClock(clock.seatId, clock.seconds);
        else this.hideClocks();
    }

public startClock(dataSeat: number, seconds: number | null): void {
        this.stopClock();
        const unlimited = seconds === null;
        let remaining = unlimited ? 0 : Math.max(0, Math.floor(seconds));
        const entry = createSeatEntries(this.host.authoritativePlayerCount(), this.host.clientSeat())
            .find((item) => item.dataSeat === dataSeat);
        const rotationZ = entry ? (180 + entry.physicalSlot * 90) % 360 : 0;
        const setInfo = this.host.runtime.getRoomSet().GetRoomSetInfo() ?? {};
        const deadline = this.host.record(setInfo.operationDeadline);
        const stateVersion = Number(setInfo.stateVersion
            ?? this.host.runtime.getRoom().GetRoomProperty('stateVersion') ?? -1);
        const operationId = String(deadline?.operationId ?? '');
        const traceKey = `${stateVersion}:${operationId}:${dataSeat}:${this.host.clientSeat()}:${entry?.physicalSlot ?? -1}`;
        if (traceKey !== this.host.lastTurnPointerTraceKey) {
            this.host.lastTurnPointerTraceKey = traceKey;
            console.info('[PdkTurnPointer]', JSON.stringify({
                roomId: this.host.roomId(), stateVersion, operationId,
                dataSeat, clientSeat: this.host.clientSeat(),
                physicalSlot: entry?.physicalSlot ?? -1,
                rotationZ, seconds: unlimited ? null : remaining, unlimited,
            }));
        }
        const update = () => {
            // The room-level clock is the single authority timer. Rotate its
            // one Pointer counter-clockwise around the clock centre using the
            // same physical-slot convention as the seats: local/down, right,
            // opposite/up, left. The atlas artwork extends upward at normalized
            // 0°, so local/down has a 180° base offset. Normalize X/Y because
            // the prefab also carries an equivalent serialized X/Y flip.
            for (let slot = 0; slot < 4; slot += 1) {
                this.host.view?.visible(`Players/Seat_${slot}/Clock`, false);
            }
            this.host.view?.visible('Clock', Boolean(entry));
            const pointer = this.host.view?.find('Clock/Pointer');
            if (pointer) {
                pointer.active = Boolean(entry);
                if (entry) pointer.setRotationFromEuler(0, 0, rotationZ);
            }
            this.host.view?.visible('Clock/Time', Boolean(entry) && !unlimited);
            if (entry && !unlimited) this.host.view?.label('Clock/Time', String(remaining));
            const countdownKey = `${dataSeat}:${remaining}`;
            if (!unlimited && remaining > 3) this.host.lastCountdownSound = '';
            if (!unlimited && remaining > 0 && remaining <= 3 && countdownKey !== this.host.lastCountdownSound) {
                this.host.lastCountdownSound = countdownKey;
                void this.host.roomAudio?.play('daojishi');
            }
            if (!unlimited && remaining-- <= 0) this.stopClock();
        };
        update();
        if (!unlimited) this.host.clockTimer = globalThis.setInterval(update, 1000) as unknown as number;
    }

public hideClocks(): void {
        this.stopClock();
        this.host.view?.visible('Clock', false);
        this.host.view?.visible('Clock/Pointer', false);
        for (let slot = 0; slot < 4; slot += 1) {
            this.host.view?.visible(`Players/Seat_${slot}/Clock`, false);
        }
    }

public stopClock(): void { if (this.host.clockTimer) globalThis.clearInterval(this.host.clockTimer); this.host.clockTimer = 0; }
}
