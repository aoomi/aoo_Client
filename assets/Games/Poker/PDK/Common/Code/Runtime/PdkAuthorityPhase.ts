const CONTINUABLE_SETTLEMENT_PHASES = new Set([
    'FINISHED',
    'ROUND_SETTLEMENT',
    'INTER_ROUND',
    'SETTLED',
    'DIRECT_WIN',
]);

/** True only after the authority has completed the current round. */
export function isContinuableSettlementPhase(phase: unknown): boolean {
    return CONTINUABLE_SETTLEMENT_PHASES.has(String(phase ?? '').toUpperCase());
}
