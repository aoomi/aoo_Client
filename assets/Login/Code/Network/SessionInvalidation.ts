export type SessionInvalidationReason = 'SESSION_REPLACED' | 'SESSION_INVALID';

export function classifyRefreshFailure(status: number, packet: unknown): SessionInvalidationReason | null {
    if (status !== 401) return null;
    const root = packet && typeof packet === 'object' ? packet as Record<string, unknown> : {};
    const data = root.data && typeof root.data === 'object' ? root.data as Record<string, unknown> : {};
    const reasonCode = String(root.reasonCode ?? data.reasonCode ?? root.code ?? '');
    return reasonCode === 'SESSION_REPLACED' ? 'SESSION_REPLACED' : 'SESSION_INVALID';
}
