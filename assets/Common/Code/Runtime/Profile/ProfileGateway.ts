import { ProductionApiClient } from '../Activity/ProductionApiClient';
export interface ProfilePatch { expectedVersion: number; nickname?: string; avatarAssetId?: number; gender?: string; region?: string; }
export class ProfileGateway {
    public constructor(private readonly api: ProductionApiClient) {}
    public own(): Promise<unknown> { return this.api.get('/api/v2/player-profile/me'); }
    public view(playerId: string): Promise<unknown> { return this.api.get('/api/v2/player-profile/view', { playerId }); }
    public update(patch: ProfilePatch): Promise<unknown> { return this.api.mutate('PUT', '/api/v2/player-profile/profile', patch, ProductionApiClient.operationKey('profile')); }
}
