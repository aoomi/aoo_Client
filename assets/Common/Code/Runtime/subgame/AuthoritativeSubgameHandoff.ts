export interface LegacySubgameTicket {
    entryOrigin?: 'GAME_LOBBY' | 'CLUB' | 'UNION';
    returnContext?: { clubId?: number; unionId?: number };
    gameId?: number;
    gameName?: string;
    playFamily?: string;
    smallSettleTemplate?: string;
    bigSettleTemplate?: string;
    roomId?: number;
    roomID?: number;
    roomKey?: number | string;
    clubId?: number;
    unionId?: number;
    fromClub?: boolean;
    playBackCode?: string;
    playVersion?: string;
    authorityRoute?: string;
    gameTicket?: string;
    bundleName?: string;
    sceneName?: string;
    ruleSnapshot?: Record<string, unknown>;
    ruleFields?: readonly Record<string, unknown>[];
    state?: string;
    playerNum?: number;
    occupiedCount?: number;
    waitingFull?: boolean;
}

export interface LegacyExternalSubgameHandoff extends LegacySubgameTicket {
    gameId: number;
    gameName: string;
    gameServerUrl: string;
    gameToken: unknown;
    consume: () => boolean;
    cancel: () => void;
}
