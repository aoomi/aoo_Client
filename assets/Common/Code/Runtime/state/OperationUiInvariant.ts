export interface OperationUiEvidence {
    readonly roomId: number;
    readonly eventSeq: number;
    readonly localSeatId: number;
    readonly operationSeatId: number;
    readonly allowedActions: readonly string[];
    readonly enabledActions: readonly string[];
}

/** End-to-end invariant between the authoritative operation seat/actions and visible enabled buttons. */
export function assertOperationUi(evidence: OperationUiEvidence): void {
    const expected = evidence.localSeatId === evidence.operationSeatId
        ? [...evidence.allowedActions].sort() : [];
    const actual = [...evidence.enabledActions].sort();
    if (expected.length !== actual.length || expected.some((value, index) => value !== actual[index])) {
        throw new Error(`operation UI mismatch room=${evidence.roomId} seq=${evidence.eventSeq}`);
    }
}
