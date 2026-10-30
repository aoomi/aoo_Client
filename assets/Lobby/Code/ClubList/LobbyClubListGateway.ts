import { ProtocolClient } from '../../../Common/Code/Runtime/network/ProtocolClient';
import { AppError } from '../../../Common/Code/Runtime/core/AppError';

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
            // Legacy Club used numeric 3008 for several meanings. It must never
            // be silently converted to an empty list because that hides the root
            // cause and collides with Gateway's room-state 3008.
            const appError = AppError.fromUnknown(error);
            if (appError.legacyCode === 3008 || (error instanceof Error && /^3008:\s/.test(error.message))) {
                const detail = appError.message.replace(/^3008:\s*/, '').trim() || 'legacy club list response';
                console.error('[AooClientError]', {
                    source: 'LobbyClubListGateway.list', code: 'CLUB_LIST_EMPTY', legacyCode: 3008, detail,
                });
                throw new AppError('CLUB_LIST_EMPTY', 'club list response used ambiguous numeric 3008', appError, 3008);
            }
            throw appError;
        }
    }

    public pin(clubId: number): Promise<LobbyClubSummary[]> {
        return this.client.request<LobbyClubSummary[]>('club.CClubTop', { clubId });
    }

    public detail(clubId: number): Promise<LobbyClubSummary> {
        return this.client.request<LobbyClubSummary>('club.CGetClubListById', { clubId });
    }
}
