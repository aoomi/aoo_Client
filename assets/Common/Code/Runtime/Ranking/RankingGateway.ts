import { ProductionApiClient } from '../Activity/ProductionApiClient';
export class RankingGateway {
    public constructor(private readonly api: ProductionApiClient) {}
    public leaderboard(seasonId: string, limit = 50, cursor?: string): Promise<unknown> { return this.api.get(`/api/v2/rankings/${encodeURIComponent(seasonId)}`, { limit, cursor }); }
    public standing(seasonId: string): Promise<unknown> { return this.api.get(`/api/v2/rankings/${encodeURIComponent(seasonId)}/me`); }
    public achievements(): Promise<unknown> { return this.api.get('/api/v2/achievements'); }
    public claimAchievement(code: string): Promise<unknown> { return this.api.mutate('POST', `/api/v2/achievements/${encodeURIComponent(code)}/claim`, {}, ProductionApiClient.operationKey(`achievement:${code}`)); }
}
