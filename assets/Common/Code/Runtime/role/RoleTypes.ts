export interface RoleSession {
    playerId: number;
    displayName: string;
    headImageUrl: string;
    roomCard: number;
    diamond: number;
    raw: Readonly<Record<string, unknown>>;
}
