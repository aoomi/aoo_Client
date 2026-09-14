import { ProductionApiClient } from '../Activity/ProductionApiClient';
export class InventoryGateway {
    public constructor(private readonly api: ProductionApiClient) {}
    public catalog(): Promise<unknown> { return this.api.get('/api/v2/items'); }
    public inventory(): Promise<unknown> { return this.api.get('/api/v2/inventory'); }
    public offers(): Promise<unknown> { return this.api.get('/api/v2/store'); }
    public purchase(offerCode: string): Promise<unknown> { return this.api.mutate('POST', '/api/v2/store', { offerCode }, ProductionApiClient.operationKey(`purchase:${offerCode}`)); }
    public redeem(code: string): Promise<unknown> { return this.api.mutate('POST', '/api/v2/redemptions', { code }, ProductionApiClient.operationKey('redeem')); }
}
