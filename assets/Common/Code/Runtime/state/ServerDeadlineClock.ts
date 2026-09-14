export interface ServerTimedResponse {
    serverTimeEpochMillis: number;
    operationDeadline?: { operationId?: string; seatId?: number; deadlineEpochMillis?: number };
}

/** Client display clock. It interpolates a server deadline but never decides timeout authority. */
export class ServerDeadlineClock {
    private serverOffsetMillis = 0;
    private deadlineEpochMillis = 0;
    private operationId = '';

    update(response: ServerTimedResponse, receivedAtEpochMillis = Date.now()): void {
        if (!Number.isFinite(response.serverTimeEpochMillis) || response.serverTimeEpochMillis <= 0) {
            throw new Error('serverTimeEpochMillis is required');
        }
        this.serverOffsetMillis = response.serverTimeEpochMillis - receivedAtEpochMillis;
        const deadline = Number(response.operationDeadline?.deadlineEpochMillis ?? 0);
        this.deadlineEpochMillis = Number.isFinite(deadline) && deadline > 0 ? deadline : 0;
        this.operationId = String(response.operationDeadline?.operationId ?? '');
    }

    remainingMillis(localNowEpochMillis = Date.now()): number {
        if (!this.deadlineEpochMillis) return 0;
        return Math.max(0, this.deadlineEpochMillis - (localNowEpochMillis + this.serverOffsetMillis));
    }

    currentOperationId(): string { return this.operationId; }
    // Reaching zero is presentation-only; the next server push/response remains authoritative.
    locallyExpired(localNowEpochMillis = Date.now()): boolean {
        return this.deadlineEpochMillis > 0 && this.remainingMillis(localNowEpochMillis) === 0;
    }
}
