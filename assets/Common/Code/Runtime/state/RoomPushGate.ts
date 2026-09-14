export interface RoomPushAuthority {
    readonly roomId: string;
    readonly playVersion: string;
}

/** Rejects late or regressive room pushes before they enter any gameplay listener. */
export class RoomPushGate {
    private authority: RoomPushAuthority | null = null;
    private stateVersion = -1;

    public bind(roomId: string, playVersion: string): void {
        if (!/^[1-9]\d*$/.test(roomId) || !playVersion) throw new Error('invalid room push authority');
        if (this.authority?.roomId !== roomId || this.authority.playVersion !== playVersion) this.stateVersion = -1;
        this.authority = Object.freeze({ roomId, playVersion });
    }

    public accepts(payload: unknown, envelope: unknown): boolean {
        if (!this.authority) return false;
        const fields = this.fields(payload, envelope);
        if (fields.roomId !== this.authority.roomId || fields.playVersion !== this.authority.playVersion) return false;
        if (fields.stateVersion !== null) {
            if (!Number.isSafeInteger(fields.stateVersion) || fields.stateVersion < 0) return false;
            if (fields.stateVersion < this.stateVersion) return false;
            this.stateVersion = fields.stateVersion;
        }
        return true;
    }

    public clear(): void {
        this.authority = null;
        this.stateVersion = -1;
    }

    private fields(payload: unknown, envelope: unknown): {
        roomId: string; playVersion: string; stateVersion: number | null;
    } {
        const outer = this.record(envelope);
        const body = this.record(outer.body);
        const value = this.record(payload);
        const nested = this.record(value.payload);
        const roomId = this.positiveId(outer.roomId) ?? this.positiveId(body.roomId)
            ?? this.positiveId(value.roomId) ?? this.positiveId(value.roomID)
            ?? this.positiveId(nested.roomId) ?? this.positiveId(nested.roomID) ?? '';
        const playVersion = String(outer.playVersion ?? body.playVersion ?? value.playVersion
            ?? nested.playVersion ?? '').trim();
        const rawVersion = outer.stateVersion ?? body.stateVersion ?? value.stateVersion ?? nested.stateVersion;
        const version = Number(rawVersion);
        return {
            roomId,
            playVersion,
            stateVersion: rawVersion === undefined || rawVersion === null
                ? null : Number.isSafeInteger(version) && version >= 0 ? version : Number.NaN,
        };
    }

    private record(value: unknown): Record<string, unknown> {
        return value && typeof value === 'object' ? value as Record<string, unknown> : {};
    }

    private positiveId(value: unknown): string | undefined {
        const text = String(value ?? '').trim();
        return /^[1-9]\d*$/.test(text) ? text : undefined;
    }
}
