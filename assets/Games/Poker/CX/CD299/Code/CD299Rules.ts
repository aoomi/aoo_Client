export const CD299_GAME_CODE = 'CD299' as const;
export const CD299_PLAY_VERSION = 'cd299-v1.0.0' as const;
export type CD299StandPolicy = 'LOSER_ONLY' | 'EVERYONE' | 'NOBODY';
export type CD299FlipMode = 'LADDER' | 'ROLLING';

export type CD299RoomEndRules =
    | { roundCount: 10 | 20 | 30; roomDurationMinutes?: never }
    | { roomDurationMinutes: 30 | 45 | 60; roundCount?: never };

export type CD299RoomRules = CD299RoomEndRules & {
    maxPlayers: 8;
    startPlayers: 2 | 4 | 6;
    operationSeconds: 10 | 15 | 30;
    standPolicy: CD299StandPolicy;
    mangoFlipMode: CD299FlipMode;
    mangoRaise: 0 | 1 | 2 | 3 | 4 | 5;
    mangoScore: number;
    openingBet: number;
    splitSeconds: 30;
    splitExtensionSeconds: 30;
    splitExtensionLimit: 1;
    seatConfirmationSeconds: 30;
    seatRetentionSeconds: 120;
    autoOperateAfterTimeouts: 3 | 4 | 5;
    spectatorEntry: boolean;
    autoReady: boolean;
    supplementNextRound: boolean;
    mute: boolean;
    interactionDisabled: boolean;
    distanceTips: boolean;
    restMango: boolean;
    beatMango: boolean;
    everyHandMango: boolean;
    firstRoundCanRest: boolean;
    eachPlayerMustFollow: boolean;
    earthNineKing: boolean;
    fireproofCard: boolean;
    bigHeadKeepsBase: boolean;
};

export const CD299_DEFAULT_RULES: Readonly<CD299RoomRules> = Object.freeze({
    roundCount: 10, maxPlayers: 8, startPlayers: 2,
    operationSeconds: 10, standPolicy: 'LOSER_ONLY', mangoFlipMode: 'LADDER',
    mangoRaise: 3, mangoScore: 3, openingBet: 3, splitSeconds: 30,
    splitExtensionSeconds: 30, splitExtensionLimit: 1, seatConfirmationSeconds: 30,
    seatRetentionSeconds: 120, autoOperateAfterTimeouts: 3, spectatorEntry: true,
    autoReady: true, supplementNextRound: true, mute: true, interactionDisabled: false,
    distanceTips: true, restMango: true, beatMango: true, everyHandMango: true,
    firstRoundCanRest: true, eachPlayerMustFollow: false, earthNineKing: true,
    fireproofCard: true, bigHeadKeepsBase: false,
});

export function validateCD299Rules(r: CD299RoomRules): CD299RoomRules {
    const flags = [r.spectatorEntry, r.autoReady, r.supplementNextRound, r.mute,
        r.interactionDisabled, r.distanceTips, r.restMango, r.beatMango,
        r.everyHandMango, r.firstRoundCanRest, r.eachPlayerMustFollow,
        r.earthNineKing, r.fireproofCard, r.bigHeadKeepsBase];
    const hasRoundCount = r.roundCount !== undefined;
    const hasDuration = r.roomDurationMinutes !== undefined;
    const validEndDimension = hasRoundCount !== hasDuration
        && (hasRoundCount
            ? ([10, 20, 30] as const).includes(r.roundCount)
            : ([30, 45, 60] as const).includes(r.roomDurationMinutes!));
    if (!validEndDimension
        || r.maxPlayers !== 8 || !([2, 4, 6] as const).includes(r.startPlayers)
        || !([10, 15, 30] as const).includes(r.operationSeconds)
        || r.mangoRaise < 0 || r.mangoRaise > 5 || !Number.isFinite(r.mangoScore)
        || r.mangoScore < 0 || !Number.isFinite(r.openingBet) || r.openingBet < r.mangoScore
        || r.splitSeconds !== 30 || r.splitExtensionSeconds !== 30
        || r.splitExtensionLimit !== 1 || r.seatConfirmationSeconds !== 30
        || r.seatRetentionSeconds !== 120
        || !([3, 4, 5] as const).includes(r.autoOperateAfterTimeouts)
        || flags.some(value => typeof value !== 'boolean')) {
        throw new Error('[CD299] invalid room rules');
    }
    return { ...r };
}
