export interface RoleSession {
    playerId: number;
    displayName: string;
    headImageUrl: string;
    roomCard: number;
    gold: number;
    raw: Readonly<Record<string, unknown>>;
}
