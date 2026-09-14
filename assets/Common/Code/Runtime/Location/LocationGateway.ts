import { ProductionApiClient } from '../Activity/ProductionApiClient';
export interface LocationSignal { latitude: number; longitude: number; accuracyMeters: number; capturedAt: string; authorization: string; }
export class LocationGateway {
    public constructor(private readonly api: ProductionApiClient) {}
    public authorization(state: string): Promise<unknown> { return this.api.mutate('POST', '/api/v2/location/authorization', { state }, ProductionApiClient.operationKey('location-auth')); }
    public signals(signal: LocationSignal): Promise<unknown> { return this.api.mutate('POST', '/api/v2/location/signals', signal, ProductionApiClient.operationKey('location-signal')); }
    public tableRisk(tableId: string): Promise<unknown> { return this.api.mutate('POST', '/api/v2/location/table-risk', { tableId }, ProductionApiClient.operationKey(`table-risk:${tableId}`)); }
}
