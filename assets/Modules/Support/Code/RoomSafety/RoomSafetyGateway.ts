import { ProductionApiClient } from '../../../../Common/Code/Runtime/Activity/ProductionApiClient';

export type ReportCategory = 'CHEATING' | 'ABUSE' | 'COLLUSION' | 'OTHER';

export interface RoomSafetyReportInput {
    readonly roomId?: number;
    readonly targetPlayerId?: number;
    readonly category: ReportCategory;
    readonly detail: string;
}

export class RoomSafetyGateway {
    public constructor(private readonly api: ProductionApiClient) {}

    public report(input: RoomSafetyReportInput): Promise<{ reportId: string; status: string }> {
        return this.api.mutate(
            'POST',
            '/api/v2/room-safety/reports',
            input,
            ProductionApiClient.operationKey('report'),
        );
    }
}
