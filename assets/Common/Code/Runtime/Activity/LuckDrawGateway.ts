import { ProductionApiClient } from './ProductionApiClient';

export interface LuckDrawState {
    campaignCode: string;
    campaignName: string;
    remaining: number;
    startsAt: string;
    endsAt: string;
    open: boolean;
}

export interface LuckDrawResult {
    requestId: string;
    drawId: number;
    campaignCode: string;
    prizeCode: string;
    prizeName: string;
    rewardKind: string;
    rewardCode: string;
    rewardAmount: number;
    remaining: number;
    deliveryState: string;
}

export class LuckDrawGateway {
    public constructor(private readonly api: ProductionApiClient) {}

    public query(campaignCode: string): Promise<LuckDrawState> {
        return this.api.get('/api/v2/luck-draw', { campaignCode });
    }

    public draw(campaignCode: string, requestId: string): Promise<LuckDrawResult> {
        return this.api.mutate('POST', `/api/v2/luck-draw?campaignCode=${encodeURIComponent(campaignCode)}`, {}, requestId);
    }

    public cancelPending(): void { this.api.cancelPending(); }
}
