export const NN_GAME_CODE = 'quanguo2998' as const;
export const NN_FAMILY = 'poker:betting' as const;
export const NN_PLAY_VERSION = 'nn-v1.0.0' as const;

export type NnMode = 'classic' | 'passion' | 'crazy';
export type NnStandPolicy = 'loser_may_stand' | 'everyone_may_stand' | 'no_one_may_stand';

export interface NnRoomRules {
    rounds: 10 | 20 | 30;
    maxPlayers: 8 | 10;
    startPlayers: 2 | 4 | 6;
    mode: NnMode;
    maxRobMultiplier: 3 | 4 | 5;
    maxPushMultiplier: 0 | 5 | 10 | 15;
    standPolicy: NnStandPolicy;
    fastModeEnabled: boolean;
    kanShunDouEnabled: boolean;
}

export interface NnSnapshotRules {
    readonly baseScore?: number;
    readonly enterScore?: number;
    readonly leaveScore?: number;
    readonly minCarryToRob?: number;
    readonly kanShunDouEnabled?: boolean;
}

export const NN_DEFAULT_RULES: Readonly<NnRoomRules> = Object.freeze({
    rounds: 10,
    maxPlayers: 8,
    startPlayers: 2,
    mode: 'classic',
    maxRobMultiplier: 4,
    maxPushMultiplier: 10,
    standPolicy: 'everyone_may_stand',
    fastModeEnabled: true,
    kanShunDouEnabled: true,
});

/**
 * Rules in the authoritative snapshot are display values, not client defaults.
 * Missing fields stay absent so an older server cannot overwrite Prefab text with invented values.
 */
export function parseNnSnapshotRules(value: unknown): Readonly<NnSnapshotRules> | undefined {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
    const source = value as Readonly<Record<string, unknown>>;
    const number = (key: string): number | undefined => {
        const candidate = source[key];
        return typeof candidate === 'number' && Number.isFinite(candidate) ? candidate : undefined;
    };
    return Object.freeze({
        baseScore: number('baseScore'),
        enterScore: number('enterScore'),
        leaveScore: number('leaveScore'),
        minCarryToRob: number('minCarryToRob'),
        kanShunDouEnabled: typeof source.kanShunDouEnabled === 'boolean'
            ? source.kanShunDouEnabled : undefined,
    });
}

export function validateNnRules(value: NnRoomRules): NnRoomRules {
    const valid = ([10, 20, 30] as const).includes(value.rounds)
        && ([8, 10] as const).includes(value.maxPlayers)
        && ([2, 4, 6] as const).includes(value.startPlayers)
        && value.startPlayers <= value.maxPlayers
        && (['classic', 'passion', 'crazy'] as const).includes(value.mode)
        && ([3, 4, 5] as const).includes(value.maxRobMultiplier)
        && ([0, 5, 10, 15] as const).includes(value.maxPushMultiplier)
        && (['loser_may_stand', 'everyone_may_stand', 'no_one_may_stand'] as const).includes(value.standPolicy)
        && typeof value.fastModeEnabled === 'boolean'
        && typeof value.kanShunDouEnabled === 'boolean';
    if (!valid) throw new Error('[NN] invalid room rules');
    return { ...value };
}
