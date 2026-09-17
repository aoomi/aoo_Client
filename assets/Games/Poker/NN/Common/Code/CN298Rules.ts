export const CN298_GAME_CODE = 'CN298' as const;
export const CN298_FAMILY = 'poker:betting' as const;
export const CN298_PLAY_VERSION = 'cn298-v1.0.0' as const;

export type CN298Mode = 'classic' | 'passion' | 'crazy';
export type CN298StandPolicy = 'loser_may_stand' | 'everyone_may_stand' | 'no_one_may_stand';

export interface CN298RoomRules {
    rounds: 10 | 20 | 30;
    maxPlayers: 8 | 10;
    startPlayers: 2 | 4 | 6;
    mode: CN298Mode;
    maxRobMultiplier: 3 | 4 | 5;
    maxPushMultiplier: 0 | 5 | 10 | 15;
    standPolicy: CN298StandPolicy;
    kanShunDouEnabled: boolean;
}

export const CN298_DEFAULT_RULES: Readonly<CN298RoomRules> = Object.freeze({
    rounds: 10,
    maxPlayers: 8,
    startPlayers: 2,
    mode: 'classic',
    maxRobMultiplier: 4,
    maxPushMultiplier: 10,
    standPolicy: 'everyone_may_stand',
    kanShunDouEnabled: true,
});

export function validateCN298Rules(value: CN298RoomRules): CN298RoomRules {
    const valid = ([10, 20, 30] as const).includes(value.rounds)
        && ([8, 10] as const).includes(value.maxPlayers)
        && ([2, 4, 6] as const).includes(value.startPlayers)
        && value.startPlayers <= value.maxPlayers
        && (['classic', 'passion', 'crazy'] as const).includes(value.mode)
        && ([3, 4, 5] as const).includes(value.maxRobMultiplier)
        && ([0, 5, 10, 15] as const).includes(value.maxPushMultiplier)
        && (['loser_may_stand', 'everyone_may_stand', 'no_one_may_stand'] as const).includes(value.standPolicy);
    if (!valid) throw new Error('[CN298] invalid room rules');
    return { ...value };
}
