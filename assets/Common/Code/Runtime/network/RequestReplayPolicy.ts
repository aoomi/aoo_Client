import type { RequestReplayPolicy } from './ReconnectCoordinator';

const NON_REPLAYABLE = /(?:sendready|sendopcard|enterroom|createroom|joinroom|leaveroom|exitroom|dissolve|continue|(?:^|[._-])(?:ready|play|discard|pass|create|join|leave|exit|vote|start)(?:$|[._-]))/i;
const QUERY_REPLAYABLE = /(?:heartbeat|catalog|active|snapshot|state|reconnect|history|records?|profile|status|list|get|query)/i;

export interface ResolvedRequestPolicy {
    readonly policy: RequestReplayPolicy;
    readonly idempotencyKey?: string;
}

export function resolveRequestPolicy(msgId: string, body: unknown): ResolvedRequestPolicy {
    const record = body && typeof body === 'object' ? body as Record<string, unknown> : {};
    const action = String(record.action ?? record.command ?? '');
    const operation = `${msgId}.${action}`;
    if (NON_REPLAYABLE.test(operation)) return { policy: 'NON_REPLAYABLE' };
    const key = [record.idempotencyKey, record.operationId, record.requestId]
        .find((value): value is string => typeof value === 'string' && value.trim().length > 0);
    if (key) return { policy: 'IDEMPOTENT_KEYED', idempotencyKey: key };
    return { policy: QUERY_REPLAYABLE.test(operation) ? 'QUERY_REPLAYABLE' : 'NON_REPLAYABLE' };
}
