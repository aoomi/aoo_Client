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
    // A caller-supplied key upgrades a mutation to replay-safe: ProtocolClient uses
    // the same value as the V2 requestId, so Gateway's durable idempotency ledger
    // returns the committed result instead of applying the mutation twice.
    const key = [record.idempotencyKey, record.operationId, record.requestId,
        payload.idempotencyKey, payload.operationId, payload.requestId]
        .find((value): value is string => typeof value === 'string' && value.trim().length > 0);
    if (key) return { policy: 'IDEMPOTENT_KEYED', idempotencyKey: key };
    if (NON_REPLAYABLE.test(operation)) return { policy: 'NON_REPLAYABLE' };
    return { policy: QUERY_REPLAYABLE.test(operation) ? 'QUERY_REPLAYABLE' : 'NON_REPLAYABLE' };
}
