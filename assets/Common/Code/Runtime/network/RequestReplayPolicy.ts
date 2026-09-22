import type { RequestReplayPolicy } from './ReconnectCoordinator';

const NON_REPLAYABLE = /(?:sendready|sendopcard|enterroom|createroom|joinroom|leaveroom|exitroom|dissolve|continue|(?:^|[._-])(?:ready|play|discard|pass|create|join|leave|exit|vote|start)(?:$|[._-]))/i;
const QUERY_REPLAYABLE = /(?:heartbeat|catalog|active|snapshot|state|reconnect|history|records?|profile|status|list|get|query)/i;

export interface ResolvedRequestPolicy {
    readonly policy: RequestReplayPolicy;
    readonly idempotencyKey?: string;
}

export function resolveRequestPolicy(msgId: string, body: unknown): ResolvedRequestPolicy {
    const record = body && typeof body === 'object' ? body as Record<string, unknown> : {};
    const payload = record.payload && typeof record.payload === 'object' && !Array.isArray(record.payload)
        ? record.payload as Record<string, unknown> : {};
    const action = String(record.action ?? record.command ?? '');
    const operation = `${msgId}.${action}`;
    // Only an explicit idempotency identity may upgrade a mutation to replay-safe.
    // operationId is authority-owned turn/deadline state: several corrected user
    // attempts legitimately share it, so using it as requestId makes the second
    // attempt collide with the first in Gateway's durable ledger.
    const key = [record.idempotencyKey, payload.idempotencyKey]
        .find((value): value is string => typeof value === 'string' && value.trim().length > 0);
    if (key) return { policy: 'IDEMPOTENT_KEYED', idempotencyKey: key };
    if (NON_REPLAYABLE.test(operation)) return { policy: 'NON_REPLAYABLE' };
    return { policy: QUERY_REPLAYABLE.test(operation) ? 'QUERY_REPLAYABLE' : 'NON_REPLAYABLE' };
}
