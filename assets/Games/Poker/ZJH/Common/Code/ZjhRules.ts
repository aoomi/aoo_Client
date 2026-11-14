export const ZJH_GAME_CODE = 'quanguo2997' as const;
export const ZJH_FAMILY = 'poker:compare-hand' as const;
export const ZJH_PLAY_VERSION = 'zjh-v1.0.0' as const;

export interface ZjhRoomRules {
    totalRounds: 10 | 20 | 30;
    seatLimit: 8 | 10;
    minimumPlayers: 2 | 4 | 6;
    operationSeconds: 10 | 15 | 20;
    compareStartRound: 1 | 3 | 5;
    maximumBet: 10 | 20 | 50;
    mustBlindRounds: 0 | 1 | 2;
    baseBet: 1 | 2 | 5 | 10;
    aaaBonus: number;
    leopardBonus: number;
    straightFlushBonus: number;
}

// 站起属于外围房间管理，不是 ZJH 玩法规则；本规则模型不得引入对应字段。
export const ZJH_DEFAULT_RULES: Readonly<ZjhRoomRules> = Object.freeze({
    totalRounds: 10, seatLimit: 8, minimumPlayers: 2, operationSeconds: 10,
    compareStartRound: 5, maximumBet: 50, mustBlindRounds: 1, baseBet: 1,
    aaaBonus: 20, leopardBonus: 10, straightFlushBonus: 5,
});

export function validateZjhRules(value: ZjhRoomRules): Readonly<ZjhRoomRules> {
    const nonNegative = [value.mustBlindRounds, value.aaaBonus, value.leopardBonus, value.straightFlushBonus];
    if (![10, 20, 30].includes(value.totalRounds) || ![8, 10].includes(value.seatLimit)
        || ![2, 4, 6].includes(value.minimumPlayers) || value.minimumPlayers > value.seatLimit
        || ![10, 15, 20].includes(value.operationSeconds) || ![10, 20, 50].includes(value.maximumBet)
        || ![1, 3, 5].includes(value.compareStartRound) || ![0, 1, 2].includes(value.mustBlindRounds)
        || ![1, 2, 5, 10].includes(value.baseBet)
        || nonNegative.some(item => !Number.isInteger(item) || item < 0) || value.baseBet > value.maximumBet) {
        throw new Error('[ZJH] invalid room rules');
    }
    return Object.freeze({ ...value });
}
