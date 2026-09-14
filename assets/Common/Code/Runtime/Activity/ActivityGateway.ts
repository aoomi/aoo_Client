import { ProductionApiClient } from './ProductionApiClient';

export interface ActivityCatalog { code?: string; activities?: unknown[]; [key: string]: unknown; }

export class ActivityGateway {
    public constructor(private readonly api: ProductionApiClient) {}
    public catalog(): Promise<ActivityCatalog | unknown[]> { return this.api.get('/api/v2/activities'); }
    public checkIn(activityCode: string): Promise<unknown> {
        return this.api.mutate('POST', `/api/v2/activities/${encodeURIComponent(activityCode)}/check-in`, {}, ProductionApiClient.operationKey(`check-in:${activityCode}`));
    }
    public claim(activityCode: string, missionCode: string): Promise<unknown> {
        return this.api.mutate('POST', `/api/v2/activities/${encodeURIComponent(activityCode)}/missions/${encodeURIComponent(missionCode)}/claim`, {}, ProductionApiClient.operationKey(`mission:${activityCode}:${missionCode}`));
    }
    public recordShare(activityCode: string, missionCode: string, shareEventId: string): Promise<unknown> {
        return this.api.mutate('POST', `/api/v2/activities/${encodeURIComponent(activityCode)}/missions/${encodeURIComponent(missionCode)}/progress`, { eventId: shareEventId, delta: 1 }, `share:${shareEventId}`);
    }
}
