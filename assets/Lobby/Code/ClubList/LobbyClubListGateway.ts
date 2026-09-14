import { ProtocolClient } from '../../../Common/Code/Runtime/network/ProtocolClient';

export interface LobbyClubSummary {
    id?: number;
    curatorId?: number;
    clubsign?: number | string;
    key?: string;
    name?: string;
    minister?: number;
    isPromotionManage?: boolean;
    curatorAvatarUrl?: string;
    player?: { pid?: number; id?: number; iconUrl?: string; headImageUrl?: string };
}

export interface LobbyClubListSource {
    list(): Promise<LobbyClubSummary[]>;
    pin(clubId: number): Promise<LobbyClubSummary[]>;
    detail(clubId: number): Promise<LobbyClubSummary>;
}

/** The network boundary for the independently migrated lobby club-list feature. */
export class LobbyClubListGateway implements LobbyClubListSource {
    public constructor(private readonly client: ProtocolClient) {}

    public async list(): Promise<LobbyClubSummary[]> {
        try {
            const summaries = await this.client.request<LobbyClubSummary[]>('club.CGetClubListMin', {});
            // The compact list is the authoritative membership/index source but
            // omits the current player's position. Enrich each existing row with
            // its detail response; one failed detail must never erase the list.
            return await Promise.all(summaries.map(async summary => {
                const clubId = Number(summary.id ?? 0);
                if (!Number.isSafeInteger(clubId) || clubId <= 0) return summary;
                try {
                    return { ...summary, ...await this.detail(clubId) };
                } catch {
                    return summary;
                }
            }));
        } catch (error: unknown) {
            // The legacy service uses 3008 for an account with no club records.
            // The list screen represents that state as an empty list, not an error.
            if (error instanceof Error && /^3008:\s/.test(error.message)) return [];
            throw error;
        }
    }

    public pin(clubId: number): Promise<LobbyClubSummary[]> {
        return this.client.request<LobbyClubSummary[]>('club.CClubTop', { clubId });
    }

    public detail(clubId: number): Promise<LobbyClubSummary> {
        return this.client.request<LobbyClubSummary>('club.CGetClubListById', { clubId });
    }
}
