import { ProductionApiClient } from '../Activity/ProductionApiClient';
export class ReplayGateway {
    private static readonly pendingChunks = new Map<string, Promise<unknown>>();
    public constructor(private readonly api: ProductionApiClient) {}
    public history(beforeRoomId = 0, limit = 20, startAt = 0, endAt = 0, clubId = 0): Promise<unknown> {
        return this.api.get('/api/v2/hall/history', { beforeRoomId, limit, startAt, endAt, clubId });
    }
    public room(roomId: string): Promise<unknown> { return this.api.get(`/api/v2/hall/history/${encodeURIComponent(roomId)}`); }
    public currentReplayCode(roomId: string, setId: string): Promise<unknown> {
        return this.api.get('/api/v2/hall/replay-codes/current', { roomId, setId });
    }
    public chunks(roomId: string, setId: string, afterSequence = 0, limit = 100): Promise<unknown> {
        const key = `${roomId}:${setId}:${afterSequence}:${limit}`;
        const existing = ReplayGateway.pendingChunks.get(key);
        if (existing) return existing;
        const request = this.api.get(`/api/v2/hall/replays/${encodeURIComponent(roomId)}/${encodeURIComponent(setId)}/chunks`, { afterSequence, limit });
        ReplayGateway.pendingChunks.set(key, request);
        const release = (): void => { globalThis.setTimeout(() => {
            if (ReplayGateway.pendingChunks.get(key) === request) ReplayGateway.pendingChunks.delete(key);
        }, 250); };
        void request.then(release, release);
        return request;
    }
}
